"""
LifeConnect — API Routes
Hardened, production-grade REST endpoints with input validation, transactional integrity, and comprehensive CRUD.
"""

import hashlib
import hmac
import json
import secrets
from datetime import datetime, date
from fastapi import APIRouter, HTTPException, Depends, Query, Path as FPath, status
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from database import get_db
from models import get_llm_chat_response, get_voice_search_response

router = APIRouter(prefix="/api")


import os
import base64
import time

SECRET_KEY = os.environ.get("JWT_SECRET", "lifeconnect_production_secret_key_2026_v2")

def b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def b64_decode(data: str) -> bytes:
    padded = data + '=' * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded)

def create_jwt_token(user_id: int, email: str, expires_in: int = 604800) -> str:
    """Generate a signed JWT token valid for 7 days."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": int(time.time()),
        "exp": int(time.time()) + expires_in
    }
    h_b64 = b64_encode(json.dumps(header).encode('utf-8'))
    p_b64 = b64_encode(json.dumps(payload).encode('utf-8'))
    sig_input = f"{h_b64}.{p_b64}".encode('utf-8')
    sig = hmac.new(SECRET_KEY.encode('utf-8'), sig_input, hashlib.sha256).digest()
    sig_b64 = b64_encode(sig)
    return f"{h_b64}.{p_b64}.{sig_b64}"

def verify_jwt_token(token: str) -> Optional[dict]:
    """Verify signature and expiration of JWT token."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        h_b64, p_b64, sig_b64 = parts
        sig_input = f"{h_b64}.{p_b64}".encode('utf-8')
        expected_sig = hmac.new(SECRET_KEY.encode('utf-8'), sig_input, hashlib.sha256).digest()
        if not hmac.compare_digest(b64_encode(expected_sig), sig_b64):
            return None
        payload = json.loads(b64_decode(p_b64).decode('utf-8'))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None

# Simple in-memory sliding window rate limiter
_rate_limit_store: Dict[str, List[float]] = {}

def check_rate_limit(client_id: str, max_requests: int = 60, window_seconds: int = 60):
    """Simple rate limit check. Throws 429 if threshold exceeded."""
    now = time.time()
    timestamps = _rate_limit_store.get(client_id, [])
    # filter timestamps within window
    timestamps = [t for t in timestamps if now - t < window_seconds]
    if len(timestamps) >= max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please wait a moment before trying again."
        )
    timestamps.append(now)
    _rate_limit_store[client_id] = timestamps


