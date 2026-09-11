"""
Optional RVC (Retrieval-based Voice Conversion) / Applio pipeline integration for KAI NOKKI.
Disabled by default (ENABLE_RVC=false).
RVC only alters acoustic voice timbre; language, humor, and Malayalam slang come entirely from the LLM.
"""
import os
from typing import Optional


async def convert_voice(audio_bytes: bytes, model_path: Optional[str] = None) -> bytes:
    """
    Pass-through or external inference for RVC / Applio audio timbre transformation.
    """
    enable_rvc = os.getenv("ENABLE_RVC", "false").lower() == "true"
    if not enable_rvc:
        return audio_bytes

    model = model_path or os.getenv("RVC_MODEL_PATH", "")
    if not model:
        print("RVC is enabled but RVC_MODEL_PATH is not set. Returning original audio.")
        return audio_bytes

    try:
        # Example hook for local Applio/RVC HTTP inference server or CLI:
        # If an external RVC inference microservice is configured at RVC_SERVER_URL:
        rvc_url = os.getenv("RVC_SERVER_URL", "")
        if rvc_url:
            import httpx
            async with httpx.AsyncClient(timeout=10.0) as client:
                files = {"audio": ("input.wav", audio_bytes, "audio/wav")}
                data = {"model": model}
                res = await client.post(f"{rvc_url}/convert", files=files, data=data)
                if res.status_code == 200:
                    return res.content
    except Exception as err:
        print(f"RVC conversion failed: {err}. Falling back to base audio.")

    return audio_bytes
