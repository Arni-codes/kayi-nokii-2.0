"""
KAI NOKKI - AI Jothishyan Backend Entrypoint (FastAPI)
"Ninte kai onnu kaanikkeda..."
"""
import os
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from dotenv import load_dotenv

# Load local environment variables
load_dotenv()

from .palm.detector import detect_palm_features
from .palm.analyzer import analyze_palm_features
from .ai.chatbot import generate_jothishyan_response
from .voice.tts import generate_speech
from .websocket.signaling import router as signaling_router

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

app = FastAPI(
    title="KAI NOKKI API",
    description="Humorous Kerala-style AI Palm-Reading & Jothishyan backend",
    version="1.0.0"
)

# CORS setup
origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include WebRTC signaling router
app.include_router(signaling_router)


# Request Models
class AnalyzePalmRequest(BaseModel):
    image: Optional[str] = None
    features: Optional[Dict[str, Any]] = None


class ChatMessageRequest(BaseModel):
    message: str
    palm_context: Optional[Dict[str, Any]] = None
    chat_history: Optional[List[Dict[str, str]]] = None


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None


@app.get("/api/health")
async def health_check():
    """Returns server and mock mode status."""
    mock_mode = os.getenv("MOCK_MODE", "true").lower() == "true"
    has_llm_key = bool(os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY"))
    return {
        "status": "healthy",
        "app": "KAI NOKKI",
        "tagline": "Ninte kai onnu kaanikkeda...",
        "mock_mode": mock_mode,
        "llm_available": has_llm_key,
        "tts_provider": os.getenv("TTS_PROVIDER", "mock")
    }


@app.post("/api/analyze-palm")
async def analyze_palm_endpoint(req: AnalyzePalmRequest):
    """
    Analyzes captured palm data, creates entertainment predictions for
    LOVE, CAREER, MONEY, PERSONALITY, FUTURE, and generates jothishyan audio.
    """
    try:
        # Step 1: Detect & normalize palm features
        palm_features = detect_palm_features(req.features)
        
        # Step 2: Generate entertainment interpretations
        analysis = analyze_palm_features(palm_features)
        
        # Step 3: Generate the AI Jothishyan summary in Unnimaya persona
        ai_response = await generate_jothishyan_response(
            palm_data=palm_features,
            user_message="Provide a complete initial palm reading summary."
        )
        summary_text = ai_response.get("text") or analysis["summary"]
        
        # Step 4: Generate voice audio
        tts_res = await generate_speech(summary_text)
        
        return {
            "reading": analysis["reading"],
            "features": palm_features,
            "summary": summary_text,
            "audio_url": tts_res.get("audio_url", "/public/audio/completed.mp3"),
            "audio_format": tts_res.get("format", "url")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/api/chat")
async def chat_endpoint(req: ChatMessageRequest):
    """
    Interactive Q&A with the jothishyan character, retaining session palm context.
    """
    try:
        if not req.message:
            raise HTTPException(status_code=400, detail="Message cannot be empty")
        
        palm_data = req.palm_context or {}
        ai_res = await generate_jothishyan_response(
            palm_data=palm_data,
            user_message=req.message,
            chat_history=req.chat_history
        )
        text = ai_res.get("text", "എടാ ഉണ്ടം പാണ്ടി... എനിക്ക് ചെറിയൊരു കൺഫ്യൂഷൻ തോന്നി, ഒന്നുകൂടി ചോദിക്ക്!")
        
        # Voice generation
        tts_res = await generate_speech(text)
        
        return {
            "text": text,
            "audio_url": tts_res.get("audio_url", ""),
            "audio_format": tts_res.get("format", "url")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@app.post("/api/tts")
async def tts_endpoint(req: TTSRequest):
    """
    Direct Text-To-Speech endpoint for playing jothishyan voice lines.
    """
    try:
        res = await generate_speech(req.text)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS error: {str(e)}")


# Serve static files if running directly via FastAPI
if (PROJECT_ROOT / "css").exists():
    app.mount("/css", StaticFiles(directory=str(PROJECT_ROOT / "css")), name="css")
if (PROJECT_ROOT / "js").exists():
    app.mount("/js", StaticFiles(directory=str(PROJECT_ROOT / "js")), name="js")
if (PROJECT_ROOT / "public").exists():
    app.mount("/public", StaticFiles(directory=str(PROJECT_ROOT / "public")), name="public")


@app.get("/")
async def read_index():
    index_file = PROJECT_ROOT / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": "KAI NOKKI backend is running. Open index.html in browser."}


@app.get("/camera.html")
async def read_camera():
    camera_file = PROJECT_ROOT / "camera.html"
    if camera_file.exists():
        return FileResponse(str(camera_file))
    return {"message": "camera.html not found"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"Starting KAI NOKKI FastAPI on http://{host}:{port}")
    uvicorn.run("backend.main:app", host=host, port=port, reload=True)
