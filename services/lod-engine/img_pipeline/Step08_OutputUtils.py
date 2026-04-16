import json
import uuid
from pathlib import Path

import cv2
import numpy as np

def estimate_lod(img, mask=None):
    # Convert to numpy
    if hasattr(img, 'convert'):
        img_np = np.array(img.convert("RGB"))
    else:
        img_np = img

    # Grayscale
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    
    # Metrics
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    sharpness = laplacian.var()
    
    edges = cv2.Canny(gray, 100, 200)
    edge_density = np.count_nonzero(edges) / (edges.size + 1e-6)
    
    height, width = gray.shape
    resolution_mp = (width * height) / 1e6
    aspect = width / (height + 1e-6)
    
    # Composite detail score. Sharpness alone tended to under-rank detailed elements.
    detail_score = sharpness + (edge_density * 1800.0) + (min(resolution_mp, 10.0) * 45.0)
    if detail_score < 220: lod = 100; label = "Low"
    elif detail_score < 520: lod = 200; label = "Medium"
    elif detail_score < 950: lod = 300; label = "Medium-High"
    else: lod = 400; label = "High"
    
    return {
        "lod": lod, 
        "lod_label": label, 
        "metrics": {
            "sharpness": float(sharpness),
            "edge_density": float(edge_density),
            "resolution_mp": float(resolution_mp),
            "aspect_ratio": float(aspect),
            "detail_score": float(detail_score)
        }
    }

import hashlib

def create_image_record(original_path, output_path, description, cat_data, **kwargs):
    return {
        "id": str(uuid.uuid4()),
        "name_of_image": Path(output_path).stem,
        "name_of_file": Path(output_path).name,
        "original_path": str(original_path),  # Explicitly save this for deduplication
        "full_description": description,
        "final_category": cat_data.get("category"),
        "subcategory": cat_data.get("subcategory"),
        "confidence_level": cat_data.get("confidence"),
        "reasoning": cat_data.get("reasoning"),
        "output_path": str(output_path),
        **kwargs
    }

def write_image_json(record, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2)

def write_jsonl_record(record, path):
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")

def generate_output_filename(name, cat, idx):
    clean = "".join(x if x.isalnum() else "_" for x in name)
    # Use MD5 of the name + idx to ensure stability across runs
    stable_hash = hashlib.md5(f"{name}_{idx}".encode()).hexdigest()[:6]
    return f"{clean}_{stable_hash}.png"

def sanitize_category_path(cat):
    return str(cat).replace(" ", "_").replace("/", "_")

def generate_simplified_name(desc):
    return "_".join(str(desc).split()[:5])
