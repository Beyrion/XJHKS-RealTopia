#include "turnsense_engine.h"

#include <MNN/MNNForwardType.h>
#include <MNN/expr/Executor.hpp>
#include <MNN/expr/ExprCreator.hpp>
#include <MNN/expr/Module.hpp>

#include <algorithm>
#include <chrono>
#include <cmath>

namespace realtopia {
using MNN::Express::Executor;
using MNN::Express::Module;
using MNN::Express::NCHW;
using MNN::Express::_Const;

class TurnSenseEngine::Impl {
public:
    explicit Impl(const std::string& cmvnPath) : frontend(cmvnPath) {}

    TurnSenseFrontend frontend;
    std::shared_ptr<Executor::RuntimeManager> runtime;
    std::unique_ptr<Module, decltype(&Module::destroy)> module{nullptr, Module::destroy};
};

TurnSenseEngine::TurnSenseEngine(const std::string& modelPath, const std::string& cmvnPath)
    : impl_(std::make_unique<Impl>(cmvnPath)) {
    if (!impl_->frontend.valid()) return;
    MNN::ScheduleConfig schedule;
    schedule.type = MNN_FORWARD_CPU;
    schedule.numThread = 4;
    MNN::BackendConfig backend;
    // The vivo MT6993 produced NaNs with Precision_Low. FP16 weights remain
    // compressed in the model while FP32 accumulation keeps output stable.
    backend.precision = MNN::BackendConfig::Precision_Normal;
    schedule.backendConfig = &backend;
    impl_->runtime.reset(
        Executor::RuntimeManager::createRuntimeManager(schedule),
        Executor::RuntimeManager::destroy);
    if (!impl_->runtime) return;
    Module::Config config;
    config.shapeMutable = true;
    impl_->module.reset(Module::load(
        {"feats", "feat_lengths"}, {"logits"}, modelPath.c_str(), impl_->runtime, &config));
}

TurnSenseEngine::~TurnSenseEngine() = default;

bool TurnSenseEngine::valid() const {
    return impl_ && impl_->frontend.valid() && impl_->module != nullptr;
}

TurnSenseResult TurnSenseEngine::classify(const std::vector<float>& normalizedPcm) {
    TurnSenseResult result;
    if (!valid()) {
        result.error = "TurnSense engine is not loaded";
        return result;
    }
    const auto frontendStarted = std::chrono::steady_clock::now();
    TurnSenseFeatures features = impl_->frontend.extract(normalizedPcm);
    result.frontendMs = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - frontendStarted).count();
    result.featureFrames = features.frames;
    if (features.frames <= 0 || features.values.empty()) {
        result.error = "audio is too short for TurnSense";
        return result;
    }
    auto feats = _Const(features.values.data(), {1, features.frames, TurnSenseFrontend::kOutputDim},
                        NCHW, halide_type_of<float>());
    int64_t lengthValue = features.frames;
    auto length = _Const(&lengthValue, {1}, NCHW, halide_type_of<int64_t>());
    const auto inferenceStarted = std::chrono::steady_clock::now();
    auto outputs = impl_->module->onForward({feats, length});
    if (outputs.size() != 1 || outputs[0] == nullptr) {
        result.error = "MNN TurnSense inference failed";
        return result;
    }
    const float* values = outputs[0]->readMap<float>();
    result.inferenceMs = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - inferenceStarted).count();
    if (values == nullptr || !std::isfinite(values[0]) || !std::isfinite(values[1]) ||
        !std::isfinite(values[2])) {
        result.error = "MNN TurnSense produced non-finite output";
        return result;
    }
    result.probabilities.assign(values, values + 3);
    static constexpr const char* labels[] = {"complete", "incomplete", "invalid"};
    const auto maximum = std::max_element(result.probabilities.begin(), result.probabilities.end());
    result.label = labels[maximum - result.probabilities.begin()];
    return result;
}

}  // namespace realtopia
