#include <MNN/expr/ExprCreator.hpp>
#include <llm/llm.hpp>

#include <chrono>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

using namespace MNN::Express;
using namespace MNN::Transformer;

int main(int argc, char** argv) {
    if (argc != 4) {
        std::cerr << "usage: realtopia_asr_bench config.json audio.pcm sample_rate\n";
        return 2;
    }
    const int sampleRate = std::stoi(argv[3]);
    std::ifstream input(argv[2], std::ios::binary | std::ios::ate);
    if (!input || sampleRate <= 0) return 3;
    const auto byteCount = static_cast<size_t>(input.tellg());
    if (byteCount == 0 || byteCount % 2 != 0) return 4;
    input.seekg(0);
    std::vector<uint8_t> bytes(byteCount);
    input.read(reinterpret_cast<char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    std::vector<float> waveform(byteCount / 2);
    for (size_t i = 0; i < waveform.size(); ++i) {
        const auto value = static_cast<int16_t>(static_cast<uint16_t>(bytes[2 * i]) |
                                                static_cast<uint16_t>(bytes[2 * i + 1]) << 8);
        waveform[i] = static_cast<float>(value) / 32768.0f;
    }
    if (sampleRate != 16000) {
        std::cerr << "benchmark fixture must be 16 kHz\n";
        return 5;
    }

    std::unique_ptr<Llm, decltype(&Llm::destroy)> llm(Llm::createLLM(argv[1]), &Llm::destroy);
    const auto loadStarted = std::chrono::steady_clock::now();
    if (!llm || !llm->load()) return 6;
    const double loadMs = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - loadStarted).count();
    llm->set_config("{\"async\":false}");
    std::cout << "CONFIG=" << llm->dump_config() << "\n";

    MultimodalPrompt prompt;
    prompt.prompt_template = "<audio>recording</audio>";
    PromptAudioPart audio;
    audio.waveform = _Const(waveform.data(), {static_cast<int>(waveform.size())}, NCHW,
                            halide_type_of<float>());
    prompt.audios.emplace("recording", std::move(audio));
    std::cout << "TEMPLATE=" << llm->apply_chat_template(prompt.prompt_template) << "\n";
    std::ostringstream output;
    const auto started = std::chrono::steady_clock::now();
    llm->response(prompt, &output, nullptr, 256);
    const double totalMs = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - started).count();
    const auto* context = llm->getContext();
    const double duration = static_cast<double>(waveform.size()) / sampleRate;
    std::cout << "TRANSCRIPT=" << output.str() << "\n"
              << "LOAD_MS=" << loadMs << "\n"
              << "INFERENCE_MS=" << totalMs << "\n"
              << "AUDIO_MS=" << context->audio_us / 1000.0 << "\n"
              << "PREFILL_MS=" << context->prefill_us / 1000.0 << "\n"
              << "DECODE_MS=" << context->decode_us / 1000.0 << "\n"
              << "DURATION_S=" << duration << "\n"
              << "RTF=" << totalMs / 1000.0 / duration << "\n"
              << "TOKENS=" << context->prompt_len << "/" << context->gen_seq_len << "\n"
              << "STATUS=" << static_cast<int>(context->status) << "\n";
    return context->status == LlmStatus::NORMAL_FINISHED ? 0 : 7;
}
