from __future__ import annotations

import sys
from pathlib import Path

import torch
from transformers import Blip2ForConditionalGeneration, Blip2Processor

ROOT_DIR = Path(__file__).resolve().parents[3]
CONFIG_ROOT = ROOT_DIR / "04_config"
if str(CONFIG_ROOT) not in sys.path:
    sys.path.insert(0, str(CONFIG_ROOT))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
from config import load_config
from hf_utils import hf_common_kwargs

CFG = load_config(ROOT_DIR)


def load_blip2_model() -> tuple[Blip2ForConditionalGeneration, Blip2Processor, str]:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model_name = CFG["models"]["blip2"]
    hf_kwargs = hf_common_kwargs()
    if hf_kwargs.get("local_files_only"):
        print("[BLIP2] Network unavailable; using local_files_only=True (fail-fast).")
    processor = Blip2Processor.from_pretrained(model_name, **hf_kwargs)

    try:
        if device == "cuda":
            model = Blip2ForConditionalGeneration.from_pretrained(
                model_name,
                torch_dtype=torch.float16,
                **hf_kwargs,
            )
            model = model.to(device)
            torch.zeros(1).to(device)
            torch.cuda.synchronize()
        else:
            model = Blip2ForConditionalGeneration.from_pretrained(model_name, **hf_kwargs)
            model = model.to(device)
    except RuntimeError as exc:
        print(f"[BLIP2] Warning: CUDA failed ({exc}), falling back to CPU (slower)")
        device = "cpu"
        model = Blip2ForConditionalGeneration.from_pretrained(model_name, **hf_kwargs)
        model = model.to(device)

    model.eval()
    return model, processor, device
