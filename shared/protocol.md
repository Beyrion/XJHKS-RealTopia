# REA/1 transport protocol

控制面使用 Rokid CXR 的蓝牙链路：

- `Realia_Capture`：`requestId:int64`、`width:int32`、`jpegQuality:int32`、`forceCold:int32`。
- `Realia_Control`：`continuousPerception:int32`，控制眼镜端的周期热拍。
- `Realia_Person`：`personId:string`、`name:string`、`role:string`、`affinity:int32`、`story:string`、`quest:string`，将手机端识别结果同步为眼镜人物海报。

数据面使用 CXR 协商出的 Wi-Fi Direct 网络和 TCP `39831` 端口。所有整数均为大端，帧头为：

`magic:u32`、`version:u8`、`type:u8`、`reserved:u16`、`id:u64`、`metadataLength:u32`、`payloadLength:u32`。

`magic` 固定为 `REA1`，`version` 固定为 `1`。类型定义：

- `type=1`：JPEG 图片，最大 20 MiB；metadata 包含拍摄与分阶段延时。
- `type=2`：16 kHz、单声道、PCM signed 16-bit little-endian 录音，最大 32 MiB；metadata 包含 `sampleRate`、`channels`、`encoding`、`durationMs` 和眼镜侧采集状态。

Java 写端的唯一实现是 `RealiaFrame`；图片和录音都必须以原始字节传输，不得使用 Base64 或二次编码。
