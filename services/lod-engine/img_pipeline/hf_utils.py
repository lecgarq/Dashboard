from __future__ import annotations

import os
import socket
from functools import lru_cache


def _env_flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def can_reach_huggingface(timeout_seconds: float = 1.0) -> bool:
    if _env_flag("LOD_HF_ASSUME_ONLINE", "0"):
        return True
    try:
        with socket.create_connection(("huggingface.co", 443), timeout=timeout_seconds):
            return True
    except OSError:
        return False


def should_use_local_files_only() -> bool:
    # Explicit override always wins.
    if _env_flag("LOD_HF_LOCAL_ONLY", "0"):
        return True
    # Default fail-fast behavior when network is blocked in this runtime.
    return not can_reach_huggingface()


def hf_common_kwargs(*, trust_remote_code: bool = False) -> dict:
    kwargs: dict = {"local_files_only": should_use_local_files_only()}
    if trust_remote_code:
        kwargs["trust_remote_code"] = True

    token = os.getenv("HUGGINGFACE_HUB_TOKEN") or os.getenv("HF_TOKEN")
    if token:
        kwargs["token"] = token
    return kwargs
