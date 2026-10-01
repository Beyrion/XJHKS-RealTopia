#include <android/log.h>
#include <jni.h>

#include <MNN/expr/ExprCreator.hpp>
#include <llm/llm.hpp>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

using MNN::Express::NCHW;
using MNN::Express::VARP;
using MNN::Express::_Const;
using MNN::Transformer::Llm;
using MNN::Transformer::LlmStatus;
using MNN::Transformer::MultimodalPrompt;
using MNN::Transformer::PromptAudioPart;

namespace {

constexpr int kAsrSampleRate = 16000;
constexpr char kLogTag[] = "RealTopiaAsr";

struct Engine {
    explicit Engine(Llm* value) : llm(value) {}
    ~Engine() {
        if (llm != nullptr) Llm::destroy(llm);
    }
    Llm* llm;
};

std::string fromJString(JNIEnv* env, jstring value) {
    if (value == nullptr) return {};
    const char* characters = env->GetStringUTFChars(value, nullptr);
    if (characters == nullptr) return {};
    std::string result(characters);
    env->ReleaseStringUTFChars(value, characters);
    return result;
}

std::string escapeJson(const std::string& value) {
    std::ostringstream output;
    for (const unsigned char character : value) {
        switch (character) {
            case '\\': output << "\\\\"; break;
            case '"': output << "\\\""; break;
            case '\n': output << "\\n"; break;
            case '\r': output << "\\r"; break;
            case '\t': output << "\\t"; break;
            default:
                if (character < 0x20) {
                    static constexpr char digits[] = "0123456789abcdef";
                    output << "\\u00" << digits[character >> 4] << digits[character & 15];
                } else {
                    output << character;
                }
        }
    }
    return output.str();
}

std::string trim(const std::string& value) {
    const auto begin = value.find_first_not_of(" \t\r\n");
    if (begin == std::string::npos) return {};
    const auto end = value.find_last_not_of(" \t\r\n");
    return value.substr(begin, end - begin + 1);
}

bool readPcm16(const std::string& path, std::vector<float>* output, std::string* error) {
    std::ifstream stream(path, std::ios::binary | std::ios::ate);
    if (!stream) {
        *error = "cannot open PCM recording";
        return false;
    }
    const auto length = stream.tellg();
    if (length <= 0 || (length % 2) != 0) {
        *error = "PCM recording is empty or has an odd byte count";
        return false;
    }
    stream.seekg(0);
    std::vector<uint8_t> bytes(static_cast<size_t>(length));
    if (!stream.read(reinterpret_cast<char*>(bytes.data()), length)) {
        *error = "cannot read PCM recording";
        return false;
    }
    output->resize(bytes.size() / 2);
    for (size_t index = 0; index < output->size(); ++index) {
        const uint16_t packed = static_cast<uint16_t>(bytes[index * 2]) |
                (static_cast<uint16_t>(bytes[index * 2 + 1]) << 8);
        const int16_t sample = static_cast<int16_t>(packed);
        (*output)[index] = static_cast<float>(sample) / 32768.0f;
    }
    return true;
}

std::vector<float> resample(const std::vector<float>& source, int sourceRate) {
    if (sourceRate == kAsrSampleRate) return source;
    const size_t targetSize = std::max<size_t>(1, static_cast<size_t>(
            std::llround(static_cast<double>(source.size()) * kAsrSampleRate / sourceRate)));
    std::vector<float> target(targetSize);
    const double step = static_cast<double>(sourceRate) / kAsrSampleRate;
    for (size_t index = 0; index < targetSize; ++index) {
        const double position = std::min(static_cast<double>(source.size() - 1), index * step);
        const size_t left = static_cast<size_t>(position);
        const size_t right = std::min(left + 1, source.size() - 1);
        const float fraction = static_cast<float>(position - left);
        target[index] = source[left] * (1.0f - fraction) + source[right] * fraction;
    }
    return target;
}

jstring errorJson(JNIEnv* env, const std::string& error) {
    const std::string json = "{\"error\":\"" + escapeJson(error) + "\"}";
    return env->NewStringUTF(json.c_str());
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_realtopia_phone_asr_AsrNative_create(JNIEnv* env, jobject, jstring configPath) {
    const std::string path = fromJString(env, configPath);
    if (path.empty()) return 0;
    std::unique_ptr<Llm, decltype(&Llm::destroy)> llm(Llm::createLLM(path), &Llm::destroy);
    if (!llm || !llm->load()) {
        __android_log_print(ANDROID_LOG_ERROR, kLogTag, "could not load ASR model at %s", path.c_str());
        return 0;
    }
    llm->set_config("{\"async\":false}");
    return reinterpret_cast<jlong>(new Engine(llm.release()));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_realtopia_phone_asr_AsrNative_transcribe(
        JNIEnv* env, jobject, jlong handle, jstring pcmPath, jint sampleRate,
        jint channels, jint maxNewTokens) {
    auto* engine = reinterpret_cast<Engine*>(handle);
    if (engine == nullptr || engine->llm == nullptr) return errorJson(env, "ASR engine is not loaded");
    if (channels != 1 || sampleRate <= 0) return errorJson(env, "only mono PCM is supported");

    std::vector<float> source;
    std::string error;
    if (!readPcm16(fromJString(env, pcmPath), &source, &error)) return errorJson(env, error);
    const double durationSeconds = static_cast<double>(source.size()) / sampleRate;
    if (durationSeconds > 300.0) return errorJson(env, "recording exceeds the 5 minute ASR limit");
    std::vector<float> waveform = resample(source, sampleRate);

    const auto started = std::chrono::steady_clock::now();
    VARP waveformVar = _Const(waveform.data(), {static_cast<int>(waveform.size())}, NCHW,
                              halide_type_of<float>());
    MultimodalPrompt prompt;
    prompt.prompt_template = "<audio>recording</audio>";
    PromptAudioPart audio;
    audio.waveform = waveformVar;
    prompt.audios.emplace("recording", std::move(audio));

    engine->llm->reset();
    std::ostringstream transcript;
    engine->llm->response(prompt, &transcript, nullptr, std::max(1, static_cast<int>(maxNewTokens)));
    const auto* context = engine->llm->getContext();
    const double totalMs = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - started).count();
    if (context == nullptr || context->status == LlmStatus::INTERNAL_ERROR ||
        context->status == LlmStatus::NOT_LOADED) {
        return errorJson(env, "MNN ASR inference failed");
    }
    const std::string text = trim(transcript.str());
    if (text.empty()) return errorJson(env, "MNN ASR returned empty text");
    const double audioMs = context->audio_us / 1000.0;
    const double prefillMs = context->prefill_us / 1000.0;
    const double decodeMs = context->decode_us / 1000.0;
    const double realtimeFactor = durationSeconds > 0.0 ? totalMs / 1000.0 / durationSeconds : 0.0;

    std::ostringstream json;
    json << "{\"text\":\"" << escapeJson(text)
         << "\",\"model\":\"Qwen3-ASR-0.6B-INT8-MNN\""
         << ",\"provider\":\"mnn-local\",\"side\":\"edge\""
         << ",\"latency_ms\":" << totalMs
         << ",\"audio_ms\":" << audioMs
         << ",\"prefill_ms\":" << prefillMs
         << ",\"decode_ms\":" << decodeMs
         << ",\"audio_duration_ms\":" << durationSeconds * 1000.0
         << ",\"realtime_factor\":" << realtimeFactor
         << ",\"prompt_tokens\":" << context->prompt_len
         << ",\"generated_tokens\":" << context->gen_seq_len
         << ",\"status\":" << static_cast<int>(context->status) << "}";
    return env->NewStringUTF(json.str().c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_realtopia_phone_asr_AsrNative_destroy(JNIEnv*, jobject, jlong handle) {
    delete reinterpret_cast<Engine*>(handle);
}
