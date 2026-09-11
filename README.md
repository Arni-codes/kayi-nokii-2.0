<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />

# Kai Nokki (കൈ നോക്കി) 🎯

## Basic Details
### Team Name: AstroBrothers

### Team Members
- Team Lead: ArniTeja Vijay - Government Engineering College CKG
- Member 2: Sidharth P - Government Engineering College CKG

### Project Description
Kai Nokki is an AI-powered, hilarious Kerala-style palm-reading web application. It uses real-time computer vision to analyze your palm and delivers sarcastic, highly expressive astrological "roasts" in authentic colloquial Malayalam audio.

### The Problem (that doesn't exist)
People take astrology way too seriously, and no real astrologer has the guts to look at your palm and tell you directly that your bank account is empty because of your crippling Swiggy addiction and poor life choices. 

### The Solution (that nobody asked for)
An aggressively sarcastic AI Astrologer ("Unnimaya" or "Fenrir") that forces you to show your palm to the webcam, tracks your hand in 3D using optical ML models, and then verbally obliterates your ego using deeply expressive, perfectly paced Malayalam text-to-speech. 

## Technical Details
### Technologies/Components Used
For Software:
- **Languages used**: HTML, CSS, JavaScript, TypeScript
- **Frameworks used**: Express.js, Node.js
- **Libraries used**: Tailwind CSS, MediaPipe Hands, @google/genai (Gemini API)
- **Tools used**: EdgeTTS (for Malayalam Neural Voice generation), Vite, WebRTC API

### Implementation
For Software:
# Installation
```bash
# Install all dependencies
npm install
```

# Run
```bash
# Start the development server
npm run dev
```
The application will start running on port `3000`.

### Project Documentation
For Software:

# Screenshots (Add at least 3)
![Screenshot1](docs/home_screen.png)
*The landing screen where the user selects their preferred AI Astrologer voice (Male/Female).*

![Screenshot2](docs/scanning_palm.png)
*The real-time MediaPipe ML model tracking the user's hand and aligning it for the perfect read.*

![Screenshot3](docs/roast_result.png)
*The final generated Malayalam roast, playing back with expressive neural audio.*

# Diagrams
![Workflow](docs/architecture.png)
*Architecture showing WebRTC capturing video -> MediaPipe extracting landmarks -> Gemini generating Malayalam Roast -> EdgeTTS synthesizing the audio -> Client playing it back.*

## Team Contributions
- **ArniTeja Vijay**: Core logic for MediaPipe Hand Tracking, Prompt Engineering for Malayalam sarcastic humor, and Text-to-Speech integration.
- **Sidharth P**: Frontend UI/UX design with Tailwind CSS, WebRTC Camera setup, and expressive audio playback synchronization.

---
Made with ❤️ at TinkerHub Useless Projects 

![Static Badge](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Static Badge](https://img.shields.io/badge/UselessProjects--26-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)
