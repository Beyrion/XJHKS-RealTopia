#include "turnsense_frontend.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <complex>
#include <fstream>
#include <limits>
#include <sstream>

namespace realtopia {
namespace {

constexpr int kSampleRate = 16000;
constexpr int kFrameLength = 400;
constexpr int kFrameShift = 160;
constexpr int kFftSize = 512;
constexpr int kSpectrumBins = kFftSize / 2;
constexpr int kMelBins = 80;
constexpr int kLfrWindow = 7;
constexpr int kLfrShift = 6;
constexpr size_t kMaximumSamples = 8 * kSampleRate;
constexpr double kPi = 3.14159265358979323846;

float melScale(float frequency) {
    return 1127.0f * std::log1p(frequency / 700.0f);
}

std::vector<float> parseVectorAfter(const std::string& content, const std::string& marker) {
    const auto markerAt = content.find(marker);
    if (markerAt == std::string::npos) return {};
    const auto begin = content.find('[', markerAt);
    const auto end = begin == std::string::npos ? std::string::npos : content.find(']', begin);
    if (begin == std::string::npos || end == std::string::npos) return {};
    std::istringstream stream(content.substr(begin + 1, end - begin - 1));
    std::vector<float> result;
    float value = 0.0f;
    while (stream >> value) result.push_back(value);
    return result;
}

void fft(std::array<std::complex<float>, kFftSize>* values) {
    auto& data = *values;
    for (int i = 1, j = 0; i < kFftSize; ++i) {
        int bit = kFftSize >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) std::swap(data[i], data[j]);
    }
    for (int length = 2; length <= kFftSize; length <<= 1) {
        const float angle = static_cast<float>(-2.0 * kPi / length);
        const std::complex<float> root(std::cos(angle), std::sin(angle));
        for (int offset = 0; offset < kFftSize; offset += length) {
            std::complex<float> factor(1.0f, 0.0f);
            for (int index = 0; index < length / 2; ++index) {
                const auto even = data[offset + index];
                const auto odd = data[offset + index + length / 2] * factor;
                data[offset + index] = even + odd;
                data[offset + index + length / 2] = even - odd;
                factor *= root;
            }
        }
    }
}

using MelWeights = std::array<std::array<float, kSpectrumBins>, kMelBins>;

const MelWeights& melWeights() {
    static const MelWeights weights = [] {
        MelWeights result{};
        const float melLow = melScale(20.0f);
        const float melHigh = melScale(kSampleRate / 2.0f);
        const float delta = (melHigh - melLow) / (kMelBins + 1);
        const float binWidth = static_cast<float>(kSampleRate) / kFftSize;
        for (int melBin = 0; melBin < kMelBins; ++melBin) {
            const float left = melLow + melBin * delta;
            const float center = left + delta;
            const float right = center + delta;
            for (int fftBin = 0; fftBin < kSpectrumBins; ++fftBin) {
                const float mel = melScale(binWidth * fftBin);
                if (mel <= left || mel >= right) continue;
                result[melBin][fftBin] = mel <= center
                    ? (mel - left) / (center - left)
                    : (right - mel) / (right - center);
            }
        }
        return result;
    }();
    return weights;
}

const std::array<float, kFrameLength>& hammingWindow() {
    static const std::array<float, kFrameLength> window = [] {
        std::array<float, kFrameLength> result{};
        for (int index = 0; index < kFrameLength; ++index) {
            result[index] = static_cast<float>(
                0.54 - 0.46 * std::cos(2.0 * kPi * index / (kFrameLength - 1)));
        }
        return result;
    }();
    return window;
}

std::vector<float> fbank(const std::vector<float>& source) {
    if (source.size() < kFrameLength) return {};
    const size_t sourceOffset = source.size() > kMaximumSamples
        ? source.size() - kMaximumSamples : 0;
    const size_t sampleCount = source.size() - sourceOffset;
    const int frameCount = 1 + static_cast<int>((sampleCount - kFrameLength) / kFrameShift);
    std::vector<float> features(static_cast<size_t>(frameCount) * kMelBins);
    std::array<std::complex<float>, kFftSize> spectrum{};
    std::array<float, kFrameLength> frame{};
    std::array<float, kSpectrumBins> power{};
    const auto& window = hammingWindow();
    const auto& weights = melWeights();
    for (int frameIndex = 0; frameIndex < frameCount; ++frameIndex) {
        const size_t start = sourceOffset + static_cast<size_t>(frameIndex) * kFrameShift;
        float mean = 0.0f;
        for (int index = 0; index < kFrameLength; ++index) {
            frame[index] = source[start + index] * 32768.0f;
            mean += frame[index];
        }
        mean /= kFrameLength;
        for (float& value : frame) value -= mean;
        for (int index = kFrameLength - 1; index > 0; --index) {
            frame[index] -= 0.97f * frame[index - 1];
        }
        frame[0] -= 0.97f * frame[0];
        for (int index = 0; index < kFftSize; ++index) {
            spectrum[index] = index < kFrameLength
                ? std::complex<float>(frame[index] * window[index], 0.0f)
                : std::complex<float>(0.0f, 0.0f);
        }
        fft(&spectrum);
        for (int index = 0; index < kSpectrumBins; ++index) {
            power[index] = std::norm(spectrum[index]);
        }
        for (int melBin = 0; melBin < kMelBins; ++melBin) {
            float energy = 0.0f;
            for (int fftBin = 0; fftBin < kSpectrumBins; ++fftBin) {
                energy += power[fftBin] * weights[melBin][fftBin];
            }
            features[static_cast<size_t>(frameIndex) * kMelBins + melBin] =
                std::log(std::max(energy, std::numeric_limits<float>::epsilon()));
        }
    }
    return features;
}

}  // namespace

TurnSenseFrontend::TurnSenseFrontend(const std::string& cmvnPath) {
    std::ifstream input(cmvnPath);
    if (!input) return;
    std::ostringstream buffer;
    buffer << input.rdbuf();
    const std::string content = buffer.str();
    means_ = parseVectorAfter(content, "<AddShift>");
    scales_ = parseVectorAfter(content, "<Rescale>");
}

TurnSenseFeatures TurnSenseFrontend::extract(const std::vector<float>& normalizedPcm) const {
    TurnSenseFeatures result;
    if (!valid()) return result;
    const std::vector<float> base = fbank(normalizedPcm);
    const int baseFrames = static_cast<int>(base.size() / kMelBins);
    if (baseFrames <= 0) return result;
    result.frames = (baseFrames + kLfrShift - 1) / kLfrShift;
    result.values.resize(static_cast<size_t>(result.frames) * kOutputDim);
    for (int outputFrame = 0; outputFrame < result.frames; ++outputFrame) {
        for (int lfrIndex = 0; lfrIndex < kLfrWindow; ++lfrIndex) {
            // Official frontend prepends three copies of frame zero.
            const int sourceFrame = std::clamp(
                outputFrame * kLfrShift + lfrIndex - (kLfrWindow - 1) / 2,
                0,
                baseFrames - 1);
            for (int melBin = 0; melBin < kMelBins; ++melBin) {
                const int outputIndex = lfrIndex * kMelBins + melBin;
                const float value = base[static_cast<size_t>(sourceFrame) * kMelBins + melBin];
                result.values[static_cast<size_t>(outputFrame) * kOutputDim + outputIndex] =
                    (value + means_[outputIndex]) * scales_[outputIndex];
            }
        }
    }
    return result;
}

}  // namespace realtopia
