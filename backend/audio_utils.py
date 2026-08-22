import io
from pathlib import Path

# Optional heavy dependencies
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

def get_whisper_model():
    global _whisper_model
    if not WHISPER_AVAILABLE:
        raise RuntimeError("Whisper package is not installed. Run: pip install whisper")
    if _whisper_model is None:
        _whisper_model = whisper.load_model("base")
    return _whisper_model

def get_tts_model(model_name: str = "tts_models/en/ljspeech/tacotron2"):
    global _tts_model
    if not TTS_AVAILABLE:
        raise RuntimeError("TTS package is not installed. Run: pip install TTS")
    if _tts_model is None:
        _tts_model = TTS(model_name)
    return _tts_model

def transcribe_audio(audio_bytes: bytes) -> str:
    """Transcribe raw audio bytes to text using Whisper."""
    model = get_whisper_model()
    tmp_path = Path("tmp_audio.wav")
    try:
        tmp_path.write_bytes(audio_bytes)
        result = model.transcribe(str(tmp_path))
        return result["text"].strip()
    finally:
        tmp_path.unlink(missing_ok=True)

def synthesize_speech(text: str, model_name: str = "tts_models/en/ljspeech/tacotron2") -> bytes:
    """Synthesize speech from text using Coqui TTS. Returns WAV bytes."""
    if not NUMPY_AVAILABLE:
        raise RuntimeError("Numpy and Scipy are required for TTS audio synthesis.")
    tts = get_tts_model(model_name)
    wav = tts.tts(text)
    wav_int16 = (np.array(wav) * 32767).astype(np.int16)
    buffer = io.BytesIO()
    wavfile.write(buffer, 22050, wav_int16)
    return buffer.getvalue()

