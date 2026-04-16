from __future__ import annotations

import json
import os
import sys
import threading
import subprocess
import time
from typing import List, Optional
from pathlib import Path

import numpy as np
import torch
import yaml
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
from transformers import SiglipModel, SiglipProcessor

# Configuration
DEFAULT_MODEL_ID = "google/siglip-base-patch16-224"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8091
DEFAULT_DEVICE = "auto"

app = FastAPI(title="LOD Engine", version="2.0.0")

def load_model_id() -> str:
    env_model = os.getenv("LOD_SIGLIP_MODEL_ID", "").strip()
    if env_model:
        return env_model
    config_path = Path("Categories.json").parent / "config" / "default.yaml"
    if config_path.exists():
        with config_path.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle) or {}
        return data.get("models", {}).get("siglip", DEFAULT_MODEL_ID)
    return DEFAULT_MODEL_ID

class SiglipTextEncoder:
    def __init__(self, model_id: str) -> None:
        self.model_id = model_id
        self.preferred_device = (
            os.getenv("LOD_QUERY_ENCODER_DEVICE", DEFAULT_DEVICE).strip().lower()
            or DEFAULT_DEVICE
        )
        self.device = "cpu"
        self.fallback_count = 0
        self._lock = threading.Lock()
        self.processor = SiglipProcessor.from_pretrained(model_id, use_fast=True)
        self.model = self._load_model(self._resolve_initial_device())

    def _resolve_initial_device(self) -> str:
        if self.preferred_device in {"cpu", "cuda"}:
            return self.preferred_device
        return "cuda" if torch.cuda.is_available() else "cpu"

    def _load_model(self, target_device: str) -> SiglipModel:
        device = target_device
        if device == "cuda" and not torch.cuda.is_available():
            print("[lod-engine] CUDA requested but not available. Falling back to CPU.", flush=True)
            device = "cpu"

        try:
            print(f"[lod-engine] Loading model on {device}...", flush=True)
            model = SiglipModel.from_pretrained(self.model_id)
            model = model.to(device)
            
            if device == "cuda":
                try:
                    print(f"[lod-engine] Enabling FP16 half-precision for {device}", flush=True)
                    model = model.half()
                except Exception as e:
                    print(f"[lod-engine] FP16 failed on {device}: {e}. Keeping full precision.", flush=True)

            model.eval()
            self.device = device
            return model
        except Exception as e:
            if device == "cuda":
                print(f"[lod-engine] CUDA model load failed ({e}). Forcing CPU fallback.", flush=True)
                return self._load_model("cpu")
            raise

    def _encode_once(self, text: str) -> list[float]:
        inputs = self.processor(
            text=[text], padding="max_length", truncation=True, max_length=64, return_tensors="pt"
        )
        text_inputs = {
            key: value.to(self.device)
            for key, value in inputs.items()
            if key in ("input_ids", "attention_mask")
        }
        with torch.no_grad():
            text_features = self.model.get_text_features(**text_inputs)
        
        embeddings = text_features.mean(dim=1) if text_features.dim() == 3 else text_features
        embeddings = embeddings / (embeddings.norm(dim=-1, keepdim=True) + 1e-8)
        vector = embeddings.cpu().numpy().astype(np.float32)[0]
        return vector.tolist()

    def encode(self, text: str) -> list[float]:
        with self._lock:
            try:
                return self._encode_once(text)
            except Exception as e:
                print(f"[lod-engine] Inference error: {e}", flush=True)
                raise

# Global Instances
MODEL_ID = load_model_id()
ENCODER = SiglipTextEncoder(MODEL_ID)
EXPECTED_API_KEY = os.getenv("LOD_QUERY_ENCODER_API_KEY", "").strip()

# Models
class QueryRequest(BaseModel):
    query: str

class BatchRequest(BaseModel):
    input_dir: str
    output_dir: str
    limit: Optional[int] = None
    provider: Optional[str] = "Unknown"

# Auth Helper
def check_auth(request: Request):
    if not EXPECTED_API_KEY:
        return
    auth_header = request.headers.get("Authorization", "")
    if auth_header != f"Bearer {EXPECTED_API_KEY}":
        raise HTTPException(status_code=401, detail="Unauthorized")

# Routes
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": MODEL_ID,
        "device": ENCODER.device,
        "fallbackCount": ENCODER.fallback_count
    }

@app.post("/embed-query")
async def embed_query(request: Request, payload: QueryRequest):
    check_auth(request)
    try:
        vector = ENCODER.encode(payload.query)
        return {"vector": vector, "model": MODEL_ID}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process-batch")
async def process_batch(request: Request, payload: BatchRequest, background_tasks: BackgroundTasks):
    check_auth(request)
    
    # Check if pipeline is already running by looking for status file
    status_file = Path("00_data/pipeline_status.json")
    if status_file.exists():
        try:
            with open(status_file, "r") as f:
                current_status = json.load(f)
                if current_status.get("progress", 0) < 100 and time.time() - current_status.get("timestamp", 0) < 300:
                    raise HTTPException(status_code=409, detail="Pipeline already running")
        except:
            pass

    # Start the background pipeline
    background_tasks.add_task(run_pipeline_task, payload)
    return {"status": "accepted", "message": "Training pipeline started"}

@app.get("/pipeline-status")
async def get_pipeline_status():
    status_file = Path("00_data/pipeline_status.json")
    if not status_file.exists():
        return {"status": "idle", "progress": 0}
    
    try:
        with open(status_file, "r") as f:
            data = json.load(f)
            # Check for staleness (5 minutes)
            if time.time() - data.get("timestamp", 0) > 300:
                return {"status": "stale", "progress": data.get("progress", 0)}
            return data
    except Exception as e:
        return {"status": "error", "detail": str(e)}

def run_pipeline_task(payload: BatchRequest):
    """Background task to run the optimized pipeline script"""
    script_path = Path("img_pipeline/Run_Pipeline_Optimized.py")
    if not script_path.exists():
        print(f"[lod-engine] ERROR: Pipeline script not found at {script_path}", flush=True)
        return

    cmd = [
        sys.executable,
        str(script_path),
        "--input", payload.input_dir,
        "--output", payload.output_dir,
        "--provider", payload.provider,
        "--persistent" # Maintain models in VRAM for speed
    ]
    if payload.limit:
        cmd.extend(["--limit", str(payload.limit)])

    print(f"[lod-engine] Launching batch pipeline: {' '.join(cmd)}", flush=True)
    
    try:
        # We use a subprocess so the main FastAPI thread stays responsive for health checks/embeddings
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=os.getcwd()
        )
        stdout, stderr = process.communicate()
        if process.returncode != 0:
            print(f"[lod-engine] Pipeline failed with code {process.returncode}", flush=True)
            print(f"STDOUT: {stdout}", flush=True)
            print(f"STDERR: {stderr}", flush=True)
    except Exception as e:
        print(f"[lod-engine] Failed to launch pipeline: {e}", flush=True)

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("LOD_QUERY_ENCODER_HOST", DEFAULT_HOST)
    port = int(os.getenv("LOD_QUERY_ENCODER_PORT", str(DEFAULT_PORT)))
    uvicorn.run(app, host=host, port=port)
