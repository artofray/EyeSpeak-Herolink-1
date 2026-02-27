# 🚀 EyeSpeak Herolink 1: Mission Control for Young Pilots

An AI-powered eye-tracking communication device for non-verbal children. Turns speech practice and body awareness into a superhero mission.

**Built with:** React + TypeScript + MediaPipe + Gemini Live Audio + Gemini TTS

---

## ✨ What's New in v2.0

### Eye Tracking Improvements
- **5-Point Gaze Calibration** — personalized gaze-to-screen mapping per child
- **Blink Detection** — EAR (Eye Aspect Ratio) algorithm prevents false selections during blinks
- **Adjustable Sensitivity** — configurable smoothing, head/iris sensitivity, and dwell time
- **Face Detection Indicator** — warns when child's face is not visible

### Communication Upgrades
- **Word Prediction** — after typing 2+ letters, top-3 word suggestions appear (200-word AAC core vocabulary)
- **Audio Feedback** — rising pitch tick sound during dwell, confirmation chime on selection
- **Haptic Feedback** — vibration on selection (mobile/tablet)
- **Session History** — selections persisted in localStorage for caregiver review

### Architecture
- **Decomposed from 724-line god file** into 15+ focused modules (hooks, components, utils)
- Every file under 200 lines
- Clean separation: tracking logic, UI components, audio, prediction

---

## 🛠 Setup & Requirements

### Browser Mode (PC/Mac/Tablet)
- **Browser**: Google Chrome or Microsoft Edge (for best eye tracking)
- **Hardware**: Webcam + microphone
- **Permissions**: Allow Camera and Microphone access

### VR Mode (Meta Quest 2/3/Pro)
- Open **Meta Quest Browser** and navigate to the app URL
- Enable **Passthrough** mode for real-world visibility

---

## 🧠 How It Works

### Eye-Gaze Tracking
1. **Calibration** — On first launch, child looks at 5 dots (corners + center) to personalize tracking
2. **Targeting Reticle** — child looks at a letter or button
3. **Dwell Selection** — holding gaze for 1.5s triggers the action (configurable)
4. **Blink Safety** — blinks are detected and ignored to prevent accidental selections
5. **Energy Charging** — orbit particles and rising pitch provide visual + audio feedback

### The Voices
- **Maggie (Mission Support)** — warm, encouraging AI assistant via Gemini Live Audio
- **Pilot Voice (The Child)** — selected letters/words spoken in a child-appropriate voice via Gemini TTS

### Word Prediction
After typing 2+ letters, the system suggests words from a 200-word AAC core vocabulary:
- Type "H-E-L" → suggests "HELLO", "HELP"
- Select a prediction to complete the word instantly

### Body Awareness
MediaPipe Pose tracks the child's body. The "Armour Integrity" panel shows which body parts are detected, encouraging movement and body awareness.

### Emergency Help
Large, easy-to-select buttons for safety situations:
- 🛑 Bad Touch
- 🩹 I Am Hurt
- 🤢 I Feel Sick
- 🗺️ I Am Lost

### Caregiver Console
Parents can open a text chat with an AI advisor for questions about:
- Autism communication strategies
- AAC best practices
- Interpreting their child's selection patterns
- Adjusting system settings

---

## 📋 Quick Start

```bash
# 1. Clone
git clone https://github.com/artofray/EyeSpeak-Herolink-1.git
cd EyeSpeak-Herolink-1

# 2. Install
npm install

# 3. Set API key
echo "GEMINI_API_KEY=your_key_here" > .env.local

# 4. Run
npm run dev
```

Open `http://localhost:3000` in Chrome.

---

## 📁 Project Structure

```
src/
├── App.tsx                     # Main app (< 280 lines)
├── main.tsx                    # Entry point
├── constants.ts                # Config, vocabulary, settings
├── types.ts                    # TypeScript interfaces
├── hooks/
│   ├── useGazeTracking.ts      # FaceMesh + iris + blink detection
│   ├── usePoseTracking.ts      # Body pose + skeleton drawing
│   ├── useDwell.ts             # Dwell selection + cooldown
│   └── useMaggieSession.ts     # Gemini Live Audio + TTS
├── components/
│   ├── HeroButton.tsx          # Gaze-selectable hex button
│   ├── GazeReticle.tsx         # Targeting cursor
│   ├── CalibrationScreen.tsx   # 5-point calibration wizard
│   ├── WordPrediction.tsx      # Word suggestions
│   ├── CaregiverChat.tsx       # Parent/caregiver AI chat
│   └── HelpMenu.tsx            # Emergency help overlay
└── utils/
    ├── audioHelpers.ts         # PCM encode/decode, audio feedback
    └── wordPrediction.ts       # AAC vocabulary + prediction
```

---

## 💡 Troubleshooting

- **Gaze not working?** Make sure room is well-lit, camera at eye level. Try re-calibrating.
- **Too many false selections?** Increase dwell time in settings or reduce sensitivity.
- **Tracking jittery?** Increase smoothing factor. Close other tabs.
- **No sound?** Check system volume. Make sure browser tab isn't muted.
- **"No Face Detected"?** Move the child closer to camera, ensure face is fully visible.

---

## 🔧 Configuration

Settings in `src/constants.ts` under `DEFAULT_SETTINGS`:

| Setting | Default | Description |
|---------|---------|-------------|
| `dwellTime` | 1500ms | Time to hold gaze before selection |
| `smoothingFactor` | 0.15 | Gaze smoothing (0.05=smooth, 0.4=responsive) |
| `gazeSensitivity` | 3.5 | Iris movement multiplier |
| `headSensitivity` | 2.5 | Head movement multiplier |
| `blinkThreshold` | 0.2 | EAR below this = blink detected |
| `voiceName` | Puck | Child's TTS voice |
| `maggieVoice` | Kore | Maggie's voice |

---

**Mission Directive:** *Be patient, be loud with your praise, and have fun. Every letter spelled is a successful mission completed.* 🎖️