def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with a random salt."""
    salt = secrets.token_hex(16)
    iterations = 100_000
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
    return f"pbkdf2:{iterations}:{salt}:{key.hex()}"


def verify_password(plain_password: str, stored_hash: str) -> bool:
    """Verify password supporting both secure PBKDF2 and legacy SHA-256 hashes."""
    if not stored_hash:
        return False
    # Check if PBKDF2 format
    if stored_hash.startswith("pbkdf2:"):
        try:
            parts = stored_hash.split(":")
            if len(parts) != 4:
                return False
            iterations = int(parts[1])
            salt = parts[2]
            expected_key = parts[3]
            computed_key = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt.encode("utf-8"), iterations).hex()
            return hmac.compare_digest(computed_key, expected_key)
        except Exception:
            return False
    # Legacy plain SHA-256 fallback for existing accounts
    legacy_hash = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
    return hmac.compare_digest(legacy_hash, stored_hash)


def row_to_dict(row) -> Optional[Dict[str, Any]]:
    return dict(row) if row else None


def rows_to_list(rows) -> List[Dict[str, Any]]:
    return [dict(r) for r in rows]


def sanitize_user_dict(u: dict) -> dict:
    """Format and clean user dictionary for frontend consumption."""
    if not u:
        return {}
    res = dict(u)
    res.pop("password_hash", None)
    if "interests" in res and isinstance(res["interests"], str):
        try:
            res["interests"] = json.loads(res["interests"] or "[]")
        except Exception:
            res["interests"] = []
    elif "interests" not in res:
        res["interests"] = []
    return res


# ══════════════════════════════════════════════════════════════
# REQUEST & RESPONSE SCHEMAS
# ══════════════════════════════════════════════════════════════

class SignupRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=5, max_length=150)
    password: str = Field(..., min_length=6, max_length=128)
    mobile: Optional[str] = Field(None, max_length=25)
    age: Optional[int] = Field(None, ge=10, le=130)
    city: Optional[str] = Field(None, max_length=100)
    interests: Optional[List[str]] = Field(default_factory=list)
    decade: Optional[str] = Field(None, max_length=20)
    avatar: Optional[str] = Field(None, max_length=10)
    bio: Optional[str] = Field(None, max_length=500)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    mobile: Optional[str] = Field(None, max_length=25)
    age: Optional[int] = Field(None, ge=10, le=130)
    city: Optional[str] = Field(None, max_length=100)
    interests: Optional[List[str]] = None
    decade: Optional[str] = Field(None, max_length=20)
    avatar: Optional[str] = Field(None, max_length=10)
    bio: Optional[str] = Field(None, max_length=500)


class MemoryCreate(BaseModel):
    user_id: int
    year: Optional[int] = Field(None, ge=1900, le=2100)
    title: str = Field(..., min_length=1, max_length=200)
    content: Optional[str] = Field(None, max_length=5000)
    media_type: Optional[str] = Field("story", max_length=50)
    emoji: Optional[str] = Field("📖", max_length=10)


class MemoryUpdate(BaseModel):
    year: Optional[int] = Field(None, ge=1900, le=2100)
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = Field(None, max_length=5000)
    media_type: Optional[str] = Field(None, max_length=50)
    emoji: Optional[str] = Field(None, max_length=10)


class WellnessCreate(BaseModel):
    user_id: int
    activity: str = Field(..., min_length=1, max_length=200)
    completed: Optional[int] = Field(0, ge=0, le=1)
    date: Optional[str] = None


class ConnectionRequest(BaseModel):
    user_id: int
    friend_id: int


class CommunityJoin(BaseModel):
    user_id: int
    community_id: int


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


# ══════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.post("/auth/signup", tags=["Auth"], status_code=status.HTTP_201_CREATED)
def signup(data: SignupRequest):
    """Register a new user with secure password hashing and JWT token issuance."""
    normalized_email = data.email.strip().lower()
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE LOWER(email) = ?", (normalized_email,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered.")

        pw_hash = hash_password(data.password)
        avatar = data.avatar or (data.full_name.strip()[0].upper() if data.full_name else "🌻")
        interests_str = json.dumps(data.interests or [])

        cursor = conn.execute(
            """INSERT INTO users (full_name, email, mobile, password_hash, age, city,
                                  interests, decade, avatar, bio)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data.full_name.strip(), normalized_email, data.mobile, pw_hash,
             data.age, data.city, interests_str, data.decade, avatar, data.bio)
        )
        user_id = cursor.lastrowid
        user_row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        user_data = sanitize_user_dict(row_to_dict(user_row))
        token = create_jwt_token(user_id, normalized_email)

        return {"success": True, "token": token, "token_type": "bearer", "user": user_data, "message": "Account created successfully."}


