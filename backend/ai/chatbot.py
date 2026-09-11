"""
LLM abstraction and chatbot response generator for KAI NOKKI.
Supports Mock Mode and real LLM providers (Gemini, OpenAI, etc.).
"""
import os
import random
from typing import Dict, Any, Optional
from .persona import build_prompt

# Fallback witty mock responses when no LLM key is configured
MOCK_JOTHISHYAN_RESPONSES = [
    "എടാ ഉണ്ടം പാണ്ടി... കൈ ഞാൻ കൃത്യമായി നോക്കി! ഇവിടെ നോക്കിയേ... നിന്റെ ലൈഫ് ലൈൻ നല്ല ലെങ്ത് ഉണ്ട്. പക്ഷേ പുളകിതൻ പാവയ്ക്കേ, രാത്രി ഉറങ്ങാതെ ഫോണിൽ നോക്കി ഇരിക്കുന്ന ആ സ്വഭാവം മാറിയില്ലെങ്കിൽ കൺതടത്തിൽ തിമിര തങ്കന്റെ കറുപ്പ് വരും! അതൊക്കെ പോട്ടെ മുത്തേ... ലവ് ലൈൻ ആണ് കിടുക്കൻ. അടുത്ത മാസം ഒരു വലിയ എക്സ്ചേഞ്ച് ഓഫർ വരാൻ സാധ്യതയുണ്ട്. തീർന്നടാ!",
    "മൊട്ടത്തലയാ... നീ ഇങ്ങോട്ട് വാ. കൈ കണ്ടിട്ട് എനിക്ക് ഒരു കാര്യം മനസ്സിലായി. ബിസിനസ് പ്ലാൻ ഒക്കെ മനസ്സിൽ ഭയങ്കരമായി ഓടുന്നുണ്ട്. പക്ഷേ മൺചട്ടി മലരേ... പൈസ കിട്ടിയാൽ കയ്യിൽ നിൽക്കില്ല, കശുവണ്ടി പോലെ കൊറിച്ചു തീർക്കും! ഓന്ത് ഗോപാലനെ പോലെ അങ്ങോട്ടും ഇങ്ങോട്ടും ചാടാതെ ഒരു കാര്യത്തിൽ ഉറച്ചു നിക്ക്!",
    "എടി ചെന്താമര മലരേ... നിന്റെ ഹാർട്ട് ലൈൻ കണ്ടിട്ട് എനിക്ക് ചിരി വരുന്നു! കോളേജിൽ ആരുടെയോ പിറകെ നടന്നിട്ട് അവസാനം ഇൻസ്റ്റാഗ്രാമിൽ മാത്രം ഒളിഞ്ഞു നോക്കുന്ന ആ പഴയ സ്വഭാവം ഇപ്പൊഴും ഉണ്ടോ? പേടിക്കണ്ട... നിന്റെ തലവരയിൽ നല്ലൊരു വഴിത്തിരിവ് കിടപ്പുണ്ട്. ഒരു പ്രീമിയം സർപ്രൈസ് വരും!",
    "എടാ കുണ്ടാമണ്ടി തലയാ... കരിയർ ലൈൻ കണ്ടിട്ട് ഗൂഗിൾ മാപ്സ് പോലും വഴി തെറ്റും! ഓവർതിങ്കിംഗ് നിന്റെ ബ്രെയിനിന്റെ പ്രീമിയം സബ്സ്ക്രിപ്ഷൻ എടുത്ത പോലെയാണല്ലോ. നീ ഒരു കാര്യം ചെയ്യ്... കുറച്ചു നേരം ശാന്തമായിരിക്ക്. പൈസ വരും, പക്ഷേ വന്ന സ്പീഡിൽ ഡെലിവറി ചാർജ്ജും കൊണ്ട് പോകും!",
    "മയോണീസ് മോനേ... നിന്റെ പെരുവിരൽ കണ്ടിട്ടേ എനിക്ക് തോന്നി! വിദേശത്ത് പോകാൻ ഭയങ്കര ആഗ്രഹം അല്ലേ? പാസ്പോർട്ട് ഒക്കെ റെഡിയാക്കി വെച്ചോ, പക്ഷേ കയ്യിലെ വര പറയുന്നത് അനുസരിച്ച് ആദ്യം ആലുവ വഴി കാക്കനാട് വരെ പോയി ഒരു ബിസിനസ് ഡീൽ സെറ്റിൽ ആവേണ്ടി വരും!"
]

