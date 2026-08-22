import io
from pathlib import Path
import numpy as np
import scipy.io.wavfile as wavfile
import whisper
from TTS.api import TTS

# Load Whisper model once (base model balances speed/accuracy)
_whisper_model = whisper.load_model("base")

def transcribe_audio(audio_bytes: bytes) -> str:
    """Transcribe raw audio bytes to text using Whisper.
    The audio is temporarily written to disk because Whisper expects a filename.
    """
    tmp_path = Path("tmp_audio.wav")
    tmp_path.write_bytes(audio_bytes)
    result = _whisper_model.transcribe(str(tmp_path))
    tmp_path.unlink(missing_ok=True)
    return result["text"].strip()

def synthesize_speech(text: str, model_name: str = "tts_models/en/ljspeech/tacotron2") -> bytes:
    """Synthesize speech from text using Coqui TTS.
    Returns WAV bytes (16‑bit PCM, 22 kHz).
    """
    tts = TTS(model_name)
    wav = tts.tts(text)
    # Convert numpy float32 array to int16 PCM
    wav_int16 = (wav * 32767).astype(np.int16)
    buffer = io.BytesIO()
    wavfile.write(buffer, 22050, wav_int16)
    return buffer.getvalue()
