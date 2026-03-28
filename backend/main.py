"""
FINDME — Complete Single-File Backend
======================================
FastAPI + MongoDB (Motor) + MobileNetV3 CNN + TF-IDF matching
No external AI APIs. Runs fully locally.

Usage:
    pip install fastapi uvicorn[standard] motor pymongo pydantic[email] \
                python-jose[cryptography] passlib[bcrypt] python-multipart \
                pillow numpy scikit-learn torch torchvision python-dotenv aiofiles
    uvicorn backend:app --reload --port 8000

Environment variables (create a .env file):
    MONGO_URI=mongodb://localhost:27017
    MONGO_DB=findme
    SECRET_KEY=your-strong-secret-here
    IMAGE_WEIGHT=0.6
    TEXT_WEIGHT=0.4
    MIN_MATCH_SCORE=35.0
    BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxxxxxx
    BREVO_FROM_EMAIL=noreply@yourdomain.com
    BREVO_FROM_NAME=FINDME
"""

# ─────────────────────────────────────────────────────────────────────────────
# IMPORTS
# ─────────────────────────────────────────────────────────────────────────────
import os, io, uuid, json, logging, re
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from enum import Enum
from functools import lru_cache
from typing import Optional

import numpy as np
from bson import ObjectId
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
# Note: Form is still used in create_item for multipart file uploads
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
#from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from PIL import Image
from pydantic import BaseModel, EmailStr
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity as sk_cosine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("findme")

# IST = UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))

def now_utc() -> datetime:
    """Return current datetime in UTC."""
    return datetime.now(timezone.utc)

def now_ist() -> datetime:
    """Return current datetime in Indian Standard Time (UTC+5:30)."""
    return datetime.now(IST)

# ─────────────────────────────────────────────────────────────────────────────
# SETTINGS
# ─────────────────────────────────────────────────────────────────────────────
class Settings(BaseModel):
    MONGO_URI:                str = "mongodb://localhost:27017"
    MONGO_DB:                 str = "findme"
    SECRET_KEY:               str = "changeme-use-a-long-random-string"
    ACCESS_TOKEN_EXPIRE_MINS: int = 1440          # 24 h
    UPLOAD_DIR:               str = "uploads"
    MAX_FILE_MB:              int = 10
    IMAGE_WEIGHT:           float = 0.6
    TEXT_WEIGHT:            float = 0.4
    MIN_MATCH_SCORE:        float = 35.0
    BREVO_API_KEY:            str = ""
    BREVO_FROM_EMAIL:         str = "noreply@yourdomain.com"
    BREVO_FROM_NAME:          str = "FINDME"
    CLOUDINARY_CLOUD_NAME:     str=""
    CLOUDINARY_API_KEY:        str=""
    CLOUDINARY_API_SECRET:     str=""

@lru_cache
def cfg() -> Settings:
    from dotenv import load_dotenv
    load_dotenv()
    return Settings(
        MONGO_URI               = os.getenv("MONGO_URI",               "mongodb://localhost:27017"),
        MONGO_DB                = os.getenv("MONGO_DB",                "findme"),
        SECRET_KEY              = os.getenv("SECRET_KEY",              "changeme"),
        ACCESS_TOKEN_EXPIRE_MINS= int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")),
        UPLOAD_DIR              = os.getenv("UPLOAD_DIR",              "uploads"),
        MAX_FILE_MB             = int(os.getenv("MAX_FILE_MB",         "10")),
        IMAGE_WEIGHT            = float(os.getenv("IMAGE_WEIGHT",      "0.6")),
        TEXT_WEIGHT             = float(os.getenv("TEXT_WEIGHT",       "0.4")),
        MIN_MATCH_SCORE         = float(os.getenv("MIN_MATCH_SCORE",   "35.0")),
        BREVO_API_KEY           = os.getenv("BREVO_API_KEY",           ""),
        BREVO_FROM_EMAIL        = os.getenv("BREVO_FROM_EMAIL",        "noreply@yourdomain.com"),
        BREVO_FROM_NAME         = os.getenv("BREVO_FROM_NAME",         "FINDME"),
        CLOUDINARY_CLOUD_NAME   =os.getenv("CLOUDINARY_CLOUD_NAME"),
        CLOUDINARY_API_KEY      =os.getenv("CLOUDINARY_API_KEY"),
        CLOUDINARY_API_SECRET   =os.getenv("CLOUDINARY_API_SECRET"),

    )

# ─────────────────────────────────────────────────────────────────────────────
# DATABASE
# ─────────────────────────────────────────────────────────────────────────────
_mongo_client: AsyncIOMotorClient | None = None

def mongo_client() -> AsyncIOMotorClient:
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(cfg().MONGO_URI)
    return _mongo_client

def db():
    return mongo_client()[cfg().MONGO_DB]

def col_users():        return db()["users"]
def col_items():        return db()["items"]
def col_matches():      return db()["matches"]
def col_notifications():return db()["notifications"]

async def create_indexes():
    await col_users().create_index("email", unique=True)
    await col_items().create_index("owner_id")
    await col_items().create_index("status")
    await col_items().create_index("created_at")
    await col_matches().create_index("lost_item_id")
    await col_matches().create_index("found_item_id")
    await col_matches().create_index([("score", -1)])
    await col_notifications().create_index("user_id")

