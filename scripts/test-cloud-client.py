#!/usr/bin/env python3
"""Minimal host-side smoke test for RealTopia's OpenAI-compatible endpoint."""

import os
import sys
import time

from openai import OpenAI


DEFAULT_BASE_URL = (
    "https://llm-91vwfbm1df53hn0g.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
)


def required_environment(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"Set {name} before running this smoke test.")
    return value


def main() -> None:
    api_key = required_environment("DASHSCOPE_API_KEY")
    base_url = os.getenv("DASHSCOPE_BASE_URL", DEFAULT_BASE_URL).strip().rstrip("/")
    model = os.getenv("DASHSCOPE_MODEL", "qwen-plus").strip()
    if not base_url.startswith("https://"):
        raise SystemExit("DASHSCOPE_BASE_URL must use HTTPS.")
    if not model:
        raise SystemExit("DASHSCOPE_MODEL must not be empty.")

    client = OpenAI(api_key=api_key, base_url=base_url)
    started = time.monotonic()
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "This is a RealTopia connectivity check."},
            {"role": "user", "content": "Reply with REALTOPIA_OK only."},
        ],
        temperature=0,
    )
    content = response.choices[0].message.content or ""
    if "REALTOPIA_OK" not in content:
        raise SystemExit("Endpoint replied, but the expected marker was absent.")
    elapsed_ms = round((time.monotonic() - started) * 1000)
    print(f"PASS model={response.model or model} latency_ms={elapsed_ms}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
