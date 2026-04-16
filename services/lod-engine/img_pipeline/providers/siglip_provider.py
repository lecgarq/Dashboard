from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from sentence_transformers import SentenceTransformer
from transformers import SiglipModel, SiglipProcessor

from .embedding_provider import EmbeddingProvider
from hf_utils import hf_common_kwargs

ROOT_DIR = Path(__file__).resolve().parents[3]
CONFIG_ROOT = ROOT_DIR / "04_config"
if str(CONFIG_ROOT) not in sys.path:
    sys.path.insert(0, str(CONFIG_ROOT))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
from config import load_config

CFG = load_config(ROOT_DIR)
SIGLIP_MODEL_ID = CFG["models"]["siglip"]
TEXT_EMB_MODEL_ID = CFG["models"]["sentence_transformer"]


class SigLIPProvider(EmbeddingProvider):
    def __init__(self) -> None:
        self._model = None
        self._processor = None
        self._device = None
        self._text_model = None

    def load(self) -> tuple[object, object]:
        if self._model is not None:
            return self._model, self._processor
        hf_kwargs = hf_common_kwargs()
        if hf_kwargs.get("local_files_only"):
            print("[SigLIP] Network unavailable; using local_files_only=True (fail-fast).")

        if torch.cuda.is_available():
            try:
                self._device = "cuda"
                print(f"[SigLIP] Loading model on {self._device}...")
                self._processor = SiglipProcessor.from_pretrained(SIGLIP_MODEL_ID, **hf_kwargs)
                self._model = SiglipModel.from_pretrained(SIGLIP_MODEL_ID, **hf_kwargs).to(self._device)
                dummy = torch.zeros(1, 3, 224, 224).to(self._device)
                self._model.get_image_features(pixel_values=dummy)
                print(f"[SigLIP] Validated on GPU. Mem: {torch.cuda.memory_allocated()/1024**2:.1f}MB")
            except Exception as exc:
                print(f"[SigLIP] CUDA Init Failed: {exc}. Falling back to CPU.")
                self._device = "cpu"
                self._processor = SiglipProcessor.from_pretrained(SIGLIP_MODEL_ID, **hf_kwargs)
                self._model = SiglipModel.from_pretrained(SIGLIP_MODEL_ID, **hf_kwargs).to(self._device)
        else:
            print("[SigLIP] CUDA not available. Using CPU.")
            self._device = "cpu"
            self._processor = SiglipProcessor.from_pretrained(SIGLIP_MODEL_ID, **hf_kwargs)
            self._model = SiglipModel.from_pretrained(SIGLIP_MODEL_ID, **hf_kwargs).to(self._device)

        self._model.eval()
        return self._model, self._processor

    def get_image_embedding(self, img: Image.Image) -> np.ndarray:
        return self.get_image_embeddings([img])[0]

    def get_image_embeddings(self, imgs: list[Image.Image]) -> np.ndarray:
        self.load()
        if not imgs:
            return np.array([])
        inputs = self._processor(images=[img.convert("RGB") for img in imgs], return_tensors="pt").to(self._device)
        with torch.no_grad():
            outputs = self._model.get_image_features(**inputs)
        
        embs = outputs.cpu().numpy()
        norms = np.linalg.norm(embs, axis=1, keepdims=True) + 1e-8
        return (embs / norms).astype(np.float32)

    def get_text_embedding(self, text: str) -> np.ndarray:
        if self._text_model is None:
            device = "cpu"
            print(f"[TextEmb] Loading SentenceTransformer on {device}...")
            self._text_model = SentenceTransformer(TEXT_EMB_MODEL_ID, device=device)
        emb = self._text_model.encode(text, convert_to_numpy=True)
        return (emb / (np.linalg.norm(emb) + 1e-8)).astype(np.float32)

    def unload(self) -> None:
        if self._model is not None:
            del self._model
            del self._processor
            self._model = None
            self._processor = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
