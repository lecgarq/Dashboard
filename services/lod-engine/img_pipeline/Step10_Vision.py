import cv2
import numpy as np
from PIL import Image
from typing import Tuple

def check_quality_gate(alpha: Image.Image, threshold=0.6) -> Tuple[bool, dict]:
    a = np.array(alpha.convert("L"))
    _, bin_img = cv2.threshold(a, 127, 255, cv2.THRESH_BINARY)
    num, _, stats, _ = cv2.connectedComponentsWithStats(bin_img)
    blob_count = num - 1
    frag = 0
    if blob_count > 0:
        areas = stats[1:, cv2.CC_STAT_AREA]
        frag = 1 - (max(areas) / (sum(areas) + 1e-6))
    edges = cv2.Canny(a, 50, 150)
    sharpness = 0
    if np.sum(edges) > 0:
        gy, gx = np.gradient(a)
        mag = np.sqrt(gx**2 + gy**2)
        sharpness = np.mean(mag[edges > 0]) / 255.0
    score = 1.0 - (frag * 0.3) + (sharpness * 0.3)
    if blob_count > 1: score -= 0.2
    score = min(1.0, max(0.0, score))
    needs_refinement = (blob_count == 0) or (blob_count > 3) or (frag > 0.5) or (score < threshold)
    return not needs_refinement, {"score": score, "needs_refinement": needs_refinement}

def flood_fill_background(alpha: Image.Image) -> Image.Image:
    a = np.array(alpha.convert("L"))
    h, w = a.shape
    _, b = cv2.threshold(a, 127, 255, cv2.THRESH_BINARY)
    mask = np.zeros((h+2, w+2), np.uint8)
    for pt in [(0,0), (w-1,0), (0,h-1), (w-1,h-1)]:
        if b[pt[1], pt[0]] == 0:
            cv2.floodFill(b, mask, pt, 128)
    b[b==0] = 255
    b[b==128] = 0
    return Image.fromarray(b, "L")

def remove_background_artifacts(img: Image.Image, alpha: Image.Image):
    return img.convert("RGB"), alpha

def apply_mask_to_image(img, alpha):
    rgba = img.convert("RGB")
    a = alpha.resize(rgba.size, Image.LANCZOS).convert("L")
    # Light blur reduces jagged/cropped edge artifacts without changing object silhouette much.
    a_np = np.array(a, dtype=np.uint8)
    a_np = cv2.GaussianBlur(a_np, (3, 3), 0)
    rgba.putalpha(Image.fromarray(a_np, "L"))
    return rgba

def refine_mask_aggressive(img, alpha, detect_halo=True, min_retention_ratio=0.85):
    """
    Conservative refinement with shrinkage guard:
    - Fill small internal holes/gaps.
    - Preserve boundary details by reverting if mask area shrinks too much.
    """
    orig = np.array(alpha.convert("L"), dtype=np.uint8)

    # 1) Inclusive boost: keep weak positives instead of hard erosion.
    boosted = orig.copy()
    boosted[boosted > 20] = 255

    # 2) Fill holes on boosted mask.
    alpha_boosted = Image.fromarray(boosted, "L")
    alpha_filled = flood_fill_background(alpha_boosted)
    refined = np.array(alpha_filled, dtype=np.uint8)

    # 3) Small close to connect tiny gaps while minimizing edge movement.
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    refined = cv2.morphologyEx(refined, cv2.MORPH_CLOSE, k, iterations=1)

    # 4) Retention guard: if refinement removes too much area, keep original mask.
    orig_fg = int(np.count_nonzero(orig > 20))
    refined_fg = int(np.count_nonzero(refined > 20))
    if orig_fg > 0 and refined_fg < int(orig_fg * float(min_retention_ratio)):
        return Image.fromarray(orig, "L")

    return Image.fromarray(refined, "L")
