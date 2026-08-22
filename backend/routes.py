"""
LifeConnect — API Routes
All REST endpoints grouped by feature area.
"""

import hashlib
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Response, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List

from database import get_connection
from models import get_llm_chat_response

router = APIRouter(prefix="/api")


# ══════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def row_to_dict(row) -> dict:
    return dict(row) if row else None


def rows_to_list(rows) -> list:
    return [dict(r) for r in rows]


# ══════════════════════════════════════════════════════════════
# SCHEMAS
# ══════════════════════════════════════════════════════════════

class SignupRequest(BaseModel):
    full_name: str = Field(..., min_length=2)
    email: str
    password: str = Field(..., min_length=6)
    mobile: Optional[str] = None
    age: Optional[int] = None
    city: Optional[str] = None
    interests: Optional[List[str]] = []
    decade: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class MemoryCreate(BaseModel):
    user_id: int
    year: Optional[int] = None
    title: str
    content: Optional[str] = None
    media_type: Optional[str] = "story"
    emoji: Optional[str] = "📖"


class WellnessCreate(BaseModel):
    user_id: int
    activity: str
    completed: Optional[int] = 0
    date: Optional[str] = None


class ConnectionRequest(BaseModel):
    user_id: int
    friend_id: int


class CommunityJoin(BaseModel):
    user_id: int
    community_id: int


# ══════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.post("/auth/signup", tags=["Auth"])
def signup(data: SignupRequest):
    """Register a new user."""
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?", (data.email,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered.")

        pw_hash = hash_password(data.password)
        avatar = data.full_name.strip()[0].upper()
        interests_str = json.dumps(data.interests or [])

        cursor = conn.execute(
            """INSERT INTO users (full_name, email, mobile, password_hash, age, city,
                                  interests, decade, avatar)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data.full_name, data.email, data.mobile, pw_hash,
             data.age, data.city, interests_str, data.decade, avatar)
        )
        conn.commit()
        user_id = cursor.lastrowid
        user = row_to_dict(conn.execute(
            "SELECT id, full_name, email, mobile, age, city, interests, decade, avatar FROM users WHERE id=?",
            (user_id,)
        ).fetchone())
        user["interests"] = json.loads(user.get("interests") or "[]")
        return {"success": True, "user": user}
    finally:
        conn.close()


@router.post("/auth/login", tags=["Auth"])
def login(data: LoginRequest):
    """Authenticate a user."""
    conn = get_connection()
    try:
        pw_hash = hash_password(data.password)
        user = conn.execute(
            """SELECT id, full_name, email, mobile, age, city, interests, decade, avatar
               FROM users WHERE email=? AND password_hash=?""",
            (data.email, pw_hash)
        ).fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        user_dict = row_to_dict(user)
        user_dict["interests"] = json.loads(user_dict.get("interests") or "[]")
        return {"success": True, "user": user_dict}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# USER / PROFILE ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/profile/{user_id}", tags=["Profile"])
def get_profile(user_id: int):
    """Fetch a user profile by ID."""
    conn = get_connection()
    try:
        user = conn.execute(
            "SELECT id, full_name, email, mobile, age, city, interests, decade, avatar, created_at FROM users WHERE id=?",
            (user_id,)
        ).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")
        user_dict = row_to_dict(user)
        user_dict["interests"] = json.loads(user_dict.get("interests") or "[]")
        return user_dict
    finally:
        conn.close()


@router.get("/users", tags=["Profile"])
def list_users(city: Optional[str] = None, decade: Optional[str] = None):
    """List users — useful for friend discovery. Filter by city or decade."""
    conn = get_connection()
    try:
        query = "SELECT id, full_name, email, age, city, interests, decade, avatar FROM users WHERE 1=1"
        params = []
        if city:
            query += " AND city LIKE ?"
            params.append(f"%{city}%")
        if decade:
            query += " AND decade = ?"
            params.append(decade)
        rows = conn.execute(query, params).fetchall()
        users = []
        for r in rows_to_list(rows):
            r["interests"] = json.loads(r.get("interests") or "[]")
            users.append(r)
        return {"users": users, "total": len(users)}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# MEMORIES ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/memories/{user_id}", tags=["Memories"])
def get_memories(user_id: int):
    """Retrieve all memories for a user, ordered by year."""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM memories WHERE user_id=? ORDER BY year ASC",
            (user_id,)
        ).fetchall()
        return {"memories": rows_to_list(rows)}
    finally:
        conn.close()


@router.post("/memories", tags=["Memories"])
def create_memory(data: MemoryCreate):
    """Save a new memory."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """INSERT INTO memories (user_id, year, title, content, media_type, emoji)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (data.user_id, data.year, data.title, data.content, data.media_type, data.emoji)
        )
        conn.commit()
        memory = row_to_dict(conn.execute(
            "SELECT * FROM memories WHERE id=?", (cursor.lastrowid,)
        ).fetchone())
        return {"success": True, "memory": memory}
    finally:
        conn.close()


@router.delete("/memories/{memory_id}", tags=["Memories"])
def delete_memory(memory_id: int):
    """Delete a memory by ID."""
    conn = get_connection()
    try:
        conn.execute("DELETE FROM memories WHERE id=?", (memory_id,))
        conn.commit()
        return {"success": True, "message": "Memory deleted."}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# CONNECTIONS / FRIENDS ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/connections/{user_id}", tags=["Connections"])
