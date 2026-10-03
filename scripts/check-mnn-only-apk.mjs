import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
const apk = process.argv[2];
if (!apk) throw Error("usage: node scripts/check-mnn-only-apk.mjs <apk>");
const files = execFileSync("unzip", ["-Z1", apk], { encoding: "utf8" })
  .trim()
  .split("\n");
const banned = files.filter(
  (f) =>
    /\.(onnx|ort)$/i.test(f) || /(?:onnxruntime|sherpa-onnx).*\.so$/i.test(f),
);
assert.deepEqual(
  banned,
  [],
  `Forbidden non-MNN artifacts: ${banned.join(", ")}`,
);
for (const expected of [
  "assets/speaker/campplus-zh.mnn",
  "assets/speaker/segmentation.mnn",
  "lib/arm64-v8a/libsherpa-mnn-jni.so",
])
  assert.ok(
    files.includes(expected),
    `Missing MNN speaker artifact: ${expected}`,
  );
for (const file of files.filter((f) => /^lib\/.*\.so$/.test(f))) {
  const child = spawn("unzip", ["-p", apk, file], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(Error(`unzip ${file}: ${code}`)),
    );
  });
  let suffix = Buffer.alloc(0),
    forbidden = false;
  for await (const chunk of child.stdout) {
    const bytes = Buffer.concat([suffix, chunk]);
    forbidden ||=
      bytes.includes(Buffer.from("OrtGetApiBase")) ||
      bytes.includes(Buffer.from("onnxruntime::"));
    suffix = bytes.subarray(Math.max(0, bytes.length - 32));
  }
  await completed;
  assert.ok(!forbidden, `ONNX Runtime code statically embedded in ${file}`);
}
console.log(
  "MNN-only APK audit PASS: both .mnn models, MNN speaker JNI, no ONNX/ORT models or runtime",
);
