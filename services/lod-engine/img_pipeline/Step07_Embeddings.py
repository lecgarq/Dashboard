import torch
import numpy as np
import sys
from pathlib import Path
from PIL import Image
from providers import SigLIPProvider

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

_PROVIDER = SigLIPProvider()


def load_siglip():
    return _PROVIDER.load()


def get_image_embedding(img: Image.Image) -> np.ndarray:
    return _PROVIDER.get_image_embedding(img)


def get_image_embeddings(imgs: list[Image.Image]) -> np.ndarray:
    return _PROVIDER.get_image_embeddings(imgs)


def unload_siglip():
    _PROVIDER.unload()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def get_text_embedding(text: str) -> np.ndarray:
    return _PROVIDER.get_text_embedding(text)