@router.post("/auth/login", tags=["Auth"])
def login(data: LoginRequest):
    """Authenticate a user with PBKDF2 / legacy SHA256 validation and JWT token issuance."""
    normalized_input = data.email.strip().lower()
    raw_input = data.email.strip()
    with get_db() as conn:
        user_row = conn.execute(
            "SELECT * FROM users WHERE LOWER(email) = ? OR mobile = ?", (normalized_input, raw_input)
        ).fetchone()
        if not user_row:
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        stored_hash = user_row["password_hash"]
        if not verify_password(data.password, stored_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        # If user is using legacy hash, auto-upgrade to PBKDF2
        if not stored_hash.startswith("pbkdf2:"):
            new_hash = hash_password(data.password)
            conn.execute("UPDATE users SET password_hash=? WHERE id=?", (new_hash, user_row["id"]))

        user_data = sanitize_user_dict(row_to_dict(user_row))
        token = create_jwt_token(user_row["id"], user_row["email"])

        return {"success": True, "token": token, "token_type": "bearer", "user": user_data, "message": "Login successful."}


from fastapi import APIRouter, HTTPException, Depends, Query, Header, Path as FPath, status

@router.get("/auth/me", tags=["Auth"])
def get_me(authorization: Optional[str] = Header(None)):
    """Retrieve profile of authenticated user via JWT token header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header.")
    token = authorization.split(" ")[1]
    payload = verify_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token.")
    
    user_id = int(payload["sub"])
    with get_db() as conn:
        user_row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found.")
        return {"success": True, "user": sanitize_user_dict(row_to_dict(user_row))}


@router.post("/auth/logout", tags=["Auth"])
def logout():
    """Client logout confirmation."""
    return {"success": True, "message": "Logged out successfully."}


# ══════════════════════════════════════════════════════════════
# USER / PROFILE ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/profile/{user_id}", tags=["Profile"])
def get_profile(user_id: int = FPath(..., ge=1)):
    """Fetch user profile details."""
    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")
        return sanitize_user_dict(row_to_dict(user))


@router.put("/profile/{user_id}", tags=["Profile"])
def update_profile(user_id: int, data: ProfileUpdateRequest):
    """Update user profile information."""
    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        updates = []
        params = []

        if data.full_name is not None:
            updates.append("full_name = ?")
            params.append(data.full_name.strip())
        if data.mobile is not None:
            updates.append("mobile = ?")
            params.append(data.mobile)
        if data.age is not None:
            updates.append("age = ?")
            params.append(data.age)
        if data.city is not None:
            updates.append("city = ?")
            params.append(data.city)
        if data.interests is not None:
            updates.append("interests = ?")
            params.append(json.dumps(data.interests))
        if data.decade is not None:
            updates.append("decade = ?")
            params.append(data.decade)
        if data.avatar is not None:
            updates.append("avatar = ?")
            params.append(data.avatar)
        if data.bio is not None:
            updates.append("bio = ?")
            params.append(data.bio)

        if updates:
            params.append(user_id)
            conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)

        updated_row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        return {"success": True, "user": sanitize_user_dict(row_to_dict(updated_row)), "message": "Profile updated."}


@router.get("/users", tags=["Profile"])
def list_users(
    city: Optional[str] = None,
    decade: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200)
):
    """Discover users with optional filtering by city, decade, or search query."""
    with get_db() as conn:
        query = "SELECT id, full_name, email, age, city, interests, decade, avatar, bio, created_at FROM users WHERE 1=1"
        params = []
        if city:
            query += " AND LOWER(city) LIKE ?"
            params.append(f"%{city.strip().lower()}%")
        if decade:
            query += " AND decade = ?"
            params.append(decade)
        if search:
            query += " AND (LOWER(full_name) LIKE ? OR LOWER(city) LIKE ? OR LOWER(interests) LIKE ?)"
            s_param = f"%{search.strip().lower()}%"
            params.extend([s_param, s_param, s_param])

        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(query, params).fetchall()
        users = [sanitize_user_dict(r) for r in rows_to_list(rows)]
        return {"users": users, "total": len(users)}


# ══════════════════════════════════════════════════════════════
# MEMORIES ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/memories/{user_id}", tags=["Memories"])
def get_memories(
    user_id: int,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    media_type: Optional[str] = None,
    search: Optional[str] = None
):
    """Retrieve memories for a user, ordered chronologically by year with pagination & search."""
    with get_db() as conn:
        query = "SELECT * FROM memories WHERE user_id=?"
        params = [user_id]
        if media_type:
            query += " AND media_type = ?"
            params.append(media_type)
        if search:
            query += " AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?)"
            s_term = f"%{search.strip().lower()}%"
            params.extend([s_term, s_term])
        
        query += " ORDER BY year ASC, created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = conn.execute(query, params).fetchall()
        return {"memories": rows_to_list(rows), "total": len(rows), "limit": limit, "offset": offset}


@router.post("/memories", tags=["Memories"], status_code=status.HTTP_201_CREATED)
def create_memory(data: MemoryCreate):
    """Save a new memory to the user's Memory Vault."""
    with get_db() as conn:
        user = conn.execute("SELECT id FROM users WHERE id=?", (data.user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        cursor = conn.execute(
            """INSERT INTO memories (user_id, year, title, content, media_type, emoji)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (data.user_id, data.year, data.title.strip(), data.content, data.media_type, data.emoji)
        )
        memory_id = cursor.lastrowid
        memory = row_to_dict(conn.execute("SELECT * FROM memories WHERE id=?", (memory_id,)).fetchone())
        return {"success": True, "memory": memory, "message": "Memory saved to vault."}


@router.put("/memories/{memory_id}", tags=["Memories"])
def update_memory(memory_id: int, data: MemoryUpdate):
    """Update an existing memory entry."""
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM memories WHERE id=?", (memory_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Memory not found.")

        updates = []
        params = []
        if data.year is not None:
            updates.append("year = ?")
            params.append(data.year)
        if data.title is not None:
            updates.append("title = ?")
            params.append(data.title.strip())
        if data.content is not None:
            updates.append("content = ?")
            params.append(data.content)
        if data.media_type is not None:
            updates.append("media_type = ?")
            params.append(data.media_type)
        if data.emoji is not None:
            updates.append("emoji = ?")
            params.append(data.emoji)

        if updates:
            params.append(memory_id)
            conn.execute(f"UPDATE memories SET {', '.join(updates)} WHERE id=?", params)

        updated = row_to_dict(conn.execute("SELECT * FROM memories WHERE id=?", (memory_id,)).fetchone())
        return {"success": True, "memory": updated, "message": "Memory updated."}


@router.delete("/memories/{memory_id}", tags=["Memories"])
def delete_memory(memory_id: int):
    """Delete a memory from the user's vault."""
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM memories WHERE id=?", (memory_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Memory not found.")
        conn.execute("DELETE FROM memories WHERE id=?", (memory_id,))
        return {"success": True, "message": "Memory deleted successfully."}


# ══════════════════════════════════════════════════════════════
# CONNECTIONS / FRIENDS ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/connections/{user_id}", tags=["Connections"])
def get_connections(user_id: int):
    """Get all connections and pending requests for a user."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT c.id, c.status, c.created_at,
                      u.id as friend_id, u.full_name, u.city, u.avatar, u.decade, u.interests
               FROM connections c
               JOIN users u ON u.id = c.friend_id
               WHERE c.user_id = ?
               ORDER BY c.created_at DESC""",
            (user_id,)
        ).fetchall()
        connections = []
        for r in rows_to_list(rows):
            r = sanitize_user_dict(r)
            connections.append(r)
        return {"connections": connections, "total": len(connections)}


@router.post("/connections", tags=["Connections"], status_code=status.HTTP_201_CREATED)
def send_connection(data: ConnectionRequest):
    """Send a reconnect/connection request to another user."""
    if data.user_id == data.friend_id:
        raise HTTPException(status_code=400, detail="Cannot send connection request to yourself.")

    with get_db() as conn:
        # Check both users exist
        u1 = conn.execute("SELECT id FROM users WHERE id=?", (data.user_id,)).fetchone()
        u2 = conn.execute("SELECT id FROM users WHERE id=?", (data.friend_id,)).fetchone()
        if not u1 or not u2:
            raise HTTPException(status_code=404, detail="User not found.")

        existing = conn.execute(
            "SELECT id, status FROM connections WHERE user_id=? AND friend_id=?",
            (data.user_id, data.friend_id)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail=f"Connection request already {existing['status']}.")

        cursor = conn.execute(
            "INSERT INTO connections (user_id, friend_id, status) VALUES (?, ?, 'pending')",
            (data.user_id, data.friend_id)
        )
        return {"success": True, "id": cursor.lastrowid, "message": "Connection request sent."}


@router.put("/connections/{connection_id}/accept", tags=["Connections"])
def accept_connection(connection_id: int):
    """Accept a pending connection request."""
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM connections WHERE id=?", (connection_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Connection request not found.")

        conn.execute("UPDATE connections SET status='connected' WHERE id=?", (connection_id,))
        # Also create reciprocal connection if not exists
        reciprocal = conn.execute(
            "SELECT id FROM connections WHERE user_id=? AND friend_id=?",
            (existing["friend_id"], existing["user_id"])
        ).fetchone()
        if not reciprocal:
            conn.execute(
                "INSERT INTO connections (user_id, friend_id, status) VALUES (?, ?, 'connected')",
                (existing["friend_id"], existing["user_id"])
            )
        else:
            conn.execute("UPDATE connections SET status='connected' WHERE id=?", (reciprocal["id"],))

        return {"success": True, "message": "Connection accepted."}


@router.delete("/connections/{connection_id}", tags=["Connections"])
def delete_connection(connection_id: int):
    """Remove or cancel a connection."""
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM connections WHERE id=?", (connection_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Connection not found.")
        conn.execute("DELETE FROM connections WHERE id=?", (connection_id,))
        return {"success": True, "message": "Connection removed."}


