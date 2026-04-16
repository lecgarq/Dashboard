"""
RMBG Worker: Isolated subprocess for background removal
Uses BRIA RMBG v1.4 via HuggingFace transformers

This worker:
1. Loads the model
2. Processes the input image
3. Saves the alpha mask
4. Exits (freeing all VRAM)

Communication via JSON files for cross-process data exchange.
"""
import sys
import json
import torch
from pathlib import Path
from PIL import Image

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT_DIR))

from torchvision import transforms
from adapters.rmbg_adapter import load_rmbg_model


def load_rmbg():
    """Load BRIA RMBG model via adapter."""
    return load_rmbg_model()


def process_image(model, device, img_path: Path) -> Image.Image:
    """Process single image and return alpha mask"""
    # Load image
    img = Image.open(img_path).convert("RGB")
    orig_size = img.size
    
    # Preprocessing
    transform = transforms.Compose([
        transforms.Resize((1024, 1024)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    input_tensor = transform(img).unsqueeze(0).to(device)
    
    # Inference
    with torch.no_grad():
        output = model(input_tensor)
    
    # Post-process
    if isinstance(output, (list, tuple)):
        mask = output[0][0]
    else:
        mask = output[0]
    
    # Squeeze and convert to numpy
    mask = mask.cpu().numpy()
    
    # Robust squeeze to 2D
    while mask.ndim > 2:
        mask = mask[0]
    
    # Normalize to 0-255
    mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)
    mask = (mask * 255).astype("uint8")
    
    # Convert to PIL and resize to original
    alpha = Image.fromarray(mask, mode="L")
    alpha = alpha.resize(orig_size, Image.LANCZOS)
    
    return alpha


def main():
    """Main worker entry point"""
    if len(sys.argv) < 3:
        print("Usage: python rmbg_worker.py <input_json> <output_json>")
        sys.exit(1)
    
    input_json = Path(sys.argv[1])
    output_json = Path(sys.argv[2])
    
    # Read input
    with open(input_json, "r") as f:
        config = json.load(f)
    
    img_path = Path(config["image_path"])
    alpha_output_path = Path(config["alpha_output_path"])
    
    try:
        print(f"[RMBG] Loading model...")
        model, device = load_rmbg()
        print(f"[RMBG] Model loaded on {device}")
        
        if torch.cuda.is_available():
            print(f"[RMBG] VRAM allocated: {torch.cuda.memory_allocated() / 1024**2:.1f} MB")
        
        print(f"[RMBG] Processing: {img_path}")
        alpha = process_image(model, device, img_path)
        
        # Save alpha
        alpha_output_path.parent.mkdir(parents=True, exist_ok=True)
        alpha.save(alpha_output_path, "PNG")
        print(f"[RMBG] Saved alpha to: {alpha_output_path}")
        
        # Write success result
        result = {
            "success": True,
            "alpha_path": str(alpha_output_path),
            "device": device
        }
        
    except Exception as e:
        result = {
            "success": False,
            "error": str(e)
        }
        print(f"[RMBG] Error: {e}")
    
    finally:
        # Cleanup
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[RMBG] VRAM cleared, exiting")
    
    with open(output_json, "w") as f:
        json.dump(result, f, indent=2)


if __name__ == "__main__":
    main()
