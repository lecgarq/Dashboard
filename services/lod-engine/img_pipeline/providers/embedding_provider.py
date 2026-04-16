from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np
from PIL import Image


class EmbeddingProvider(ABC):
    @abstractmethod
    def load(self) -> tuple[object, object]:
        raise NotImplementedError

    @abstractmethod
    def get_image_embedding(self, img: Image.Image) -> np.ndarray:
        raise NotImplementedError

    @abstractmethod
    def get_text_embedding(self, text: str) -> np.ndarray:
        raise NotImplementedError

    @abstractmethod
    def unload(self) -> None:
        raise NotImplementedError
