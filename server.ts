import express from "express";
import http from "http";
import https from "node:https";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";
import { Client as GradioClient } from "@gradio/client";
import { EdgeTTS } from "node-edge-tts";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const server = http.createServer(app);

app.use(express.json({ limit: "15mb" }));

// Load Persona Prompt and Vocabulary
let personaPrompt = "You are Unnimaya Kai Nokki, a funny Kerala AI jothishyan.";
let referenceVocabulary: any = {};

const resolveFile = (filename: string) => {
  const cwdFile = path.join(process.cwd(), filename);
  if (fs.existsSync(cwdFile)) return cwdFile;
  const dirFile = path.join(__dirname, filename);
  if (fs.existsSync(dirFile)) return dirFile;
  const parentFile = path.join(__dirname, "..", filename);
  if (fs.existsSync(parentFile)) return parentFile;
  return cwdFile;
};

try {
  const promptPath = resolveFile("persona_prompt.txt");
  if (fs.existsSync(promptPath)) {
    personaPrompt = fs.readFileSync(promptPath, "utf-8");
  }
  const vocabPath = resolveFile("reference_vocabulary.json");
  if (fs.existsSync(vocabPath)) {
    referenceVocabulary = JSON.parse(fs.readFileSync(vocabPath, "utf-8"));
  }
} catch (e) {
  console.warn("Could not load persona files:", e);
}

// Lazy Gemini AI Client Initialization
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  if (!key) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: { "User-Agent": "aistudio-build" }
      }
    });
  }
  return aiClient;
}

/**
 * Resilient Gemini content generation with realistic timeout and working model fallback.
 * Uses gemini-3.1-flash-lite and gemini-flash-latest.
 */
async function generateGeminiContentWithRetry(
  prompt: string,
  options: { temperature?: number; timeoutMs?: number } = {}
): Promise<string | null> {
  const ai = getAIClient();
  if (!ai) return null;

  const candidateModels = ["gemini-3.1-flash-lite", "gemini-flash-latest"];
  const temperature = options.temperature ?? 0.85;
  const timeoutMs = options.timeoutMs ?? 15000;

  for (const model of candidateModels) {
    try {
      const callPromise = ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature
        }
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs)
      );

      const response: any = await Promise.race([callPromise, timeoutPromise]);

      if (response && response.text) {
        const text = response.text.trim();
        if (text.length > 0) {
          return text;
        }
      }
    } catch (err: any) {
      console.log(`[Gemini Request] Model '${model}' unavailable or timed out: ${err.message || err}`);
    }
  }

  return null;
}

// Helper to construct punchy, fast Unnimaya Kai Nokki prompt
function buildPromptText(palmData: any, userMessage: string = "", chatHistory: any[] = []): string {
  let historyStr = "";
  if (chatHistory && chatHistory.length > 0) {
    historyStr = "\nRecent dialogue:\n";
    for (const msg of chatHistory.slice(-4)) {
      const role = msg.role === "user" ? "User" : "Unnimaya";
      historyStr += `${role}: ${msg.text}\n`;
    }
  }

  return `You are "Unnimaya Kai Nokki" (ഉണ്ണിമായ കൈ നോക്കി), the hilarious, confident, sharp-tongued Kerala astrologer and palm reader.
Style rules:
- Speak in authentic, expressive colloquial Malayalam script.
- Be funny, witty, sarcastic, and dramatic with iconic Kerala humor.
- Naturally use playful nicknames and expressions (e.g., എടാ ഉണ്ടം പാണ്ടി, മൊട്ടത്തലയാ, പുളകിതൻ പാവയ്ക്കേ, മയോണീസ് മോനേ, ചെന്താമര മലരേ, കുണ്ടാമണ്ടി തലയാ, കശുവണ്ടി പോലെ, തീർന്നടാ).
- Keep it punchy: 2 to 4 sentences max.
${palmData ? `Palm features: ${JSON.stringify(palmData)}` : ""}
${historyStr}
User query / prompt: ${userMessage || "Give a complete, funny initial Malayalam palm reading roast based on this palm."}

Output ONLY your spoken Malayalam response.`;
}

