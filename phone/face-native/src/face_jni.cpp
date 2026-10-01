#include <android/bitmap.h>
#include <android/log.h>
#include <jni.h>

#include <MNN/Interpreter.hpp>
#include <MNN/expr/Executor.hpp>
#include <MNN/expr/ExprCreator.hpp>
#include <MNN/expr/Module.hpp>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

using MNN::BackendConfig;
using MNN::Express::Executor;
using MNN::Express::Module;
using MNN::Express::VARP;
using namespace MNN::Express;

namespace {

constexpr int kDetectorSize = 640;
constexpr int kRecognizerSize = 112;
constexpr float kDetectionThreshold = 0.5f;
constexpr float kNmsThreshold = 0.4f;
constexpr char kLogTag[] = "RealTopiaFace";

struct RgbImage {
    int width = 0;
    int height = 0;
    std::vector<uint8_t> pixels;
};

struct Point {
    Point() = default;
    Point(float xValue, float yValue) : x(xValue), y(yValue) {
    }

    float x = 0.0f;
    float y = 0.0f;
};

struct Detection {
    float x1 = 0.0f;
    float y1 = 0.0f;
    float x2 = 0.0f;
    float y2 = 0.0f;
    float score = 0.0f;
    Point landmarks[5];
    bool eligible = false;
    std::vector<float> embedding;
};

double elapsedMs(const std::chrono::steady_clock::time_point& begin) {
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count();
}

float clampFloat(float value, float lower, float upper) {
    return std::max(lower, std::min(value, upper));
}

std::string escapeJson(const std::string& value) {
    std::ostringstream output;
    for (const char character : value) {
        switch (character) {
            case '\\':
                output << "\\\\";
                break;
            case '"':
                output << "\\\"";
                break;
            case '\n':
                output << "\\n";
                break;
            case '\r':
                output << "\\r";
                break;
            case '\t':
                output << "\\t";
                break;
            default:
                output << character;
                break;
        }
    }
    return output.str();
}

RgbImage rotateRgba(const uint8_t* rgba, int width, int height, int stride, int rotationDegrees) {
    const int rotation = ((rotationDegrees % 360) + 360) % 360;
    RgbImage output;
    output.width = (rotation == 90 || rotation == 270) ? height : width;
    output.height = (rotation == 90 || rotation == 270) ? width : height;
    output.pixels.resize(static_cast<size_t>(output.width) * output.height * 3);
    for (int outputY = 0; outputY < output.height; ++outputY) {
        for (int outputX = 0; outputX < output.width; ++outputX) {
            int sourceX = outputX;
            int sourceY = outputY;
            if (rotation == 90) {
                sourceX = outputY;
                sourceY = height - 1 - outputX;
            } else if (rotation == 180) {
                sourceX = width - 1 - outputX;
                sourceY = height - 1 - outputY;
            } else if (rotation == 270) {
                sourceX = width - 1 - outputY;
                sourceY = outputX;
            }
            const uint8_t* source = rgba + static_cast<size_t>(sourceY) * stride + sourceX * 4;
            uint8_t* destination = output.pixels.data() +
                    (static_cast<size_t>(outputY) * output.width + outputX) * 3;
            destination[0] = source[0];
            destination[1] = source[1];
            destination[2] = source[2];
        }
    }
    return output;
}

void sampleRgb(const RgbImage& image, float x, float y, float* rgb) {
    if (x < 0.0f || y < 0.0f || x > image.width - 1 || y > image.height - 1) {
        rgb[0] = rgb[1] = rgb[2] = 0.0f;
        return;
    }
    const int x0 = static_cast<int>(std::floor(x));
    const int y0 = static_cast<int>(std::floor(y));
    const int x1 = std::min(x0 + 1, image.width - 1);
    const int y1 = std::min(y0 + 1, image.height - 1);
    const float dx = x - x0;
    const float dy = y - y0;
    for (int channel = 0; channel < 3; ++channel) {
        const float top = image.pixels[(static_cast<size_t>(y0) * image.width + x0) * 3 + channel] * (1.0f - dx) +
                image.pixels[(static_cast<size_t>(y0) * image.width + x1) * 3 + channel] * dx;
        const float bottom = image.pixels[(static_cast<size_t>(y1) * image.width + x0) * 3 + channel] * (1.0f - dx) +
                image.pixels[(static_cast<size_t>(y1) * image.width + x1) * 3 + channel] * dx;
        rgb[channel] = top * (1.0f - dy) + bottom * dy;
    }
}

std::vector<float> detectorInput(const RgbImage& image, float* scale) {
    *scale = std::min(static_cast<float>(kDetectorSize) / image.width,
                      static_cast<float>(kDetectorSize) / image.height);
    const int resizedWidth = static_cast<int>(image.width * *scale);
    const int resizedHeight = static_cast<int>(image.height * *scale);
    const size_t plane = static_cast<size_t>(kDetectorSize) * kDetectorSize;
    std::vector<float> input(plane * 3, (0.0f - 127.5f) / 128.0f);
    for (int y = 0; y < resizedHeight; ++y) {
        const float sourceY = (y + 0.5f) / *scale - 0.5f;
        for (int x = 0; x < resizedWidth; ++x) {
            const float sourceX = (x + 0.5f) / *scale - 0.5f;
            float rgb[3];
            sampleRgb(image, sourceX, sourceY, rgb);
            const size_t index = static_cast<size_t>(y) * kDetectorSize + x;
            for (int channel = 0; channel < 3; ++channel) {
                input[static_cast<size_t>(channel) * plane + index] = (rgb[channel] - 127.5f) / 128.0f;
            }
        }
    }
    return input;
}

float intersectionOverUnion(const Detection& left, const Detection& right) {
    const float x1 = std::max(left.x1, right.x1);
    const float y1 = std::max(left.y1, right.y1);
    const float x2 = std::min(left.x2, right.x2);
    const float y2 = std::min(left.y2, right.y2);
    const float intersection = std::max(0.0f, x2 - x1 + 1.0f) * std::max(0.0f, y2 - y1 + 1.0f);
    const float leftArea = std::max(0.0f, left.x2 - left.x1 + 1.0f) * std::max(0.0f, left.y2 - left.y1 + 1.0f);
    const float rightArea = std::max(0.0f, right.x2 - right.x1 + 1.0f) * std::max(0.0f, right.y2 - right.y1 + 1.0f);
    const float denominator = leftArea + rightArea - intersection;
    return denominator > 0.0f ? intersection / denominator : 0.0f;
}

std::vector<Detection> nonMaximumSuppression(std::vector<Detection> candidates) {
    std::sort(candidates.begin(), candidates.end(), [](const Detection& left, const Detection& right) {
        return left.score > right.score;
    });
    std::vector<Detection> kept;
    std::vector<bool> removed(candidates.size(), false);
    for (size_t i = 0; i < candidates.size(); ++i) {
        if (removed[i]) {
            continue;
        }
        kept.push_back(candidates[i]);
        for (size_t j = i + 1; j < candidates.size(); ++j) {
            if (!removed[j] && intersectionOverUnion(candidates[i], candidates[j]) > kNmsThreshold) {
                removed[j] = true;
            }
        }
    }
    return kept;
}

bool solveLinear4(float matrix[4][5], float result[4]) {
    for (int column = 0; column < 4; ++column) {
        int pivot = column;
        for (int row = column + 1; row < 4; ++row) {
            if (std::fabs(matrix[row][column]) > std::fabs(matrix[pivot][column])) {
                pivot = row;
            }
        }
        if (std::fabs(matrix[pivot][column]) < 1.0e-8f) {
            return false;
        }
        if (pivot != column) {
            for (int value = column; value < 5; ++value) {
                std::swap(matrix[column][value], matrix[pivot][value]);
            }
        }
        const float divisor = matrix[column][column];
        for (int value = column; value < 5; ++value) {
            matrix[column][value] /= divisor;
        }
        for (int row = 0; row < 4; ++row) {
            if (row == column) {
                continue;
            }
            const float factor = matrix[row][column];
            for (int value = column; value < 5; ++value) {
                matrix[row][value] -= factor * matrix[column][value];
            }
        }
    }
    for (int index = 0; index < 4; ++index) {
        result[index] = matrix[index][4];
    }
    return true;
}

bool estimateSimilarity(const Point source[5], float transform[4]) {
    static const Point destination[5] = {
        {38.2946f, 51.6963f}, {73.5318f, 51.5014f}, {56.0252f, 71.7366f},
        {41.5493f, 92.3655f}, {70.7299f, 92.2041f},
    };
    float normal[4][5] = {};
    for (int index = 0; index < 5; ++index) {
        const float rows[2][4] = {
            {source[index].x, -source[index].y, 1.0f, 0.0f},
            {source[index].y, source[index].x, 0.0f, 1.0f},
        };
        const float targets[2] = {destination[index].x, destination[index].y};
        for (int row = 0; row < 2; ++row) {
            for (int left = 0; left < 4; ++left) {
                for (int right = 0; right < 4; ++right) {
                    normal[left][right] += rows[row][left] * rows[row][right];
                }
                normal[left][4] += rows[row][left] * targets[row];
            }
        }
    }
    return solveLinear4(normal, transform);
}

std::vector<float> recognizerInput(const RgbImage& image, const Point landmarks[5]) {
    float transform[4];
    if (!estimateSimilarity(landmarks, transform)) {
        return {};
    }
    const float a = transform[0];
    const float b = transform[1];
    const float tx = transform[2];
    const float ty = transform[3];
    const float determinant = a * a + b * b;
    if (determinant < 1.0e-10f) {
        return {};
    }
    const size_t plane = static_cast<size_t>(kRecognizerSize) * kRecognizerSize;
    std::vector<float> input(plane * 3);
    for (int y = 0; y < kRecognizerSize; ++y) {
        for (int x = 0; x < kRecognizerSize; ++x) {
            const float shiftedX = x - tx;
            const float shiftedY = y - ty;
            const float sourceX = (a * shiftedX + b * shiftedY) / determinant;
            const float sourceY = (-b * shiftedX + a * shiftedY) / determinant;
            float rgb[3];
            sampleRgb(image, sourceX, sourceY, rgb);
            const size_t index = static_cast<size_t>(y) * kRecognizerSize + x;
            for (int channel = 0; channel < 3; ++channel) {
                input[static_cast<size_t>(channel) * plane + index] = (rgb[channel] - 127.5f) / 127.5f;
            }
        }
    }
    return input;
}

std::string vectorJson(const std::vector<float>& values) {
    std::ostringstream output;
    output.precision(8);
    output << '[';
    for (size_t index = 0; index < values.size(); ++index) {
        if (index > 0) {
            output << ',';
        }
        output << values[index];
    }
    output << ']';
    return output.str();
}

class FaceEngine {
public:
    FaceEngine(const std::string& detectorPath, const std::string& recognizerPath, int threads)
        : mRecognizerPath(recognizerPath) {
        BackendConfig backendConfig;
        backendConfig.precision = BackendConfig::Precision_Normal;
        backendConfig.power = BackendConfig::Power_High;
        backendConfig.memory = BackendConfig::Memory_Normal;
        MNN::ScheduleConfig schedule;
        schedule.type = MNN_FORWARD_CPU;
        schedule.backupType = MNN_FORWARD_CPU;
        schedule.numThread = threads;
        schedule.backendConfig = &backendConfig;
        mRuntime.reset(Executor::RuntimeManager::createRuntimeManager(schedule));
        if (!mRuntime) {
            mError = "failed to create MNN runtime";
            return;
        }
        mRuntime->setHint(MNN::Interpreter::INIT_THREAD_NUMBER, threads);
        Module::Config config;
        config.shapeMutable = true;
        mDetector.reset(Module::load({}, {}, detectorPath.c_str(), mRuntime, &config), Module::destroy);
        if (!mDetector) {
            mError = "failed to load detector";
            return;
        }
    }

