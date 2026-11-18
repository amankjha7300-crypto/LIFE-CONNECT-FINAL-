"""
LifeConnect Root ASGI Entry Point
Allows standard ASGI servers (Render, Railway, Uvicorn, Gunicorn, Docker) to start cleanly from root.
"""
import sys
import os
from pathlib import Path

# Ensure backend directory is in sys.path
ROOT_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Import FastAPI instance from backend
from backend.main import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)