// Fallback witty mock answers
const MOCK_SUMMARIES = [
  "എടാ ഉണ്ടം പാണ്ടി... കൈ ഞാൻ കൃത്യമായി നോക്കി! ഇവിടെ നോക്കിയേ... നിന്റെ ലൈഫ് ലൈൻ നല്ല ലെങ്ത് ഉണ്ട്. പക്ഷേ പുളകിതൻ പാവയ്ക്കേ, രാത്രി ഉറങ്ങാതെ ഫോണിൽ നോക്കി ഇരിക്കുന്ന ആ സ്വഭാവം മാറിയില്ലെങ്കിൽ കൺതടത്തിൽ തിമിര തങ്കന്റെ കറുപ്പ് വരും! അതൊക്കെ പോട്ടെ മുത്തേ... ലവ് ലൈൻ ആണ് കിടുക്കൻ. അടുത്ത മാസം ഒരു വലിയ എക്സ്ചേഞ്ച് ഓഫർ വരാൻ സാധ്യതയുണ്ട്. തീർന്നടാ!",
  "മൊട്ടത്തലയാ... നീ ഇങ്ങോട്ട് വാ. കൈ കണ്ടിട്ട് എനിക്ക് ഒരു കാര്യം മനസ്സിലായി. ബിസിനസ് പ്ലാൻ ഒക്കെ മനസ്സിൽ ഭയങ്കരമായി ഓടുന്നുണ്ട്. പക്ഷേ മൺചട്ടി മലരേ... പൈസ കിട്ടിയാൽ കയ്യിൽ നിൽക്കില്ല, കശുവണ്ടി പോലെ കൊറിച്ചു തീർക്കും! ഓന്ത് ഗോപാലനെ പോലെ അങ്ങോട്ടും ഇങ്ങോട്ടും ചാടാതെ ഒരു കാര്യത്തിൽ ഉറച്ചു നിക്ക്!",
  "എടി ചെന്താമര മലരേ... നിന്റെ ഹാർട്ട് ലൈൻ കണ്ടിട്ട് എനിക്ക് ചിരി വരുന്നു! കോളേജിൽ ആരുടെയോ പിറകെ നടന്നിട്ട് അവസാനം ഇൻസ്റ്റാഗ്രാമിൽ മാത്രം ഒളിഞ്ഞു നോക്കുന്ന ആ പഴയ സ്വഭാവം ഇപ്പൊഴും ഉണ്ടോ? പേടിക്കണ്ട... നിന്റെ തലവരയിൽ നല്ലൊരു വഴിത്തിരിവ് കിടപ്പുണ്ട്. ഒരു പ്രീമിയം സർപ്രൈസ് വരും!",
  "എടാ കുണ്ടാമണ്ടി തലയാ... കരിയർ ലൈൻ കണ്ടിട്ട് ഗൂഗിൾ മാപ്സ് പോലും വഴി തെറ്റും! ഓവർതിങ്കിംഗ് നിന്റെ ബ്രെയിനിന്റെ പ്രീമിയം സബ്സ്ക്രിപ്ഷൻ എടുത്ത പോലെയാണല്ലോ. നീ ഒരു കാര്യം ചെയ്യ്... കുറച്ചു നേരം ശാന്തമായിരിക്ക്. പൈസ വരും, പക്ഷേ വന്ന സ്പീഡിൽ ഡെലിവറി ചാർജ്ജും കൊണ്ട് പോകും!",
  "മയോണീസ് മോനേ... നിന്റെ പെരുവിരൽ കണ്ടിട്ടേ എനിക്ക് തോന്നി! വിദേശത്ത് പോകാൻ ഭയങ്കര ആഗ്രഹം അല്ലേ? പാസ്പോർട്ട് ഒക്കെ റെഡിയാക്കി വെച്ചോ, പക്ഷേ കയ്യിലെ വര പറയുന്നത് അനുസരിച്ച് ആദ്യം ആലുവ വഴി കാക്കനാട് വരെ പോയി ഒരു ബിസിനസ് ഡീൽ സെറ്റിൽ ആവേണ്ടി വരും!"
];