    bool valid() const {
        return mError.empty() && mDetector;
    }

    const std::string& error() const {
        return mError;
    }

    std::string analyze(const RgbImage& image, float minimumFaceAt640) {
        const auto totalStarted = std::chrono::steady_clock::now();
        const auto preprocessStarted = std::chrono::steady_clock::now();
        float detectorScale = 1.0f;
        const std::vector<float> prepared = detectorInput(image, &detectorScale);
        const double preprocessMilliseconds = elapsedMs(preprocessStarted);

        const auto detectionStarted = std::chrono::steady_clock::now();
        auto input = _Input({1, 3, kDetectorSize, kDetectorSize}, NCHW, halide_type_of<float>());
        std::copy(prepared.begin(), prepared.end(), input->writeMap<float>());
        const std::vector<VARP> outputs = mDetector->onForward({input});
        if (outputs.size() != 9) {
            return errorJson("detector returned an unexpected output count");
        }
        std::vector<const float*> values;
        for (const auto& output : outputs) {
            const float* mapped = output->readMap<float>();
            if (mapped == nullptr) {
                return errorJson("detector output mapping failed");
            }
            values.push_back(mapped);
        }
        const double detectionMilliseconds = elapsedMs(detectionStarted);

        const auto postprocessStarted = std::chrono::steady_clock::now();
        const int strides[3] = {8, 16, 32};
        std::vector<Detection> candidates;
        for (int level = 0; level < 3; ++level) {
            const int stride = strides[level];
            const int featureWidth = kDetectorSize / stride;
            const int featureHeight = kDetectorSize / stride;
            const int count = featureWidth * featureHeight * 2;
            for (int index = 0; index < count; ++index) {
                const float score = values[level][index];
                if (score < kDetectionThreshold) {
                    continue;
                }
                const int cell = index / 2;
                const float centerX = static_cast<float>(cell % featureWidth) * stride;
                const float centerY = static_cast<float>(cell / featureWidth) * stride;
                const float* distances = values[level + 3] + static_cast<size_t>(index) * 4;
                const float* landmarkDistances = values[level + 6] + static_cast<size_t>(index) * 10;
                Detection detection;
                detection.x1 = (centerX - distances[0] * stride) / detectorScale;
                detection.y1 = (centerY - distances[1] * stride) / detectorScale;
                detection.x2 = (centerX + distances[2] * stride) / detectorScale;
                detection.y2 = (centerY + distances[3] * stride) / detectorScale;
                detection.score = score;
                for (int landmark = 0; landmark < 5; ++landmark) {
                    detection.landmarks[landmark].x =
                            (centerX + landmarkDistances[landmark * 2] * stride) / detectorScale;
                    detection.landmarks[landmark].y =
                            (centerY + landmarkDistances[landmark * 2 + 1] * stride) / detectorScale;
                }
                candidates.push_back(detection);
            }
        }
        std::vector<Detection> detections = nonMaximumSuppression(std::move(candidates));
        for (auto& detection : detections) {
            detection.x1 = clampFloat(detection.x1, 0.0f, image.width - 1.0f);
            detection.y1 = clampFloat(detection.y1, 0.0f, image.height - 1.0f);
            detection.x2 = clampFloat(detection.x2, 0.0f, image.width - 1.0f);
            detection.y2 = clampFloat(detection.y2, 0.0f, image.height - 1.0f);
            const float shortSideAtDetector =
                    std::min(detection.x2 - detection.x1, detection.y2 - detection.y1) * detectorScale;
            detection.eligible = shortSideAtDetector >= minimumFaceAt640;
        }
        const double postprocessMilliseconds = elapsedMs(postprocessStarted);

        const auto recognitionStarted = std::chrono::steady_clock::now();
        int recognitionCount = 0;
        double recognizerLoadMilliseconds = 0.0;
        const bool hasEligibleFace = std::find_if(
                detections.begin(), detections.end(), [](const Detection& detection) {
                    return detection.eligible;
                }) != detections.end();
        if (hasEligibleFace && !ensureRecognizer(&recognizerLoadMilliseconds)) {
            return errorJson(mError);
        }
        for (auto& detection : detections) {
            if (!detection.eligible) {
                continue;
            }
            std::vector<float> recognitionInput = recognizerInput(image, detection.landmarks);
            if (recognitionInput.empty()) {
                continue;
            }
            auto recognitionVariable =
                    _Input({1, 3, kRecognizerSize, kRecognizerSize}, NCHW, halide_type_of<float>());
            std::copy(recognitionInput.begin(), recognitionInput.end(), recognitionVariable->writeMap<float>());
            const std::vector<VARP> recognitionOutputs = mRecognizer->onForward({recognitionVariable});
            if (recognitionOutputs.size() != 1 || recognitionOutputs[0]->readMap<float>() == nullptr) {
                continue;
            }
            const auto* info = recognitionOutputs[0]->getInfo();
            if (info == nullptr || info->size != 512) {
                continue;
            }
            const float* embedding = recognitionOutputs[0]->readMap<float>();
            double squaredNorm = 0.0;
            for (int index = 0; index < 512; ++index) {
                squaredNorm += static_cast<double>(embedding[index]) * embedding[index];
            }
            const float norm = static_cast<float>(std::sqrt(squaredNorm));
            if (norm <= 1.0e-12f) {
                continue;
            }
            detection.embedding.resize(512);
            for (int index = 0; index < 512; ++index) {
                detection.embedding[index] = embedding[index] / norm;
            }
            ++recognitionCount;
        }
        const double recognitionMilliseconds = elapsedMs(recognitionStarted);

        std::ostringstream json;
        json.precision(8);
        json << "{\"image_width\":" << image.width << ",\"image_height\":" << image.height
             << ",\"detected_count\":" << detections.size() << ",\"eligible_count\":" << recognitionCount
             << ",\"recognition_invoked\":" << (recognitionCount > 0 ? "true" : "false") << ",\"faces\":[";
        for (size_t index = 0; index < detections.size(); ++index) {
            const Detection& detection = detections[index];
            if (index > 0) {
                json << ',';
            }
            json << "{\"bbox\":[" << detection.x1 << ',' << detection.y1 << ',' << detection.x2 << ','
                 << detection.y2 << "],\"detection_score\":" << detection.score << ",\"eligible\":"
                 << (detection.eligible ? "true" : "false") << ",\"landmarks\":[";
            for (int landmark = 0; landmark < 5; ++landmark) {
                if (landmark > 0) {
                    json << ',';
                }
                json << '[' << detection.landmarks[landmark].x << ',' << detection.landmarks[landmark].y << ']';
            }
            json << ']';
            if (!detection.embedding.empty()) {
                json << ",\"embedding\":" << vectorJson(detection.embedding);
            }
            json << '}';
        }
        json << "],\"timings\":{\"preprocess_ms\":" << preprocessMilliseconds
             << ",\"detection_ms\":" << detectionMilliseconds << ",\"postprocess_ms\":"
             << postprocessMilliseconds << ",\"recognition_ms\":" << recognitionMilliseconds
             << ",\"recognizer_load_ms\":" << recognizerLoadMilliseconds
             << ",\"native_total_ms\":" << elapsedMs(totalStarted) << "}}";
        return json.str();
    }

private:
    bool ensureRecognizer(double* loadMilliseconds) {
        if (mRecognizer) {
            return true;
        }
        const auto started = std::chrono::steady_clock::now();
        Module::Config config;
        config.shapeMutable = true;
        mRecognizer.reset(
                Module::load({}, {}, mRecognizerPath.c_str(), mRuntime, &config), Module::destroy);
        *loadMilliseconds = elapsedMs(started);
        if (!mRecognizer) {
            mError = "failed to load recognizer";
            return false;
        }
        __android_log_print(
                ANDROID_LOG_INFO, kLogTag, "recognizer loaded in %.2fms", *loadMilliseconds);
        return true;
    }

