/**
 * KAI NOKKI - Audio Controller
 * Manages scanner voice cues, Web Audio buffer playback, Malayalam/Manglish speech synthesis,
 * and Jothishyan reading audio on all browsers with bulletproof fallbacks.
 */

const AUDIO_FILES = {
  show_hand: '/public/audio/show_hand.mp3',
  detected: '/public/audio/detected.mp3',
  closer: '/public/audio/closer.mp3',
  farther: '/public/audio/farther.mp3',
  steady: '/public/audio/steady.mp3',
  analyzing: '/public/audio/analyzing.mp3',
  completed: '/public/audio/completed.mp3'
};

const AUDIO_PHRASES = {
  show_hand: "Kai kaanikkeda mone...",
  detected: "Aha... kai kitti!",
  closer: "Kurach closer aayi vekku...",
  farther: "Onnu pinnottu maari vekku...",
  steady: "Steady ayi vekka da...",
  analyzing: "Hmmm... Onnu nokkatte...",
  completed: "Aha! Karyangalokke manassilayi..."
};

// Syllabic Malayalam to phonetic Latin (Manglish) converter for natural device TTS
const ML_VOWELS = {
  '\u0D05': 'a', '\u0D06': 'aa', '\u0D07': 'i', '\u0D08': 'ee', '\u0D09': 'u', '\u0D0A': 'oo',
  '\u0D0B': 'ri', '\u0D0E': 'e', '\u0D0F': 'ae', '\u0D10': 'ai', '\u0D12': 'o', '\u0D13': 'oa', '\u0D14': 'ou'
};

const ML_CONSONANTS = {
  '\u0D15': 'k', '\u0D16': 'kh', '\u0D17': 'g', '\u0D18': 'gh', '\u0D19': 'ng',
  '\u0D1A': 'ch', '\u0D1B': 'chh', '\u0D1C': 'j', '\u0D1D': 'jh', '\u0D1E': 'nj',
  '\u0D1F': 't', '\u0D20': 'th', '\u0D21': 'd', '\u0D22': 'dh', '\u0D23': 'n',
  '\u0D24': 'th', '\u0D25': 'thh', '\u0D26': 'd', '\u0D27': 'dh', '\u0D28': 'n',
  '\u0D2A': 'p', '\u0D2B': 'ph', '\u0D2C': 'b', '\u0D2D': 'bh', '\u0D2E': 'ma',
  '\u0D2F': 'ya', '\u0D30': 'ra', '\u0D31': 'ra', '\u0D32': 'la', '\u0D33': 'la', '\u0D34': 'zha',
  '\u0D35': 'va', '\u0D36': 'sha', '\u0D37': 'sha', '\u0D38': 'sa', '\u0D39': 'ha'
};

const ML_VOWEL_SIGNS = {
  '\u0D3E': 'aa', '\u0D3F': 'i', '\u0D40': 'ee', '\u0D41': 'u', '\u0D42': 'oo',
  '\u0D43': 'ri', '\u0D46': 'e', '\u0D47': 'ae', '\u0D48': 'ai', '\u0D4A': 'o', '\u0D4B': 'oa', '\u0D4C': 'ou', '\u0D57': 'ou'
};

const ML_CHILLUS = {
  '\u0D7A': 'n', '\u0D7B': 'n', '\u0D7C': 'r', '\u0D7D': 'l', '\u0D7E': 'l', '\u0D7F': 'k'
};

