#include <android/bitmap.h>
#include <android/log.h>
#include <jni.h>

#include <MNN/expr/ExprCreator.hpp>
#include <llm/llm.hpp>

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <memory>
#include <sstream>
#include <string>
#include <unordered_set>
#include <vector>

using MNN::Express::NHWC;
using MNN::Express::VARP;
using MNN::Express::_Const;
using MNN::Transformer::Llm;
using MNN::Transformer::LlmContext;
using MNN::Transformer::LlmStatus;
using MNN::Transformer::MultimodalPrompt;
using MNN::Transformer::PromptImagePart;

namespace {

constexpr char kLogTag[] = "RealTopiaVl";

struct Engine {
    Engine(Llm* value, std::string name) : llm(value), modelName(std::move(name)) {
    }
    ~Engine() {
        if (llm != nullptr) Llm::destroy(llm);
    }
    Llm* llm;
    std::string modelName;
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

jstring errorJson(JNIEnv* env, const std::string& error) {
    const std::string json = "{\"error\":\"" + escapeJson(error) + "\"}";
    return env->NewStringUTF(json.c_str());
}

std::string modelNameFromConfigPath(const std::string& path) {
    if (path.find("4B-Instruct") != std::string::npos) return "Qwen3-VL-4B-Instruct-MNN";
    return "Qwen3-VL-2B-Instruct-MNN";
}

bool isDegenerateOutput(const LlmContext* context) {
    if (context == nullptr || context->output_tokens.size() < 32) return false;
    std::unordered_set<int> uniqueTokens;
    size_t longestRun = 1;
    size_t currentRun = 1;
    for (size_t index = 0; index < context->output_tokens.size(); ++index) {
        uniqueTokens.insert(context->output_tokens[index]);
        if (index == 0) continue;
        if (context->output_tokens[index] == context->output_tokens[index - 1]) {
            currentRun += 1;
            longestRun = std::max(longestRun, currentRun);
        } else {
            currentRun = 1;
        }
    }
    return longestRun >= 16 || uniqueTokens.size() * 8 < context->output_tokens.size();
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_realtopia_phone_vl_VlNative_create(JNIEnv* env, jobject, jstring configPath) {
    const std::string path = fromJString(env, configPath);
    if (path.empty()) return 0;
    std::unique_ptr<Llm, decltype(&Llm::destroy)> llm(Llm::createLLM(path), &Llm::destroy);
    if (!llm) return 0;
    // Sampler construction happens inside load(). Keep the repository's tuned
    // mixed sampler and only select synchronous execution before it is built.
    llm->set_config("{\"async\":false}");
    if (!llm->load()) {
        __android_log_print(ANDROID_LOG_ERROR, kLogTag, "could not load VL model at %s", path.c_str());
        return 0;
    }
    return reinterpret_cast<jlong>(new Engine(llm.release(), modelNameFromConfigPath(path)));
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_realtopia_phone_vl_VlNative_analyze(
        JNIEnv* env, jobject, jlong handle, jobject bitmap, jstring promptValue, jint maxNewTokens) {
    auto* engine = reinterpret_cast<Engine*>(handle);
    if (engine == nullptr || engine->llm == nullptr) return errorJson(env, "VL engine is not loaded");
    if (bitmap == nullptr) return errorJson(env, "image is null");
    const std::string question = trim(fromJString(env, promptValue));
    if (question.empty()) return errorJson(env, "prompt is empty");

    AndroidBitmapInfo info;
    if (AndroidBitmap_getInfo(env, bitmap, &info) != ANDROID_BITMAP_RESULT_SUCCESS ||
        info.format != ANDROID_BITMAP_FORMAT_RGBA_8888 || info.width == 0 || info.height == 0) {
        return errorJson(env, "VL engine requires a non-empty RGBA_8888 bitmap");
    }
    void* pixels = nullptr;
    if (AndroidBitmap_lockPixels(env, bitmap, &pixels) != ANDROID_BITMAP_RESULT_SUCCESS) {
        return errorJson(env, "failed to lock bitmap pixels");
    }
    std::vector<uint8_t> bgr(static_cast<size_t>(info.width) * info.height * 3);
    const auto* rgba = static_cast<const uint8_t*>(pixels);
    for (uint32_t y = 0; y < info.height; ++y) {
        const auto* row = rgba + static_cast<size_t>(y) * info.stride;
        for (uint32_t x = 0; x < info.width; ++x) {
            const auto* source = row + static_cast<size_t>(x) * 4;
            auto* destination = bgr.data() + (static_cast<size_t>(y) * info.width + x) * 3;
            destination[0] = source[2];
            destination[1] = source[1];
            destination[2] = source[0];
        }
    }
    AndroidBitmap_unlockPixels(env, bitmap);

    VARP image = _Const(bgr.data(), {static_cast<int>(info.height), static_cast<int>(info.width), 3},
                        NHWC, halide_type_of<uint8_t>());
    MultimodalPrompt prompt;
    prompt.prompt_template = "<img>frame</img>\n" + question;
    PromptImagePart imagePart;
    imagePart.image_data = image;
    imagePart.width = static_cast<int>(info.width);
    imagePart.height = static_cast<int>(info.height);
    prompt.images.emplace("frame", std::move(imagePart));

    constexpr int kMaxAttempts = 4;
    constexpr int kMinAcceptedTokens = 8;
    const auto started = std::chrono::steady_clock::now();
    std::ostringstream response;
    const LlmContext* context = nullptr;
    std::string text;
    int attemptCount = 0;
    bool accepted = false;
    double visionMs = 0.0;
    double prefillMs = 0.0;
    double decodeMs = 0.0;
    for (int attempt = 0; attempt < kMaxAttempts; ++attempt) {
        attemptCount = attempt + 1;
        engine->llm->reset();
        response.str("");
        response.clear();
        engine->llm->response(
                prompt, &response, nullptr, std::max(1, static_cast<int>(maxNewTokens)));
        context = engine->llm->getContext();
        if (context == nullptr || context->status == LlmStatus::INTERNAL_ERROR ||
            context->status == LlmStatus::NOT_LOADED) {
            return errorJson(env, "MNN VL inference failed");
        }
        visionMs += context->vision_us / 1000.0;
        prefillMs += context->prefill_us / 1000.0;
        decodeMs += context->decode_us / 1000.0;
        text = trim(response.str());
        const bool tooShort = context->gen_seq_len < kMinAcceptedTokens;
        const bool degenerate = isDegenerateOutput(context);
        if (!tooShort && !degenerate) {
            accepted = true;
            break;
        }
        if (attempt + 1 == kMaxAttempts) break;
        __android_log_print(ANDROID_LOG_WARN, kLogTag,
                            "VL output rejected: tokens=%d degenerate=%d; retrying (%d/%d)",
                            context->gen_seq_len, degenerate, attempt + 1, kMaxAttempts - 1);
    }
    const double totalMs = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - started).count();
    if (!accepted || text.empty()) {
        return errorJson(env, "MNN VL output remained degenerate after retries");
    }

    std::ostringstream json;
    json << "{\"text\":\"" << escapeJson(text)
         << "\",\"model\":\"" << escapeJson(engine->modelName)
         << "\",\"provider\":\"mnn-local\",\"side\":\"edge\""
         << ",\"latency_ms\":" << totalMs
         << ",\"vision_ms\":" << visionMs
         << ",\"prefill_ms\":" << prefillMs
         << ",\"decode_ms\":" << decodeMs
         << ",\"image_width\":" << info.width
         << ",\"image_height\":" << info.height
         << ",\"prompt_tokens\":" << context->prompt_len
         << ",\"generated_tokens\":" << context->gen_seq_len
         << ",\"retry_count\":" << attemptCount - 1
         << ",\"status\":" << static_cast<int>(context->status) << "}";
    __android_log_print(ANDROID_LOG_INFO, kLogTag,
                        "%s %ux%u total=%.2fms vision=%.2fms retries=%d",
                        engine->modelName.c_str(), info.width, info.height, totalMs,
                        visionMs, attemptCount - 1);
    return env->NewStringUTF(json.str().c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_realtopia_phone_vl_VlNative_destroy(JNIEnv*, jobject, jlong handle) {
    delete reinterpret_cast<Engine*>(handle);
}