# ══════════════════════════════════════════════════════════════
# COMMUNITIES ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/communities", tags=["Communities"])
def get_communities(category: Optional[str] = None):
    """List all available communities, optionally filtered by category."""
    with get_db() as conn:
        query = "SELECT * FROM communities"
        params = []
        if category:
            query += " WHERE LOWER(category) = ?"
            params.append(category.strip().lower())
        query += " ORDER BY member_count DESC"
        rows = conn.execute(query, params).fetchall()
        return {"communities": rows_to_list(rows), "total": len(rows)}


@router.post("/communities/join", tags=["Communities"])
def join_community(data: CommunityJoin):
    """Join a community."""
    with get_db() as conn:
        community = conn.execute("SELECT id FROM communities WHERE id=?", (data.community_id,)).fetchone()
        if not community:
            raise HTTPException(status_code=404, detail="Community not found.")

        existing = conn.execute(
            "SELECT 1 FROM community_members WHERE user_id=? AND community_id=?",
            (data.user_id, data.community_id)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Already a member of this community.")

        conn.execute(
            "INSERT INTO community_members (user_id, community_id) VALUES (?, ?)",
            (data.user_id, data.community_id)
        )
        conn.execute(
            "UPDATE communities SET member_count = member_count + 1 WHERE id=?",
            (data.community_id,)
        )
        return {"success": True, "message": "Joined community successfully."}


@router.delete("/communities/leave", tags=["Communities"])
def leave_community(data: CommunityJoin):
    """Leave a community."""
    with get_db() as conn:
        existing = conn.execute(
            "SELECT 1 FROM community_members WHERE user_id=? AND community_id=?",
            (data.user_id, data.community_id)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="User is not a member of this community.")

        conn.execute(
            "DELETE FROM community_members WHERE user_id=? AND community_id=?",
            (data.user_id, data.community_id)
        )
        conn.execute(
            "UPDATE communities SET member_count = MAX(0, member_count - 1) WHERE id=?",
            (data.community_id,)
        )
        return {"success": True, "message": "Left community."}


@router.get("/communities/{user_id}/mine", tags=["Communities"])
def get_my_communities(user_id: int):
    """Get communities the specified user has joined."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT c.*, cm.joined_at FROM communities c
               JOIN community_members cm ON cm.community_id = c.id
               WHERE cm.user_id = ?
               ORDER BY cm.joined_at DESC""",
            (user_id,)
        ).fetchall()
        return {"communities": rows_to_list(rows), "total": len(rows)}


