"""
LifeConnect — Database Module
Handles SQLite database initialization and async connection management.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "lifeconnect.db")


def get_connection() -> sqlite3.Connection:
    """Return a synchronous SQLite connection with row factory enabled."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Initialize the database schema (called once on startup)."""
    conn = get_connection()
    cursor = conn.cursor()

    # ── Users ──────────────────────────────────────────────────────
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
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Memories ───────────────────────────────────────────────────
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

    # ── Connections / Friends ──────────────────────────────────────
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

    # ── Communities ────────────────────────────────────────────────
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

    # ── Community Memberships ──────────────────────────────────────
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

    # ── Wellness Activities ────────────────────────────────────────
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

    conn.commit()
    conn.close()
    print("[LifeConnect] Database initialized successfully.")


if __name__ == "__main__":
    init_db()
