import os
import sys
from pathlib import Path

# Ensure api directory is at the front of sys.path
api_dir = Path(__file__).resolve().parent
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))

# Import main FastAPI application
from main import app
from database import init_db

# Explicitly initialize database and seed demo user on serverless cold start
try:
    init_db()
except Exception as e:
    print(f"[Vercel Serverless] DB init: {e}")