// Fictional Category Interpretations
const CATEGORY_BANK = {
  love: [
    "അതൊക്കെ പോട്ടെ മുത്തേ... ലവ് ലൈൻ ആണ് ഇപ്പോൾ മെയിൻ സംഭവം! ഒരാളുടെ ഷാഡോ തെളിഞ്ഞു കാണുന്നുണ്ട്. പക്ഷേ നീ ഇൻസ്റ്റാഗ്രാമിൽ ഫുൾ ടൈം വേറെ ആൾക്കാരുടെ സ്റ്റോറി കണ്ടിരുന്നാൽ പിന്നെ എന്ത് പ്രണയം?",
    "എടാ ഉണ്ടം പാണ്ടി... ലവ് ലൈൻ ഒക്കെ വളഞ്ഞു പുളഞ്ഞ് കിടക്കുകയാണ്. മാട്രിമോണിയൽ സൈറ്റിൽ ഫോട്ടോ ഇടാൻ നോക്കണ്ട, സ്വന്തം ഫ്രണ്ട്സ് തന്നെ ട്രോളും!",
    "എടി ചെന്താമര മലരേ, ഹാർട്ട് ലൈൻ സൂപ്പർ ആണ്... പക്ഷേ നിന്റെ ഡിമാൻഡ് കണ്ടാൽ ബാഹുബലി പോലും ജീവനും കൊണ്ട് ഓടും!"
  ],
  career: [
    "കരിയർ ലൈൻ കണ്ടിട്ട് നേരെ പോകുന്ന ഒരു റൂട്ട് അല്ല മോനേ! ഗൂഗിൾ മാപ്സ് പോലും 'യൂ-ടേൺ എടുക്ക്' എന്ന് പറയുന്ന പോലത്തെ കരിയർ പാത്താണ്. അടുത്ത മാസം പുതിയൊരു ബിസിനസ് ഐഡിയ വരും!",
    "മൊട്ടത്തലയാ... നീ ഇങ്ങോട്ട് വാ. ജോബ് കിട്ടും, പക്ഷേ ഓഫീസിലെ എക്സ്ചേഞ്ച് ഓഫർ പോലെ വേറെ ടീമിലേക്ക് മാറ്റാൻ സാധ്യതയുണ്ട്. കസ്റ്റമർ ഡീൽ ഒക്കെ വരുമ്പോൾ തിമിര തങ്കൻ ആവാതിരുന്നാൽ മതി!",
    "എടാ മാക്രി തലയാ, നിനക്ക് സ്റ്റാർട്ടപ്പ് തുടങ്ങാൻ ഭയങ്കര പൂതി അല്ലേ? പ്ലാൻ ഉണ്ടാക്കും, പ്രസന്റേഷൻ ഉണ്ടാക്കും, ലാസ്റ്റ് ഡെലിവറി ചെയ്യാൻ നേരം ഫുൾ പുളകിതൻ പാവയ്ക്ക!"
  ],
  money: [
    "പൈസ വരും മോനേ... കശുവണ്ടി പോലെ കൊറിക്കാൻ കാശ് വരും, പക്ഷേ കയ്യിൽ നിൽക്കില്ല! എവിടെ നിന്നോ വരും, സ്വിഗ്ഗിയിലും ആമസോണിലും കയറി ഒറ്റ പോക്ക് പോകും.",
    "മൺചട്ടി മലരേ... ധനരേഖ നോക്കിയപ്പോൾ എനിക്ക് കണ്ണ് നിറഞ്ഞു പോയി. ബാങ്ക് അക്കൗണ്ടിൽ മിനിമം ബാലൻസ് മെയിന്റയിൻ ചെയ്യുന്നതിൽ നീ ഗിന്നസ് ബുക്കിൽ കയറും!",
    "പച്ചടി പാവക്കയെ പോലെ കയ്യിലിരിപ്പ് വെച്ചാൽ പൈസ എങ്ങനെ നിക്കും? വലിയ ഡീൽ ഒക്കെ സംസാരിക്കും, കമ്മീഷൻ ചോദിക്കാൻ നേരം ചമ്മൽ!"
  ],
  personality: [
    "ഓവർതിങ്കിംഗ് നിന്റെ ബ്രെയിനിന്റെ പ്രീമിയം സബ്സ്ക്രിപ്ഷൻ എടുത്ത പോലെയാണ്! രാത്രി രണ്ട് മണിക്ക് ഇരുന്ന് 'പണ്ട് അഞ്ചാം ക്ലാസ്സിൽ ഞാൻ അങ്ങനെ പറഞ്ഞത് ശരിയാണോ' എന്ന് ആലോചിക്കുന്ന സ്വഭാവം മാറ് കുണ്ടാമണ്ടി തലയാ!",
    "എടാ മരത്തടി മയിൽ കാവടി... പുറമെ ഭയങ്കര സൈലന്റ്, പക്ഷേ മനസ്സിൽ ഫുൾ ഡ്രാമയും സിനിമയും ഓടുകയാണ്! ആരാടാ നീ?",
    "പുളകിതൻ പാവയ്ക്കേ... ഒന്നിനും ഒരു സ്ഥിരതയില്ല! രാവിലെ ജിമ്മിൽ പോകാൻ ഷൂ എടുത്തു വെക്കും, വൈകുന്നേരം ഷവർമ തിന്നാൻ പോകും!"
  ],
  future: [
    "ഫ്യൂച്ചർ കിടുക്കൻ ആണ് മുത്തേ! അടുത്ത രണ്ടു വർഷത്തിനുള്ളിൽ നീ ഒരു വണ്ടി എടുക്കും, അല്ലെങ്കിൽ ഒരു വണ്ടിയുടെ ഷോറൂമിൽ പോയി സെൽഫി എടുക്കും!",
    "നിന്റെ ഭാവിയിൽ ഒരു വലിയ സർപ്രൈസ് കിടപ്പുണ്ട്. പേടിക്കണ്ട... പെട്ടെന്ന് ഒരു സുപ്രഭാതത്തിൽ നല്ലൊരു വഴിത്തിരിവ് ഉണ്ടാകും. അതിനു മുന്നേ കൈ കഴുകി വെച്ചോ!",
    "തീർന്നടാ... നിന്റെ നല്ല കാലം തുടങ്ങാൻ പോവുകയാണ്! ഇനി പുറകോട്ടു നോക്കരുത്, നോക്കിയാൽ തല കറങ്ങും!"
  ]
};

