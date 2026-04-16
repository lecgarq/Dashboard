from __future__ import annotations

import sys
from pathlib import Path

import torch
from transformers import AutoModelForImageSegmentation

ROOT_DIR = Path(__file__).resolve().parents[3]
CONFIG_ROOT = ROOT_DIR / "04_config"
if str(CONFIG_ROOT) not in sys.path:
    sys.path.insert(0, str(CONFIG_ROOT))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
from config import load_config
from hf_utils import hf_common_kwargs

CFG = load_config(ROOT_DIR)


def load_rmbg_model() -> tuple[AutoModelForImageSegmentation, str]:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model_name = CFG["models"]["rmbg"]
    hf_kwargs = hf_common_kwargs(trust_remote_code=True)
    if hf_kwargs.get("local_files_only"):
        print("[RMBG] Network unavailable; using local_files_only=True (fail-fast).")

    try:
        model = AutoModelForImageSegmentation.from_pretrained(model_name, **hf_kwargs)
        model = model.to(device)
        if device == "cuda":
            dummy = torch.zeros(1, 3, 1024, 1024).to(device)
            model(dummy)
            torch.cuda.synchronize()
    except RuntimeError as exc:
        print(f"[RMBG] Warning: CUDA failed ({exc}), falling back to CPU")
        device = "cpu"
        model = AutoModelForImageSegmentation.from_pretrained(model_name, **hf_kwargs)
        model = model.to(device)

    model.eval()
    return model, device
