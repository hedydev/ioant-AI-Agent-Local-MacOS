#!/usr/bin/env python3
"""Explicit bounded serial chat probes of installed local models; no tools."""
import json
import sys
import time
import urllib.request
from pathlib import Path

if sys.argv[1:] not in (["--run"], ["--run", "--qwen"]):
    raise SystemExit("Use --run, optionally --qwen for the installed Qwen supplement.")
qwen_only = "--qwen" in sys.argv

results = []
for model in (["qwen3.8:27b-mlx"] if qwen_only else ["gemma4:26b-a4b", "gpt-oss:20b"]):
    cases = [
        ("chat", "你好，今天想找你聊聊，先用20字以内自然地回应我。", 128),
        ("reasoning", "A独立完成任务需12天，B需18天。合作3天后A离开，B还需几天？用中文给答案和两步计算，80字以内。", 384),
    ]
    for label, prompt, limit in cases:
        think = "low" if model.startswith("gpt-oss") else label == "reasoning"
        body = {"model": model, "stream": True, "think": think,
                "messages": [{"role": "system", "content": "用自然中文交流。回答清晰简洁，认真检查计算。"},
                             {"role": "user", "content": prompt}],
                "options": {"num_predict": limit, "num_ctx": 8192, "temperature": 0},
                "keep_alive": "2m" if label == "chat" else "0s"}
        request = urllib.request.Request("http://127.0.0.1:11435/api/chat",
                                         data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json"})
        started = time.monotonic()
        first = None
        text = ""
        thinking_chars = 0
        final = {}
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                for line in response:
                    event = json.loads(line)
                    if event.get("error"):
                        raise RuntimeError("local_model_error")
                    message = event.get("message", {})
                    chunk = message.get("content", "")
                    if chunk and first is None:
                        first = time.monotonic() - started
                    text += chunk
                    thinking_chars += len(message.get("thinking", ""))
                    if event.get("done"):
                        final = event
            count, duration = final.get("eval_count", 0), final.get("eval_duration", 0)
            result = {"model": model, "case": label, "think": think,
                      "wall_seconds": round(time.monotonic() - started, 3),
                      "first_visible_seconds": round(first, 3) if first is not None else None,
                      "generation_tps": round(count / (duration / 1e9), 2) if duration else None,
                      "done_reason": final.get("done_reason"),
                      "thinking_chars": thinking_chars, "reply": text[:1200]}
        except Exception as error:
            result = {"model": model, "case": label, "error_type": type(error).__name__}
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)

name = "chat-model-probe-qwen-20261029.json" if qwen_only else "chat-model-probe-20261029.json"
destination = Path("/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/verification") / name
destination.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
destination.chmod(0o600)
