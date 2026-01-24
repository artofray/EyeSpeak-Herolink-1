import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';

// Base64 Helpers
const encode = (b: Uint8Array) => btoa(Array.from(b).map(c => String.fromCharCode(c)).join(''));
const decode = (s: string) => new Uint8Array(atob(s).split('').map(c => c.charCodeAt(0)));

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const COMMON_WORDS = ["MISSION START", "HELP ME", "MORE ENERGY", "STOP MISSION", "THANK YOU", "MAGGIE", "AFFIRMATIVE", "NEGATIVE"];
const DWELL_TIME = 1500; 

const CHILD_VOICES = [
  { id: 'Puck', label: 'Stark-Tech Alpha', gender: 'Youthful A' },
  { id: 'Fenrir', label: 'Nova Prime Delta', gender: 'Youthful B' },
  { id: 'Zephyr', label: 'Guardians Echo', gender: 'Youthful C' },
  { id: 'Charon', label: 'Titan Core', gender: 'Youthful D' },
];

const TRACKERS = [
  { id: 'hmd', label: 'CPU CORE', color: 'bg-yellow-400' },
  { id: 'chest', label: 'ARC REACTOR', color: 'bg-cyan-400' },
  { id: 'waist', label: 'POWER CELL', color: 'bg-blue-400' },
];

