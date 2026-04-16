"""
Caption Worker: Isolated subprocess for BLIP-2 captioning (FALLBACK ONLY)
Only runs when SAM3 cannot classify the object.

Uses FP16 for reduced VRAM.

This worker:
1. Loads BLIP-2 model (FP16)
2. Generates caption
3. Returns caption
4. Exits (freeing all VRAM)

Communication via JSON files.
"""
import sys
import json
import torch
from pathlib import Path
from PIL import Image

# Add parent to path for imports
ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(ROOT_DIR))

from adapters.blip2_adapter import load_blip2_model


def load_blip2():
    """Load BLIP-2 model using adapter (GPU with fallback)."""
    return load_blip2_model()


def generate_captions(model, processor, device, images: list[Image.Image]) -> list[str]:
    """Generate captions for a batch of images"""
    if not images:
        return []
        
    # Prepare batch inputs
    inputs = processor(images=[img.convert("RGB") for img in images], return_tensors="pt").to(device)
    
    # Convert to FP16 if on GPU
    if device == "cuda":
        inputs = {k: v.half() if v.dtype == torch.float32 else v for k, v in inputs.items()}
    
    # Generate
    with torch.no_grad():
        generated_ids = model.generate(
            **inputs,
            max_new_tokens=120,
            min_new_tokens=15,
            num_beams=3,  # Slight reduction from 5 to 3 for batch speed
            early_stopping=True
        )
    
    # Decode
    captions = processor.batch_decode(generated_ids, skip_special_tokens=True)
    return [c.strip() for c in captions]


def generate_caption(model, processor, device, img: Image.Image) -> str:
    """Fallback single caption wrapper"""
    return generate_captions(model, processor, device, [img])[0]


def main():
    """Main worker entry point"""
    if len(sys.argv) < 3:
        print("Usage: python caption_worker.py <input_json> <output_json>")
        sys.exit(1)
    
    input_json = Path(sys.argv[1])
    output_json = Path(sys.argv[2])
    
    # Read input
    with open(input_json, "r") as f:
        config = json.load(f)
    
    img_path = Path(config["image_path"])
    
    try:
        print(f"[BLIP2] Loading model (FP16)...")
        model, processor, device = load_blip2()
        print(f"[BLIP2] Model loaded on {device}")
        
        if torch.cuda.is_available():
            print(f"[BLIP2] VRAM allocated: {torch.cuda.memory_allocated() / 1024**2:.1f} MB")
        
        img = Image.open(img_path)
        
        print(f"[BLIP2] Generating caption...")
        caption = generate_caption(model, processor, device, img)
        print(f"[BLIP2] Caption: {caption}")
        
        # Write success result
        result = {
            "success": True,
            "caption": caption,
            "device": device
        }
        
    except Exception as e:
        result = {
            "success": False,
            "error": str(e),
            "caption": ""
        }
        print(f"[BLIP2] Error: {e}")
    
    finally:
        # Cleanup
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[BLIP2] VRAM cleared, exiting")
    
    with open(output_json, "w") as f:
        json.dump(result, f, indent=2)


if __name__ == "__main__":
    main()