function pcmToWav(pcmBase64: string, sampleRate = 24000, numChannels = 1, bitDepth = 16): Buffer {
  const pcmBuffer = Buffer.from(pcmBase64, "base64");
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * numChannels * (bitDepth / 8), 28);
  header.writeUInt16LE(numChannels * (bitDepth / 8), 32);
  header.writeUInt16LE(bitDepth, 34);

  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

const ttsAudioCache = new Map<string, string>();
let ttsQuotaExhaustedUntil = 0;

// Strictly use Fenrir (Deep Astrologer) exclusively as requested
const SOLE_VOICE = "Fenrir";

// Clean and prepare Malayalam text for natural, prompt AI TTS output (preserves full paragraph)
function cleanTextForTTS(rawText: string): string {
  if (!rawText) return "";
  const clean = rawText
    .replace(/[*_~`#]/g, "") // remove markdown
    .replace(/^.*?(Unnimaya|ഉണ്ണിമായ|Jothishyan|ജ്യോത്സ്യൻ)[:\-]/i, "") // remove speaker prefix
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "") // remove emojis
    .replace(/[«»""'']/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Return the entire paragraph without truncation
  return clean;
}

/**
 * Native Malayalam Female Speech Chunk Generator (Google Translate tl=ml)
 * Produces authentic Kerala female spoken Malayalam audio with no quota limits.
 */
function fetchNativeMalayalamTTSChunk(textChunk: string, timeoutMs = 8000): Promise<Buffer | null> {
  return new Promise((resolve) => {
    try {
      const encoded = encodeURIComponent(textChunk);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ml&client=tw-ob&q=${encoded}`;
      const req = https.get(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://translate.google.com/"
          }
        },
        (res) => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const fullBuf = Buffer.concat(chunks);
            if (fullBuf.length > 200) {
              resolve(fullBuf);
            } else {
              resolve(null);
            }
          });
        }
      );
      req.on("error", () => resolve(null));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve(null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Fallback: Synthesizes dynamic Malayalam speech for the entire paragraph.
 * Chunks by punctuation, fetches ALL chunks without truncation, and combines into a full MP3 stream.
 */
async function generateNativeMalayalamTTS(rawText: string): Promise<string | null> {
  const cleaned = cleanTextForTTS(rawText);
  if (!cleaned) return null;

  const cacheKey = `ml_female_native:::${cleaned}`;
  if (ttsAudioCache.has(cacheKey)) {
    return ttsAudioCache.get(cacheKey)!;
  }

  // Split into manageable chunks by natural Malayalam punctuation
  const chunks: string[] = [];
  const rawSentences = cleaned.split(/(?<=[.!?|।\n,])/);
  let current = "";

  for (const s of rawSentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if ((current + " " + trimmed).length <= 150) {
      current = current ? `${current} ${trimmed}` : trimmed;
    } else {
      if (current) chunks.push(current);
      if (trimmed.length > 150) {
        const words = trimmed.split(" ");
        let sub = "";
        for (const w of words) {
          if ((sub + " " + w).length <= 150) {
            sub = sub ? `${sub} ${w}` : w;
          } else {
            if (sub) chunks.push(sub);
            sub = w;
          }
        }
        if (sub) chunks.push(sub);
        current = "";
      } else {
        current = trimmed;
      }
    }
  }
  if (current) chunks.push(current);

  if (chunks.length === 0) return null;

  try {
    const audioBuffers: Buffer[] = [];
    for (const chunk of chunks) {
      const buf = await fetchNativeMalayalamTTSChunk(chunk);
      if (buf) {
        audioBuffers.push(buf);
      }
    }

    if (audioBuffers.length > 0) {
      const combined = Buffer.concat(audioBuffers);
      const dataUrl = `data:audio/mp3;base64,${combined.toString("base64")}`;
      ttsAudioCache.set(cacheKey, dataUrl);
      console.log(`[TTS-Female] Synthesized ${combined.length} bytes of native female Malayalam audio across all ${chunks.length} chunks (full paragraph)`);
      return dataUrl;
    }
  } catch (err) {
    console.warn("[TTS-Female] Native female synthesis failed:", err);
  }

  return null;
}

/**
 * High-fidelity Female Malayalam Neural TTS (Microsoft Sobhana Online)
 * Voice: ml-IN-SobhanaNeural (Gender: Female)
 * Reads out the complete paragraph without truncation.
 */
async function generateFemaleMalayalamNeuralTTS(rawText: string, timeoutMs = 25000): Promise<string | null> {
  const cleaned = cleanTextForTTS(rawText);
  if (!cleaned) return null;

  const cacheKey = `female_sobhana:::${cleaned}`;
  if (ttsAudioCache.has(cacheKey)) {
    return ttsAudioCache.get(cacheKey)!;
  }

  // If text is within normal paragraph length (<= 750 chars), synthesize directly in one shot
  if (cleaned.length <= 750) {
    const tmpFile = path.join(os.tmpdir(), `astrologer_female_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`);
    try {
      const tts = new EdgeTTS({
        voice: "ml-IN-SobhanaNeural",
        lang: "ml-IN",
        outputFormat: "audio-24khz-48kbitrate-mono-mp3",
        pitch: "+0Hz",
        rate: "+0%"
      });

      const genPromise = tts.ttsPromise(cleaned, tmpFile);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("EdgeTTS female timeout")), timeoutMs)
      );

      await Promise.race([genPromise, timeoutPromise]);

      const buf = await fsPromises.readFile(tmpFile);
      await fsPromises.unlink(tmpFile).catch(() => {});

      if (buf && buf.length > 500) {
        const dataUrl = `data:audio/mp3;base64,${buf.toString("base64")}`;
        ttsAudioCache.set(cacheKey, dataUrl);
        console.log(`[TTS-Female] Synthesized ${buf.length} bytes for full paragraph (${cleaned.length} chars) using Sobhana Female Neural Voice`);
        return dataUrl;
      }
    } catch (err: any) {
      console.warn("[TTS-Female] EdgeTTS female generation failed, will try fallback:", err?.message || err);
      await fsPromises.unlink(tmpFile).catch(() => {});
    }
  } else {
    // If paragraph is extraordinarily long (> 750 chars), split by sentences and concatenate
    const sentences = cleaned.split(/(?<=[.!?|।\n])/).map((s) => s.trim()).filter(Boolean);
    const chunks: string[] = [];
    let current = "";
    for (const s of sentences) {
      if ((current + " " + s).length <= 500) {
        current = current ? `${current} ${s}` : s;
      } else {
        if (current) chunks.push(current);
        current = s;
      }
    }
    if (current) chunks.push(current);

    try {
      const buffers: Buffer[] = [];
      const tts = new EdgeTTS({
        voice: "ml-IN-SobhanaNeural",
        lang: "ml-IN",
        outputFormat: "audio-24khz-48kbitrate-mono-mp3",
        pitch: "+0Hz",
        rate: "+0%"
      });

      for (let i = 0; i < chunks.length; i++) {
        const chunkTmpFile = path.join(os.tmpdir(), `astrologer_female_part_${Date.now()}_${i}.mp3`);
        await tts.ttsPromise(chunks[i], chunkTmpFile);
        const partBuf = await fsPromises.readFile(chunkTmpFile);
        await fsPromises.unlink(chunkTmpFile).catch(() => {});
        if (partBuf && partBuf.length > 200) {
          buffers.push(partBuf);
        }
      }

      if (buffers.length > 0) {
        const fullBuf = Buffer.concat(buffers);
        const dataUrl = `data:audio/mp3;base64,${fullBuf.toString("base64")}`;
        ttsAudioCache.set(cacheKey, dataUrl);
        console.log(`[TTS-Female] Synthesized ${fullBuf.length} bytes for entire multi-part paragraph (${cleaned.length} chars) using Sobhana Female Voice`);
        return dataUrl;
      }
    } catch (err: any) {
      console.warn("[TTS-Female] Multi-part EdgeTTS failed:", err?.message || err);
    }
  }

  return null;
}

