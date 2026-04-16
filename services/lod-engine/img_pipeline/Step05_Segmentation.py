import sys
import json
import torch
import numpy as np
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from Step11_Detection import segment_with_boxes, unload_sam

def main():
    if len(sys.argv) < 3: sys.exit(1)
    
    with open(sys.argv[1], "r") as f: config = json.load(f)
    img_path = Path(config["image_path"])
    boxes = config.get("boxes", [])
    mask_output_path = Path(config.get("mask_output_path", "sam_mask.png"))
    
    try:
        if not boxes:
            # Fallback if no boxes provided (auto-segment not implemented in lib yet)
            combined = np.zeros(Image.open(img_path).size[::-1], dtype=np.uint8)
        else:
            img = Image.open(img_path).convert("RGB")
            # We take the best box or combine them
            # For simplicity, we process the first 3 boxes and combine
            combined = np.zeros(img.size[::-1], dtype=np.uint8)
            for box in boxes[:3]:
                mask = segment_with_boxes(img, box)
                combined = np.maximum(combined, mask)
        
        mask_output_path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(combined, mode="L").save(mask_output_path, "PNG")
        
        result = {"success": True, "mask_path": str(mask_output_path)}
    except Exception as e:
        result = {"success": False, "error": str(e)}
    finally:
        unload_sam()

    with open(sys.argv[2], "w") as f: json.dump(result, f, indent=2)

if __name__ == "__main__":
    main()