# ─────────────────────────────────────────────────────────────────────────────
# AUTH UTILITIES
# ─────────────────────────────────────────────────────────────────────────────
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2  = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def hash_pw(pw: str)            -> str:  return pwd_ctx.hash(pw)
def verify_pw(plain, hashed)    -> bool: return pwd_ctx.verify(plain, hashed)

def make_token(user_id: str) -> str:
    expire = now_utc() + timedelta(minutes=cfg().ACCESS_TOKEN_EXPIRE_MINS)
    return jwt.encode({"sub": user_id, "exp": expire}, cfg().SECRET_KEY, algorithm="HS256")

async def current_user(token: str = Depends(oauth2)) -> dict:
    exc = HTTPException(status_code=401, detail="Invalid credentials",
                        headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, cfg().SECRET_KEY, algorithms=["HS256"])
        uid = payload.get("sub")
        if not uid: raise exc
    except JWTError:
        raise exc
    user = await col_users().find_one({"_id": ObjectId(uid)})
    if not user or not user.get("is_active", True): raise exc
    return user

# ─────────────────────────────────────────────────────────────────────────────
# CNN IMAGE EMBEDDING  (MobileNetV3-Small, 576-d, runs on CPU)
# ─────────────────────────────────────────────────────────────────────────────
_cnn_model  = None
_cnn_prep   = None