let hfF5Client: any = null;
let isConnectingHfClient = false;

/**
 * Connects or returns existing Gradio Client for Hugging Face space sajilck/malayalam-f5-tts-demo
 */
async function getF5MalayalamClient(): Promise<any> {
  if (hfF5Client) return hfF5Client;
  if (isConnectingHfClient) {
    await new Promise((r) => setTimeout(r, 1000));
    if (hfF5Client) return hfF5Client;
  }
  isConnectingHfClient = true;
  try {
    console.log("[F5-TTS] Connecting to Hugging Face Space: sajilck/malayalam-f5-tts-demo...");
    hfF5Client = await GradioClient.connect("sajilck/malayalam-f5-tts-demo");
    console.log("[F5-TTS] Connected to Hugging Face sajilck/f5-tts-malayalam-v2 successfully!");
    return hfF5Client;
  } catch (err: any) {
    console.warn("[F5-TTS] Failed to connect to Hugging Face space:", err?.message || err);
    return null;
  } finally {
    isConnectingHfClient = false;
  }
}

/**
 * Main Malayalam Speech Audio Generator - strictly FEMALE voice only.
 * Primary: High-fidelity Female Malayalam Neural Voice (Sobhana / Unnimaya).
 * Secondary: Native Malayalam Female Speech Engine (Google Translate tl=ml).
 * Completely reads out the entire paragraph.
 */
