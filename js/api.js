/**
 * KAI NOKKI - API Client
 * Robust network communication with FastAPI / Node server, including bulletproof mock fallbacks.
 */

class ApiClient {
  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
    this.timeoutMs = 25000;
  }

  async checkHealth() {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/api/health`, { method: "GET" }, 4000);
      if (res.ok) {
        return await res.json();
      }
      return { status: "degraded", mock_mode: true };
    } catch (err) {
      console.warn("Backend health check failed, running in autonomous mock mode:", err.message);
      return { status: "offline", mock_mode: true };
    }
  }

  async analyzePalm(payload) {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/api/analyze-palm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        return await res.json();
      }
      throw new Error(`Server returned ${res.status}`);
    } catch (err) {
      console.warn("analyzePalm endpoint unavailable, generating mock reading:", err.message);
      return this.generateMockAnalysis(payload);
    }
  }

  async sendChatMessage(payload) {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        return await res.json();
      }
      throw new Error(`Server returned ${res.status}`);
    } catch (err) {
      console.warn("chat endpoint unavailable, generating mock response:", err.message);
      return this.generateMockChatReply(payload.message);
    }
  }

  async generateTTS(text) {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        return await res.json();
      }
      throw new Error(`Server returned ${res.status}`);
    } catch (err) {
      return { audio_url: "/public/audio/completed.mp3", format: "url", text };
    }
  }

  fetchWithTimeout(resource, options = {}, timeout = this.timeoutMs) {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const id = setTimeout(() => {
        controller.abort();
        reject(new Error("Request timed out"));
      }, timeout);

      fetch(resource, { ...options, signal: controller.signal })
        .then(response => {
          clearTimeout(id);
          resolve(response);
        })
        .catch(err => {
          clearTimeout(id);
          reject(err);
        });
    });
  }

  generateMockAnalysis(payload) {
    const features = payload.features || {
      hand: "right",
      palm_width: 520,
      palm_height: 610,
      aspect_ratio: 1.17,
      palm_shape: "balanced_classic"
    };

    const reading = {
      love: "അതൊക്കെ പോട്ടെ മുത്തേ... ലവ് ലൈൻ ആണ് ഇപ്പോൾ ഇൻട്രസ്റ്റിംഗ്! ഇൻസ്റ്റാഗ്രാമിൽ ആരെയാ നോക്കി ഇരിക്കുന്നത് എന്ന് എനിക്ക് മനസ്സിലായി. പേടിക്കണ്ട... പെട്ടെന്ന് ഒരു സർപ്രൈസ് വരും!",
      career: "കരിയർ ലൈൻ കണ്ടിട്ട് നേരെ പോകുന്ന റൂട്ട് അല്ല മൊട്ടത്തലയാ! നീ ഒരു കാര്യം തീരുമാനിച്ചിട്ട് പിന്നെ അതു മാറ്റുന്ന സ്വഭാവം കാണുന്നുണ്ട്. അടുത്ത മാസം പുതിയൊരു ബിസിനസ് പ്ലാൻ വരും!",
      money: "പൈസ വരും മോനേ... കശുവണ്ടി പോലെ കൊറിക്കാൻ കാശ് വരും, പക്ഷേ കയ്യിൽ നിൽക്കില്ല! വരുന്ന വഴിക്ക് തന്നെ സ്വിഗ്ഗിയിലും ആമസോണിലും കയറി ഒറ്റ പോക്ക് പോകും.",
      personality: "ഓവർതിങ്കിംഗ് നിന്റെ ബ്രെയിനിന്റെ പ്രീമിയം സബ്സ്ക്രിപ്ഷൻ എടുത്ത പോലെയാണ്! രാത്രി രണ്ട് മണിക്ക് ഇരുന്നു ആലോചിക്കുന്ന സ്വഭാവം മാറ് കുണ്ടാമണ്ടി തലയാ!",
      future: "ഫ്യൂച്ചർ കിടുക്കൻ ആണ് തക്കുടു! അടുത്ത രണ്ടു വർഷത്തിനുള്ളിൽ ഒരു വണ്ടിയുടെ ഷോറൂമിൽ പോയി സെൽഫി എടുക്കാനുള്ള യോഗം തെളിഞ്ഞു കാണുന്നുണ്ട്. തീർന്നടാ!"
    };

    const summary = "എടാ ഉണ്ടം പാണ്ടി, കൈ ഞാൻ കൃത്യമായി നോക്കി! ലൈഫ് ലൈൻ ഒക്കെ കിടുക്കൻ ആണ്. പക്ഷേ ഓവർതിങ്കിംഗ് മാറ്റി പണി എടുക്കണം. പൈസ വരും പക്ഷേ കയ്യിൽ നിൽക്കില്ല. തീർന്നടാ!";

    return {
      reading,
      features,
      summary,
      audio_url: "/public/audio/completed.mp3",
      audio_format: "url"
    };
  }

  generateMockChatReply(userMessage) {
    const msg = (userMessage || "").toLowerCase();
    let text = "എടാ മാക്രി തലയാ... ചോദ്യം കൊള്ളാം! കൈ നോക്കിയപ്പോൾ എനിക്ക് തോന്നുന്നത്, നീ വിചാരിക്കുന്നതിലും വേഗത്തിൽ കാര്യങ്ങൾ മാറും എന്നാണ്!";
    
    if (msg.includes("love") || msg.includes("marriage") || msg.includes("കല്യാണം") || msg.includes("പെണ്ണ്")) {
      text = "അതൊക്കെ പോട്ടെ മുത്തേ... ലവ് ലൈൻ ആണ് ഇപ്പൊ ഏറ്റവും വലിയ കോമഡി! നീ ആരുടെയോ ഫോട്ടോ സൂം ചെയ്തു നോക്കുന്നുണ്ട് എന്ന് എനിക്ക് മനസ്സിലായി. പേടിക്കണ്ട, നല്ലൊരു ബന്ധം വരും!";
    } else if (msg.includes("job") || msg.includes("career") || msg.includes("ജോലി")) {
      text = "കരിയർ ലൈൻ കണ്ടിട്ട് ഞാൻ ഒന്ന് ഞെട്ടി! ജോലി കിട്ടും മൊട്ടത്തലയാ... പക്ഷേ ഓഫീസിൽ കയറിയാൽ പുളകിതൻ പാവയ്ക്ക പോലെ ഇരിക്കരുത്. പെർഫോം ചെയ്യണം!";
    } else if (msg.includes("cash") || msg.includes("money") || msg.includes("പൈസ")) {
      text = "പൈസ വരാൻ ചാൻസ് ഉണ്ട് ഉണ്ടം പാണ്ടി... പക്ഷേ നിന്റെ ബാങ്ക് അക്കൗണ്ട് ഒരു അരിപ്പ പോലെയാണല്ലോ! വരുന്ന വഴിക്ക് തന്നെ ചോർന്നു പോകുന്നു. അനാവശ്യ ഷോപ്പിംഗ് ഒന്ന് കുറക്ക്!";
    } else if (msg.includes("foreign") || msg.includes("വിദേശം") || msg.includes("visa")) {
      text = "വിദേശയോഗം ചോദിച്ചാൽ ഞാൻ സത്യം പറയാം... ലൈൻ കണ്ടിട്ട് ആലുവ വഴി കിളിമാനൂർ വരെ പോകുന്ന യോഗമേ കാണുന്നുള്ളൂ! എന്നാലും ഒരു എക്സ്ചേഞ്ച് ഓഫറിൽ നീ പറക്കും!";
    }

    return {
      text,
      audio_url: "/public/audio/completed.mp3",
      audio_format: "url"
    };
  }
}

// Global API instance
window.apiClient = new ApiClient();
