"""
Provider-independent Text-To-Speech abstraction for KAI NOKKI.
Supports Gemini TTS, ElevenLabs, Google TTS, and client-side fallback.
"""
import os
import base64
from typing import Dict, Any, Optional
from .rvc import convert_voice


async def generate_speech(text: str) -> Dict[str, Any]:
    """
    Generates speech audio for the jothishyan response.
    Returns a dictionary with 'audio_url', 'format', and 'fallback_synthesis'.
    """
    provider = os.getenv("TTS_PROVIDER", "mock").lower()
    enable_rvc = os.getenv("ENABLE_RVC", "false").lower() == "true"
    api_key = os.getenv("TTS_API_KEY") or os.getenv("GEMINI_API_KEY")

    # If provider is configured and not mock
    if provider == "gemini" and api_key:
        try:
            import httpx
            # Gemini TTS endpoint
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": text}]}],
                "config": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {
                            "prebuiltVoiceConfig": {"voiceName": "Kore"}
                        }
                    }
                }
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        for part in parts:
                            inline = part.get("inlineData", {})
                            if inline.get("data"):
                                audio_base64 = inline.get("data")
                                
                                # Optional RVC voice conversion if enabled
                                if enable_rvc:
                                    audio_bytes = base64.b64decode(audio_base64)
                                    converted = await convert_voice(audio_bytes)
                                    audio_base64 = base64.b64encode(converted).decode("utf-8")

                                return {
                                    "audio_url": f"data:audio/mp3;base64,{audio_base64}",
                                    "format": "base64",
                                    "text": text
                                }
        except Exception as e:
            print(f"TTS synthesis error: {e}")

    # Fallback to predefined mock audio or signaling client to use browser speech synthesis
    return {
        "audio_url": "/public/audio/completed.mp3",
        "format": "url",
        "text": text,
        "fallback_synthesis": True,
        "message": "Client can utilize Web Speech API or custom audio queue for Malayalam voice."
    }