async function generateSpeechAudio(rawText: string, _voiceName = "female-astrologer", timeoutMs = 25000): Promise<string | null> {
  const spokenText = cleanTextForTTS(rawText);
  if (!spokenText) return null;

  const cacheKey = `female:::${spokenText}`;
  if (ttsAudioCache.has(cacheKey)) {
    console.log(`[TTS-Female] Serving cached female audio for full paragraph: "${spokenText.slice(0, 30)}..."`);
    return ttsAudioCache.get(cacheKey)!;
  }

  // 1. Primary: High-fidelity Female Malayalam Neural Voice (ml-IN-SobhanaNeural)
  console.log(`[TTS-Female] Synthesizing Female Malayalam Voice (Sobhana) for full paragraph (${spokenText.length} chars): "${spokenText.slice(0, 40)}..."`);
  const femaleAudio = await generateFemaleMalayalamNeuralTTS(spokenText, timeoutMs);
  if (femaleAudio) {
    ttsAudioCache.set(cacheKey, femaleAudio);
    return femaleAudio;
  }

  // 2. Fallback: Native Malayalam Female Speech Engine (Google Translate tl=ml)
  console.log(`[TTS-Female] Falling back to Native Malayalam Female Engine for full paragraph: "${spokenText.slice(0, 40)}..."`);
  const nativeAudio = await generateNativeMalayalamTTS(spokenText);
  if (nativeAudio) {
    ttsAudioCache.set(cacheKey, nativeAudio);
    return nativeAudio;
  }

  return null;
}

// 1. Health Check
app.get("/api/health", (req, res) => {
  const ai = getAIClient();
  res.json({
    status: "healthy",
    app: "KAI NOKKI",
    tagline: "Ninte kai onnu kaanikkeda...",
    llm_available: !!ai,
    mock_mode: !ai,
    tts_model: "Female Malayalam Voice (Sobhana Neural / Unnimaya)",
    current_voice: "Female Astrologer (Unnimaya / Sobhana)"
  });
});

// List available voices - Female Astrologer Voice
app.get("/api/voices", (req, res) => {
  const voices = [
    {
      id: "female-astrologer",
      name: "Female Malayalam Astrologer (Unnimaya)",
      description: "Authentic Female Kerala Astrologer Voice (Sobhana Neural & Native ML)"
    }
  ];
  res.json({ voices, default: "female-astrologer" });
});

