"""
LifeConnect — Audio Router
Handles STT audio transcription and TTS audio synthesis with size validation and status diagnostics.
"""

import io
from fastapi import APIRouter, UploadFile, File, HTTPException, status
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

try:
    from audio_utils import transcribe_audio, synthesize_speech, is_audio_pipeline_available
    from models import get_llm_response
except ImportError:
    from .audio_utils import transcribe_audio, synthesize_speech, is_audio_pipeline_available
    from .models import get_llm_response

router = APIRouter(prefix="/api/audio", tags=["Audio"])

MAX_AUDIO_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB
ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/wav", "audio/wave", "audio/x-wav",
    "audio/mpeg", "audio/mp3", "audio/ogg", "audio/aac", "audio/m4a"
}


class VoiceRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


@router.get("/status", summary="Check availability of audio processing engines")
def get_audio_status():
    """Return status of speech-to-text (Whisper) and text-to-speech (TTS) backends."""
    return {"status": "ok", "pipeline": is_audio_pipeline_available()}


@router.post("/transcribe", summary="Transcribe short audio clip to text (STT)")
async def transcribe(file: UploadFile = File(...)):
    """Convert spoken voice audio bytes to text using Whisper."""
    content_type = file.content_type.lower() if file.content_type else ""
    if content_type not in ALLOWED_AUDIO_TYPES and not content_type.startswith("audio/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format '{content_type}'. Allowed: WAV, MP3, WebM, OGG."
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio file provided.")
    if len(content) > MAX_AUDIO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio file exceeds 15MB size limit."
        )

    try:
        text = transcribe_audio(content)
        return {"success": True, "text": text}
    except RuntimeError as re:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Transcription failed: {e}")


@router.post("/voice", summary="Chat with voice assistant; returns streaming audio response")
async def voice_chat(request: VoiceRequest):
    """Receive user text, generate domain response, and synthesize spoken audio."""
    # 1. Obtain LLM Response Text
    try:
        response_text = await get_llm_response(request.text)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"AI model error: {e}")

    # 2. Synthesize Speech
    try:
        audio_bytes = synthesize_speech(response_text)
        audio_stream = io.BytesIO(audio_bytes)
        return StreamingResponse(
            audio_stream,
            media_type="audio/wav",
            headers={"X-Response-Text": response_text[:200].replace("\n", " ")}
        )
    except RuntimeError as re:
        # If server-side TTS is not installed, return JSON with text fallback
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "text": response_text,
                "note": "TTS engine not installed on server; client speech synthesis recommended.",
                "detail": str(re)
            }
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"TTS synthesis error: {e}")

