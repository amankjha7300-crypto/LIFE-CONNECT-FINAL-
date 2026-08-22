"""
LifeConnect — FastAPI Application Entry Point
Production-grade backend with request logging, global error handling, static file serving, and health telemetry.
"""

import os
import time
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from database import init_db, get_db
from routes import router
from audio_router import router as audio_router

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [LifeConnect] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("lifeconnect")

START_TIME = time.time()


# ── Lifespan (startup/shutdown) ────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB and log readiness on startup."""
    try:
        init_db()
        logger.info("Database initialized successfully.")
        logger.info("Server is ready at http://localhost:8000")
        logger.info("API docs available at http://localhost:8000/api/docs")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise e
    yield
    logger.info("Server shutting down cleanly.")


# ── App setup ──────────────────────────────────────────────────────────────────
app = FastAPI(
    title="LifeConnect API",
    description="Production-grade Backend API for LifeConnect — AI-powered life companion for people 50+",
    version="1.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)


# ── Global Middleware ──────────────────────────────────────────────────────────
@app.middleware("http")
async def request_metrics_middleware(request: Request, call_next):
    """Log incoming request, compute duration, and inject X-Process-Time header."""
    start_time = time.perf_counter()
    client_ip = request.client.host if request.client else "unknown"
    
    try:
        response = await call_next(request)
        process_time_ms = (time.perf_counter() - start_time) * 1000
        response.headers["X-Process-Time"] = f"{process_time_ms:.2f}ms"
        
        # Log API calls
        if request.url.path.startswith("/api"):
            logger.info(f"{request.method} {request.url.path} - {response.status_code} ({process_time_ms:.2f}ms) [{client_ip}]")
            
        return response
    except Exception as exc:
        process_time_ms = (time.perf_counter() - start_time) * 1000
        logger.error(f"Unhandled Exception on {request.method} {request.url.path}: {exc} ({process_time_ms:.2f}ms)")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "error": {
                    "code": 500,
                    "message": "Internal server error. Please try again later.",
                    "detail": str(exc) if os.getenv("DEBUG", "false").lower() == "true" else None
                }
            }
        )


# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Register API routes ────────────────────────────────────────────────────────
app.include_router(router)
app.include_router(audio_router)


# ── Enhanced System Health Check ───────────────────────────────────────────────
@app.get("/api/health", tags=["System"])
def health_check():
    """System health and database latency diagnostics."""
    db_status = "unknown"
    db_latency_ms = None
    try:
        t0 = time.perf_counter()
        with get_db() as conn:
            conn.execute("SELECT 1").fetchone()
        db_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy ({e})"

    uptime_seconds = int(time.time() - START_TIME)

    return {
        "status": "ok" if db_status == "healthy" else "degraded",
        "app": "LifeConnect API",
        "version": "1.1.0",
        "database": {
            "status": db_status,
            "latency_ms": db_latency_ms
        },
        "uptime_seconds": uptime_seconds
    }


# ── Serve frontend static files ────────────────────────────────────────────────
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    def serve_index():
        """Serve the SPA index.html at the root."""
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        """Fall back to index.html for all SPA routes (excluding missing API routes)."""
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": f"API route '/{full_path}' not found."})
        requested = FRONTEND_DIR / full_path
        if requested.exists() and requested.is_file():
            return FileResponse(str(requested))
        return FileResponse(str(FRONTEND_DIR / "index.html"))


# ── Dev entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)



