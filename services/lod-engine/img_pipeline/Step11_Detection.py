import torch
import numpy as np
import sys
from pathlib import Path
from PIL import Image
from transformers import AutoProcessor, GroundingDinoForObjectDetection, SamModel, SamProcessor
from hf_utils import hf_common_kwargs

ROOT_DIR = Path(__file__).resolve().parents[2]
CONFIG_ROOT = ROOT_DIR / "04_config"
if str(CONFIG_ROOT) not in sys.path:
    sys.path.insert(0, str(CONFIG_ROOT))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
from config import load_config

CFG = load_config(ROOT_DIR)
GDINO_MODEL_ID = CFG["models"]["gdino"]
SAM_MODEL_ID = CFG["models"]["sam"]

_GDINO_MODEL = None
_GDINO_PROCESSOR = None
_GDINO_DEVICE = None

_SAM_MODEL = None
_SAM_PROCESSOR = None
_SAM_DEVICE = None

def load_gdino():
    global _GDINO_MODEL, _GDINO_PROCESSOR, _GDINO_DEVICE
    if _GDINO_MODEL is None:
        _GDINO_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
        hf_kwargs = hf_common_kwargs()
        if hf_kwargs.get("local_files_only"):
            print("[Step11] GDINO using local_files_only=True (fail-fast).")
        _GDINO_PROCESSOR = AutoProcessor.from_pretrained(GDINO_MODEL_ID, **hf_kwargs)
        _GDINO_MODEL = GroundingDinoForObjectDetection.from_pretrained(GDINO_MODEL_ID, **hf_kwargs).to(_GDINO_DEVICE)
    return _GDINO_MODEL, _GDINO_PROCESSOR

def detect_taxonomy_categories(img: Image.Image, category_index: dict, box_threshold=0.3):
    model, processor = load_gdino()
    phrases = list(category_index.keys())
    
    # Process in chunks to avoid token limit overflow (256 limit)
    all_detections = []
    chunk_size = 30  # Safe batch size
    
    for i in range(0, len(phrases), chunk_size):
        chunk = phrases[i : i + chunk_size]
        text = ". ".join(chunk) + "."
        
        try:
            inputs = processor(images=img.convert("RGB"), text=text, return_tensors="pt").to(_GDINO_DEVICE)
            with torch.no_grad():
                outputs = model(**inputs)
            
            results = processor.post_process_grounded_object_detection(
                outputs, inputs.input_ids, threshold=box_threshold, text_threshold=box_threshold, target_sizes=[img.size[::-1]]
            )[0]
            
            chunk_detections = [
                {"score": float(s), "label": l, "box": b.cpu().numpy().tolist()} 
                for s, l, b in zip(results["scores"], results["labels"], results["boxes"])
            ]
            all_detections.extend(chunk_detections)
            
        except RuntimeError as e:
            print(f"[Step11] GDINO Chunk Error: {e}. Skipping chunk.")
            continue

    best_cat = max(all_detections, key=lambda x: x["score"])["label"] if all_detections else None
    return all_detections, best_cat

def unload_gdino():
    global _GDINO_MODEL, _GDINO_PROCESSOR
    if _GDINO_MODEL:
        del _GDINO_MODEL; del _GDINO_PROCESSOR; _GDINO_MODEL = None
        if torch.cuda.is_available(): torch.cuda.empty_cache()

def load_sam():
    global _SAM_MODEL, _SAM_PROCESSOR, _SAM_DEVICE
    if _SAM_MODEL is None:
        _SAM_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
        hf_kwargs = hf_common_kwargs()
        if hf_kwargs.get("local_files_only"):
            print("[Step11] SAM using local_files_only=True (fail-fast).")
        _SAM_PROCESSOR = SamProcessor.from_pretrained(SAM_MODEL_ID, **hf_kwargs)
        _SAM_MODEL = SamModel.from_pretrained(SAM_MODEL_ID, **hf_kwargs).to(_SAM_DEVICE)
    return _SAM_MODEL, _SAM_PROCESSOR

def segment_with_boxes(img: Image.Image, box: list):
    model, processor = load_sam()
    inputs = processor(img.convert("RGB"), input_boxes=[[box]], return_tensors="pt").to(_SAM_DEVICE)
    with torch.no_grad():
        outputs = model(**inputs)
    masks = processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes)[0]
    # masks[0] has shape [3, H, W] representing 3 levels of granularity.
    # We take the logical OR (max) of all 3 to ensure we don't destroy elements.
    combined_mask = torch.max(masks[0], dim=0)[0].cpu().numpy()
    return (combined_mask * 255).astype(np.uint8)

def unload_sam():
    global _SAM_MODEL, _SAM_PROCESSOR
    if _SAM_MODEL:
        del _SAM_MODEL; del _SAM_PROCESSOR; _SAM_MODEL = None
        if torch.cuda.is_available(): torch.cuda.empty_cache()
