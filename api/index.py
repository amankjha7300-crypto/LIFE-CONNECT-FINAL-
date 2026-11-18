import os
import sys
import traceback
from pathlib import Path

# Ensure api directory is at the front of sys.path
api_dir = Path(__file__).resolve().parent
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))

try:
    from main import app
    from database import init_db
    try:
        init_db()
    except Exception as dbe:
        print(f"[Vercel] DB Init: {dbe}")

except Exception as err:
    tb = traceback.format_exc()
    print(f"[Vercel Startup Error]: {tb}")
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    app = FastAPI(title="LifeConnect Error Diagnostics")

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
    async def debug_error(full_path: str):
        return JSONResponse(
            status_code=500,
            content={
                "error": "Vercel Startup Exception",
                "detail": str(err),
                "traceback": tb.split("\n")
            }
        )

# Serverless handler with Mangum adapter (lifespan="off" prevents serverless freeze)
try:
    from mangum import Mangum
    handler = Mangum(app, lifespan="off")
except Exception:
    handler = app
