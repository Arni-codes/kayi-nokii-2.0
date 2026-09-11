"""
Voice and Speech synthesis package for KAI NOKKI.
"""
from .tts import generate_speech
from .rvc import convert_voice

__all__ = ["generate_speech", "convert_voice"]