const App = () => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('SYSTEMS OFFLINE');
  const [transcription, setTranscription] = useState('');
  const [slimeStatus, setSlimeStatus] = useState('UNLINKED');
  const [trackersActive, setTrackersActive] = useState<Record<string, boolean>>({});
  
  const [childVoice, setChildVoice] = useState('Puck');
  const [showSettings, setShowSettings] = useState(false);
  const [currentWord, setCurrentWord] = useState("");
  const [gazePoint, setGazePoint] = useState({ x: 0, y: 0 });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sessionRef = useRef<any>(null);
  const poseRef = useRef<any>(null);
  const faceMeshRef = useRef<any>(null);
  const dwellStartTimeRef = useRef<number | null>(null);
  const lastSelectedIdRef = useRef<string | null>(null);

  const letterColors = useMemo(() => {
    return ALPHABET.map((_, i) => {
      const row = Math.floor(i / 6);
      const col = i % 6;
      return `grid-c${(row + col) % 6}`;
    });
  }, []);

  useEffect(() => {
    if (typeof (window as any).Pose !== 'undefined') {
      poseRef.current = new (window as any).Pose({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });
      poseRef.current.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      poseRef.current.onResults(onPoseResults);
    }
    if (typeof (window as any).FaceMesh !== 'undefined') {
      faceMeshRef.current = new (window as any).FaceMesh({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });
      faceMeshRef.current.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      faceMeshRef.current.onResults(onFaceResults);
    }
  }, []);

  const onPoseResults = (results: any) => {
    if (!poseCanvasRef.current) return;
    const ctx = poseCanvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, poseCanvasRef.current.width, poseCanvasRef.current.height);
    if (results.poseLandmarks) {
      // Draw glowing wireframe skeleton
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0ea5e9';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#0ea5e9';
      
      const drawLine = (from: number, to: number) => {
        const p1 = results.poseLandmarks[from];
        const p2 = results.poseLandmarks[to];
        if (p1.visibility > 0.5 && p2.visibility > 0.5) {
          ctx.beginPath();
          ctx.moveTo(p1.x * poseCanvasRef.current!.width, p1.y * poseCanvasRef.current!.height);
          ctx.lineTo(p2.x * poseCanvasRef.current!.width, p2.y * poseCanvasRef.current!.height);
          ctx.stroke();
        }
      };

      drawLine(11, 12); drawLine(11, 23); drawLine(12, 24); drawLine(23, 24);
      
      setTrackersActive({
        hmd: results.poseLandmarks[0].visibility > 0.5,
        chest: results.poseLandmarks[11].visibility > 0.5,
        waist: results.poseLandmarks[23].visibility > 0.5,
      });
    }
  };

  const onFaceResults = (results: any) => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      const noseTip = landmarks[1];
      const x = 1.0 - (noseTip.x - 0.5) * 4 + 0.5; 
      const y = (noseTip.y - 0.5) * 4 + 0.5;
      const clampedX = Math.max(0, Math.min(1, x));
      const clampedY = Math.max(0, Math.min(1, y));
      setGazePoint({ x: clampedX, y: clampedY });
      checkDwell(clampedX, clampedY);
    }
  };

  const checkDwell = (x: number, y: number) => {
    const screenX = x * window.innerWidth;
    const screenY = y * window.innerHeight;
    const element = document.elementFromPoint(screenX, screenY);
    const target = element?.closest('[data-gaze-id]');
    const targetId = target?.getAttribute('data-gaze-id') || null;

    if (targetId && targetId !== focusedId) {
      setFocusedId(targetId);
      dwellStartTimeRef.current = Date.now();
      setDwellProgress(0);
    } else if (!targetId) {
      setFocusedId(null);
      dwellStartTimeRef.current = null;
      setDwellProgress(0);
    } else if (targetId === focusedId && dwellStartTimeRef.current) {
      const elapsed = Date.now() - dwellStartTimeRef.current;
      const progress = Math.min(100, (elapsed / DWELL_TIME) * 100);
      setDwellProgress(progress);
      if (progress >= 100 && targetId !== lastSelectedIdRef.current) {
        handleSelection(targetId);
        lastSelectedIdRef.current = targetId;
        setTimeout(() => { lastSelectedIdRef.current = null; }, 800);
      }
    }
  };

  const handleSelection = (id: string) => {
    if (id === 'BACKSPACE') setCurrentWord(prev => prev.slice(0, -1));
    else if (id === 'SPACE') setCurrentWord(prev => prev + " ");
    else if (id === 'CLEAR') setCurrentWord("");
    else if (id === 'SPEAK') speakChildsVoice(currentWord);
    else if (id.length === 1) {
      setCurrentWord(prev => prev + id);
      speakChildsVoice(id);
    } else speakChildsVoice(id);
  };

  const speakChildsVoice = async (text: string) => {
    if (!text.trim()) return;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: childVoice } } },
        },
      });
      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData && audioContextRef.current) {
        const ctx = audioContextRef.current;
        const buf = await decodeAudioData(decode(audioData), ctx, 24000, 1);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start();
        if (sessionRef.current) {
          sessionRef.current.sendRealtimeInput({
            text: `[SYSTEM] The pilot just transmitted: "${text}". Mission Support, provide an encouraging tech-themed response.`
          });
        }
        if (text.length > 1 && text !== 'SPACE') setCurrentWord("");
      }
    } catch (err) {}
  };

  const startMaggie = async () => {
    try {
      setStatus('INITIALIZING HUD...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 480 } });
      if (videoRef.current) videoRef.current.srcObject = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;

      const camera = new (window as any).Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current) {
            await poseRef.current.send({ image: videoRef.current });
            await faceMeshRef.current.send({ image: videoRef.current });
          }
        },
        width: 640, height: 480
      });
      camera.start();

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => { setIsActive(true); setStatus('MISSION ACTIVE'); },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.outputTranscription) setTranscription(msg.serverContent.outputTranscription.text);
            const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buf = await decodeAudioData(decode(audio), ctx, 24000, 1);
              const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
              src.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buf.duration;
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are MAGGIE (Mission Assistance & Global Guidance Integrated Entity). 
          Your persona is like a friendly superhero mission commander (Stark-tech helper).
          The user is a "Pilot" with a "Power Suit" (the SlimeVR trackers).
          When they spell or use the console, speak in high-tech hero terms like "Excellent link, Pilot!" or "Core stability looking great!"
          Use a warm but high-tech professional voice (Kore).`,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) { setStatus('CONNECTION FAILURE'); }
  };

  return (
    <div className="h-screen flex flex-col p-4 relative overflow-hidden">
      <div className="scanline-overlay"></div>

      {/* Targeting Reticle Overlay */}
      {isActive && (
        <div 
          className="targeting-reticle w-12 h-12"
          style={{ left: `${gazePoint.x * 100}%`, top: `${gazePoint.y * 100}%`, transform: 'translate(-50%, -50%)' }}
        >
          <div className="reticle-inner"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-1 h-1 bg-amber-400 rounded-full"></div>
          </div>
        </div>
      )}

      {/* HUD HEADER */}
      <div className="flex justify-between items-center hud-glass p-4 rounded-xl border-b-2 border-sky-500/50 mb-6">
        <div className="flex items-center gap-6">
          <div className="text-2xl text-hud font-bold text-sky-400">EYESPEAK <span className="text-amber-500">HEROLINK 1</span></div>
          <div className="flex gap-2">
            <div className={`px-2 py-1 rounded text-[10px] font-bold border ${slimeStatus === 'UNLINKED' ? 'border-red-500 text-red-400' : 'border-emerald-500 text-emerald-400'}`}>{slimeStatus}</div>
            <div className="px-2 py-1 rounded text-[10px] font-bold border border-sky-500 text-sky-400">MAGGIE_v2.5</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <button onClick={() => setShowSettings(true)} className="text-[10px] hud-glass px-4 py-2 rounded-md hover:bg-sky-500/20 transition text-hud">CONFIG_VOICE</button>
           <div className="text-amber-500 text-hud text-sm animate-pulse">{status}</div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* LEFT HUD: Console & Spellboard */}
        <div className="flex-[3] flex flex-col gap-6">
          {/* Transmission Display */}
          <div className="hud-glass rounded-2xl p-8 border-l-4 border-amber-500 relative overflow-hidden">
             <div className="absolute top-2 right-4 text-[10px] text-amber-500/50 font-bold">OUTGOING_TRANSMISSION</div>
             <div className="text-6xl font-bold text-sky-100 tracking-[0.2em] min-h-[1.1em] drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]">
              {currentWord || <span className="text-sky-900/40">WAITING_FOR_INPUT...</span>}
            </div>
            <div className="flex gap-4 mt-6">
              <GazeButton id="BACKSPACE" label="DEL" color="border-red-500/30" active={focusedId === 'BACKSPACE'} progress={focusedId === 'BACKSPACE' ? dwellProgress : 0} />
              <GazeButton id="CLEAR" label="RESET" color="border-slate-500/30" active={focusedId === 'CLEAR'} progress={focusedId === 'CLEAR' ? dwellProgress : 0} />
              <GazeButton id="SPEAK" label="TRANSMIT_VOICE 🛰️" color="hud-border-amber" active={focusedId === 'SPEAK'} progress={focusedId === 'SPEAK' ? dwellProgress : 0} className="flex-1" />
            </div>
          </div>

          {/* Holographic Key-Pad */}
          <div className="flex-1 grid grid-cols-10 gap-3 p-4 hud-glass rounded-3xl border-t-2 border-sky-500/20">
            <div className="col-span-2 flex flex-col gap-2">
              {COMMON_WORDS.slice(0, 4).map((w, i) => (
                <GazeButton key={w} id={w} label={w} color="border-amber-500/20" active={focusedId === w} progress={focusedId === w ? dwellProgress : 0} className="flex-1 text-[10px]" />
              ))}
            </div>
            <div className="col-span-6 grid grid-cols-6 gap-2">
              {ALPHABET.map((l, i) => (
                <GazeButton key={l} id={l} label={l} color={letterColors[i]} active={focusedId === l} progress={focusedId === l ? dwellProgress : 0} className="text-2xl font-bold" />
              ))}
              <GazeButton id="SPACE" label="SPACE_CORE" color="border-sky-500/20" active={focusedId === 'SPACE'} progress={focusedId === 'SPACE' ? dwellProgress : 0} className="col-span-2 text-[10px]" />
            </div>
            <div className="col-span-2 flex flex-col gap-2">
              {COMMON_WORDS.slice(4).map((w, i) => (
                <GazeButton key={w} id={w} label={w} color="border-amber-500/20" active={focusedId === w} progress={focusedId === w ? dwellProgress : 0} className="flex-1 text-[10px]" />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT HUD: Pilot Scan & Maggie */}
        <div className="flex-1 flex flex-col gap-6 max-w-sm">
          {/* Pilot Feed */}
          <div className="hud-glass rounded-3xl overflow-hidden relative border-2 border-sky-500/30 aspect-video shadow-[0_0_50px_rgba(14,165,233,0.1)]">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1] opacity-40 grayscale sepia brightness-150 contrast-125" />
            <canvas ref={poseCanvasRef} width="640" height="480" className="absolute inset-0 w-full h-full scale-x-[-1]" />
            <div className="absolute inset-0 border-[20px] border-transparent border-t-sky-500/10 border-b-sky-500/10 pointer-events-none"></div>
            {!isActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-sky-900/80 backdrop-blur-sm">
                <button onClick={startMaggie} className="bg-sky-500 text-white px-8 py-4 rounded-lg font-bold text-hud hud-border-cyan pulse">INIT_LINK</button>
              </div>
            )}
            <div className="absolute top-2 left-2 text-[8px] font-bold text-sky-400 bg-sky-900/50 px-2 py-0.5 rounded">LIVE_PILOT_FEED_01</div>
          </div>

          {/* Mission Support (Maggie) */}
          <div className="hud-glass p-6 rounded-3xl border-r-4 border-sky-500 flex-1 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-ping"></div>
              <h3 className="text-[10px] font-bold text-sky-400 text-hud">MISSION_SUPPORT_AI</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              <p className="text-lg font-bold text-sky-100 leading-tight italic drop-shadow-md">
                {transcription || "READY FOR MISSION DATA..."}
              </p>
            </div>
            
            {/* System Integrity Readout */}
            <div className="pt-4 border-t border-sky-500/20">
              <h4 className="text-[10px] font-bold text-amber-500 text-hud mb-3">ARMOR_INTEGRITY</h4>
              <div className="space-y-3">
                {TRACKERS.map(t => (
                  <div key={t.id} className="space-y-1">
                    <div className="flex justify-between text-[8px] font-bold">
                      <span>{t.label}</span>
                      <span className={trackersActive[t.id] ? 'text-emerald-400' : 'text-red-500'}>{trackersActive[t.id] ? 'ONLINE' : 'OFFLINE'}</span>
                    </div>
                    <div className="h-1 bg-sky-900 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-500 ${trackersActive[t.id] ? 'w-full ' + t.color : 'w-0'}`}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Config Panel */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-12">
          <div className="hud-glass rounded-[2rem] p-12 max-w-2xl w-full border-2 border-amber-500 shadow-[0_0_100px_rgba(245,158,11,0.2)]">
            <h2 className="text-3xl text-hud font-bold text-amber-500 mb-8 text-center">PILOT_VOICE_MODULATION</h2>
            <div className="grid grid-cols-2 gap-4 mb-10">
              {CHILD_VOICES.map(v => (
                <button 
                  key={v.id} 
                  onClick={() => { setChildVoice(v.id); speakChildsVoice("Voice modulation test. Core link established."); }}
                  className={`p-6 rounded-xl font-bold text-left transition-all border-2 ${childVoice === v.id ? 'border-amber-500 bg-amber-500/20 text-white shadow-lg' : 'border-sky-500/20 text-sky-400 hover:bg-sky-500/10'}`}
                >
                  <div className="text-hud text-sm">{v.label}</div>
                  <div className="text-[10px] opacity-60 mt-2">ENCODING: {v.gender}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowSettings(false)} className="w-full bg-amber-600 text-white py-5 rounded-xl font-bold text-hud hover:bg-amber-500 transition">LOCK_CONFIG</button>
          </div>
        </div>
      )}
    </div>
  );
};