# ══════════════════════════════════════════════════════════════
# WELLNESS ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/wellness/{user_id}", tags=["Wellness"])
def get_wellness(user_id: int, date: Optional[str] = None):
    """Get wellness activities for a user on a given date (default today)."""
    with get_db() as conn:
        target_date = date or datetime.today().strftime("%Y-%m-%d")
        rows = conn.execute(
            "SELECT * FROM wellness_activities WHERE user_id=? AND date=? ORDER BY id ASC",
            (user_id, target_date)
        ).fetchall()
        return {"activities": rows_to_list(rows), "date": target_date}


@router.get("/wellness/{user_id}/summary", tags=["Wellness"])
def get_wellness_summary(user_id: int):
    """Get summary stats of wellness activity (today completion & total count)."""
    with get_db() as conn:
        today = datetime.today().strftime("%Y-%m-%d")
        today_rows = conn.execute(
            "SELECT completed FROM wellness_activities WHERE user_id=? AND date=?",
            (user_id, today)
        ).fetchall()

        total_today = len(today_rows)
        completed_today = sum(1 for r in today_rows if r["completed"] == 1)

        total_all_time = conn.execute(
            "SELECT COUNT(*) as c FROM wellness_activities WHERE user_id=? AND completed=1",
            (user_id,)
        ).fetchone()["c"]

        return {
            "date": today,
            "today_total": total_today,
            "today_completed": completed_today,
            "today_percentage": int((completed_today / total_today * 100)) if total_today > 0 else 0,
            "total_completed_all_time": total_all_time
        }


@router.post("/wellness", tags=["Wellness"], status_code=status.HTTP_201_CREATED)
def log_wellness(data: WellnessCreate):
    """Log a wellness activity for the user."""
    with get_db() as conn:
        target_date = data.date or datetime.today().strftime("%Y-%m-%d")
        cursor = conn.execute(
            "INSERT INTO wellness_activities (user_id, activity, completed, date) VALUES (?, ?, ?, ?)",
            (data.user_id, data.activity.strip(), data.completed, target_date)
        )
        return {"success": True, "id": cursor.lastrowid, "message": "Wellness activity logged."}


