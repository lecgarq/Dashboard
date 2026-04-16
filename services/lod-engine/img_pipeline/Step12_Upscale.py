import subprocess
import tempfile
import sys
from pathlib import Path
from PIL import Image

ROOT_DIR = Path(__file__).resolve().parents[2]
CONFIG_ROOT = ROOT_DIR / "04_config"
if str(CONFIG_ROOT) not in sys.path:
    sys.path.insert(0, str(CONFIG_ROOT))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
from config import load_config

load_config(ROOT_DIR)
REALESRGAN_REL_PATH = Path(__file__).parent / "bin" / "realesrgan" / "realesrgan-ncnn-vulkan.exe"
REALESRGAN_CONFIG_PATH = ROOT_DIR / "01_backend" / "img_pipeline" / "bin" / "realesrgan" / "realesrgan-ncnn-vulkan.exe"

def upscale_with_alpha_preservation(img: Image.Image, scale=4):
    exe = REALESRGAN_REL_PATH
    if not exe.exists():
        exe = REALESRGAN_CONFIG_PATH
        if not exe.exists(): return img
        
    with tempfile.TemporaryDirectory() as tmp:
        tmp_p = Path(tmp)
        rgb_in, rgb_out = tmp_p/"i.png", tmp_p/"o.png"
        img.convert("RGB").save(rgb_in)
        
        subprocess.run([str(exe), "-i", str(rgb_in), "-o", str(rgb_out), "-s", str(scale), "-n", "realesrgan-x4plus"], capture_output=True)
        
        if not rgb_out.exists(): return img
        
        big_rgb = Image.open(rgb_out).convert("RGB")
        if img.mode == "RGBA":
            alpha = img.split()[3].resize(big_rgb.size, Image.LANCZOS)
            big_rgb.putalpha(alpha)
        return big_rgb
