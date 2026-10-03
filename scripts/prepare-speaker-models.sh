#!/usr/bin/env bash
set -euo pipefail
speaker_project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$speaker_project_dir"
node --input-type=module <<'JS'
import { readFileSync, copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = process.cwd();
const manifest = JSON.parse(readFileSync('phone/speaker-native/manifest.json', 'utf8'));
const assets = path.join(root, 'model/speaker');
mkdirSync(assets, {recursive:true});
for (const name of ['LICENSE-pyannote.txt', 'LICENSE-runtime.txt', 'NOTICE.txt'])
  copyFileSync(path.join(root, 'phone/speaker-native', name), path.join(assets, name));
const cache = path.join(root, '.cache/speaker-runtime');
mkdirSync(cache, {recursive:true});
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const valid = (file, expected) => existsSync(file) && hash(file) === expected;
function fetchVerified(url, file, expected) {
  if (valid(file, expected)) return;
  const staging = `${file}.download`;
  execFileSync('curl', ['-fL', '--retry', '2', '--connect-timeout', '20', url, '-o', staging], {stdio:'inherit'});
  if (!valid(staging, expected)) throw Error(`SHA256 mismatch: ${file}`);
  renameSync(staging, file);
}
const converter = path.join(root, manifest.conversion.converter);
const missing = manifest.models.filter(m => !valid(path.join(root, 'model/speaker', m.file), m.sha256));
if (missing.length && !existsSync(converter)) {
  const build = path.dirname(converter);
  execFileSync('cmake', ['-S', 'phone/MNN', '-B', build, '-DMNN_BUILD_CONVERTER=ON', '-DMNN_BUILD_SHARED_LIBS=OFF', '-DMNN_BUILD_TOOLS=OFF', '-DMNN_BUILD_TEST=OFF', '-DMNN_METAL=OFF', '-DMNN_KLEIDIAI=OFF', '-DCMAKE_BUILD_TYPE=Release'], {stdio:'inherit'});
  execFileSync('cmake', ['--build', build, '--target', 'MNNConvert', '--parallel', process.env.CMAKE_BUILD_PARALLEL_LEVEL ?? '4'], {stdio:'inherit'});
}
for (const model of missing) {
  const source = path.join(cache, model.sourceFile);
  if (model.source) fetchVerified(model.source, source, model.sourceSha256);
  else if (!valid(source, model.sourceSha256)) {
    const archive = path.join(cache, 'segmentation.tar.bz2');
    fetchVerified(model.sourceArchive, archive, model.archiveSha256);
    execFileSync('tar', ['-xjf', archive, '-C', cache, model.sourceFile]);
  }
  if (!valid(source, model.sourceSha256)) throw Error('Speaker source checksum mismatch');
  const staged = path.join(cache, `${model.file}.export`);
  // Pin MNN's model UUID: the default randomized UUID changes the binary hash.
  execFileSync(converter, ['-f', 'ONNX', '--modelFile', source, '--MNNModel', staged, '--bizCode', manifest.conversion.bizCode, '--compressionParamsFile', path.join(root, model.exportConfig)], {stdio:'inherit'});
  if (!valid(staged, model.sha256)) throw Error(`MNN export checksum mismatch: ${model.file}; verify converter revision`);
  renameSync(staged, path.join(root, 'model/speaker', model.file));
}
console.log('Verified pure MNN speaker models; interchange sources stay in host cache');
JS