// 2. Palm Analysis
app.post("/api/analyze-palm", async (req, res) => {
  try {
    const rawFeatures = req.body.features || {};
    const requestedVoice = "Fenrir";
    const palmFeatures = {
      hand: rawFeatures.hand || "right",
      palm_width: rawFeatures.palm_width || 520,
      palm_height: rawFeatures.palm_height || 610,
      aspect_ratio: rawFeatures.aspect_ratio || 1.17,
      palm_shape: rawFeatures.palm_shape || "balanced_classic",
      life_line_curve: rawFeatures.life_line_curve || 0.82,
      heart_line_curve: rawFeatures.heart_line_curve || 0.65,
      head_line_length: rawFeatures.head_line_length || 0.88,
      fate_line_strength: rawFeatures.fate_line_strength || 0.42
    };

    const reading = {
      love: CATEGORY_BANK.love[Math.floor(Math.random() * CATEGORY_BANK.love.length)],
      career: CATEGORY_BANK.career[Math.floor(Math.random() * CATEGORY_BANK.career.length)],
      money: CATEGORY_BANK.money[Math.floor(Math.random() * CATEGORY_BANK.money.length)],
      personality: CATEGORY_BANK.personality[Math.floor(Math.random() * CATEGORY_BANK.personality.length)],
      future: CATEGORY_BANK.future[Math.floor(Math.random() * CATEGORY_BANK.future.length)]
    };

    let summary = MOCK_SUMMARIES[Math.floor(Math.random() * MOCK_SUMMARIES.length)];

    const ai = getAIClient();
    if (ai) {
      try {
        const prompt = buildPromptText(palmFeatures, "Provide a complete initial palm reading summary.");
        const generated = await generateGeminiContentWithRetry(prompt, { temperature: 0.85, timeoutMs: 15000 });
        if (generated) {
          summary = generated;
        }
      } catch (err) {
        console.warn("Gemini generateContent error handled, using mock summary:", err);
      }
    }

    // Generate Malayalam AI model sound directly for the summary (Female Astrologer Voice - Unnimaya)
    let audioUrl = "/public/audio/completed.mp3";
    let audioFormat = "url";
    let ttsAvailable = false;

    try {
      const generatedAudio = await generateSpeechAudio(summary, "female-astrologer", 25000);
      if (generatedAudio) {
        audioUrl = generatedAudio;
        audioFormat = "base64_wav";
        ttsAvailable = true;
      }
    } catch (ttsErr) {
      console.warn("Speech generation during palm analysis caught:", ttsErr);
    }

    res.json({
      reading,
      features: palmFeatures,
      summary,
      audio_url: audioUrl,
      audio_format: audioFormat,
      tts_available: ttsAvailable,
      voice: "female-astrologer"
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Palm analysis error" });
  }
});

// 3. Chat Endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message, palm_context, chat_history } = req.body;
    const requestedVoice = "female-astrologer";
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    let reply = "എടാ മാക്രി തലയാ... ചോദ്യം കൊള്ളാം! കൈ നോക്കിയപ്പോൾ എനിക്ക് തോന്നുന്നത്, നീ വിചാരിക്കുന്നതിലും വേഗത്തിൽ കാര്യങ്ങൾ മാറും എന്നാണ്!";
    const msg = message.toLowerCase();

    if (msg.includes("love") || msg.includes("marriage") || msg.includes("കല്യാണം")) {
      reply = "അതൊക്കെ പോട്ടെ മുത്തേ... ലവ് ലൈൻ ആണ് ഇപ്പൊ ഏറ്റവും വലിയ കോമഡി! നീ ആരുടെയോ ഫോട്ടോ സൂം ചെയ്തു നോക്കുന്നുണ്ട് എന്ന് എനിക്ക് മനസ്സിലായി. പേടിക്കണ്ട, നല്ലൊരു ബന്ധം വരും!";
    } else if (msg.includes("job") || msg.includes("career") || msg.includes("ജോലി")) {
      reply = "കരിയർ ലൈൻ കണ്ടിട്ട് ഞാൻ ഒന്ന് ഞെട്ടി! ജോലി കിട്ടും മൊട്ടത്തലയാ... പക്ഷേ ഓഫീസിൽ കയറിയാൽ പുളകിതൻ പാവയ്ക്ക പോലെ ഇരിക്കരുത്. പെർഫോം ചെയ്യണം!";
    } else if (msg.includes("cash") || msg.includes("money") || msg.includes("പൈസ")) {
      reply = "പൈസ വരാൻ ചാൻസ് ഉണ്ട് ഉണ്ടം പാണ്ടി... പക്ഷേ നിന്റെ ബാങ്ക് അക്കൗണ്ട് ഒരു അരിപ്പ പോലെയാണല്ലോ! വരുന്ന വഴിക്ക് തന്നെ ചോർന്നു പോകുന്നു. അനാവശ്യ ഷോപ്പിംഗ് ഒന്ന് കുറക്ക്!";
    } else if (msg.includes("foreign") || msg.includes("വിദേശം") || msg.includes("visa")) {
      reply = "വിദേശയോഗം ചോദിച്ചാൽ ഞാൻ സത്യം പറയാം... ലൈൻ കണ്ടിട്ട് ആലുവ വഴി കിളിമാനൂർ വരെ പോകുന്ന യോഗമേ കാണുന്നുള്ളൂ! എന്നാലും ഒരു എക്സ്ചേഞ്ച് ഓഫറിൽ നീ പറക്കും!";
    }

    const ai = getAIClient();
    if (ai) {
      try {
        const prompt = buildPromptText(palm_context || {}, message, chat_history || []);
        const generated = await generateGeminiContentWithRetry(prompt, { temperature: 0.85, timeoutMs: 15000 });
        if (generated) {
          reply = generated;
        }
      } catch (err) {
        console.warn("Gemini chat error handled, using fallback reply:", err);
      }
    }

    // Generate Malayalam AI model sound for the chat reply (Female Astrologer Voice - Unnimaya)
    let audioUrl = "/public/audio/completed.mp3";
    let audioFormat = "url";
    let ttsAvailable = false;

    try {
      const generatedAudio = await generateSpeechAudio(reply, "female-astrologer", 25000);
      if (generatedAudio) {
        audioUrl = generatedAudio;
        audioFormat = "base64_wav";
        ttsAvailable = true;
      }
    } catch (ttsErr) {
      console.warn("Speech generation during chat caught:", ttsErr);
    }

    res.json({
      text: reply,
      audio_url: audioUrl,
      audio_format: audioFormat,
      tts_available: ttsAvailable,
      voice: "female-astrologer"
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Chat error" });
  }
});

// 4. TTS Endpoint (Explicit on-demand Malayalam AI Voice synthesis)
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }
    const audioDataUrl = await generateSpeechAudio(text, "female-astrologer", 25000);
    if (audioDataUrl) {
      return res.json({
        audio_url: audioDataUrl,
        format: "base64_wav",
        text,
        voice: "female-astrologer",
        tts_available: true
      });
    }
    res.json({
      audio_url: "/public/audio/completed.mp3",
      format: "url",
      text,
      voice: "female-astrologer",
      tts_available: false
    });
  } catch (err: any) {
    res.json({
      audio_url: "/public/audio/completed.mp3",
      format: "url",
      text: req.body?.text || "",
      voice: "female-astrologer",
      tts_available: false
    });
  }
});

