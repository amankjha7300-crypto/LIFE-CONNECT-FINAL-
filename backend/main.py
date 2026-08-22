"""
LifeConnect — FastAPI Application Entry Point
Run with: uvicorn main:app --reload  (from the backend/ directory)
Or:       python main.py
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import init_db
from routes import router
from audio_router import router as audio_router


# ── Lifespan (startup/shutdown) ────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB on startup."""
    init_db()
    print("[LifeConnect] Server is ready at http://localhost:8000")
    print("[LifeConnect] API docs at http://localhost:8000/api/docs")
    yield
    # shutdown logic can go here if needed


# ── App setup ──────────────────────────────────────────────────────────────────
app = FastAPI(
    title="LifeConnect API",
    description="Backend API for LifeConnect — AI-powered life companion for people 50+",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register API routes ────────────────────────────────────────────────────────
app.include_router(router)
app.include_router(audio_router)

# ── Serve frontend static files ────────────────────────────────────────────────
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

if FRONTEND_DIR.exists():
    # Serve static assets (CSS, JS) under /static
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    def serve_index():
        """Serve the SPA index.html at the root."""
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        """Fall back to index.html for all SPA routes."""
        requested = FRONTEND_DIR / full_path
        if requested.exists() and requested.is_file():
            return FileResponse(str(requested))
        return FileResponse(str(FRONTEND_DIR / "index.html"))


# ── Dev entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
