"""
LifeConnect — Audio Processing Utilities
Thread-safe transcription (Whisper) and speech synthesis (TTS) with temporary file isolation.
"""

import io
import os
import uuid
import tempfile
import logging
from pathlib import Path

logger = logging.getLogger("lifeconnect.audio")

# Optional heavy dependencies detection
try:
    import numpy as np
    import scipy.io.wavfile as wavfile
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False

try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False

try:
    from TTS.api import TTS
    TTS_AVAILABLE = True
except ImportError:
    TTS_AVAILABLE = False

_whisper_model = None
_tts_model = None


def is_audio_pipeline_available() -> dict:
    """Return status of audio processing backends."""
    return {
        "whisper_available": WHISPER_AVAILABLE,
        "tts_available": TTS_AVAILABLE,
        "numpy_scipy_available": NUMPY_AVAILABLE
    }


def get_whisper_model():
    """Lazy load Whisper model."""
    global _whisper_model
    if not WHISPER_AVAILABLE:
        raise RuntimeError("Whisper is not installed. To enable STT, install: pip install openai-whisper")
    if _whisper_model is None:
        logger.info("Loading Whisper base model into memory...")
        _whisper_model = whisper.load_model("base")
    return _whisper_model


def get_tts_model(model_name: str = "tts_models/en/ljspeech/tacotron2"):
    """Lazy load Coqui TTS model."""
    global _tts_model
    if not TTS_AVAILABLE:
        raise RuntimeError("TTS is not installed. To enable server TTS, install: pip install TTS")
    if _tts_model is None:
        logger.info(f"Loading TTS model '{model_name}'...")
        _tts_model = TTS(model_name)
    return _tts_model


def transcribe_audio(audio_bytes: bytes) -> str:
    """Transcribe raw audio bytes to text using Whisper with thread-safe temporary file."""
    if not WHISPER_AVAILABLE:
        raise RuntimeError("Whisper model is not available on this server.")
    
    model = get_whisper_model()
    # Unique temporary file per request to avoid race condition collisions
    temp_filename = f"lifeconnect_stt_{uuid.uuid4().hex}.wav"
    temp_path = Path(tempfile.gettempdir()) / temp_filename
    
    try:
        temp_path.write_bytes(audio_bytes)
        result = model.transcribe(str(temp_path))
        return result.get("text", "").strip()
    finally:
        try:
            if temp_path.exists():
                temp_path.unlink()
        except Exception as e:
            logger.warning(f"Failed to delete temp file {temp_path}: {e}")


def synthesize_speech(text: str, model_name: str = "tts_models/en/ljspeech/tacotron2") -> bytes:
    """Synthesize speech from text using Coqui TTS. Returns WAV bytes."""
    if not NUMPY_AVAILABLE:
        raise RuntimeError("Numpy and Scipy are required for server-side audio synthesis.")
    if not TTS_AVAILABLE:
        raise RuntimeError("TTS package is not installed on this server.")
        
    tts = get_tts_model(model_name)
    wav = tts.tts(text)
    wav_int16 = (np.array(wav) * 32767).astype(np.int16)
    buffer = io.BytesIO()
    wavfile.write(buffer, 22050, wav_int16)
    return buffer.getvalue()


