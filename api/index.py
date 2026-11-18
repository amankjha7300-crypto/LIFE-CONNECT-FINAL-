import sys
import os
from pathlib import Path

# Set up Python path so backend modules resolve seamlessly on Vercel
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"

sys.path.insert(0, str(backend_dir))
sys.path.insert(0, str(root_dir))

from main import app