def get_connections(user_id: int):
    """Get all connections (friends) for a user."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT c.id, c.status, c.created_at,
                      u.id as friend_id, u.full_name, u.city, u.avatar, u.decade
               FROM connections c
               JOIN users u ON u.id = c.friend_id
               WHERE c.user_id = ?""",
            (user_id,)
        ).fetchall()
        return {"connections": rows_to_list(rows)}
    finally:
        conn.close()


@router.post("/connections", tags=["Connections"])
def send_connection(data: ConnectionRequest):
    """Send a friend/connection request."""
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM connections WHERE user_id=? AND friend_id=?",
            (data.user_id, data.friend_id)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Connection request already sent.")
        conn.execute(
            "INSERT INTO connections (user_id, friend_id, status) VALUES (?, ?, 'pending')",
            (data.user_id, data.friend_id)
        )
        conn.commit()
        return {"success": True, "message": "Connection request sent."}
    finally:
        conn.close()


@router.put("/connections/{connection_id}/accept", tags=["Connections"])
def accept_connection(connection_id: int):
    """Accept a pending connection request."""
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE connections SET status='connected' WHERE id=?",
            (connection_id,)
        )
        conn.commit()
        return {"success": True, "message": "Connection accepted."}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# COMMUNITIES ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/communities", tags=["Communities"])
def get_communities(category: Optional[str] = None):
    """List all communities, optionally filtered by category."""
    conn = get_connection()
    try:
        query = "SELECT * FROM communities"
        params = []
        if category:
            query += " WHERE category = ?"
            params.append(category)
        query += " ORDER BY member_count DESC"
        rows = conn.execute(query, params).fetchall()
        return {"communities": rows_to_list(rows)}
    finally:
        conn.close()


@router.post("/communities/join", tags=["Communities"])
def join_community(data: CommunityJoin):
    """Join a community."""
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT 1 FROM community_members WHERE user_id=? AND community_id=?",
            (data.user_id, data.community_id)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Already a member.")
        conn.execute(
            "INSERT INTO community_members (user_id, community_id) VALUES (?, ?)",
            (data.user_id, data.community_id)
        )
        conn.execute(
            "UPDATE communities SET member_count = member_count + 1 WHERE id=?",
            (data.community_id,)
        )
        conn.commit()
        return {"success": True, "message": "Joined community."}
    finally:
        conn.close()


@router.delete("/communities/leave", tags=["Communities"])
def leave_community(data: CommunityJoin):
    """Leave a community."""
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM community_members WHERE user_id=? AND community_id=?",
            (data.user_id, data.community_id)
        )
        conn.execute(
            "UPDATE communities SET member_count = MAX(0, member_count - 1) WHERE id=?",
            (data.community_id,)
        )
        conn.commit()
        return {"success": True, "message": "Left community."}
    finally:
        conn.close()


@router.get("/communities/{user_id}/mine", tags=["Communities"])
def get_my_communities(user_id: int):
    """Get communities the user has joined."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT c.* FROM communities c
               JOIN community_members cm ON cm.community_id = c.id
               WHERE cm.user_id = ?""",
            (user_id,)
        ).fetchall()
        return {"communities": rows_to_list(rows)}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# WELLNESS ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/wellness/{user_id}", tags=["Wellness"])
def get_wellness(user_id: int, date: Optional[str] = None):
    """Get wellness activities for a user on a given date (defaults to today)."""
    conn = get_connection()
    try:
        target_date = date or datetime.today().strftime("%Y-%m-%d")
        rows = conn.execute(
            "SELECT * FROM wellness_activities WHERE user_id=? AND date=?",
            (user_id, target_date)
        ).fetchall()
        return {"activities": rows_to_list(rows), "date": target_date}
    finally:
        conn.close()


@router.post("/wellness", tags=["Wellness"])
def log_wellness(data: WellnessCreate):
    """Log a wellness activity."""
    conn = get_connection()
    try:
        date = data.date or datetime.today().strftime("%Y-%m-%d")
        cursor = conn.execute(
            "INSERT INTO wellness_activities (user_id, activity, completed, date) VALUES (?, ?, ?, ?)",
            (data.user_id, data.activity, data.completed, date)
        )
        conn.commit()
        return {"success": True, "id": cursor.lastrowid}
    finally:
        conn.close()


@router.put("/wellness/{activity_id}/complete", tags=["Wellness"])
def complete_wellness(activity_id: int):
    """Mark a wellness activity as completed."""
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE wellness_activities SET completed=1 WHERE id=?", (activity_id,)
        )
        conn.commit()
        return {"success": True, "message": "Activity marked as completed."}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# HEALTH CHECK
# ══════════════════════════════════════════════════════════════

@router.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "app": "LifeConnect API", "version": "1.0.0"}


# ══════════════════════════════════════════════════════════════
# CHAT (LLM)
# ══════════════════════════════════════════════════════════════

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

@router.post("/chat", tags=["Chat"])
async def chat_endpoint(req: ChatRequest):
    """Process a chat interaction maintaining history."""
    try:
        messages = [{"role": msg.role, "content": msg.content} for msg in req.messages]
        response_text = await get_llm_chat_response(messages)
        return {"text": response_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
