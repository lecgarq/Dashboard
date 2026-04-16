import argparse
import json
import logging
import sys
import shutil
from pathlib import Path
from tqdm import tqdm

# Add parent directory to path to find other Steps
sys.path.append(str(Path(__file__).parent.parent))

try:
    from img_pipeline.Step07_Embeddings import get_image_embedding, get_text_embedding, unload_siglip
except ImportError:
    # Fallback if running from root without package structure
    try:
        from Step07_Embeddings import get_image_embedding, get_text_embedding, unload_siglip
    except ImportError:
         print("Warning: Step07_Embeddings not found. Embedding restoration will fail.")

# Configure logging
logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

def consolidate_jsons(output_dir):
    """
    Consolidates all individual JSON files and the batch manifest into a single master registry.
    """
    vectors_dir = output_dir / "vectors"
    if not vectors_dir.exists(): vectors_dir = output_dir # Support flat or nested
    master_path = vectors_dir / "master_registry.json"
    
    all_records = []
    
    # 1. Load existing master if it exists
    if master_path.exists():
        try:
            with open(master_path, "r", encoding="utf-8") as f:
                all_records = json.load(f)
            logger.info(f"Loaded {len(all_records)} existing records from master registry.")
        except Exception as e:
            logger.error(f"Failed to load master registry: {e}")

    # 2. Load and merge ALL batch manifests
    # New pattern: batch_YYYYMMDD_HHMMSS.json in vectors/
    batch_files = list(vectors_dir.glob("batch_*.json"))
    
    # Also support legacy classification_manifest.json
    legacy_manifest = output_dir / "classification_manifest.json"
    if legacy_manifest.exists(): batch_files.append(legacy_manifest)

    logger.info(f"Found {len(batch_files)} batch files to merge.")

    for b_file in batch_files:
        try:
            with open(b_file, "r", encoding="utf-8") as f:
                batch_data = json.load(f)
                if isinstance(batch_data, list):
                    all_records.extend(batch_data)
                else:
                    logger.warning(f"Batch {b_file.name} is not a list, skipping.")
        except Exception as e:
            logger.error(f"Failed to load batch {b_file.name}: {e}")

    # 3. Scan for stray JSONs in output dir (legacy cleanup)
    stray_jsons = list(output_dir.glob("*.json"))
    for json_file in tqdm(stray_jsons, desc="Merging stray JSONs"):
        if json_file.name in ["classification_manifest.json", "master_registry.json", "Categories.json"]: continue
        if json_file.parent.name == "vectors": continue 
        
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    # Check if it looks like an image record
                    if "id" in data or "name_of_file" in data:
                        all_records.append(data)
                elif isinstance(data, list):
                    all_records.extend(data)
        except Exception as e:
            logger.error(f"Error reading {json_file.name}: {e}")

    # Deduplicate by ID or Filename
    unique_records = {}
    for i, rec in enumerate(all_records):
        # Key priority: original_path (Stable) > name_of_file (Standard) > filename (Legacy) > id (UUID) > index (Fallback)
        # We ensure we keep the LATEST version if multiple exist (as we iterate in order)
        key = rec.get("original_path") or rec.get("name_of_file") or rec.get("filename") or rec.get("id") or str(i)
        unique_records[key] = rec
    final_list = list(unique_records.values())
    
    # Save Master
    with open(master_path, "w", encoding="utf-8") as f:
        json.dump(final_list, f, indent=2)
    
    logger.info(f"✅ Consolidation Complete. Master Registry: {len(final_list)} records.")
    
    # Cleanup: Remove batch files that have been consolidated into the master registry
    cleaned = 0
    for b_file in batch_files:
        try:
            b_file.unlink()
            cleaned += 1
        except Exception as e:
            logger.warning(f"Could not remove batch file {b_file.name}: {e}")
    if cleaned:
        logger.info(f"🧹 Cleaned up {cleaned} batch file(s) after consolidation.")

    return final_list

def restore_embeddings(output_dir):
    """
    Scans the output directory (specifically img/) for images missing from the master registry
    or records missing embeddings, and generates them.
    """
    img_dir = output_dir / "img"
    vectors_dir = output_dir / "vectors"
    master_path = vectors_dir / "master_registry.json"
    
    if not master_path.exists():
        logger.error("Master registry not found. Run --consolidate first.")
        return

    with open(master_path, "r", encoding="utf-8") as f:
        records = json.load(f)
    
    # Create lookup
    rec_map = {Path(r["file_path"]).name: r for r in records if "file_path" in r}
    
    updated_count = 0
    from PIL import Image
    
    # Scan images
    images = list(img_dir.glob("*.png"))
    logger.info(f"Scanning {len(images)} images for missing embeddings...")
    
    for img_path in tqdm(images):
        img_name = img_path.name
        needs_update = False
        
        # Check if record exists
        if img_name not in rec_map:
            logger.warning(f"Skipping {img_name}: No metadata record found. Run pipeline fully for this image.")
            continue
            
        record = rec_map[img_name]
        
        # Check if embeddings are missing/empty
        if not record.get("image_embedding") or len(record["image_embedding"]) == 0:
            try:
                img = Image.open(img_path).convert("RGB")
                emb = get_image_embedding(img)
                record["image_embedding"] = emb.tolist()
                needs_update = True
            except Exception as e:
                logger.error(f"Failed to embed image {img_name}: {e}")
        
        if not record.get("text_embedding") or len(record["text_embedding"]) == 0:
             # If we have a caption, embed it
             if record.get("caption"):
                 try:
                    txt_emb = get_text_embedding(record["caption"])
                    record["text_embedding"] = txt_emb.tolist()
                    needs_update = True
                 except Exception as e:
                     logger.error(f"Failed to embed text for {img_name}: {e}")

        if needs_update:
            updated_count += 1
            
    if updated_count > 0:
        unload_siglip()
        # Save updates
        with open(master_path, "w", encoding="utf-8") as f:
            json.dump(list(rec_map.values()), f, indent=2)
        logger.info(f"✅ Restored embeddings for {updated_count} records.")
    else:
        logger.info("All records appear to have embeddings.")

def main():
    parser = argparse.ArgumentParser(description="Data Management Tools for LOD Checker")
    parser.add_argument("--root", required=True, help="Output root folder (e.g. ./00_data)")
    parser.add_argument("--consolidate", action="store_true", help="Merge all manifest/json files into master_registry.json")
    parser.add_argument("--restore", action="store_true", help="Generate missing embeddings for images in master registry")
    
    args = parser.parse_args()
    output_dir = Path(args.root)
    
    if args.consolidate:
        consolidate_jsons(output_dir)
        
    if args.restore:
        restore_embeddings(output_dir)

if __name__ == "__main__":
    main()
