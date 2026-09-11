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

// Helper to construct punchy, fast Kai Nokki prompt
function buildPromptText(palmData: any, userMessage: string = "", chatHistory: any[] = [], voice: string = "male-astrologer"): string {
  let historyStr = "";
  if (chatHistory && chatHistory.length > 0) {
    historyStr = "\nRecent dialogue:\n";
    for (const msg of chatHistory.slice(-4)) {
      const role = msg.role === "user" ? "User" : "Kai Nokki";
      historyStr += `${role}: ${msg.text}\n`;
    }
  }

  const personaName = voice === "female-astrologer" ? "Unnimaya (ഉണ്ണിമായ)" : "Fenrir (ഫെൻറിർ)";
  const randomSeed = Math.floor(Math.random() * 1000);
  
  return `You are "${personaName} Kai Nokki", the hilarious, confident, sharp-tongued Kerala astrologer and palm reader.
Style rules:
- Speak in authentic, highly expressive colloquial Malayalam script.
- Be funny, witty, sarcastic, and dramatic with iconic Kerala humor.
- EXPRESSION IS MANDATORY: Use expressive vocal markers naturally like 'ഹ്മ്മ്...' (Hmm...), 'ഹാ!' (Ha!), 'ശ്ശെടാ...' (Sheda...), 'ഹയ്യോ...' (Ayyo...), 'ങ്ഹാ...' (Ngha...).
- PROSODY & PACING: Use ellipses (...) for dramatic pauses and exclamation marks (!) for sudden energy. Elongate vowels for dramatic effect (e.g., എടാാാ..., എന്താടാാാ...).
- CRITICAL ANTI-REPETITION DIRECTIVE [SEED ${randomSeed}]: You MUST NEVER start your sentences the same way twice. NEVER use the same insults from previous turns. You MUST invent completely new, contextual slang based on this specific user's query.
- DO NOT just use the same "എടാ..." (Eda...) format every time.
- HUGE SLANG BANK (Pick ONE OR TWO uniquely, NEVER repeat): കോന്തൻ, മണവാളൻ, ഉഡായിപ്പ്, ഊള, തരികിട, അലവലാതി, ഗുണ്ടം പീപ്പി, മൊട്ടത്തലയാ, പുളകിതൻ പാവയ്ക്കേ, മയോണീസ് മോനേ, ചെന്താമര മലരേ, കശുവണ്ടി പോലെ, കുണ്ടാമണ്ടി, എടാ കൊടുകമ്പിളി, വങ്കൻ, പത്താംക്ലാസ്സ് ബുദ്ധി, മാക്രി, വളിപ്പ്, കുട്ടിചാത്തൻ, കിളിപോയി, എടാ മരവാഴേ, ഓന്ത് ഗോപാലൻ, ചീഞ്ഞ തക്കാളി, പോത്തേ, എമ്പോക്കി, വെറും വാഴ, ഉണ്ടം പാണ്ടി.
- VARY your tone. Sometimes be deeply mystical and quiet, sometimes be brutally insulting and loud, sometimes surprisingly encouraging.
- Keep it punchy: 2 to 4 sentences max.
${palmData ? `Palm features: ${JSON.stringify(palmData)}` : ""}
${historyStr}
User query / prompt: ${userMessage || "Give a complete, funny initial Malayalam palm reading roast based on this palm. Start with a completely unique expression or sigh."}

Output ONLY your spoken Malayalam response.`;
}