    static std::string errorJson(const std::string& message) {
        return "{\"error\":\"" + escapeJson(message) + "\"}";
    }

    std::shared_ptr<Executor::RuntimeManager> mRuntime;
    std::shared_ptr<Module> mDetector;
    std::shared_ptr<Module> mRecognizer;
    std::string mRecognizerPath;
    std::string mError;
};

std::string jstringValue(JNIEnv* environment, jstring value) {
    if (value == nullptr) {
        return {};
    }
    const char* characters = environment->GetStringUTFChars(value, nullptr);
    if (characters == nullptr) {
        return {};
    }
    const std::string output(characters);
    environment->ReleaseStringUTFChars(value, characters);
    return output;
}

void throwIllegalState(JNIEnv* environment, const std::string& message) {
    jclass exception = environment->FindClass("java/lang/IllegalStateException");
    if (exception != nullptr) {
        environment->ThrowNew(exception, message.c_str());
    }
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL Java_com_realtopia_phone_face_FaceNative_create(
        JNIEnv* environment, jobject, jstring detectorPath, jstring recognizerPath, jint threads) {
    std::unique_ptr<FaceEngine> engine(
            new FaceEngine(jstringValue(environment, detectorPath), jstringValue(environment, recognizerPath), threads));
    if (!engine->valid()) {
        throwIllegalState(environment, engine->error());
        return 0;
    }
    return reinterpret_cast<jlong>(engine.release());
}

extern "C" JNIEXPORT jstring JNICALL Java_com_realtopia_phone_face_FaceNative_analyze(
        JNIEnv* environment, jobject, jlong handle, jobject bitmap, jint rotationDegrees, jfloat minimumFaceAt640) {
    FaceEngine* engine = reinterpret_cast<FaceEngine*>(handle);
    if (engine == nullptr || bitmap == nullptr) {
        throwIllegalState(environment, "face engine or bitmap is null");
        return nullptr;
    }
    AndroidBitmapInfo info;
    if (AndroidBitmap_getInfo(environment, bitmap, &info) != ANDROID_BITMAP_RESULT_SUCCESS ||
        info.format != ANDROID_BITMAP_FORMAT_RGBA_8888) {
        throwIllegalState(environment, "face engine requires an RGBA_8888 bitmap");
        return nullptr;
    }
    void* pixels = nullptr;
    if (AndroidBitmap_lockPixels(environment, bitmap, &pixels) != ANDROID_BITMAP_RESULT_SUCCESS) {
        throwIllegalState(environment, "failed to lock bitmap pixels");
        return nullptr;
    }
    const auto started = std::chrono::steady_clock::now();
    RgbImage image = rotateRgba(static_cast<uint8_t*>(pixels), static_cast<int>(info.width),
                                static_cast<int>(info.height), static_cast<int>(info.stride), rotationDegrees);
    AndroidBitmap_unlockPixels(environment, bitmap);
    const std::string result = engine->analyze(image, minimumFaceAt640);
    __android_log_print(ANDROID_LOG_INFO, kLogTag, "ANALYZE width=%d height=%d totalMs=%.2f", image.width,
                        image.height, elapsedMs(started));
    return environment->NewStringUTF(result.c_str());
}

extern "C" JNIEXPORT void JNICALL Java_com_realtopia_phone_face_FaceNative_destroy(
        JNIEnv*, jobject, jlong handle) {
    delete reinterpret_cast<FaceEngine*>(handle);
}