// Serve Static Frontend
const resolveDir = (dirName: string) => {
  const cwdDir = path.join(process.cwd(), dirName);
  if (fs.existsSync(cwdDir)) return cwdDir;
  const distDir = path.join(__dirname, dirName);
  if (fs.existsSync(distDir)) return distDir;
  return cwdDir;
};

app.use("/css", express.static(resolveDir("css")));
app.use("/js", express.static(resolveDir("js")));
app.use("/public", express.static(resolveDir("public")));

app.get("/", (req, res) => {
  res.sendFile(resolveFile("index.html"));
});

app.get("/camera.html", (req, res) => {
  res.sendFile(resolveFile("camera.html"));
});

// WebSocket Signaling for WebRTC
const wss = new WebSocketServer({ noServer: true });
const rooms = new Map<string, Set<WebSocket>>();

wss.on("connection", (ws: WebSocket, request: http.IncomingMessage) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const roomId = url.searchParams.get("room") || "kai-nokki-default";

  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  const roomClients = rooms.get(roomId)!;
  roomClients.add(ws);

  // Notify other peers in room
  roomClients.forEach((client) => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "peer-joined", room: roomId }));
    }
  });

  ws.on("message", (data: any) => {
    try {
      const parsed = JSON.parse(data.toString());
      roomClients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(parsed));
        }
      });
    } catch (e) {
      console.warn("Signaling parse error:", e);
    }
  });

  ws.on("close", () => {
    roomClients.delete(ws);
    if (roomClients.size === 0) {
      rooms.delete(roomId);
    } else {
      roomClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "peer-left", room: roomId }));
        }
      });
    }
  });
});

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
  if (pathname === "/ws/signaling") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`KAI NOKKI Server active on http://0.0.0.0:${PORT}`);
});
