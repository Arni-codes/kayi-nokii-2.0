"""
Palm feature detection module for KAI NOKKI.
Receives client landmarks or image metadata and extracts entertainment palm features.
"""
from typing import Dict, Any
import random


def detect_palm_features(raw_features: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Normalizes client-detected palm landmarks or synthesizes entertainment palm metrics.
    Not scientifically valid - used purely for comedic Kerala palm-reading generation.
    """
    raw = raw_features or {}
    
    hand = raw.get("hand", "right")
    palm_width = float(raw.get("palm_width", random.randint(480, 560)))
    palm_height = float(raw.get("palm_height", random.randint(580, 670)))
    aspect_ratio = round(palm_height / max(palm_width, 1.0), 2)
    
    # Palm shape classification
    if aspect_ratio > 1.25:
        palm_shape = "long_slender"
    elif aspect_ratio < 1.05:
        palm_shape = "broad_square"
    else:
        palm_shape = "balanced_classic"
        
    # Fictional palm lines (0.0 to 1.0 scale)
    life_line_curve = round(float(raw.get("life_line_curve", random.uniform(0.60, 0.95))), 2)
    heart_line_curve = round(float(raw.get("heart_line_curve", random.uniform(0.40, 0.88))), 2)
    head_line_length = round(float(raw.get("head_line_length", random.uniform(0.55, 0.95))), 2)
    fate_line_strength = round(float(raw.get("fate_line_strength", random.uniform(0.20, 0.75))), 2)
    
    return {
        "hand": hand,
        "palm_width": palm_width,
        "palm_height": palm_height,
        "aspect_ratio": aspect_ratio,
        "palm_shape": palm_shape,
        "life_line_curve": life_line_curve,
        "heart_line_curve": heart_line_curve,
        "head_line_length": head_line_length,
        "fate_line_strength": fate_line_strength,
        "mount_of_venus": round(random.uniform(0.4, 0.9), 2),
        "mount_of_jupiter": round(random.uniform(0.3, 0.85), 2),
    }
