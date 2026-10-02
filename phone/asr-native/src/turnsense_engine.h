#pragma once

#include "turnsense_frontend.h"

#include <memory>
#include <string>
#include <vector>

namespace MNN::Express {
class Module;
class Executor;
}

namespace realtopia {

struct TurnSenseResult {
    std::string label;
    std::vector<float> probabilities;
    int featureFrames = 0;
    double frontendMs = 0.0;
    double inferenceMs = 0.0;
    std::string error;
};

class TurnSenseEngine {
public:
    TurnSenseEngine(const std::string& modelPath, const std::string& cmvnPath);
    ~TurnSenseEngine();
    bool valid() const;
    TurnSenseResult classify(const std::vector<float>& normalizedPcm);

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

}  // namespace realtopia
