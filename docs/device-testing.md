# 双设备构建与 E2E 测试

## 设备发现与部署

```bash
cp .env.example .env
# 编辑 .env 后，将变量导入当前 shell；脚本不会自动执行 .env 文件。
set -a
source .env
set +a
./scripts/devices.sh
./scripts/deploy.sh
```

`GLASS_SERIAL` 和 `PHONE_SERIAL` 必须显式提供；`ANDROID_REFERENCE_DIR` 可指向包含 `.jdk`、`.android-sdk` 与 `.gradle-home` 的参考工程。也可以不设置它，改为直接提供标准的 `JAVA_HOME`、`ANDROID_HOME` 和 `NDK_HOME`。手机 UI 输入眼镜蓝牙地址并开始会话；眼镜地址可用以下命令读取：

```bash
adb -s "$GLASS_SERIAL" shell settings get secure bluetooth_address
```

状态进入 `READY` 后，“自动基准”会严格串行执行 1 次强制冷拍和 5 次热拍。JPEG 保存至手机应用私有外部目录的 `captures/`，报告保存至 `reports/latest-e2e.{md,json}`。

## P2P 诊断

```bash
adb -s "$PHONE_SERIAL" shell ip -br addr
adb -s "$PHONE_SERIAL" logcat -s RealiaPhoneTransport WifiController RealiaE2E
adb -s "$GLASS_SERIAL" logcat -s RealiaCxr RealiaCamera RealiaPhotoSocket RealiaE2E
```

预期手机出现 `p2p0` 地址、`P2P_STATUS ... WIFI_AVAILABLE` 和 `SOCKET_READY`。部分 ROM 不把 `p2p0` 暴露为 Android `Network`；此时实现只回退到系统路由选择的单个图片 socket，进程默认网络不会被绑定到 P2P。

Rokid CXR SDK 在同一进程中紧接着 `deinitBluetooth()` 再连接可能拿到空 `BluetoothAdapter`。同一眼镜地址的新会话会复用已有 CXR/P2P transport；需要更换眼镜时建议先完整重启手机应用进程。

高频反复安装/重连时，当前 CXR-M SDK 还可能在 `WifiController` 的 peer 列表刷新竞争中对空设备读取 `status`，表现为 SDK 内部 `NullPointerException`。这是第三方控制器内部回调，应用无法捕获；验收恢复方式是先停止两端应用，再按“眼镜 → 手机”的顺序冷启动。2026-10-02 的恢复复测在 15 秒内重新得到 `P2P_ADDRESS`、`SOCKET_READY` 和自动 JPEG 收包。正常单次冷启动未复现该崩溃。

连接完成后还应看到完整参数，例如：

```text
PERCEPTION enabled=true interval=15 width=4032 quality=90 result=REQUEST_SUCCEED
```

该日志证明定时感知与物理按键所用的间隔、分辨率和质量已经通过蓝牙控制通道同步。

Honor MagicOS 会在屏幕熄灭后把前台 Activity 降为 `TOP_SLEEPING`，并可能对普通应用 UID 施加 `APP_BACKGROUND` 网络规则；现象是 p2p0 与 shell 探针正常，但应用 TCP 握手超时。手机 Activity 已设置 `FLAG_KEEP_SCREEN_ON`，因此前台采集/基准会话不会自动熄屏。若人工熄屏，重新唤醒并置顶 RealTopia 后持久 socket 会自动重连。

## 人脸模型真机回归

先准备 MNN 模型，再连接 arm64 Android 手机：

```bash
./scripts/prepare-face-models.sh
./scripts/test-face-android.sh
```

测试使用仅打入测试 APK 的 InsightFace `t1.jpg`，验收以下行为：

- SCRFD 2.5GF 检出固定的 6 张脸；
- 每张合格人脸得到 512 维、L2 范数为 1 的 ArcFace R50 特征；
- 两次推理的首张脸特征余弦相似度大于 0.9999；
- 提高尺寸门槛后仍报告检测框，但不加载/执行 R50；
- 空白帧不检出人脸且不执行 R50。

BVL-AN00（Android 15，CPU normal precision，6 threads）的集成测量中，无合格人脸的热检测约 37–55 ms；固定六人图的热推理约 628 ms，其中包含六次 R50。首次出现合格人脸时另有约 294 ms 的 R50 延迟加载。数值会受温控和后台负载影响，报告以测试结果目录中的 logcat 为准：

```text
phone/app/src-tauri/gen/android/app/build/outputs/androidTest-results/connected/debug/
```

最终 APK 的眼镜现场热拍样例为：JPEG 1.75 MB，拍摄/传输 E2E 1615 ms，1512×2016 解码图无人脸分析 77.76 ms。日志只加载检测器（20 ms），没有加载 R50。现场画面没有人脸，因此它验证真实传输与跳过路径；六人固定图负责验证正向识别链路。