// Fallback witty mock answers
const MOCK_SUMMARIES = [
  "ഹ്മ്മ്... എടാ കുട്ടിത്തേവാങ്കേ... കൈ ഞാൻ കൃത്യമായി നോക്കി! ഇവിടെ നോക്കിയേ... നിന്റെ ലൈഫ് ലൈൻ നല്ല ലെങ്ത് ഉണ്ട്. പക്ഷേ പുളകിതൻ പാവയ്ക്കേ, രാത്രി ഉറങ്ങാതെ ഫോണിൽ നോക്കി ഇരിക്കുന്ന ആ സ്വഭാവം മാറിയില്ലെങ്കിൽ കൺതടത്തിൽ തിമിര തങ്കന്റെ കറുപ്പ് വരും! അതൊക്കെ പോട്ടെ മുത്തേ... ലവ് ലൈൻ ആണ് കിടുക്കൻ. അടുത്ത മാസം ഒരു വലിയ എക്സ്ചേഞ്ച് ഓഫർ വരാൻ സാധ്യതയുണ്ട്. തീർന്നടാ!",
  "ശ്ശെടാ... എടാ മരവാഴേ... നീ ഇങ്ങോട്ട് വാ. കൈ കണ്ടിട്ട് എനിക്ക് ഒരു കാര്യം മനസ്സിലായി. ബിസിനസ് പ്ലാൻ ഒക്കെ മനസ്സിൽ ഭയങ്കരമായി ഓടുന്നുണ്ട്. പക്ഷേ പൈസ കിട്ടിയാൽ കയ്യിൽ നിൽക്കില്ല, കശുവണ്ടി പോലെ കൊറിച്ചു തീർക്കും! ഓന്ത് ഗോപാലനെ പോലെ അങ്ങോട്ടും ഇങ്ങോട്ടും ചാടാതെ ഒരു കാര്യത്തിൽ ഉറച്ചു നിക്ക്!",
  "ഹാ! എടാ അലവലാതി... നിന്റെ ഹാർട്ട് ലൈൻ കണ്ടിട്ട് എനിക്ക് ചിരി വരുന്നു! കോളേജിൽ ആരുടെയോ പിറകെ നടന്നിട്ട് അവസാനം ഇൻസ്റ്റാഗ്രാമിൽ മാത്രം ഒളിഞ്ഞു നോക്കുന്ന ആ പഴയ സ്വഭാവം ഇപ്പൊഴും ഉണ്ടോ? പേടിക്കണ്ട... നിന്റെ തലവരയിൽ നല്ലൊരു വഴിത്തിരിവ് കിടപ്പുണ്ട്. ഒരു പ്രീമിയം സർപ്രൈസ് വരും!",
  "ഹയ്യോ... എടാ കുണ്ടാമണ്ടി തലയാ... കരിയർ ലൈൻ കണ്ടിട്ട് ഗൂഗിൾ മാപ്സ് പോലും വഴി തെറ്റും! ഓവർതിങ്കിംഗ് നിന്റെ ബ്രെയിനിന്റെ പ്രീമിയം സബ്സ്ക്രിപ്ഷൻ എടുത്ത പോലെയാണല്ലോ. നീ ഒരു കാര്യം ചെയ്യ്... കുറച്ചു നേരം ശാന്തമായിരിക്ക്. പൈസ വരും, പക്ഷേ വന്ന സ്പീഡിൽ ഡെലിവറി ചാർജ്ജും കൊണ്ട് പോകും!",
  "ങ്ഹാ... മയോണീസ് മോനേ... നിന്റെ പെരുവിരൽ കണ്ടിട്ടേ എനിക്ക് തോന്നി! വിദേശത്ത് പോകാൻ ഭയങ്കര ആഗ്രഹം അല്ലേ? പാസ്പോർട്ട് ഒക്കെ റെഡിയാക്കി വെച്ചോ, പക്ഷേ കയ്യിലെ വര പറയുന്നത് അനുസരിച്ച് ആദ്യം ആലുവ വഴി കാക്കനാട് വരെ പോയി ഒരു ബിസിനസ് ഡീൽ സെറ്റിൽ ആവേണ്ടി വരും!",
  "എന്താടാാാ... കൊടുകമ്പിളി... നിന്റെ വിധി കണ്ടിട്ട് ശരിക്കും കിളിപോയി! എല്ലാം ശരിയാകും എന്ന് കരുതി നീ ഇരിക്കണ്ട, പണി എടുത്താൽ മാത്രമേ കാര്യങ്ങൾ നടക്കൂ. എന്നാലും ചെറിയൊരു ഭാഗ്യം വഴിയിൽ കിടപ്പുണ്ട് കേട്ടോ!",
  "ഹ്മ്മ്... വട്ടുണ്ടോ നിനക്ക്? ഈ വരകൾ ഒക്കെ എങ്ങോട്ടാണ് പോകുന്നത് എന്ന് വല്ല പിടിയും ഉണ്ടോ? നീ ഉദ്ദേശിക്കുന്ന കാര്യങ്ങൾ നടക്കും, പക്ഷേ കുറച്ചു ഉഡായിപ്പ് ഒക്കെ വേണ്ടി വരും. ശ്രദ്ധിച്ചു നടന്നോ!"
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
 * High-fidelity Male Malayalam Neural TTS (Microsoft Midhun Online)
 * Voice: ml-IN-MidhunNeural (Gender: Male)
 * Reads out the complete paragraph without truncation.
 */
async function generateMaleMalayalamNeuralTTS(rawText: string, timeoutMs = 25000): Promise<string | null> {
  const cleaned = cleanTextForTTS(rawText);
  if (!cleaned) return null;

  const cacheKey = `male_midhun:::${cleaned}`;
  if (ttsAudioCache.has(cacheKey)) {
    return ttsAudioCache.get(cacheKey)!;
  }

  // If text is within normal paragraph length (<= 750 chars), synthesize directly in one shot
  if (cleaned.length <= 750) {
    const tmpFile = path.join(os.tmpdir(), `astrologer_male_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`);
    try {
      const tts = new EdgeTTS({
        voice: "ml-IN-MidhunNeural",
        lang: "ml-IN",
        outputFormat: "audio-24khz-48kbitrate-mono-mp3",
        pitch: "-4Hz", // Authentic older male astrologer pitch
        rate: "-2%"    // Natural, deliberate pace
      });

      const genPromise = tts.ttsPromise(cleaned, tmpFile);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("EdgeTTS male timeout")), timeoutMs)
      );

      await Promise.race([genPromise, timeoutPromise]);

      const buf = await fsPromises.readFile(tmpFile);
      await fsPromises.unlink(tmpFile).catch(() => {});

      if (buf && buf.length > 500) {
        const dataUrl = `data:audio/mp3;base64,${buf.toString("base64")}`;
        ttsAudioCache.set(cacheKey, dataUrl);
        console.log(`[TTS-Male] Synthesized ${buf.length} bytes for full paragraph (${cleaned.length} chars) using Midhun Male Neural Voice`);
        return dataUrl;
      }
    } catch (err: any) {
      console.warn("[TTS-Male] EdgeTTS male generation failed, will try fallback:", err?.message || err);
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
        voice: "ml-IN-MidhunNeural",
        lang: "ml-IN",
        outputFormat: "audio-24khz-48kbitrate-mono-mp3",
        pitch: "-4Hz",
        rate: "-2%"
      });

      for (let i = 0; i < chunks.length; i++) {
        const chunkTmpFile = path.join(os.tmpdir(), `astrologer_male_part_${Date.now()}_${i}.mp3`);
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
        console.log(`[TTS-Male] Synthesized ${fullBuf.length} bytes for entire multi-part paragraph (${cleaned.length} chars) using Midhun Male Voice`);
        return dataUrl;
      }
    } catch (err: any) {
      console.warn("[TTS-Male] Multi-part EdgeTTS failed:", err?.message || err);
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
 * Synthesizes Malayalam speech using the fine-tuned female F5-TTS model (sajilck/f5-tts-malayalam-v2).
 * Operates with 16 NFE steps on ZeroGPU.
 */
async function generateF5MalayalamTTS(rawText: string, timeoutMs = 20000): Promise<string | null> {
  const cleaned = cleanTextForTTS(rawText);
  if (!cleaned) return null;

  const cacheKey = `f5_v2_female:::${cleaned}`;
  if (ttsAudioCache.has(cacheKey)) {
    console.log(`[F5-TTS] Serving cached audio for: "${cleaned.slice(0, 30)}..."`);
    return ttsAudioCache.get(cacheKey)!;
  }

  // F5-TTS works best with shorter chunks (up to ~200 chars). We will synthesize the first chunk 
  // to avoid space timeouts, since it's a demo space.
  const sentences = cleaned.split(/(?<=[.!?|।\n])/).map((s) => s.trim()).filter(Boolean);
  const targetText = (sentences.slice(0, 3).join(" ").slice(0, 200).trim()) || cleaned.slice(0, 200).trim();

  try {
    const client = await getF5MalayalamClient();
    if (!client) return null;

    console.log(`[F5-TTS] Synthesizing speech with sajilck/f5-tts-malayalam-v2 for: "${targetText.slice(0, 40)}..."`);
    // Map arguments by position as the space expects: [ref_audio, ref_text, gen_text, nfe_step, fix_duration, seed]
    const predictPromise = client.predict("/synthesize", [
      null, // ref_audio (null uses the space's default if any or ignores)
      "ഇത് ഒരു സാംപിൾ ഓഡിയോ ആണ്. ഞാൻ എന്റെ മാക്‌ബുക്കിൽ, മാക്‌ബുക്കിന്റെ തന്നെ ഹെഡ്‍ഫോൺ ഉപയോഗിച്ചു റെക്കോർഡ് ചെയ്യുന്ന ഒരു ഓഡിയോ ആണ്. ഇത് ഞാൻ",
      targetText,
      16, // nfe_step
      0,  // fix_duration
      -1  // seed
    ]);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("F5-TTS generation timeout")), timeoutMs)
    );

    const result: any = await Promise.race([predictPromise, timeoutPromise]);
    const fileUrl = result?.data?.[0]?.url;

    if (fileUrl) {
      const resp = await fetch(fileUrl);
      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        if (buf.length > 500) {
          const dataUrl = `data:audio/wav;base64,${buf.toString("base64")}`;
          ttsAudioCache.set(cacheKey, dataUrl);
          console.log(`[F5-TTS] Successfully generated ${buf.length} bytes of audio using sajilck/f5-tts-malayalam-v2`);
          return dataUrl;
        }
      }
    }
  } catch (err: any) {
    console.warn("[F5-TTS] sajilck/f5-tts-malayalam-v2 generation error:", err?.message || err);
  }

  return null;
}