def load_cnn():
    global _cnn_model, _cnn_prep
    if _cnn_model is not None:
        return _cnn_model, _cnn_prep
    try:
        import torch
        import torchvision.models   as M
        import torchvision.transforms as T

        backbone = M.mobilenet_v3_small(weights=M.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
        backbone.classifier = torch.nn.Identity()   # drop classifier → 576-d output
        backbone.eval()

        prep = T.Compose([
            T.Resize((224, 224)),
            T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        _cnn_model, _cnn_prep = backbone, prep
        logger.info("MobileNetV3-Small loaded ✓")
    except Exception as e:
        logger.warning(f"CNN load failed ({e}) — image matching disabled")
    return _cnn_model, _cnn_prep

def extract_embedding(image_bytes: bytes) -> Optional[list[float]]:
    """Return L2-normalised 576-d embedding, or None on failure."""
    model, prep = load_cnn()
    if model is None: return None
    try:
        import torch
        img    = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        tensor = prep(img).unsqueeze(0)
        with torch.no_grad():
            vec = model(tensor).squeeze().numpy().astype(np.float32)
        norm = np.linalg.norm(vec)
        if norm > 0: vec /= norm
        return vec.tolist()
    except Exception as e:
        logger.warning(f"Embedding failed: {e}")
        return None

def cosine_sim(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b): return 0.0
    return float(np.clip(np.dot(np.array(a, np.float32), np.array(b, np.float32)), -1, 1))

# ─────────────────────────────────────────────────────────────────────────────
# TF-IDF TEXT SIMILARITY
# ─────────────────────────────────────────────────────────────────────────────
def _item_text(item: dict) -> str:
    parts = [item.get("name",""), item.get("description","") or "",
             item.get("category","") or "", item.get("location","") or "",
             " ".join(item.get("tags",[]) or [])]
    raw = " ".join(parts)
    raw = re.sub(r"[^a-z0-9\s]", " ", raw.lower())
    return re.sub(r"\s+", " ", raw).strip()

def batch_text_sim(query: dict, candidates: list[dict]) -> list[float]:
    if not candidates: return []
    texts = [_item_text(query)] + [_item_text(c) for c in candidates]
    try:
        vec  = TfidfVectorizer(ngram_range=(1,2), min_df=1, sublinear_tf=True, stop_words="english")
        mat  = vec.fit_transform(texts)
        sims = sk_cosine(mat[0:1], mat[1:])[0]
        return [float(np.clip(s, 0, 1)) for s in sims]
    except Exception as e:
        logger.warning(f"TF-IDF failed: {e}")
        return [0.0] * len(candidates)

# ─────────────────────────────────────────────────────────────────────────────
# MATCHER
# ─────────────────────────────────────────────────────────────────────────────
def _confidence(score: float) -> str:
    return "high" if score >= 70 else "medium" if score >= 45 else "low"

def _reason(lost: dict, found: dict, img: Optional[float], txt: float) -> str:
    parts = []
    if img is not None:
        pct = round(img * 100)
        parts.append(f"{'strong' if pct>=70 else 'moderate' if pct>=45 else 'weak'} visual similarity ({pct}%)")
    ptxt = round(txt * 100)
    parts.append(f"{'strong' if ptxt>=70 else 'partial' if ptxt>=40 else 'weak'} text match ({ptxt}%)")
    shared = set(t.lower() for t in lost.get("tags",[]) or []) & \
             set(t.lower() for t in found.get("tags",[]) or [])
    if shared: parts.append(f"shared tags: {', '.join(sorted(shared))}")
    if lost.get("category") and lost.get("category") == found.get("category"):
        parts.append(f"same category ({lost['category']})")
    return "; ".join(parts) or "general similarity"

def score_pair(lost: dict, found: dict) -> dict:
    s = cfg()
    img_sim = None
    if lost.get("image_embedding") and found.get("image_embedding"):
        img_sim = max(0.0, cosine_sim(lost["image_embedding"], found["image_embedding"]))
    txt_sim = batch_text_sim(lost, [found])[0]
    combined = (((s.IMAGE_WEIGHT * img_sim) + (s.TEXT_WEIGHT * txt_sim)) if img_sim is not None
                else txt_sim) * 100
    combined = round(min(100.0, max(0.0, combined)), 2)
    return {
        "combined_score": combined,
        "image_score":    round(img_sim * 100, 2) if img_sim is not None else None,
        "text_score":     round(txt_sim * 100, 2),
        "confidence":     _confidence(combined),
        "reason":         _reason(lost, found, img_sim, txt_sim),
    }

def rank_matches(lost: dict, found_items: list[dict]) -> list[dict]:
    scored = []
    for f in found_items:
        r = score_pair(lost, f)
        scored.append({**r, "found_item": f})
    scored.sort(key=lambda x: x["combined_score"], reverse=True)
    return scored

def find_best_match(lost: dict, found_items: list[dict]) -> Optional[dict]:
    if not found_items: return None
    ranked = rank_matches(lost, found_items)
    best   = ranked[0] if ranked else None
    return best if best and best["combined_score"] >= cfg().MIN_MATCH_SCORE else None

# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICATION SERVICE
# ─────────────────────────────────────────────────────────────────────────────
def _send_email(to: str, subject: str, html: str):
    s = cfg()
    if not s.BREVO_API_KEY:
        logger.warning("BREVO_API_KEY not set — email skipped")
        return
    import urllib.request
    payload = json.dumps({
        "sender":      {"name": s.BREVO_FROM_NAME, "email": s.BREVO_FROM_EMAIL},
        "to":          [{"email": to}],
        "subject":     subject,
        "htmlContent": html,
    }).encode()
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=payload,
        headers={
            "api-key":      s.BREVO_API_KEY,
            "Content-Type": "application/json",
            "Accept":       "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        if resp.status not in (200, 201):
            raise RuntimeError(f"Brevo API error: {resp.status} {resp.read().decode()}")

def _email_html(user: dict, lost: dict, found: dict, match: dict, finder: dict = None) -> str:
    score = int(match.get("score", 0))
    finder_name  = finder.get("full_name", "A student") if finder else "A student"
    finder_phone = finder.get("phone", "") if finder else ""
    finder_email = finder.get("email", "") if finder else ""
    phone_row = f"""
    <tr><td style="padding:10px;border:1px solid #2a2a3d;color:#6b6b8a">📞 Finder phone</td>
        <td style="padding:10px;border:1px solid #2a2a3d"><strong style="color:#00c9a7">{finder_phone}</strong></td></tr>
    <tr><td style="padding:10px;border:1px solid #2a2a3d;color:#6b6b8a">✉️ Finder email</td>
        <td style="padding:10px;border:1px solid #2a2a3d">{finder_email}</td></tr>""" if finder_phone else ""
    return f"""
<html><body style="font-family:Arial,sans-serif;background:#080818;color:#e8e8f0;padding:32px;max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#a78bfa,#f472b6,#fbbf24);padding:3px;border-radius:16px;margin-bottom:24px">
    <div style="background:#0f0f23;border-radius:14px;padding:28px;text-align:center">
      <div style="font-size:48px;margin-bottom:12px">🎒</div>
      <h1 style="margin:0;font-size:26px;background:linear-gradient(135deg,#a78bfa,#f472b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Match Found!</h1>
      <p style="color:#b8b4d8;margin:8px 0 0">Hi <strong style="color:#f0eeff">{user.get('full_name','')}</strong> — great news!</p>
    </div>
  </div>
  <div style="background:#0f0f23;border-radius:14px;padding:24px;margin-bottom:20px">
    <div style="font-size:32px;margin-bottom:4px">🔍→📦</div>
    <h2 style="color:#a78bfa;margin:0 0 16px;font-size:18px">{score}% Match for your lost item</h2>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:10px;border:1px solid #2a2a4a;color:#6b6890;font-size:13px">Your lost item</td>
          <td style="padding:10px;border:1px solid #2a2a4a;font-weight:700">{lost.get('name','')}</td></tr>
      <tr><td style="padding:10px;border:1px solid #2a2a4a;color:#6b6890;font-size:13px">Found item</td>
          <td style="padding:10px;border:1px solid #2a2a4a;font-weight:700;color:#22d3ee">{found.get('name','')}</td></tr>
      <tr><td style="padding:10px;border:1px solid #2a2a4a;color:#6b6890;font-size:13px">📍 Found at</td>
          <td style="padding:10px;border:1px solid #2a2a4a">{found.get('location','campus office')}</td></tr>
      <tr><td style="padding:10px;border:1px solid #2a2a4a;color:#6b6890;font-size:13px">🤝 Found by</td>
          <td style="padding:10px;border:1px solid #2a2a4a;font-weight:700">{finder_name}</td></tr>
      {phone_row}
      <tr><td style="padding:10px;border:1px solid #2a2a4a;color:#6b6890;font-size:13px">🧠 Why matched</td>
          <td style="padding:10px;border:1px solid #2a2a4a;font-size:13px">{match.get('match_reason','')}</td></tr>
    </table>
  </div>
  <div style="background:linear-gradient(135deg,#22d3ee22,#a78bfa22);border:2px solid #22d3ee44;border-radius:12px;padding:18px;margin-bottom:20px;text-align:center">
    <p style="margin:0 0 14px;font-size:15px;color:#f0eeff">🎉 Contact the finder directly using the details above,<br/>or log in to confirm the match on the platform.</p>
    <a href="https://findme-sage.vercel.app" style="display:inline-block;background:linear-gradient(135deg,#a78bfa,#f472b6);color:#fff;padding:12px 28px;border-radius:50px;text-decoration:none;font-weight:800;font-size:14px">Open FINDME Platform →</a>
  </div>
  <p style="color:#6b6890;font-size:11px;text-align:center;margin:0">FINDME Campus Lost &amp; Found · Powered by CNN + TF-IDF Matching</p>
</body></html>"""

async def notify_match(user: dict, lost: dict, found: dict, match: dict, finder: dict = None):
    col  = col_notifications()
    now  = now_ist()
    uid  = str(user["_id"])
    mid  = str(match["_id"])

    if user.get("email"):
        subj = f"FINDME: {int(match.get('score',0))}% match found for your lost '{lost.get('name','item')}'!"
        html = _email_html(user, lost, found, match, finder)
        st, err = "sent", None
        try:    _send_email(user["email"], subj, html)
        except Exception as e: st, err = "failed", str(e); logger.warning(f"Email: {e}")
        await col.insert_one({"user_id":uid,"match_id":mid,"type":"email","status":st,
                              "recipient":user["email"],"subject":subj,"body":html,
                              "sent_at":now if st=="sent" else None,"error_message":err,"created_at":now})

# ─────────────────────────────────────────────────────────────────────────────
# FILE HELPERS
# ─────────────────────────────────────────────────────────────────────────────
ALLOWED = {"image/jpeg","image/png","image/webp","image/gif"}

async def save_upload(file: UploadFile) -> tuple[str, bytes]:
    data = await file.read()
    if len(data) > cfg().MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large (max {cfg().MAX_FILE_MB} MB)")
    if file.content_type not in ALLOWED:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")
    cloudinary.config(
        cloud_name=cfg().CLOUDINARY_CLOUD_NAME,
        api_key=cfg().CLOUDINARY_API_KEY,
        secure=True,
    )
    result=cloudinary.uploader.upload(io.BytesIO(data),floder="findme",resource_type="image")
    return result["secure_url"],data

# ─────────────────────────────────────────────────────────────────────────────
# SERIALISE MongoDB docs  (convert _id ObjectId → str, hide embedding)
# ─────────────────────────────────────────────────────────────────────────────
def ser(doc: dict) -> dict:
    doc = dict(doc)
    if "_id" in doc: doc["_id"] = str(doc["_id"])
    doc.pop("image_embedding", None)
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            if v.tzinfo is None:
                v = v.replace(tzinfo=timezone.utc)
            v = v.astimezone(IST)
            doc[k] = v.isoformat()
    return doc

# ─────────────────────────────────────────────────────────────────────────────
# APP + LIFESPAN
# ─────────────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_indexes()
    try: load_cnn()          # warm up CNN on startup
    except Exception: pass
    try: await _ensure_chat_indexes()
    except Exception: pass
    yield

app = FastAPI(
    title="FINDME — Campus Lost & Found API",
    description="CNN image + TF-IDF text matching. No external AI APIs.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(CORSMiddleware, allow_origins=["https://findme-sage.vercel.app"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


# ─────────────────────────────────────────────────────────────────────────────
# HEALTH
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/")
async def root(): return {"status": "ok", "message": "FINDME API 🎒"}

@app.get("/health")
async def health():
    try:
        await mongo_client().admin.command("ping")
        mongo = "ok"
    except Exception:
        mongo = "unreachable"
    return {"api": "ok", "mongodb": mongo}

# ─────────────────────────────────────────────────────────────────────────────
# AUTH ROUTES   /api/auth/*
# All routes accept JSON body (matching React frontend)
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/api/auth/register", status_code=201)
async def register(body: dict):
    """Register a new student account. Expects JSON: {email, password, full_name, phone, student_id?}"""
    if not body.get("email") or not body.get("password") or not body.get("full_name"):
        raise HTTPException(400, "email, password and full_name are required")
    if not body.get("phone"):
        raise HTTPException(400, "Phone number is required")
    if await col_users().find_one({"email": body["email"]}):
        raise HTTPException(400, "Email already registered")
    doc = {
        "email":           body["email"],
        "hashed_password": hash_pw(body["password"]),
        "full_name":       body["full_name"],
        "phone":           body["phone"],
        "student_id":      body.get("student_id"),
        "is_active":       True,
        "items_returned":  0,
        "created_at":      now_utc(),
    }
    res = await col_users().insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    doc.pop("hashed_password")
    return doc

@app.post("/api/auth/login")
async def login(body: dict):
    """Login. Expects JSON: {email, password}. Returns JWT access_token."""
    user = await col_users().find_one({"email": body.get("email")})
    if not user or not verify_pw(body.get("password", ""), user["hashed_password"]):
        raise HTTPException(401, "Invalid credentials")
    return {"access_token": make_token(str(user["_id"])), "token_type": "bearer"}

@app.get("/api/auth/me")
async def me(u: dict = Depends(current_user)):
    return ser(u)

@app.put("/api/auth/me")
async def update_me(body: dict, u: dict = Depends(current_user)):
    allowed = {"full_name", "phone", "student_id"}
    upd = {k: v for k, v in body.items() if k in allowed}
    if upd:
        await col_users().update_one({"_id": u["_id"]}, {"$set": upd})
    user = await col_users().find_one({"_id": u["_id"]})
    return ser(user)

# ─────────────────────────────────────────────────────────────────────────────
# ITEMS ROUTES   /api/items/*
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/api/items/", status_code=201)
async def create_item(
    name:        str             = Form(...),
    status:      str             = Form(...),   # lost | found
    description: Optional[str]  = Form(None),
    location:    Optional[str]  = Form(None),
    category:    Optional[str]  = Form(None),
    tags:        Optional[str]  = Form(None),   # comma-separated
    image:       Optional[UploadFile] = File(None),
    u:           dict            = Depends(current_user),
):
    image_path = None
    embedding  = None

    if image and image.filename:
        image_path, img_bytes = await save_upload(image)
        embedding = extract_embedding(img_bytes)

    tag_list = [t.strip() for t in (tags or "").split(",") if t.strip()]

    doc = {
        "owner_id":        str(u["_id"]),
        "name":            name,
        "status":          status,
        "description":     description,
        "category":        category,
        "tags":            tag_list,
        "location":        location,
        "image_path":      image_path,
        "image_embedding": embedding,
        "created_at":      now_utc(),
        "updated_at":      now_utc(),
    }
    res = await col_items().insert_one(doc)
    doc["_id"] = res.inserted_id

    if status == "found":
        await _auto_match_found(doc)

    return ser(doc)


async def _auto_match_found(found_doc: dict):
    """Match a newly posted found item against all active lost items."""
    cursor    = col_items().find({"status": "lost"})
    lost_list = await cursor.to_list(500)
    if not lost_list: return

    best = find_best_match(found_doc, lost_list)
    if not best: return

    matched_lost = best.pop("found_item")   # find_best_match returns the candidate as "found_item"
    now = now_utc()

    match_doc = {
        "lost_item_id":  str(matched_lost["_id"]),
        "found_item_id": str(found_doc["_id"]),
        "score":         best["combined_score"],
        "image_score":   best.get("image_score"),
        "text_score":    best.get("text_score"),
        "confidence":    best["confidence"],
        "match_reason":  best["reason"],
        "is_confirmed":  False,
        "created_at":    now,
    }
    mres = await col_matches().insert_one(match_doc)
    match_doc["_id"] = mres.inserted_id

    owner = await col_users().find_one({"_id": ObjectId(matched_lost["owner_id"])})
    # finder = owner of the found item (the person who posted it)
    finder = await col_users().find_one({"_id": ObjectId(found_doc["owner_id"])}) if found_doc.get("owner_id") else None
    if owner:
        try: await notify_match(owner, matched_lost, found_doc, match_doc, finder)
        except Exception as e: logger.warning(f"Notify failed: {e}")

    await col_matches().update_one({"_id": mres.inserted_id}, {"$set": {}})  # flush


@app.get("/api/items/")
async def list_items(item_status: Optional[str] = None, category: Optional[str] = None):
    q = {}
    if item_status: q["status"]   = item_status
    if category:    q["category"] = category
    cursor = col_items().find(q).sort("created_at", -1).limit(300)
    return [ser(i) for i in await cursor.to_list(300)]


@app.get("/api/items/mine")
async def my_items(u: dict = Depends(current_user)):
    cursor = col_items().find({"owner_id": str(u["_id"])}).sort("created_at", -1)
    return [ser(i) for i in await cursor.to_list(200)]


@app.get("/api/items/{item_id}")
async def get_item(item_id: str):
    if not ObjectId.is_valid(item_id): raise HTTPException(400, "Invalid ID")
    item = await col_items().find_one({"_id": ObjectId(item_id)})
    if not item: raise HTTPException(404, "Not found")
    return ser(item)


@app.put("/api/items/{item_id}")
async def update_item(item_id: str, body: dict, u: dict = Depends(current_user)):
    if not ObjectId.is_valid(item_id): raise HTTPException(400, "Invalid ID")
    item = await col_items().find_one({"_id": ObjectId(item_id)})
    if not item: raise HTTPException(404, "Not found")
    if item["owner_id"] != str(u["_id"]): raise HTTPException(403, "Not your item")
    allowed = {"name","description","category","tags","location","status"}
    upd = {k: v for k, v in body.items() if k in allowed}
    upd["updated_at"] = now_ist()
    await col_items().update_one({"_id": ObjectId(item_id)}, {"$set": upd})
    return ser(await col_items().find_one({"_id": ObjectId(item_id)}))


@app.delete("/api/items/{item_id}", status_code=204)
async def delete_item(item_id: str, u: dict = Depends(current_user)):
    if not ObjectId.is_valid(item_id): raise HTTPException(400, "Invalid ID")
    item = await col_items().find_one({"_id": ObjectId(item_id)})
    if not item: raise HTTPException(404, "Not found")
    if item["owner_id"] != str(u["_id"]): raise HTTPException(403, "Not your item")
    await col_items().delete_one({"_id": ObjectId(item_id)})


@app.post("/api/items/{item_id}/match")
async def run_match(item_id: str, u: dict = Depends(current_user)):
    """
    Manual match: shows all results >= 20%, saves each as a Match doc so chat works.
    """
    if not ObjectId.is_valid(item_id): raise HTTPException(400, "Invalid ID")
    lost = await col_items().find_one({"_id": ObjectId(item_id)})
    if not lost: raise HTTPException(404, "Not found")
    if lost["owner_id"] != str(u["_id"]): raise HTTPException(403, "Not your item")
    if lost["status"] != "lost": raise HTTPException(400, "Item must have status 'lost'")

    cursor = col_items().find({"status": "found"})
    found_list = await cursor.to_list(500)
    ranked = rank_matches(lost, found_list)

    MIN_MANUAL = 20.0
    results = []
    now = now_ist()

    for r in ranked:
        if r["combined_score"] < MIN_MANUAL:
            continue
        fi = r.get("found_item", {})
        fi.pop("image_embedding", None)
        found_id = str(fi.get("_id", ""))
        if "_id" in fi: fi["_id"] = found_id

        # Reuse existing match doc or create new one
        existing = await col_matches().find_one({
            "lost_item_id":  str(lost["_id"]),
            "found_item_id": found_id,
        })
        if existing:
            match_id = str(existing["_id"])
        else:
            ins = await col_matches().insert_one({
                "lost_item_id":  str(lost["_id"]),
                "found_item_id": found_id,
                "score":         r["combined_score"],
                "image_score":   r.get("image_score"),
                "text_score":    r.get("text_score"),
                "confidence":    r["confidence"],
                "match_reason":  r["reason"],
                "is_confirmed":  False,
                "created_at":    now,
            })
            match_id = str(ins.inserted_id)

        r["match_id"]   = match_id
        r["found_item"] = fi
        results.append(r)

    return {"results": results[:20]}


# ─────────────────────────────────────────────────────────────────────────────
# MATCHES ROUTES   /api/matches/*
# ─────────────────────────────────────────────────────────────────────────────
async def _hydrate_match(m: dict) -> dict:
    m = ser(m)
    for key, fld in [("lost_item_id","lost_item"),("found_item_id","found_item")]:
        oid = m.get(key,"")
        if ObjectId.is_valid(oid):
            doc = await col_items().find_one({"_id": ObjectId(oid)})
            if doc: m[fld] = ser(doc)
    # attach finder contact info (owner of found item)
    found_item = m.get("found_item", {})
    finder_owner_id = found_item.get("owner_id", "")
    if finder_owner_id and ObjectId.is_valid(finder_owner_id):
        finder = await col_users().find_one({"_id": ObjectId(finder_owner_id)})
        if finder:
            m["finder_name"]  = finder.get("full_name", "")
            m["finder_phone"] = finder.get("phone", "")
            m["finder_email"] = finder.get("email", "")
    return m


@app.get("/api/matches/")
async def my_matches(u: dict = Depends(current_user)):
    """Return matches for BOTH lost item owner (seeker) AND finder."""
    uid = str(u["_id"])
    cursor = col_items().find({"owner_id": uid})
    my_items = await cursor.to_list(500)
    my_item_ids = [str(i["_id"]) for i in my_items]
    if not my_item_ids: return []
    cursor = col_matches().find({"$or": [{"lost_item_id": {"$in": my_item_ids}}, {"found_item_id": {"$in": my_item_ids}}]}).sort("created_at", -1)
    matches = await cursor.to_list(200)
    hydrated = []
    for m in matches:
        hm = await _hydrate_match(m)
        lost_item  = await col_items().find_one({"_id": ObjectId(m["lost_item_id"])})
        found_item = await col_items().find_one({"_id": ObjectId(m["found_item_id"])})
        hm["my_role"] = "seeker" if (lost_item and lost_item["owner_id"] == uid) else "finder"
        hydrated.append(hm)
    return hydrated


@app.get("/api/matches/{match_id}")
async def get_match(match_id: str, u: dict = Depends(current_user)):
    if not ObjectId.is_valid(match_id): raise HTTPException(400, "Invalid ID")
    m    = await col_matches().find_one({"_id": ObjectId(match_id)})
    if not m: raise HTTPException(404, "Not found")
    lost = await col_items().find_one({"_id": ObjectId(m["lost_item_id"])})
    if not lost or lost["owner_id"] != str(u["_id"]): raise HTTPException(403, "Access denied")
    return await _hydrate_match(m)


@app.post("/api/matches/{match_id}/confirm")
async def confirm_match(match_id: str, body: dict, u: dict = Depends(current_user)):
    """
    Confirm or dismiss a match.
    body: { confirmed: bool, outcome: 'returned' | 'not_mine' | 'already_found' }
    'returned'      → item truly returned, mark claimed, increment finder leaderboard
    'not_mine'      → wrong match, dismiss only
    'already_found' → already retrieved via other means
    """
    if not ObjectId.is_valid(match_id): raise HTTPException(400, "Invalid ID")
    m    = await col_matches().find_one({"_id": ObjectId(match_id)})
    if not m: raise HTTPException(404, "Not found")
    lost = await col_items().find_one({"_id": ObjectId(m["lost_item_id"])})
    if not lost or lost["owner_id"] != str(u["_id"]): raise HTTPException(403, "Access denied")

    confirmed = bool(body.get("confirmed", False))
    outcome   = body.get("outcome", "returned" if confirmed else "not_mine")

    await col_matches().update_one(
        {"_id": ObjectId(match_id)},
        {"$set": {"is_confirmed": confirmed, "outcome": outcome}}
    )

    if confirmed and outcome == "returned":
        # mark both items as claimed
        await col_items().update_one({"_id": ObjectId(m["lost_item_id"])},  {"$set": {"status": "claimed"}})
        await col_items().update_one({"_id": ObjectId(m["found_item_id"])}, {"$set": {"status": "claimed"}})
        # ++ leaderboard: reward the finder (owner of the found item)
        found_item = await col_items().find_one({"_id": ObjectId(m["found_item_id"])})
        if found_item and found_item.get("owner_id"):
            await col_users().update_one(
                {"_id": ObjectId(found_item["owner_id"])},
                {"$inc": {"items_returned": 1}}
            )
    elif outcome in ("already_found", "returned"):
        # item is no longer active even if finder wasn't awarded
        await col_items().update_one({"_id": ObjectId(m["lost_item_id"])}, {"$set": {"status": "claimed"}})

    m = await col_matches().find_one({"_id": ObjectId(match_id)})
    return await _hydrate_match(m)


@app.get("/api/matches/item/{item_id}")
async def matches_for_item(item_id: str, u: dict = Depends(current_user)):
    if not ObjectId.is_valid(item_id): raise HTTPException(400, "Invalid ID")
    item = await col_items().find_one({"_id": ObjectId(item_id)})
    if not item or item["owner_id"] != str(u["_id"]): raise HTTPException(403, "Access denied")
    cursor  = col_matches().find({"lost_item_id": item_id}).sort("score", -1)
    matches = await cursor.to_list(50)
    return [await _hydrate_match(m) for m in matches]


# ─────────────────────────────────────────────────────────────────────────────
# LEADERBOARD ROUTE   /api/leaderboard
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/leaderboard")
async def leaderboard():
    """Top students who returned the most found items to their owners."""
    cursor = col_users().find(
        {"items_returned": {"$gt": 0}},
        {"full_name": 1, "student_id": 1, "items_returned": 1, "created_at": 1}
    ).sort("items_returned", -1).limit(20)
    users = await cursor.to_list(20)
    return [ser(u) for u in users]


# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICATIONS ROUTES   /api/notifications/*
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/notifications/")
async def my_notifications(u: dict = Depends(current_user)):
    cursor = col_notifications().find({"user_id": str(u["_id"])}).sort("created_at", -1)
    return [ser(n) for n in await cursor.to_list(100)]


@app.get("/api/notifications/{notif_id}")
async def get_notification(notif_id: str, u: dict = Depends(current_user)):
    if not ObjectId.is_valid(notif_id): raise HTTPException(400, "Invalid ID")
    n = await col_notifications().find_one({"_id": ObjectId(notif_id)})
    if not n or n["user_id"] != str(u["_id"]): raise HTTPException(404, "Not found")
    return ser(n)


# ─────────────────────────────────────────────────────────────────────────────
# CHAT ROUTES   /api/chat/*
# Simple in-app messaging between match participants
# ─────────────────────────────────────────────────────────────────────────────
def col_chat(): return db()["chat_messages"]
def col_experiences(): return db()["experiences"]
def col_otp(): return db()["password_otp"]

async def _ensure_chat_indexes():
    await col_chat().create_index([("match_id", 1), ("created_at", 1)])
    await col_experiences().create_index("created_at")
    await col_otp().create_index("email")
    await col_otp().create_index("expires_at", expireAfterSeconds=0)

@app.get("/api/chat/{match_id}")
async def get_messages(match_id: str, u: dict = Depends(current_user)):
    """Fetch all messages for a match. Only participants can read."""
    if not ObjectId.is_valid(match_id): raise HTTPException(400, "Invalid ID")
    m = await col_matches().find_one({"_id": ObjectId(match_id)})
    if not m: raise HTTPException(404, "Match not found")
    # verify user is a participant (owns lost or found item)
    lost  = await col_items().find_one({"_id": ObjectId(m["lost_item_id"])})
    found = await col_items().find_one({"_id": ObjectId(m["found_item_id"])})
    uid = str(u["_id"])
    if not ((lost and lost["owner_id"] == uid) or (found and found["owner_id"] == uid)):
        raise HTTPException(403, "Not a participant")
    cursor = col_chat().find({"match_id": match_id}).sort("created_at", 1)
    msgs = await cursor.to_list(200)
    return [ser(msg) for msg in msgs]


@app.post("/api/chat/{match_id}")
async def send_message(match_id: str, body: dict, u: dict = Depends(current_user)):
    """Send a message in a match chat."""
    if not ObjectId.is_valid(match_id): raise HTTPException(400, "Invalid ID")
    text = (body.get("text") or "").strip()
    if not text: raise HTTPException(400, "Message cannot be empty")
    if len(text) > 1000: raise HTTPException(400, "Message too long (max 1000 chars)")
    m = await col_matches().find_one({"_id": ObjectId(match_id)})
    if not m: raise HTTPException(404, "Match not found")
    lost  = await col_items().find_one({"_id": ObjectId(m["lost_item_id"])})
    found = await col_items().find_one({"_id": ObjectId(m["found_item_id"])})
    uid = str(u["_id"])
    if not ((lost and lost["owner_id"] == uid) or (found and found["owner_id"] == uid)):
        raise HTTPException(403, "Not a participant")
    msg = {
        "match_id":   match_id,
        "sender_id":  uid,
        "sender_name": u.get("full_name", "User"),
        "text":       text,
        "created_at": now_utc(),
    }
    res = await col_chat().insert_one(msg)
    msg["_id"] = str(res.inserted_id)
    return msg


# ─────────────────────────────────────────────────────────────────────────────
# EXPERIENCES ROUTES   /api/experiences/*
# Community wall — students share their FINDME stories
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/experiences")
async def list_experiences():
    cursor = col_experiences().find().sort("created_at", -1).limit(50)
    return [ser(e) for e in await cursor.to_list(50)]


@app.post("/api/experiences", status_code=201)
async def post_experience(body: dict, u: dict = Depends(current_user)):
    text = (body.get("text") or "").strip()
    if not text or len(text) < 10:
        raise HTTPException(400, "Please write at least 10 characters")
    if len(text) > 600:
        raise HTTPException(400, "Max 600 characters")
    emoji = body.get("emoji", "🎒")
    doc = {
        "author_name": u.get("full_name", "Anonymous"),
        "author_id":   str(u["_id"]),
        "text":        text,
        "emoji":       emoji,
        "created_at":  now_utc(),
    }
    res = await col_experiences().insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    return doc


@app.delete("/api/experiences/{exp_id}", status_code=204)
async def delete_experience(exp_id: str, u: dict = Depends(current_user)):
    if not ObjectId.is_valid(exp_id): raise HTTPException(400, "Invalid ID")
    e = await col_experiences().find_one({"_id": ObjectId(exp_id)})
    if not e: raise HTTPException(404, "Not found")
    if e["author_id"] != str(u["_id"]): raise HTTPException(403, "Not your post")
    await col_experiences().delete_one({"_id": ObjectId(exp_id)})


# ─────────────────────────────────────────────────────────────────────────────
# FORGOT PASSWORD   /api/auth/forgot-password  &  /api/auth/reset-password
# Simple OTP via email (6-digit code, 15-min expiry)
# ─────────────────────────────────────────────────────────────────────────────
import random, string

def _gen_otp() -> str:
    return "".join(random.choices(string.digits, k=6))

def _otp_email(full_name: str, otp: str) -> str:
    return f"""
<html><body style="font-family:Arial,sans-serif;background:#080818;color:#e8e8f0;padding:32px;max-width:480px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#a78bfa,#f472b6);padding:3px;border-radius:14px;margin-bottom:20px">
    <div style="background:#0f0f23;border-radius:12px;padding:24px;text-align:center">
      <div style="font-size:42px;margin-bottom:10px">🔑</div>
      <h2 style="margin:0;background:linear-gradient(135deg,#a78bfa,#f472b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Password Reset</h2>
    </div>
  </div>
  <p>Hi <strong>{full_name}</strong>, here is your one-time password reset code:</p>
  <div style="text-align:center;margin:24px 0">
    <span style="font-size:40px;font-weight:900;letter-spacing:10px;color:#a78bfa;font-family:monospace">{otp}</span>
  </div>
  <p style="color:#6b6890;font-size:13px">This code expires in <strong style="color:#fbbf24">15 minutes</strong>. If you didn't request this, ignore this email.</p>
  <hr style="border-color:#2a2a4a;margin:20px 0"/>
  <p style="color:#6b6890;font-size:11px;text-align:center">FINDME Campus Lost &amp; Found</p>
</body></html>"""


@app.post("/api/auth/forgot-password")
async def forgot_password(body: dict):
    email = (body.get("email") or "").strip().lower()
    if not email: raise HTTPException(400, "Email required")
    user = await col_users().find_one({"email": email})
    # Always return 200 to avoid user enumeration
    if not user:
        return {"message": "If that email exists, a reset code has been sent."}
    otp = _gen_otp()
    expires = now_utc() + timedelta(minutes=15)
    await col_otp().replace_one(
        {"email": email},
        {"email": email, "otp": hash_pw(otp), "expires_at": expires},
        upsert=True,
    )
    try:
        _send_email(email, "FINDME — Password Reset Code", _otp_email(user.get("full_name",""), otp))
    except Exception as e:
        logger.warning(f"OTP email failed: {e}")
    return {"message": "If that email exists, a reset code has been sent."}


@app.post("/api/auth/reset-password")
async def reset_password(body: dict):
    email = (body.get("email") or "").strip().lower()
    otp   = (body.get("otp") or "").strip()
    new_pw = body.get("new_password", "")
    if not email or not otp or not new_pw:
        raise HTTPException(400, "email, otp and new_password are required")
    if len(new_pw) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    record = await col_otp().find_one({"email": email})
    if not record or not verify_pw(otp, record["otp"]):
        raise HTTPException(400, "Invalid or expired reset code")
    # Motor returns datetime as UTC-aware; convert both sides to UTC for safe comparison
    expires = record["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(400, "Reset code has expired")
    await col_users().update_one({"email": email}, {"$set": {"hashed_password": hash_pw(new_pw)}})
    await col_otp().delete_one({"email": email})
    return {"message": "Password reset successfully"}


# ─────────────────────────────────────────────────────────────────────────────
# PROFILE UPDATE   /api/auth/profile
# ─────────────────────────────────────────────────────────────────────────────
@app.put("/api/auth/profile")
async def update_profile(body: dict, u: dict = Depends(current_user)):
    """Update profile fields: full_name, phone, student_id, current_password→new_password"""
    allowed = {"full_name", "phone", "student_id"}
    upd = {k: v for k, v in body.items() if k in allowed and v}

    # Password change
    if body.get("new_password"):
        if not body.get("current_password"):
            raise HTTPException(400, "Current password required to change password")
        if not verify_pw(body["current_password"], u["hashed_password"]):
            raise HTTPException(400, "Current password is incorrect")
        if len(body["new_password"]) < 8:
            raise HTTPException(400, "New password must be at least 8 characters")
        upd["hashed_password"] = hash_pw(body["new_password"])

    if upd:
        await col_users().update_one({"_id": u["_id"]}, {"$set": upd})
    user = await col_users().find_one({"_id": u["_id"]})
    return ser(user)