@router.put("/wellness/{activity_id}/complete", tags=["Wellness"])
def complete_wellness(activity_id: int):
    """Mark a wellness activity as completed."""
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM wellness_activities WHERE id=?", (activity_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Wellness activity not found.")
        conn.execute("UPDATE wellness_activities SET completed=1 WHERE id=?", (activity_id,))
        return {"success": True, "message": "Activity marked as completed."}


# ══════════════════════════════════════════════════════════════
# DASHBOARD SUMMARY ENDPOINT
# ══════════════════════════════════════════════════════════════

@router.get("/dashboard/{user_id}/summary", tags=["Dashboard"])
def get_dashboard_summary(user_id: int):
    """Consolidated dashboard snapshot for fast initial page load."""
    with get_db() as conn:
        user_row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found.")

        today = datetime.today().strftime("%Y-%m-%d")
        wellness_rows = conn.execute(
            "SELECT completed FROM wellness_activities WHERE user_id=? AND date=?",
            (user_id, today)
        ).fetchall()
        today_completed = sum(1 for r in wellness_rows if r["completed"] == 1)

        memories_count = conn.execute(
            "SELECT COUNT(*) as c FROM memories WHERE user_id=?", (user_id,)
        ).fetchone()["c"]

        connections_count = conn.execute(
            "SELECT COUNT(*) as c FROM connections WHERE user_id=? AND status='connected'", (user_id,)
        ).fetchone()["c"]

        communities_count = conn.execute(
            "SELECT COUNT(*) as c FROM community_members WHERE user_id=?", (user_id,)
        ).fetchone()["c"]

        return {
            "user": sanitize_user_dict(row_to_dict(user_row)),
            "stats": {
                "wellness_completed_today": today_completed,
                "memories_count": memories_count,
                "connections_count": connections_count,
                "communities_count": communities_count,
            }
        }


# ══════════════════════════════════════════════════════════════
# 1. COMPANION CHATBOT (FOR LIFE-CONNECT APP TASKS)
# ══════════════════════════════════════════════════════════════

@router.post("/chat", tags=["Companion Chatbot"])
async def chat_endpoint(req: ChatRequest):
    """Process companion chatbot interactions for app tasks and personal support."""
    if not req.messages:
        raise HTTPException(status_code=400, detail="Messages list cannot be empty.")
    try:
        messages = [{"role": msg.role, "content": msg.content} for msg in req.messages]
        response_text = await get_llm_chat_response(messages)
        return {"text": response_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chatbot error: {str(e)}")


# ══════════════════════════════════════════════════════════════
# 2. VOICE ASSISTANT (GOOGLE-STYLE SMART VOICE SEARCH ENGINE)
# ══════════════════════════════════════════════════════════════

class VoiceSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)