MOCK_CHAT_ANSWERS = {
    "love": "അതൊക്കെ പോട്ടെ മുത്തേ... ലവ് ലൈൻ ആണ് ഇപ്പൊ ഏറ്റവും വലിയ കോമഡി! നീ ആരുടെയോ ഫോട്ടോ സൂം ചെയ്തു നോക്കുന്നുണ്ട് എന്ന് എനിക്ക് മനസ്സിലായി. പേടിക്കണ്ട, നല്ലൊരു ബന്ധം വരും... പക്ഷേ നിന്റെ ഈ മൺചട്ടി സ്വഭാവം കാരണം അവർ ഓടിപ്പോകാതെ നോക്കണം!",
    "job": "കരിയർ ലൈൻ കണ്ടിട്ട് ഞാൻ ഒന്ന് ഞെട്ടി! ജോലി കിട്ടും മൊട്ടത്തലയാ... പക്ഷേ ഓഫീസിൽ കയറിയാൽ ബോസിന്റെ മുഖത്തു നോക്കി പുളകിതൻ പാവയ്ക്ക പോലെ ഇരിക്കരുത്. പെർഫോം ചെയ്യണം, പ്രമോഷൻ കിട്ടും!",
    "foreign": "വിദേശയോഗം ചോദിച്ചാൽ ഞാൻ സത്യം പറയാം... ലൈൻ കണ്ടിട്ട് പകുതി വഴിക്ക് നിൽക്കുകയാണ്! വിസ അടിക്കാൻ പ്ലാൻ ഇടും, പക്ഷേ ഫ്രണ്ട്സ് വിളിച്ച് തട്ടുകടയിൽ ചായ കുടിക്കാൻ പോകും. എന്നാലും ഒരു എക്സ്ചേഞ്ച് ഓഫറിൽ നീ പറക്കും!",
    "money": "പൈസ വരാൻ ചാൻസ് ഉണ്ട് ഉണ്ടം പാണ്ടി... പക്ഷേ നിന്റെ ബാങ്ക് അക്കൗണ്ട് ഒരു അരിപ്പ പോലെയാണല്ലോ! വരുന്ന വഴിക്ക് തന്നെ ചോർന്നു പോകുന്നു. നീ ഒരു കാര്യം ചെയ്യ്... അനാവശ്യ ഷോപ്പിംഗ് ഒന്ന് കുറക്ക്!",
    "default": "എടാ മാക്രി തലയാ... ചോദ്യം കൊള്ളാം! കൈ നോക്കിയപ്പോൾ എനിക്ക് തോന്നുന്നത്, നീ വിചാരിക്കുന്നതിലും വേഗത്തിൽ കാര്യങ്ങൾ മാറും എന്നാണ്. പക്ഷേ ഓവർതിങ്കിംഗ് മാറ്റി പണി എടുക്ക് മോനേ!"
}


async def generate_jothishyan_response(
    palm_data: Dict[str, Any],
    user_message: str = "",
    chat_history: Optional[list] = None
) -> Dict[str, str]:
    """
    Generates a humorous Malayalam palm-reading or chat response.
    Uses real LLM (Gemini) if API key is present; otherwise falls back to dynamic mock generator.
    """
    mock_mode = os.getenv("MOCK_MODE", "true").lower() == "true"
    api_key = os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY")

    if not mock_mode and api_key:
        try:
            # We can invoke Gemini API through google-genai or httpx
            import httpx
            
            prompt = build_prompt(palm_data, user_message, chat_history)
            model = os.getenv("LLM_MODEL", "gemini-3.8-flash")
            
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.85,
                    "maxOutputTokens": 400
                }
            }
            
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        if text:
                            return {"text": text.strip()}
        except Exception as e:
            print(f"LLM generation failed, falling back to mock: {e}")

    # Mock mode or fallback
    if user_message:
        msg_lower = user_message.lower()
        if "love" in msg_lower or "കല്യാണം" in msg_lower or "പ്രണയം" in msg_lower:
            text = MOCK_CHAT_ANSWERS["love"]
        elif "job" in msg_lower or "ജോലി" in msg_lower or "കരിയർ" in msg_lower:
            text = MOCK_CHAT_ANSWERS["job"]
        elif "foreign" in msg_lower or "വിദേശം" in msg_lower or "പോകാമോ" in msg_lower:
            text = MOCK_CHAT_ANSWERS["foreign"]
        elif "cash" in msg_lower or "പൈസ" in msg_lower or "കാശു" in msg_lower:
            text = MOCK_CHAT_ANSWERS["money"]
        else:
            text = random.choice(list(MOCK_CHAT_ANSWERS.values()))
    else:
        text = random.choice(MOCK_JOTHISHYAN_RESPONSES)

    return {"text": text}
