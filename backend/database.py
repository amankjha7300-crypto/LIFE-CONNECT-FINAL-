"""
LifeConnect — Database Module
Handles SQLite database initialization, indexing, and thread-safe connection management.
"""

import sqlite3
import os
from contextlib import contextmanager
from typing import Generator

DB_PATH = os.path.join(os.path.dirname(__file__), "lifeconnect.db")


def get_connection() -> sqlite3.Connection:
    """Return a configured synchronous SQLite connection."""
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    # High-performance and concurrency pragmas
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-64000")  # 64MB cache
    return conn


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Transactional context manager for database operations.
    Automatically commits on success, rollbacks on error, and ensures connection is closed.
    """
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Initialize the database schema and indexes (called on startup)."""
    with get_db() as conn:
        cursor = conn.cursor()

        # ── Users Table ────────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name     TEXT    NOT NULL,
                email         TEXT    UNIQUE NOT NULL,
                mobile        TEXT,
                password_hash TEXT    NOT NULL,
                age           INTEGER,
                city          TEXT,
                interests     TEXT,
                decade        TEXT,
                avatar        TEXT,
                bio           TEXT,
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ── Memories Table ─────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                year       INTEGER,
                title      TEXT    NOT NULL,
                content    TEXT,
                media_type TEXT    DEFAULT 'story',
                emoji      TEXT    DEFAULT '📖',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # ── Connections / Friends Table ────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS connections (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                friend_id  INTEGER NOT NULL,
                status     TEXT    DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, friend_id)
            )
        """)

        # ── Communities Table ──────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS communities (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                name         TEXT    NOT NULL,
                description  TEXT,
                category     TEXT,
                emoji        TEXT    DEFAULT '🌐',
                member_count INTEGER DEFAULT 0,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ── Community Memberships Table ────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS community_members (
                user_id      INTEGER NOT NULL,
                community_id INTEGER NOT NULL,
                joined_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, community_id),
                FOREIGN KEY (user_id)      REFERENCES users(id)       ON DELETE CASCADE,
                FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
            )
        """)

        # ── Wellness Activities Table ──────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS wellness_activities (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id   INTEGER NOT NULL,
                activity  TEXT    NOT NULL,
                completed INTEGER DEFAULT 0,
                date      DATE    DEFAULT CURRENT_DATE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # ── Migration check for missing columns ────────────────────────
        user_cols = [r[1] for r in cursor.execute("PRAGMA table_info(users)").fetchall()]
        if "bio" not in user_cols:
            cursor.execute("ALTER TABLE users ADD COLUMN bio TEXT")

        # ── Performance Indexes ────────────────────────────────────────
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_city ON users(city)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_decade ON users(decade)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id, year)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id, friend_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_connections_friend ON connections(friend_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_wellness_user_date ON wellness_activities(user_id, date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_communities_category ON communities(category)")

        # Seed default demo user if not exists
        cursor.execute("SELECT id FROM users WHERE email='demo@lifeconnect.local'")
        if not cursor.fetchone():
            import hashlib, secrets
            salt = secrets.token_hex(16)
            iterations = 100_000
            key = hashlib.pbkdf2_hmac("sha256", "Demo123!".encode("utf-8"), salt.encode("utf-8"), iterations).hex()
            demo_pw_hash = f"pbkdf2:{iterations}:{salt}:{key}"
            cursor.execute("""
                INSERT INTO users (full_name, email, mobile, password_hash, age, city, interests, decade, avatar, bio)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, ('Ramesh Sharma', 'demo@lifeconnect.local', '9876543210', demo_pw_hash, 68, 'New Delhi', 'Gardening,Reading,Classical Music', '1970s', 'R', 'Retired educator and avid classical music lover.'))

        # Seed communities if empty
        cursor.execute("SELECT COUNT(*) FROM communities")
        if cursor.fetchone()[0] == 0:
            default_communities = [
                ('1970s School Alumni', 'Connect with schoolmates from the golden decade of the 1970s.', 'Alumni', '🏫', 2431),
                ('Lata Mangeshkar Fans', 'Celebrate the timeless music of the nightingale of India.', 'Music', '🎵', 8923),
                ('Old Bollywood Lovers', 'Rediscover the golden era of Hindi cinema from the 60s, 70s and 80s.', 'Movies', '🎬', 5621),
                ('Morning Yoga & Walking', 'Start your day right with a supportive community of walkers and yogis.', 'Wellness', '🧘', 3218),
                ('Cricket Memories', 'Relive the golden era of Indian cricket with fellow fans.', 'Sports', '🏏', 6754),
                ('Classic Book Lovers', 'Discuss the books that shaped generations — Premchand, Tagore, Gulzar and more.', 'Books', '📚', 2109),
                ('Punjabi Heritage Group', 'Celebrate Punjabi culture, food, language and community.', 'Regional', '🌾', 4320),
                ('Doordarshan Memories', 'Remember Ramayan, Mahabharat, Chitrahaar and all those memorable shows.', 'Nostalgia', '📺', 7891),
            ]
            cursor.executemany(
                "INSERT INTO communities (name, description, category, emoji, member_count) VALUES (?, ?, ?, ?, ?)",
                default_communities
            )

    print("[LifeConnect] Database initialized with performance indexes and demo user.")


if __name__ == "__main__":
    init_db()

