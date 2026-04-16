import json
import time
import logging
import os
import sys
from pathlib import Path
from sentence_transformers import SentenceTransformer, util
from openai import OpenAI
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
CONFIG_ROOT = ROOT_DIR / "04_config"
if str(CONFIG_ROOT) not in sys.path:
    sys.path.insert(0, str(CONFIG_ROOT))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
from config import load_config

logger = logging.getLogger(__name__)
CFG = load_config(ROOT_DIR)

# Load environment variables
load_dotenv(ROOT_DIR / ".env")

# Paths
CATEGORIES_JSON = ROOT_DIR / CFG["paths"]["categories_json"]

_CAT_MODEL = None
_CATEGORIES = None
_CAT_EMBEDDINGS = None
_CAT_LIST = None

# Load from environment variables
_OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
_OPENAI_MODEL = os.getenv("OPENAI_MODEL", CFG["models"]["openai_model"])

if not _OPENAI_API_KEY:
    logger.warning("OPENAI_API_KEY not found in environment. OpenAI categorization will fail.")

def load_categories():
    global _CATEGORIES, _CAT_LIST, _CAT_MODEL, _CAT_EMBEDDINGS
    if _CATEGORIES: return
    with open(CATEGORIES_JSON, "r", encoding="utf-8") as f:
        _CATEGORIES = json.load(f)
    _CAT_LIST = []
    category_texts = []
    for cat_name, data in _CATEGORIES.items():
        desc = data.get("description", "")
        _CAT_LIST.append({"full_name": cat_name, "is_sub": False, "parent": None})
        category_texts.append(f"{cat_name}: {desc}")
        subs = data.get("subcategories", {})
        for sub_name, sub_data in subs.items():
            sub_desc = sub_data.get("description", "")
            _CAT_LIST.append({"full_name": sub_name, "is_sub": True, "parent": cat_name})
            category_texts.append(f"{cat_name} -> {sub_name}: {sub_desc}")
    _CAT_MODEL = SentenceTransformer(CFG["models"]["sentence_transformer"], device="cpu")
    _CAT_EMBEDDINGS = _CAT_MODEL.encode(category_texts, convert_to_tensor=True)

def predict_category(caption: str, top_k=1):
    load_categories()
    emb = _CAT_MODEL.encode(caption, convert_to_tensor=True)
    hits = util.semantic_search(emb, _CAT_EMBEDDINGS, top_k=top_k)
    res = []
    for hit in hits[0]:
        cat_info = _CAT_LIST[hit['corpus_id']]
        res.append({
            "category": cat_info["parent"] if cat_info["is_sub"] else cat_info["full_name"],
            "subcategory": cat_info["full_name"] if cat_info["is_sub"] else None,
            "confidence": float(hit['score'])
        })
    return res[0] if top_k==1 and res else (res if res else {"category": "Unknown", "confidence": 0})

def predict_category_openai(caption: str, retries=3):
    load_categories()
    client = OpenAI(api_key=_OPENAI_API_KEY)
    schema_lines = []
    for cat, data in _CATEGORIES.items():
        schema_lines.append(f"- {cat}: {data.get('description','')[:150]}")
        for s, sd in data.get("subcategories",{}).items():
             schema_lines.append(f"  * {s}: {sd.get('description','')[:100]}")
    schema_text = "\n".join(schema_lines)
    prompt = f"""Identify the BEST Category and Subcategory for this image description.\nUse definitions:\n{schema_text}\n\nDESCRIPTION: {caption}\n\nJSON ONLY: {{\"category\": \"Name\", \"subcategory\": \"Name or null\", \"reasoning\": \"...\"}}"""
    for i in range(retries):
        try:
            resp = client.chat.completions.create(
                model=_OPENAI_MODEL,
                messages=[{"role": "system", "content": "BIM Expert."}, {"role": "user", "content": prompt}],
                temperature=0, response_format={"type": "json_object"}
            )
            data = json.loads(resp.choices[0].message.content)
            cat, sub = data.get("category"), data.get("subcategory")
            if cat in _CATEGORIES:
                # Compute actual confidence for consistency
                cat_emb = _CAT_MODEL.encode(cat, convert_to_tensor=True)
                desc_emb = _CAT_MODEL.encode(caption, convert_to_tensor=True)
                raw_score = float(util.cos_sim(desc_emb, cat_emb)[0][0])
                
                # Normalize 0.15 - 0.65 -> 0.1 - 0.99
                conf = 0.1
                if raw_score > 0.15:
                    conf = min(0.99, (raw_score - 0.15) / 0.5)
                    conf = round(conf, 4)

                return {"category": cat, "subcategory": sub if sub in _CATEGORIES[cat].get("subcategories", {}) else None, "confidence": conf, "reasoning": data.get("reasoning")}
            return predict_category(caption)
        except Exception as e:
            if "429" in str(e): time.sleep(2**i)
            else: break
    return predict_category(caption)