const GazeButton = ({ id, label, color, active, progress, className = "" }: any) => {
  const isCharging = active && progress > 0 && progress < 100;
  
  return (
    <div 
      data-gaze-id={id}
      className={`energy-btn hud-glass ${active ? 'hud-border-amber z-10' : 'border-sky-500/20'} ${isCharging ? 'charging-glow scale-110' : active ? 'scale-105' : ''} ${color} ${className} flex items-center justify-center text-sky-100 font-bold transition-all duration-300 h-full cursor-pointer relative overflow-hidden`}
    >
      <span className={`relative z-20 ${active ? 'animate-pulse text-amber-400' : ''}`}>{label}</span>
      
      {active && (
        <>
          {/* Orbital HUD Circles */}
          <div className="absolute inset-0 flex items-center justify-center opacity-30">
            <div className={`w-16 h-16 border border-amber-500 rounded-full ${isCharging ? 'animate-ping' : ''}`}></div>
          </div>
          
          {/* Fill Gauge */}
          <div className="absolute bottom-0 left-0 h-full bg-amber-500/10 pointer-events-none transition-all ease-linear" style={{ width: `${progress}%` }}></div>
          <div className="absolute bottom-0 left-0 h-1 bg-amber-500 shadow-[0_0_10px_#f59e0b] transition-all ease-linear" style={{ width: `${progress}%` }}></div>
        </>
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);