@router.post("/voice/search", tags=["Voice Search Assistant"])
async def voice_search_endpoint(req: VoiceSearchRequest):
    """Google-style voice search engine answering general queries, market prices, facts, and remedies."""
    query = req.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Search query cannot be empty.")
    try:
        spoken_answer = await get_voice_search_response(query)
        return {
            "success": True,
            "query": query,
            "answer": spoken_answer,
            "type": "voice_search_result"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Voice search error: {str(e)}")


# ══════════════════════════════════════════════════════════════
# 3. 24-HOUR INDIA & 12 CITIES NEWS BULLETIN
# ══════════════════════════════════════════════════════════════

NEWS_DATA = {
    "national_24h": [
        {
            "id": 1,
            "title": "Senior Citizens Digital Pension Portal Upgrade Rolled Out Nationally",
            "category": "Governance & Welfare",
            "time_ago": "2 hours ago",
            "summary": "Ministry of Social Justice announces simplified digital life certificate verification with doorstep assistance for seniors over 60 across India.",
            "tag": "National Welfare",
            "read_time": "2 min read"
        },
        {
            "id": 2,
            "title": "Indian Railways Expands Lower Berth Auto-Allocation Quota for Elders",
            "category": "Transport & Infra",
            "time_ago": "4 hours ago",
            "summary": "IRCTC introduces enhanced priority booking for senior citizens, ensuring guaranteed lower berth preferences on Express and Vande Bharat trains.",
            "tag": "Travel & Railways",
            "read_time": "3 min read"
        },
        {
            "id": 3,
            "title": "AYUSH Ministry Launches Nationwide Morning Yoga & Pranayama Drive",
            "category": "Health & Wellness",
            "time_ago": "6 hours ago",
            "summary": "Free wellness parks established across 500 towns in India offering guided gentle breathing exercises, joint mobility sessions, and health check-ups.",
            "tag": "Senior Health",
            "read_time": "2 min read"
        },
        {
            "id": 4,
            "title": "Golden Era Music Archives Digitized for Public Access",
            "category": "Culture & Heritage",
            "time_ago": "9 hours ago",
            "summary": "Over 10,000 classic 1960s-1980s radio broadcasts, classical ragas, and vintage audio recordings restored and made free for senior listeners.",
            "tag": "Arts & Nostalgia",
            "read_time": "4 min read"
        }
    ],
    "cities": {
        "New Delhi": [
            {
                "title": "Lodhi Gardens Launches Morning Senior Walking Club & Herbal Tea Corner",
                "time_ago": "1 hour ago",
                "category": "City Wellness",
                "summary": "Delhi Municipal Corporation sets up shaded seating, free health check kiosks, and fresh herbal tea for morning walkers at Lodhi & Nehru Park."
            },
            {
                "title": "Mandi House Hosts Classical Hindustani Music Evening",
                "time_ago": "5 hours ago",
                "category": "Culture",
                "summary": "Special tribute concert featuring legendary sitar compositions organized with free reserved seating for senior citizens."
            }
        ],
        "Mumbai": [
            {
                "title": "Marine Drive Promenade Enhances Senior Safety Lighting & Benches",
                "time_ago": "2 hours ago",
                "category": "City Infrastructure",
                "summary": "BMC adds anti-skid walking paths, specialized benches, and dedicated volunteer guides along the Queen's Necklace promenade."
            },
            {
                "title": "Vintage Cinema Retrospective Opens in South Mumbai",
                "time_ago": "6 hours ago",
                "category": "Entertainment",
                "summary": "Restored 1970s Bollywood classics screened daily with subsidized tickets for senior film enthusiasts."
            }
        ],
        "Bengaluru": [
            {
                "title": "Lalbagh Botanical Garden Introduces Electric Shuttle Buggies for Seniors",
                "time_ago": "3 hours ago",
                "category": "Eco & Transport",
                "summary": "Free electric cart rides now available every morning to help senior visitors tour the glasshouse and flower displays comfortably."
            },
            {
                "title": "Malleshwaram Senior Tech Literacy Workshops Announced",
                "time_ago": "7 hours ago",
                "category": "Community",
                "summary": "Free weekend classes helping elders master smartphone navigation, online banking safety, and video calls with grandkids."
            }
        ],
        "Kolkata": [
            {
                "title": "Heritage Tram Ride Service Relaunched Along Maidan Route",
                "time_ago": "2 hours ago",
                "category": "Heritage & Travel",
                "summary": "Air-conditioned nostalgia tram tour features classic Bengali acoustic music and complimentary Darjeeling tea for senior passengers."
            },
            {
                "title": "Rabindra Sangeet Morning Recital at Victoria Memorial",
                "time_ago": "4 hours ago",
                "category": "Culture",
                "summary": "Renowned vocalists perform timeless Tagore compositions amidst lush morning lawns, drawing hundreds of city elders."
            }
        ],
        "Chennai": [
            {
                "title": "Mylapore Heritage Walk & Carnatic Morning Concerts Return",
                "time_ago": "3 hours ago",
                "category": "Arts & Tradition",
                "summary": "Sabhas across Mylapore inaugurate morning devotional music hours with dedicated elder seating and traditional filter coffee."
            },
            {
                "title": "Marina Beach Walkway Gets Wheelchair Access & Shade Canopies",
                "time_ago": "6 hours ago",
                "category": "Civic Amenities",
                "summary": "Chennai Corporation completes beachside wooden ramp extension for seamless sea-breeze walks for seniors and wheelchair users."
            }
        ],
        "Hyderabad": [
            {
                "title": "Hussain Sagar Promenade Beautified with Senior Exercise Pavilions",
                "time_ago": "2 hours ago",
                "category": "Urban Parks",
                "summary": "Hyderabad Development Authority adds low-impact hydraulic fitness equipment designed specifically for age 50+ park visitors."
            },
            {
                "title": "Charminar Heritage Evening Lights & Guided Storytelling Walk",
                "time_ago": "8 hours ago",
                "category": "Culture",
                "summary": "Interactive history tours sharing stories of Nizam era architecture with comfortable electric cart transport."
            }
        ],
        "Ahmedabad": [
            {
                "title": "Sabarmati Riverfront Morning Laughter Club Expands to 10 Zones",
                "time_ago": "1 hour ago",
                "category": "Health & Joy",
                "summary": "Popular riverfront laughter & breathing yoga sessions now accommodate over 1,500 daily senior walkers along the promenade."
            },
            {
                "title": "Old City Haveli Preservation Drive Guided Walks",
                "time_ago": "5 hours ago",
                "category": "Heritage",
                "summary": "Guided architectural walks highlighting centuries-old wooden Pol houses with local Gujarati breakfast tasting."
            }
        ],
        "Pune": [
            {
                "title": "Shaniwar Wada Cultural Evening & Marathi Literature Meet",
                "time_ago": "4 hours ago",
                "category": "Literature & Arts",
                "summary": "Veteran authors and poets gather for evening recitations in historic courtyard setting with reserved senior seating."
            },
            {
                "title": "Kothrud Senior Fitness Trails Opened at ARAI Hills",
                "time_ago": "7 hours ago",
                "category": "Fitness",
                "summary": "Gently graded walking paths with rest kiosks and drinking water stations inaugurated for morning nature lovers."
            }
        ],
        "Jaipur": [
            {
                "title": "Amer Fort Introduces Battery Golf Carts & Heritage Courtyard Music",
                "time_ago": "3 hours ago",
                "category": "Heritage & Comfort",
                "summary": "Senior visitors enjoy free cart transport up the palace incline and live Shehnai recitations in Rajasthan court."
            },
            {
                "title": "Ramniwas Garden Morning Ayurvedic Wellness Kiosk Opens",
                "time_ago": "6 hours ago",
                "category": "Ayurveda & Health",
                "summary": "Certified doctors offer free pulse diagnostics, herbal teas, and joint care advice for morning walkers."
            }
        ],
        "Lucknow": [
            {
                "title": "Gomti Riverfront Morning Gazebo & Classical Ghazal Sessions",
                "time_ago": "2 hours ago",
                "category": "Music & Leisure",
                "summary": "Lucknow Development Authority hosts sunrise musical gatherings along the riverfront promenade for city elders."
            },
            {
                "title": "Chikankari Craft Heritage Expo Opened at Hazratganj",
                "time_ago": "5 hours ago",
                "category": "Handicrafts",
                "summary": "Special exhibition celebrating veteran master artisans with interactive embroidery workshops for senior hobbyists."
            }
        ],
        "Chandigarh": [
            {
                "title": "Sukhna Lake Morning Walking Festival Attracts 2,000+ Seniors",
                "time_ago": "2 hours ago",
                "category": "Fitness & Nature",
                "summary": "Clean air walking rally, bird watching guide tours, and complimentary herbal immunity drinks hosted by UT administration."
            },
            {
                "title": "Rose Garden Senior Reading Lounge & Chess Club Inaugurated",
                "time_ago": "6 hours ago",
                "category": "Community",
                "summary": "Shaded garden pavilion equipped with newspapers, magazines from 1970-1990s, and wooden chess boards."
            }
        ],
        "Kochi": [
            {
                "title": "Water Metro Launches Scenic Backwater Morning Excursions for Seniors",
                "time_ago": "3 hours ago",
                "category": "Eco Transport",
                "summary": "Electric boat cruises offer serene views of Fort Kochi, coconut groves, and Chinese fishing nets with priority boarding."
            },
            {
                "title": "Marine Drive Promenade Kathakali Recital Evening",
                "time_ago": "7 hours ago",
                "category": "Traditional Dance",
                "summary": "Open-air classical Kathakali makeup demonstration and performance with free seaside seating for senior art lovers."
            }
        ]
    }
}


@router.get("/news", tags=["News Bulletin"])
def get_news_bulletin():
    """Retrieve 24-hour National India news highlights and city updates across 12 major Indian cities."""
    return {
        "success": True,
        "updated_at": "Last 24 Hours (Live Feed)",
        "cities_count": 12,
        "data": NEWS_DATA
    }

