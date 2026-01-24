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

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#".split("");
const EMOTIONS = [
  { id: 'HUNGRY', label: 'HUNGRY', icon: '🍔', color: 'grid-amber' },
  { id: 'THIRSTY', label: 'THIRSTY', icon: '🥤', color: 'grid-cyan' },
  { id: 'HAPPY', label: 'HAPPY', icon: '😊', color: 'grid-green' },
  { id: 'SAD', label: 'SAD', icon: '☹️', color: 'grid-amber' },
  { id: 'HELP', label: 'HELP', icon: '🆘', color: 'grid-blue' },
];

const QUICK_WORDS = ["MOM", "DAD", "PLAY", "YES", "NO", "HI", "BYE"];
const DWELL_TIME = 1500; 

const TRACKER_LIST = [
  { id: 'hmd', label: 'HEAD' },
  { id: 'chest', label: 'CHEST' },
  { id: 'waist', label: 'WAIST' },
  { id: 'knees', label: 'KNEES' },
  { id: 'feet', label: 'FEET' },
];

const App = () => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('READY TO HELP!');
  const [maggieMsg, setMaggieMsg] = useState('Welcome back, Pilot! Core link stable. Ready for mission briefing?');
  const [trackersActive, setTrackersActive] = useState<Record<string, boolean>>({
    hmd: false, chest: false, waist: false, knees: false, feet: false
  });
  
  const [currentWord, setCurrentWord] = useState("");
  const [gazePoint, setGazePoint] = useState({ x: 0, y: 0 });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [lockInId, setLockInId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sessionRef = useRef<any>(null);
  const poseRef = useRef<any>(null);
  const faceMeshRef = useRef<any>(null);
  const dwellStartTimeRef = useRef<number | null>(null);
  const lastSelectedIdRef = useRef<string | null>(null);

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
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#28E7FF';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#28E7FF';
      
      const drawLine = (from: number, to: number) => {
        const p1 = results.poseLandmarks[from];
        const p2 = results.poseLandmarks[to];
        if (p1.visibility > 0.5 && p2.visibility > 0.5) {
          ctx.beginPath();
          ctx.moveTo(p1.x * poseCanvasRef.current!.width, p1.y * poseCanvasRef.current!.height);
          ctx.lineTo(p2.x * poseCanvasRef.current!.width, p2.y * poseCanvasRef.current!.height);
          ctx.stroke();
          ctx.fillStyle = '#FFB020';
          ctx.beginPath();
          ctx.arc(p1.x * poseCanvasRef.current!.width, p1.y * poseCanvasRef.current!.height, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      drawLine(11, 12); drawLine(11, 23); drawLine(12, 24); drawLine(23, 24);
      drawLine(23, 25); drawLine(24, 26); drawLine(25, 27); drawLine(26, 28);
      
      setTrackersActive({
        hmd: results.poseLandmarks[0].visibility > 0.6,
        chest: results.poseLandmarks[11].visibility > 0.6,
        waist: results.poseLandmarks[23].visibility > 0.6,
        knees: (results.poseLandmarks[25].visibility > 0.5 || results.poseLandmarks[26].visibility > 0.5),
        feet: (results.poseLandmarks[27].visibility > 0.5 || results.poseLandmarks[28].visibility > 0.5),
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
      const progress = Math.min(1, elapsed / DWELL_TIME);
      setDwellProgress(progress);
      if (progress >= 1 && targetId !== lastSelectedIdRef.current) {
        handleSelection(targetId);
        lastSelectedIdRef.current = targetId;
        setLockInId(targetId);
        setTimeout(() => setLockInId(null), 300);
        setTimeout(() => { lastSelectedIdRef.current = null; }, 800);
      }
    }
  };

  const handleSelection = (id: string) => {
    if (id === 'BACKSPACE') setCurrentWord(prev => prev.slice(0, -1));
    else if (id === 'SPACE') setCurrentWord(prev => prev + " ");
    else if (id === 'CLEAR') setCurrentWord("");
    else if (id === 'START_WITH_MAGGIE') startMaggie();
    else if (id.length === 1) {
      setCurrentWord(prev => prev + id);
      speakChildsVoice(id);
    } else {
      speakChildsVoice(id);
      setCurrentWord(""); 
    }
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
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
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
        
        // Deepen Maggie's Intelligence
        if (sessionRef.current) {
          const contextPayload = {
            selection: text,
            activity: "Body Awareness Warmup",
            recentSelections: currentWord.split(''),
            pose: trackersActive,
            timestamp: new Date().toISOString()
          };
          sessionRef.current.sendRealtimeInput({
            text: `[PILOT_SYSTEM_DATA] ${JSON.stringify(contextPayload)}. MISSION COMMANDER MAGGIE: Provide a supportive, context-aware mission response.`
          });
        }
      }
    } catch (err) {}
  };

  const startMaggie = async () => {
    if (isActive) return;
    try {
      setStatus('INITIALIZING...');
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
          onopen: () => { setIsActive(true); setStatus('CORE LINK OK'); },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.outputTranscription) setMaggieMsg(msg.serverContent.outputTranscription.text);
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
          systemInstruction: `You are MAGGIE.AI, the Mission Assistant for EyeSpeak Herolink 1. 
          Your persona is like a friendly superhero mission commander (Stark-tech helper).
          The user is a "Pilot". Respond to selections or pose updates with encouraging mission-themed language.
          Keep responses brief, supportive, and context-aware.`,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) { setStatus('LINK_ERROR'); }
  };

  return (
    <div className="h-screen w-screen p-6 flex flex-col gap-6 relative select-none">
      <div className="scanline-overlay"></div>

      {/* Gaze Reticle */}
      <div 
        className="targeting-reticle w-16 h-16 flex items-center justify-center"
        style={{ left: `${gazePoint.x * 100}%`, top: `${gazePoint.y * 100}%`, transform: 'translate(-50%, -50%)' }}
      >
        <div className="absolute inset-0 border-2 border-[var(--cyan)] rounded-full rotating"></div>
        <div className="absolute inset-2 border border-[var(--amber)] rounded-full"></div>
        <div className="w-1 h-1 bg-white rounded-full"></div>
      </div>

      {/* HEADER SECTION */}
      <div className="flex justify-center items-center h-16 relative">
         <div className="text-4xl text-hud font-black text-white drop-shadow-[0_0_15px_var(--cyan)]">
           EYESPEAK <span className="text-[var(--amber)]">HEROLINK 1</span>
         </div>
         <div className="absolute left-0 bottom-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--cyan)] to-transparent opacity-50"></div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        
        {/* LEFT COLUMN: LIVE TRACKING & STATUS */}
        <div className="w-1/4 flex flex-col gap-6">
          <div className="flex-1 hud-panel rounded-lg overflow-hidden flex flex-col">
            <div className="bg-[var(--cyan)]/10 px-4 py-1 text-[10px] font-bold border-b border-[var(--stroke)] flex justify-between items-center text-[var(--cyan)]">
              <span>LIVE_TRACKING</span>
              <div className="flex gap-1">
                <div className="w-1 h-1 bg-[var(--cyan)] rounded-full animate-pulse"></div>
                <div className="w-1 h-1 bg-[var(--cyan)] rounded-full animate-pulse delay-100"></div>
              </div>
            </div>
            <div className="flex-1 relative bg-black/50">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover opacity-40 grayscale contrast-150" />
              <canvas ref={poseCanvasRef} width="640" height="480" className="absolute inset-0 w-full h-full scale-x-[-1]" />
              {!isActive && (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <HeroButton id="START_WITH_MAGGIE" label="START MISSION" className="w-full py-6 text-sm" active={focusedId === 'START_WITH_MAGGIE'} progress={focusedId === 'START_WITH_MAGGIE' ? dwellProgress : 0} />
                </div>
              )}
            </div>
          </div>

          <div className="hud-panel rounded-lg p-6 flex flex-col gap-3">
             <div className="flex items-center justify-between mb-2">
                <span className="text-hud text-xs text-[var(--amber)]">TRACKER STATUS</span>
                <div className="w-3 h-3 border border-[var(--cyan)] rotate-45"></div>
             </div>
             {TRACKER_LIST.map(t => (
               <div key={t.id} className="flex items-center justify-between text-[10px] font-bold">
                 <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-sm ${trackersActive[t.id] ? 'bg-[var(--ok)] animate-pulse' : 'bg-[var(--bad)]'}`}></div>
                   <span className="text-[var(--txt)]">{t.label}</span>
                 </div>
                 <span className={trackersActive[t.id] ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}>{trackersActive[t.id] ? 'CONNECTED' : 'OFFLINE'}</span>
               </div>
             ))}
          </div>
        </div>

        {/* MIDDLE COLUMN: MAIN HUB */}
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          <div className="grid grid-cols-5 gap-4 h-28">
            {EMOTIONS.map(e => (
              <HeroButton 
                key={e.id} id={e.id} label={e.label} icon={e.icon}
                className={`hex-btn flex-col`}
                active={focusedId === e.id} progress={focusedId === e.id ? dwellProgress : 0}
                locked={lockInId === e.id}
              />
            ))}
          </div>

          <div className="flex-1 hud-panel rounded-xl p-8 flex flex-col gap-6">
             <div className="relative h-20 bg-[var(--cyan)]/5 border border-[var(--stroke)] rounded-lg flex items-center px-8">
               <div className="absolute -top-3 left-4 bg-[var(--bg-0)] px-2 text-[10px] text-[var(--cyan)] font-bold">TRANSMISSION_INPUT:. \</div>
               <div className="text-4xl font-black tracking-widest text-[var(--txt)] drop-shadow-[0_0_15px_var(--cyan)] uppercase">
                 {currentWord || <span className="text-[var(--bg-1)] animate-pulse">_</span>}
               </div>
               <div className="ml-auto flex gap-4">
                 <HeroButton id="BACKSPACE" label="DEL" className="px-6 py-2 text-xs" active={focusedId === 'BACKSPACE'} progress={focusedId === 'BACKSPACE' ? dwellProgress : 0} locked={lockInId === 'BACKSPACE'} />
               </div>
             </div>

             <div className="flex-1 grid grid-cols-10 gap-3">
                {ALPHABET.map((letter, i) => (
                  <HeroButton 
                    key={letter} id={letter} label={letter}
                    className="hex-btn text-xl font-bold"
                    active={focusedId === letter} progress={focusedId === letter ? dwellProgress : 0}
                    locked={lockInId === letter}
                  />
                ))}
             </div>

             <div className="grid grid-cols-7 gap-2 h-16">
               {QUICK_WORDS.map(word => (
                 <HeroButton 
                    key={word} id={word} label={word}
                    className="hex-btn text-[10px] font-black"
                    active={focusedId === word} progress={focusedId === word ? dwellProgress : 0}
                    locked={lockInId === word}
                 />
               ))}
             </div>
          </div>
        </div>

        {/* RIGHT COLUMN: MAGGIE AI */}
        <div className="w-1/4 flex flex-col gap-6">
          <div className="flex-1 hud-panel rounded-lg overflow-hidden flex flex-col items-center p-6 relative">
             <div className="tl corner-acc"></div><div className="tr corner-acc"></div>
             <div className="bl corner-acc"></div><div className="br corner-acc"></div>
             
             <div className="w-48 h-48 rounded-full border-4 border-[var(--cyan)]/30 maggie-glow mb-6 relative overflow-hidden flex items-center justify-center bg-[var(--cyan)]/10 shadow-[0_0_50px_var(--cyan)]/20">
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--cyan)]/20 to-transparent"></div>
                <div className="w-32 h-40 bg-[var(--txt)]/10 rounded-t-full relative">
                   <div className="absolute top-8 left-4 w-4 h-4 bg-[var(--txt)] rounded-full animate-pulse shadow-[0_0_15px_#fff]"></div>
                   <div className="absolute top-8 right-4 w-4 h-4 bg-[var(--txt)] rounded-full animate-pulse shadow-[0_0_15px_#fff]"></div>
                   <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-8 h-1 bg-[var(--cyan-2)] rounded-full"></div>
                </div>
             </div>

             <div className="text-hud text-xl font-black text-[var(--txt)] mb-1">MAGGIE.AI</div>
             <div className="text-[10px] font-bold text-[var(--amber)] mb-8 uppercase tracking-widest">{status}</div>

             <div className="w-full bg-[var(--cyan)]/5 border border-[var(--stroke)] p-6 rounded-2xl relative shadow-inner">
                <div className="absolute -top-3 left-4 bg-[var(--bg-0)] px-2 text-[8px] text-[var(--cyan)] font-bold">MISSION_COMMS</div>
                <p className="text-[var(--txt)] text-sm font-bold leading-relaxed italic opacity-90">
                  "{maggieMsg}"
                </p>
             </div>
          </div>
        </div>
      </div>

      {/* FOOTER BAR */}
      <div className="h-8 flex justify-between items-center text-[8px] font-black text-[var(--muted)]/50 border-t border-[var(--stroke)]">
        <div className="flex gap-4">
          <span>OASIS_MODULE: EyeSpeak_1</span>
          <span>PILOT_ID: AUTHENTICATED</span>
        </div>
        <div className="flex gap-2 items-center">
          <div className="w-2 h-2 rounded-full bg-[var(--ok)]"></div>
          <span>NEURAL_LINK_STABLE</span>
        </div>
      </div>
    </div>
  );
};

const HeroButton = ({ id, label, icon, className = "", active, progress, locked }: any) => {
  const glow = 0.15 + progress * 0.85;
  const scale = 1 + progress * 0.08;
  const charging = active && progress > 0 && progress < 1;

  return (
    <div 
      data-gaze-id={id}
      className={`hex-btn ${className} ${locked ? 'lock-in' : ''}`}
      style={{
        transform: `scale(${locked ? 1.15 : scale})`,
        borderColor: locked ? 'var(--amber)' : `rgba(40, 231, 255, ${0.25 + 0.45 * progress})`,
        boxShadow: locked 
          ? `0 0 50px var(--amber)` 
          : `0 0 ${24 * glow}px rgba(40, 231, 255, ${0.25 + 0.55 * progress})`,
        transition: locked ? "all 0.1s" : "transform 0.1s, box-shadow 0.1s, border-color 0.1s"
      }}
    >
      <div className="hex-btn-inner"></div>
      
      {/* Energy Orbit Particles */}
      {charging && (
        <>
          <div className="energy-particle" style={{ animation: `orbit ${1.5 - progress}s linear infinite` }}></div>
          <div className="energy-particle" style={{ animation: `orbit ${1.8 - progress}s linear infinite reverse`, opacity: 0.5 }}></div>
        </>
      )}

      {/* Fill Energy From Bottom */}
      {active && !locked && (
        <div 
          className="absolute inset-0 bg-[var(--cyan)]/10 z-0 transition-all ease-linear"
          style={{ height: `${progress * 100}%`, top: 'auto', bottom: 0 }}
        ></div>
      )}

      {/* Content */}
      <div className="relative z-20 flex flex-col items-center gap-1">
        {icon && <span className="text-2xl drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">{icon}</span>}
        <span className={`${active ? 'text-[var(--amber)] font-black' : 'text-[var(--txt)]'} transition-colors duration-200 tracking-tighter`}>
          {label}
        </span>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);