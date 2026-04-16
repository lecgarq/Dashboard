"""
Semantic Spatial Graph Data Generator

Generates 2D manifold projection using UMAP on L2-normalized embeddings.
Precomputes kNN for neighbor exploration.

Architecture:
- L2-normalize embeddings (cosine-compatible)
- UMAP with metric="cosine", deterministic seed
- Aspect-preserving coordinate normalization to [-1, 1]
- Precomputed kNN (K=30) via pynndescent
"""

import json
import numpy as np
import sys
from pathlib import Path

try:
    from umap import UMAP
except ImportError:
    print("Installing umap-learn...")
    import subprocess
    subprocess.run(["pip", "install", "umap-learn"], check=True)
    from umap import UMAP

try:
    from pynndescent import NNDescent
except ImportError:
    print("Installing pynndescent...")
    import subprocess
    subprocess.run(["pip", "install", "pynndescent"], check=True)
    from pynndescent import NNDescent

# Config
ROOT_DIR = Path(__file__).resolve().parents[2]
CONFIG_ROOT = ROOT_DIR / "04_config"
if str(CONFIG_ROOT) not in sys.path:
    sys.path.append(str(CONFIG_ROOT))
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))
from config import load_config

CFG = load_config(ROOT_DIR)
VECTORS_FILE = ROOT_DIR / CFG["paths"]["vectors_dir"] / "master_registry.json"
OUTPUT_FILE = ROOT_DIR / CFG["paths"]["vectors_dir"] / "graph_data.json"

RANDOM_STATE = 42
UMAP_N_NEIGHBORS = 15
UMAP_MIN_DIST = 0.1
KNN_K = 30


def generate_semantic_graph():
    print(f"Loading data from {VECTORS_FILE}...")
    
    with open(VECTORS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    print(f"Loaded {len(data)} records")
    
    # Extract embeddings and deduplicate by ID
    embeddings = []
    valid_records = []
    seen_ids = set()
    
    for rec in data:
        rid = rec.get("id")
        if not rid: continue
        
        if rid in seen_ids: continue
        
        emb = rec.get("image_embedding")
        if emb and len(emb) > 0:
            seen_ids.add(rid)
            embeddings.append(emb)
            valid_records.append(rec)
    
    print(f"Found {len(valid_records)} records with embeddings")
    embeddings = np.array(embeddings, dtype=np.float32)
    
    # 1. L2-normalize embeddings (guard against zero vectors)
    print("L2-normalizing embeddings...")
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0  # Guard against zero vectors
    embeddings_norm = embeddings / norms
    
    # 2. UMAP dimensionality reduction
    print(f"Running UMAP (n_neighbors={UMAP_N_NEIGHBORS}, min_dist={UMAP_MIN_DIST})...")
    reducer = UMAP(
        n_components=2,
        metric="cosine",
        random_state=RANDOM_STATE,
        n_neighbors=UMAP_N_NEIGHBORS,
        min_dist=UMAP_MIN_DIST,
        low_memory=False, # Faster execution
        n_jobs=-1,        # Use all cores
        verbose=True
    )
    coords = reducer.fit_transform(embeddings_norm)
    print(f"UMAP complete. Shape: {coords.shape}")
    
    # 3. Aspect-preserving coordinate normalization to [-1, 1]
    print("Normalizing coordinates (aspect-preserving)...")
    mins = coords.min(axis=0)
    maxs = coords.max(axis=0)
    center = (mins + maxs) / 2
    scale = (maxs - mins).max() / 2  # Single scalar preserves aspect
    
    coords = (coords - center) / scale
    coords = np.clip(coords, -1, 1)
    
    # 4. Precompute kNN using pynndescent
    print(f"Computing {KNN_K}-NN index...")
    index = NNDescent(
        embeddings_norm,
        metric="cosine",
        random_state=RANDOM_STATE,
        n_jobs=-1,             # Use all cores
        n_neighbors=KNN_K + 1  # +1 to account for self
    )
    neighbors_raw, _ = index.query(embeddings_norm, k=KNN_K + 1)
    
    # Remove self from neighbors
    neighbors = []
    for i, row in enumerate(neighbors_raw):
        filtered = [int(j) for j in row if j != i][:KNN_K]
        neighbors.append(filtered)
    
    print(f"kNN complete. Each node has {KNN_K} neighbors.")
    
    # 5. Build output nodes
    print("Building output...")
    nodes = []
    
    for idx, rec in enumerate(valid_records):
        # Robust LOD Label Logic
        lod_val = rec.get("lod_label")
        if not lod_val:
            # Try to derive from numeric LOD
            lod_num = rec.get("lod") or rec.get("level_of_detail")
            if lod_num:
                try:
                    val = int(lod_num)
                    if val <= 100: lod_val = "Low"
                    elif val <= 200: lod_val = "Medium"
                    elif val <= 300: lod_val = "Medium-High"
                    elif val <= 400: lod_val = "High"
                    else: lod_val = "Very High"
                except (ValueError, TypeError):
                    lod_val = str(lod_num)
            else:
                lod_val = "Unknown"

        # Robust filename logic
        filename = rec.get("name_of_file")
        if not filename and rec.get("output_path"):
             filename = Path(rec["output_path"]).name
        if not filename and rec.get("id"):
             filename = f"{rec['id']}.png" # Last resort
        
        node = {
            "idx": idx, # Keep original idx for internal use
            "id": rec["id"], # Changed to direct access, assuming 'id' is always present
            "x": float(coords[idx, 0]),
            "y": float(coords[idx, 1]),
            "neighbors": neighbors[idx],
            # Display properties
            "name": rec.get("name_of_image", "Unknown"), # Changed from simplified_description
            "family_name": rec.get("family_name", "Generic Family"), # New field
            "final_category": rec.get("final_category") or "Uncategorized", # Changed fallback
            "lod_label": lod_val, # Using the robustly determined value
            "provider": rec.get("provider", "Unknown"),
            "img": f"/img/{filename}" if filename else "", # Changed path from thumb to root
            "full_description": rec.get("full_description"),
            "confidence_level": rec.get("confidence_level"),
            "original_file": rec.get("original_file"),
            "file_size_kb": rec.get("file_size_kb"),
            "possible_categories": rec.get("possible_categories", []),
            "category_candidates": rec.get("category_candidates", []),
        }
        nodes.append(node)
    
    # 6. Build metadata
    meta = {
        "umap": {
            "metric": "cosine",
            "n_neighbors": UMAP_N_NEIGHBORS,
            "min_dist": UMAP_MIN_DIST,
            "seed": RANDOM_STATE
        },
        "knn": {
            "k": KNN_K,
            "metric": "cosine",
            "seed": RANDOM_STATE
        },
        "bounds": {
            "x": [-1, 1],
            "y": [-1, 1]
        },
        "count": len(nodes)
    }
    
    output = {
        "meta": meta,
        "nodes": nodes
    }
    
    # 7. Save
    print(f"Saving to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f)
    
    print(f"✓ Exported {len(nodes)} nodes with precomputed positions and neighbors")
    print(f"  Bounds: x=[{coords[:,0].min():.3f}, {coords[:,0].max():.3f}], y=[{coords[:,1].min():.3f}, {coords[:,1].max():.3f}]")


if __name__ == "__main__":
    generate_semantic_graph()
