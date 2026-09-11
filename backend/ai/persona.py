"""
Persona definition and prompt builder for Unnimaya Kai Nokki.
"""
from pathlib import Path
import json
from typing import Dict, Any, Optional
from .transcript_loader import load_transcript_references

AI_DIR = Path(__file__).resolve().parent
BACKEND_DIR = AI_DIR.parent
ROOT_DIR = BACKEND_DIR.parent

# Resolve persona_prompt.txt
prompt_path = ROOT_DIR / "persona_prompt.txt"
if not prompt_path.exists():
    prompt_path = BACKEND_DIR / "persona_prompt.txt"

if prompt_path.exists():
    PERSONA_PROMPT = prompt_path.read_text(encoding="utf-8")
else:
    PERSONA_PROMPT = "You are Unnimaya Kai Nokki, a funny Kerala AI jothishyan."

# Resolve reference_vocabulary.json
vocab_path = ROOT_DIR / "reference_vocabulary.json"
if not vocab_path.exists():
    vocab_path = BACKEND_DIR / "reference_vocabulary.json"

if vocab_path.exists():
    VOCABULARY = json.loads(vocab_path.read_text(encoding="utf-8"))
else:
    VOCABULARY = {
        "addresses": ["എടാ", "എടി", "മോനെ", "മോളെ", "മുത്തേ"],
        "nicknames": ["ഉണ്ടം പാണ്ടി", "മൊട്ടത്തലയൻ", "മൺചട്ടി മലരേ", "പുളകിതൻ പാവയ്ക്ക"],
        "expressions": ["അതൊക്കെ പോട്ടെ", "നീ ഒരു കാര്യം ചെയ്യ്", "തീർന്നടാ"]
    }


def build_prompt(palm_data: Dict[str, Any], user_message: str = "", chat_history: Optional[list] = None) -> str:
    """
    Constructs the complete Unnimaya Kai Nokki prompt with persona, reference vocabulary,
    transcripts, palm data, and optional user message/history.
    """
    vocabulary_str = json.dumps(VOCABULARY, ensure_ascii=False, indent=2)
    palm_str = json.dumps(palm_data, ensure_ascii=False, indent=2)
    transcripts = load_transcript_references()
    
    history_str = ""
    if chat_history:
        history_str = "\n================================================== RECENT CONVERSATION\n"
        for msg in chat_history[-6:]:
            role = msg.get("role", "user")
            text = msg.get("text", "")
            history_str += f"{role.upper()}: {text}\n"

    return f"""{PERSONA_PROMPT}

================================================== REFERENCE VOCABULARY
{vocabulary_str}

================================================== TRANSCRIPT STYLE EXCERPTS
{transcripts}

================================================== PALM DATA
{palm_str}
{history_str}
================================================== USER MESSAGE
{user_message if user_message else "[Initial Palm Reading Request - Provide a grand Unnimaya Kai Nokki palm reading summary and predictions]"}

================================================== TASK
Generate ONE original Malayalam palm-reading response.
Use the palm data.
Use the reference vocabulary naturally.
Stay completely in character.
Return ONLY the character's response.
"""
