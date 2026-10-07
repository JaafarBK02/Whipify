"""Beta access: users, access tokens and per-user diagnosis limits (stored in SQLite)."""
import os
import secrets
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, Optional

DB_PATH = os.getenv("BETA_DB_PATH", "whipify.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_beta_users_table():
    """Create beta_users table if it doesn't exist"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS beta_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT,
            email TEXT UNIQUE NOT NULL,
            access_token TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            diagnosis_count INTEGER DEFAULT 0,
            max_diagnoses INTEGER DEFAULT 10,
            is_active BOOLEAN DEFAULT 1
        )
    """)
    
    conn.commit()
    conn.close()

def generate_access_token() -> str:
    """Generate a secure random token"""
    return secrets.token_urlsafe(32)

def create_beta_user(first_name: str, last_name: str, email: str, days_valid: int = 30, max_diagnoses: int = 10) -> Dict:
    """Create a new beta user with access token"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Generate unique token
    access_token = generate_access_token()
    created_at = datetime.now().isoformat()
    expires_at = (datetime.now() + timedelta(days=days_valid)).isoformat()
    
    try:
        cursor.execute("""
            INSERT INTO beta_users 
            (first_name, last_name, email, access_token, created_at, expires_at, max_diagnoses)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (first_name, last_name, email, access_token, created_at, expires_at, max_diagnoses))
        
        conn.commit()
        user_id = cursor.lastrowid
        
        return {
            "id": user_id,
            "email": email,
            "access_token": access_token,
            "expires_at": expires_at,
            "max_diagnoses": max_diagnoses
        }
    except sqlite3.IntegrityError:
        # Email already exists, return existing user
        cursor.execute("SELECT * FROM beta_users WHERE email = ?", (email,))
        existing = cursor.fetchone()
        return {
            "id": existing["id"],
            "email": existing["email"],
            "access_token": existing["access_token"],
            "expires_at": existing["expires_at"],
            "max_diagnoses": existing["max_diagnoses"],
            "diagnosis_count": existing["diagnosis_count"],
            "existing": True
        }
    finally:
        conn.close()

def validate_token(token: str) -> Optional[Dict]:
    """Check if token is valid and return user info"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM beta_users 
        WHERE access_token = ? AND is_active = 1
    """, (token,))
    
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return None
    
    # Check if expired
    if user["expires_at"]:
        expires_at = datetime.fromisoformat(user["expires_at"])
        if datetime.now() > expires_at:
            return None
    
    # The diagnosis limit is enforced by the API so it can return a clear "used all" message
    return dict(user)

def increment_diagnosis_count(token: str):
    """Increment diagnosis count for a user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        UPDATE beta_users 
        SET diagnosis_count = diagnosis_count + 1
        WHERE access_token = ?
    """, (token,))
    
    conn.commit()
    conn.close()

# Initialize table on import
init_beta_users_table()