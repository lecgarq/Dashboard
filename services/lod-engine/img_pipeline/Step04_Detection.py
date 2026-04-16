import sys
import json
import torch
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from Step11_Detection import detect_taxonomy_categories, unload_gdino

def main():
    if len(sys.argv) < 3: sys.exit(1)
    
    with open(sys.argv[1], "r") as f: config = json.load(f)
    img_path = Path(config["image_path"])
    category_index = config.get("category_index", {})
    box_threshold = config.get("box_threshold", 0.3)
    
    try:
        img = Image.open(img_path)
        detections, detected_category = detect_taxonomy_categories(img, category_index, box_threshold=box_threshold)
        
        # Format for SAM (list of [xmin, ymin, xmax, ymax])
        boxes = [d["box"] for d in detections]
        
        result = {
            "success": True,
            "detections": detections,
            "boxes": boxes,
            "detected_category": detected_category
        }
    except Exception as e:
        result = {"success": False, "error": str(e), "detections": [], "boxes": [], "detected_category": None}
    finally:
        unload_gdino()

    with open(sys.argv[2], "w") as f: json.dump(result, f, indent=2)

if __name__ == "__main__":
    main()