/**
 * Main Malayalam Speech Audio Generator - Routes based on voice name.
 */
async function generateSpeechAudio(rawText: string, voiceName = "male-astrologer", timeoutMs = 25000): Promise<string | null> {
  const spokenText = cleanTextForTTS(rawText);
  if (!spokenText) return null;

  if (voiceName === "female-astrologer") {
    const cacheKey = `female:::${spokenText}`;
    if (ttsAudioCache.has(cacheKey)) {
      console.log(`[TTS-Female] Serving cached female audio for full paragraph: "${spokenText.slice(0, 30)}..."`);
      return ttsAudioCache.get(cacheKey)!;
    }

    console.log(`[TTS-Female] Trying Female F5-TTS Malayalam v2 for: "${spokenText.slice(0, 40)}..."`);
    const f5Audio = await generateF5MalayalamTTS(spokenText, 20000);
    if (f5Audio) {
      ttsAudioCache.set(cacheKey, f5Audio);
      return f5Audio;
    }

    console.log(`[TTS-Female] Falling back to Native Malayalam Female Engine for full paragraph: "${spokenText.slice(0, 40)}..."`);
    const nativeAudio = await generateNativeMalayalamTTS(spokenText);
    if (nativeAudio) {
      ttsAudioCache.set(cacheKey, nativeAudio);
      return nativeAudio;
    }
    return null;
  }

  // Male Default
  const cacheKey = `male:::${spokenText}`;
  if (ttsAudioCache.has(cacheKey)) {
    console.log(`[TTS-Male] Serving cached male audio for full paragraph: "${spokenText.slice(0, 30)}..."`);
    return ttsAudioCache.get(cacheKey)!;
  }

  // 1. Primary: High-fidelity Male Malayalam Neural Voice (ml-IN-MidhunNeural)
  console.log(`[TTS-Male] Synthesizing Male Malayalam Voice (Midhun) for full paragraph (${spokenText.length} chars): "${spokenText.slice(0, 40)}..."`);
  const maleAudio = await generateMaleMalayalamNeuralTTS(spokenText, timeoutMs);
  if (maleAudio) {
    ttsAudioCache.set(cacheKey, maleAudio);
    return maleAudio;
  }

  // 2. Fallback: Native Malayalam Engine (Google Translate tl=ml)
  console.log(`[TTS-Male] Falling back to Native Malayalam Engine for full paragraph: "${spokenText.slice(0, 40)}..."`);
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
    tts_model: "Multi-Voice Malayalam (Midhun Neural / F5-TTS v2)",
    current_voice: "Dual Astrologer System"
  });
});

