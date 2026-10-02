#pragma once

#include <string>
#include <vector>

namespace realtopia {

struct TurnSenseFeatures {
    int frames = 0;
    std::vector<float> values;
};

// Reproduces TurnSense's official kaldi-native-fbank frontend:
// 16 kHz PCM -> 80-bin Kaldi fbank -> LFR(7, 6) -> CMVN.
class TurnSenseFrontend {
public:
    explicit TurnSenseFrontend(const std::string& cmvnPath);
    bool valid() const { return means_.size() == kOutputDim && scales_.size() == kOutputDim; }
    TurnSenseFeatures extract(const std::vector<float>& normalizedPcm) const;

    static constexpr int kOutputDim = 560;

private:
    std::vector<float> means_;
    std::vector<float> scales_;
};

}  // namespace realtopia
