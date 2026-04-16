import sys
import json
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from Step12_Upscale import upscale_with_alpha_preservation

def main():
    if len(sys.argv) < 3: sys.exit(1)
    
    with open(sys.argv[1], "r") as f: config = json.load(f)
    input_path = Path(config["input_path"])
    output_path = Path(config["output_path"])
    
    try:
        img = Image.open(input_path)
        upscaled = upscale_with_alpha_preservation(img)
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        upscaled.save(output_path, "PNG")
        result = {"success": True, "output_path": str(output_path)}
    except Exception as e:
        result = {"success": False, "error": str(e)}

    with open(sys.argv[2], "w") as f: json.dump(result, f, indent=2)

if __name__ == "__main__":
    main()