// List available voices
app.get("/api/voices", (req, res) => {
  const voices = [
    {
      id: "male-astrologer",
      name: "Male Malayalam Astrologer (Fenrir)",
      description: "Authentic Deep Male Kerala Astrologer Voice (Midhun Neural)"
    },
    {
      id: "female-astrologer",
      name: "Female Malayalam Astrologer (Unnimaya)",
      description: "Authentic Female Kerala Astrologer Voice (F5-TTS v2)"
    }
  ];
  res.json({ voices, default: "male-astrologer" });
});

// 2. Palm Analysis
app.post("/api/analyze-palm", async (req, res) => {
  try {
    const rawFeatures = req.body.features || {};
    const requestedVoice = req.body.voice || "male-astrologer";
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

    // Generate Malayalam AI model sound directly for the summary
    let audioUrl = "/public/audio/completed.mp3";
    let audioFormat = "url";
    let ttsAvailable = false;

    try {
      const generatedAudio = await generateSpeechAudio(summary, requestedVoice, 25000);
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
      voice: requestedVoice
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Palm analysis error" });
  }
});

// 3. Chat Endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message, palm_context, chat_history } = req.body;
    const requestedVoice = req.body.voice || "male-astrologer";
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    let reply = "ഹ്മ്മ്... എടാ മാക്രി തലയാ... ചോദ്യം കൊള്ളാം! കൈ നോക്കിയപ്പോൾ എനിക്ക് തോന്നുന്നത്, നീ വിചാരിക്കുന്നതിലും വേഗത്തിൽ കാര്യങ്ങൾ മാറും എന്നാണ്!";
    const msg = message.toLowerCase();

    if (msg.includes("love") || msg.includes("marriage") || msg.includes("കല്യാണം")) {
      reply = "ഹാ! അതൊക്കെ പോട്ടെ മുത്തേ... ലവ് ലൈൻ ആണ് ഇപ്പൊ ഏറ്റവും വലിയ കോമഡി! നീ ആരുടെയോ ഫോട്ടോ സൂം ചെയ്തു നോക്കുന്നുണ്ട് എന്ന് എനിക്ക് മനസ്സിലായി. പേടിക്കണ്ട, നല്ലൊരു ബന്ധം വരും!";
    } else if (msg.includes("job") || msg.includes("career") || msg.includes("ജോലി")) {
      reply = "ശ്ശെടാ... കരിയർ ലൈൻ കണ്ടിട്ട് ഞാൻ ഒന്ന് ഞെട്ടി! ജോലി കിട്ടും മൊട്ടത്തലയാ... പക്ഷേ ഓഫീസിൽ കയറിയാൽ പുളകിതൻ പാവയ്ക്ക പോലെ ഇരിക്കരുത്. പെർഫോം ചെയ്യണം!";
    } else if (msg.includes("cash") || msg.includes("money") || msg.includes("പൈസ")) {
      reply = "ഹയ്യോ... പൈസ വരാൻ ചാൻസ് ഉണ്ട് ഉണ്ടം പാണ്ടി... പക്ഷേ നിന്റെ ബാങ്ക് അക്കൗണ്ട് ഒരു അരിപ്പ പോലെയാണല്ലോ! വരുന്ന വഴിക്ക് തന്നെ ചോർന്നു പോകുന്നു. അനാവശ്യ ഷോപ്പിംഗ് ഒന്ന് കുറക്ക്!";
    } else if (msg.includes("foreign") || msg.includes("വിദേശം") || msg.includes("visa")) {
      reply = "ങ്ഹാ... വിദേശയോഗം ചോദിച്ചാൽ ഞാൻ സത്യം പറയാം... ലൈൻ കണ്ടിട്ട് ആലുവ വഴി കിളിമാനൂർ വരെ പോകുന്ന യോഗമേ കാണുന്നുള്ളൂ! എന്നാലും ഒരു എക്സ്ചേഞ്ച് ഓഫറിൽ നീ പറക്കും!";
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

    // Generate Malayalam AI model sound for the chat reply
    let audioUrl = "/public/audio/completed.mp3";
    let audioFormat = "url";
    let ttsAvailable = false;

    try {
      const generatedAudio = await generateSpeechAudio(reply, requestedVoice, 25000);
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
      voice: requestedVoice
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Chat error" });
  }
});

// 4. TTS Endpoint (Explicit on-demand Malayalam AI Voice synthesis)
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice } = req.body;
    const requestedVoice = voice || "male-astrologer";
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }
    const audioDataUrl = await generateSpeechAudio(text, requestedVoice, 25000);
    if (audioDataUrl) {
      return res.json({
        audio_url: audioDataUrl,
        format: "base64_wav",
        text,
        voice: requestedVoice,
        tts_available: true
      });
    }
    res.json({
      audio_url: "/public/audio/completed.mp3",
      format: "url",
      text,
      voice: requestedVoice,
      tts_available: false
    });
  } catch (err: any) {
    res.json({
      audio_url: "/public/audio/completed.mp3",
      format: "url",
      text: req.body?.text || "",
      voice: req.body?.voice || "male-astrologer",
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