function transliterateMalayalamToManglish(text) {
  if (!text) return '';
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const nextCh = text[i + 1];

    if (ML_VOWELS[ch]) {
      out += ML_VOWELS[ch];
      i++;
    } else if (ML_CHILLUS[ch]) {
      out += ML_CHILLUS[ch];
      i++;
    } else if (ML_CONSONANTS[ch]) {
      const base = ML_CONSONANTS[ch].replace(/a$/, '');
      if (nextCh === '\u0D4D') {
        // Chandrakkala (virama)
        const nextNext = text[i + 2];
        if (!nextNext || /[\s\.,!?;:\-]/.test(nextNext)) {
          out += base + 'u'; // Word-final sound
        } else {
          out += base;
        }
        i += 2;
      } else if (ML_VOWEL_SIGNS[nextCh]) {
        out += base + ML_VOWEL_SIGNS[nextCh];
        i += 2;
      } else {
        out += base + 'a';
        i++;
      }
    } else if (ch === '\u0D02') {
      out += 'm';
      i++;
    } else if (ch === '\u0D03') {
      out += 'h';
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

class AudioController {
  constructor() {
    this.currentAudio = null;
    this.currentSourceNode = null;
    this.currentUtterance = null;
    this.lastPlayedTrack = null;
    this.lastPlayTime = 0;
    this.cooldownMs = 2500;
    this.audioContext = null;
    this.isMuted = false;
    this.onPlayStateChange = null;
    this.audioBuffers = {};
    this.unlocked = false;
    this.voices = [];
    this.serverTTSCooldownUntil = 0;

    this.initVoices();
  }

  initVoices() {
    if ('speechSynthesis' in window) {
      this.voices = window.speechSynthesis.getVoices() || [];
      window.speechSynthesis.onvoiceschanged = () => {
        this.voices = window.speechSynthesis.getVoices() || [];
      };
    }
  }

  initContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  /**
   * Unlock AudioContext on user interaction to comply with browser autoplay policies.
   */
  unlockAudio() {
    this.initContext();
    this.unlocked = true;

    if (this.audioContext) {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      // Play a short silent buffer to prime audio pipeline
      try {
        const buffer = this.audioContext.createBuffer(1, 1, 22050);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start(0);
      } catch (e) {}
    }

    if ('speechSynthesis' in window) {
      this.initVoices();
    }

    this.preloadBuffers();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopAudio();
    } else {
      this.unlockAudio();
      this.synthesizeChime('steady');
    }
    return this.isMuted;
  }

  /**
   * Pre-loads audio tracks into Web Audio buffers for zero-latency, reliable playback.
   */
  async preloadBuffers() {
    if (!this.audioContext) return;
    for (const [key, url] of Object.entries(AUDIO_FILES)) {
      if (!this.audioBuffers[key]) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            this.audioBuffers[key] = await this.audioContext.decodeAudioData(arrayBuffer);
          }
        } catch (e) {
          // Fallback will handle unbuffered tracks
        }
      }
    }
  }

  /**
   * Plays scanner voice guidance with cooldowns and layered fallbacks.
   * Can optionally wait for audio to finish playing.
   */
  playScannerAudio(name, waitForEnd = false) {
    if (this.isMuted) return Promise.resolve();

    const now = Date.now();
    if (this.lastPlayedTrack === name && (now - this.lastPlayTime) < this.cooldownMs && !waitForEnd) {
      return Promise.resolve();
    }

    this.lastPlayedTrack = name;
    this.lastPlayTime = now;

    if (this.onPlayStateChange) {
      this.onPlayStateChange(true, AUDIO_PHRASES[name] || name);
    }

    this.initContext();

    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          if (this.onPlayStateChange) this.onPlayStateChange(false);
          resolve();
        }
      };

      // 1. First attempt: Web Audio API Buffer (safest against autoplay blocks)
      if (this.audioContext && this.audioBuffers[name]) {
        try {
          if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
          }
          this.stopAudio();
          const source = this.audioContext.createBufferSource();
          source.buffer = this.audioBuffers[name];
          const gainNode = this.audioContext.createGain();
          gainNode.gain.value = 0.95;
          source.connect(gainNode);
          gainNode.connect(this.audioContext.destination);

          this.currentSourceNode = source;
          source.onended = () => {
            if (this.currentSourceNode === source) {
              this.currentSourceNode = null;
            }
            done();
          };

          source.start(0);
          if (!waitForEnd) {
            resolve();
          } else {
            setTimeout(done, 3000);
          }
          return;
        } catch (err) {
          console.warn("Buffer playback failed, trying HTML Audio:", err);
        }
      }

      // 2. Second attempt: Standard HTML5 Audio Element
      const url = AUDIO_FILES[name];
      if (url) {
        try {
          this.stopAudio();
          const audio = new Audio(url);
          this.currentAudio = audio;

          audio.onended = () => {
            if (this.currentAudio === audio) {
              this.currentAudio = null;
            }
            done();
          };

          audio.onerror = () => {
            this.synthesizeChime(name);
            done();
          };

          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {
              this.synthesizeChime(name);
              done();
            });
          }
          if (!waitForEnd) {
            resolve();
          } else {
            setTimeout(done, 3000);
          }
          return;
        } catch (e) {
          // Fall through to synthesizer
        }
      }

      // 3. Third attempt: Procedural Web Audio chime
      this.synthesizeChime(name);
      setTimeout(done, 600);
      if (!waitForEnd) resolve();
    });
  }

  /**
   * Synthesizes tonal audio cues using Web Audio oscillator as a 100% reliable fallback.
   */
  synthesizeChime(name) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.audioContext) return;
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      let freq = 440;
      if (name === 'detected') freq = 587.33; // D5
      if (name === 'steady') freq = 659.25;   // E5
      if (name === 'completed') freq = 880.00; // A5
      if (name === 'closer') freq = 392.00;   // G4
      if (name === 'farther') freq = 349.23;  // F4
      if (name === 'analyzing') freq = 523.25; // C5

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.audioContext.currentTime);

      gain.gain.setValueAtTime(0.12, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.6);

      osc.start();
      osc.stop(this.audioContext.currentTime + 0.6);
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Plays the final AI Jothishyan voice reading or user chat response.
   * Plays the authentic recorded Malayalam cue first, then speaks the reading text.
   */
  async playResultAudio(audioUrl, fallbackText = "") {
    if (this.isMuted) return;
    this.stopAudio();
    this.initContext();

    if (this.onPlayStateChange) {
      this.onPlayStateChange(true, "Jothishyan is reading...");
    }

    // 1. ALWAYS play the authentic recorded Malayalam announcement cue first:
    // "Aha! Karyangalokke manassilayi..." (completed.mp3)
    // Guarantees immediate, audible spoken Malayalam feedback across all browsers.
    try {
      await this.playScannerAudio('completed', true);
    } catch (e) {
      console.warn("Announcement audio error:", e);
    }

    // 2. If a real voice audio URL is provided directly (base64 WAV data URL from Gemini TTS)
    if (audioUrl && audioUrl.startsWith("data:audio/")) {
      try {
        const played = await this.playAudioUrl(audioUrl);
        if (played) {
          if (this.onPlayStateChange) this.onPlayStateChange(false);
          return true;
        }
      } catch (err) {
        console.warn("Direct voice data playback failed:", err);
      }
    }

    // 3. If audioUrl is missing or just a chime, check /api/tts (if not in quota cooldown)
    if (fallbackText) {
      const now = Date.now();
      if (!this.serverTTSCooldownUntil || now > this.serverTTSCooldownUntil) {
        try {
          const ttsRes = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: fallbackText })
          });
          if (ttsRes.ok) {
            const ttsData = await ttsRes.json();
            if (ttsData.tts_available === false) {
              this.serverTTSCooldownUntil = Date.now() + 10 * 60 * 1000;
            } else if (ttsData.audio_url && ttsData.audio_url.startsWith("data:audio/")) {
              const played = await this.playAudioUrl(ttsData.audio_url);
              if (played) {
                if (this.onPlayStateChange) this.onPlayStateChange(false);
                return true;
              }
            }
          }
        } catch (e) {
          this.serverTTSCooldownUntil = Date.now() + 60 * 1000;
        }
      }

      // 4. Bulletproof browser SpeechSynthesis with natural Manglish phonetics
      await this.speakFallbackSpeech(fallbackText);
    }

    if (this.onPlayStateChange) this.onPlayStateChange(false);
  }

  /**
   * Plays a data: audio URL using HTML5 Audio or Web Audio Context.
   */
  playAudioUrl(url) {
    return new Promise(async (resolve, reject) => {
      this.stopAudio();
      this.initContext();

      // Attempt 1: Web Audio Context Buffer decoding (most reliable in sandboxed iframes)
      if (this.audioContext) {
        try {
          if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
          }
          const res = await fetch(url);
          const arrayBuffer = await res.arrayBuffer();
          const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

          const source = this.audioContext.createBufferSource();
          source.buffer = audioBuffer;
          const gainNode = this.audioContext.createGain();
          gainNode.gain.value = 1.0;
          source.connect(gainNode);
          gainNode.connect(this.audioContext.destination);

          this.currentSourceNode = source;
          source.onended = () => {
            if (this.currentSourceNode === source) {
              this.currentSourceNode = null;
            }
            resolve(true);
          };

          source.start(0);
          return;
        } catch (e) {
          console.warn("AudioContext buffer decode failed, falling back to HTML5 Audio:", e);
        }
      }

      // Attempt 2: HTML5 Audio
      try {
        const audio = new Audio(url);
        this.currentAudio = audio;

        audio.onended = () => {
          this.currentAudio = null;
          resolve(true);
        };
        audio.onerror = (e) => {
          this.currentAudio = null;
          reject(e);
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            this.currentAudio = null;
            reject(err);
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Uses browser SpeechSynthesis with Malayalam / Indian accent preference,
   * with automatic phonetic transliteration for English/Indian voices.
   */
  speakFallbackSpeech(text) {
    return new Promise((resolve) => {
      if (!text || this.isMuted) {
        resolve(false);
        return;
      }

      if (!('speechSynthesis' in window)) {
        resolve(false);
        return;
      }

      try {
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        // Small delay to prevent Chrome cancel bug
        setTimeout(() => {
          try {
            const voices = this.voices.length > 0 ? this.voices : (window.speechSynthesis.getVoices() || []);

            // Find optimal voice
            const mlVoice = voices.find(v => v.lang && (v.lang.startsWith('ml') || v.lang.toLowerCase().includes('malayalam')));
            const inVoice = voices.find(v => v.lang && (v.lang === 'en-IN' || v.lang.startsWith('hi') || v.lang.toLowerCase().includes('india')));
            const enVoice = voices.find(v => v.lang && v.lang.startsWith('en'));

            const chosenVoice = mlVoice || inVoice || enVoice || voices[0] || null;

            let spokenText = text;
            if (!mlVoice) {
              spokenText = transliterateMalayalamToManglish(text);
              if (!spokenText) spokenText = text;
            }

            const utterance = new SpeechSynthesisUtterance(spokenText);
            this.currentUtterance = utterance; // Keep reference against Chrome GC
            utterance.rate = 0.92;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            if (chosenVoice) {
              utterance.voice = chosenVoice;
              utterance.lang = chosenVoice.lang || 'en-IN';
            } else {
              utterance.lang = 'en-IN';
            }

            let resolved = false;
            const finish = (ok) => {
              if (!resolved) {
                resolved = true;
                if (this.currentUtterance === utterance) {
                  this.currentUtterance = null;
                }
                resolve(ok);
              }
            };

            utterance.onend = () => finish(true);
            utterance.onerror = () => finish(false);

            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
            window.speechSynthesis.speak(utterance);

            // Safety timeout in case utterance doesn't fire onend
            setTimeout(() => finish(true), Math.min(25000, Math.max(4000, spokenText.length * 90)));
          } catch (e) {
            resolve(false);
          }
        }, 50);
      } catch (err) {
        resolve(false);
      }
    });
  }

  stopAudio() {
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
      } catch (e) {}
      this.currentSourceNode = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
      this.currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    if (this.onPlayStateChange) {
      this.onPlayStateChange(false);
    }
  }
}

// Global Audio Controller Instance
window.audioController = new AudioController();

// Unlock audio context on any user interaction anywhere on the document
const autoUnlockAudio = () => {
  if (window.audioController) {
    window.audioController.unlockAudio();
  }
};
window.addEventListener('click', autoUnlockAudio, { once: false });
window.addEventListener('touchstart', autoUnlockAudio, { once: false });
window.addEventListener('keydown', autoUnlockAudio, { once: false });
