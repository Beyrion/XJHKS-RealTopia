#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${FACE_MNN_SOURCE_DIR:-$project_dir/pc/models/mnn}"
destination_dir="$project_dir/model/face"

for model in det_2.5g.mnn w600k_r50.mnn; do
  source_path="$source_dir/$model"
  if [[ ! -f "$source_path" ]]; then
    echo "Missing $source_path; convert the InsightFace buffalo_m models first." >&2
    exit 1
  fi
  install -Dm644 "$source_path" "$destination_dir/$model"
done

echo "Prepared face models under $destination_dir"

