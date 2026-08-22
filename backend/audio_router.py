from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
import io
try:
    from audio_utils import transcribe_audio, synthesize_speech
    from models import get_llm_response
except ImportError:
    from .audio_utils import transcribe_audio, synthesize_speech
    from .models import get_llm_response
from pydantic import BaseModel

router = APIRouter(prefix="/api/audio")

@router.post("/transcribe", summary="Transcribe short audio clip to text")
async def transcribe(file: UploadFile = File(...)):
    if file.content_type not in ["audio/webm", "audio/wav", "audio/mpeg", "audio/mp3"]:
        raise HTTPException(status_code=400, detail="Unsupported audio format")
    content = await file.read()
    try:
        text = transcribe_audio(content)
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class VoiceRequest(BaseModel):
    text: str

@router.post("/voice", summary="Chat with voice assistant; returns audio response")
async def voice_chat(request: VoiceRequest):
    # Get LLM response text
    try:
        response_text = await get_llm_response(request.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")
    # Synthesize speech
    try:
        audio_bytes = synthesize_speech(response_text)
        audio_stream = io.BytesIO(audio_bytes)
        return StreamingResponse(audio_stream, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS error: {e}")
