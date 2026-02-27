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

const HELP_OPTIONS = [
  { id: 'HELP_TOUCH', label: 'BAD TOUCH', icon: '🛑' },
  { id: 'HELP_HURT', label: 'I AM HURT', icon: '🩹' },
  { id: 'HELP_SICK', label: 'I FEEL SICK', icon: '🤢' },
  { id: 'HELP_LOST', label: 'I AM LOST', icon: '🗺️' },
];

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

  // Caregiver Chat State
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [isChatThinking, setIsChatThinking] = useState(false);

  // Help Menu State
  const [showHelpMenu, setShowHelpMenu] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const smoothedGazeRef = useRef({ x: 0.5, y: 0.5 });
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sessionRef = useRef<any>(null);
  const poseRef = useRef<any>(null);
  const faceMeshRef = useRef<any>(null);
  const dwellStartTimeRef = useRef<number | null>(null);
  const lastSelectedIdRef = useRef<string | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

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
    return () => {
      if (sessionRef.current) sessionRef.current.close();
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
      
      // Head tracking (Nose tip)
      const noseTip = landmarks[1];
      const headX = 1.0 - (noseTip.x - 0.5) * 2.5 + 0.5; 
      const headY = (noseTip.y - 0.5) * 2.5 + 0.5;

      // Eye tracking (Iris)
      let gazeOffsetX = 0;
      let gazeOffsetY = 0;

      if (landmarks.length > 468) {
        const getEyeBoundingBox = (indices: number[]) => {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const idx of indices) {
            const p = landmarks[idx];
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
        };

        const leftEyeBox = getEyeBoundingBox([33, 133, 159, 145]);
        const rightEyeBox = getEyeBoundingBox([362, 263, 386, 374]);
        const leftIris = landmarks[468];
        const rightIris = landmarks[473];

        const leftGazeX = 1.0 - (leftIris.x - leftEyeBox.minX) / leftEyeBox.width;
        const leftGazeY = (leftIris.y - leftEyeBox.minY) / leftEyeBox.height;
        const rightGazeX = 1.0 - (rightIris.x - rightEyeBox.minX) / rightEyeBox.width;
        const rightGazeY = (rightIris.y - rightEyeBox.minY) / rightEyeBox.height;

        const avgGazeX = (leftGazeX + rightGazeX) / 2;
        const avgGazeY = (leftGazeY + rightGazeY) / 2;

        gazeOffsetX = (avgGazeX - 0.5) * 3.5;
        gazeOffsetY = (avgGazeY - 0.5) * 3.5;

        // Draw eyes on canvas for visual feedback
        if (faceCanvasRef.current) {
          const ctx = faceCanvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, faceCanvasRef.current.width, faceCanvasRef.current.height);
            ctx.fillStyle = '#FFB020';
            ctx.beginPath();
            ctx.arc(leftIris.x * faceCanvasRef.current.width, leftIris.y * faceCanvasRef.current.height, 3, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(rightIris.x * faceCanvasRef.current.width, rightIris.y * faceCanvasRef.current.height, 3, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      } else if (faceCanvasRef.current) {
        const ctx = faceCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, faceCanvasRef.current.width, faceCanvasRef.current.height);
      }

      let targetX = headX + gazeOffsetX;
      let targetY = headY + gazeOffsetY;

      targetX = Math.max(0, Math.min(1, targetX));
      targetY = Math.max(0, Math.min(1, targetY));

      // Smoothing
      const smoothingFactor = 0.15;
      const smoothedX = smoothedGazeRef.current.x + (targetX - smoothedGazeRef.current.x) * smoothingFactor;
      const smoothedY = smoothedGazeRef.current.y + (targetY - smoothedGazeRef.current.y) * smoothingFactor;
      
      smoothedGazeRef.current = { x: smoothedX, y: smoothedY };

      setGazePoint({ x: smoothedX, y: smoothedY });
      checkDwell(smoothedX, smoothedY);
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
    else if (id === 'CAREGIVER_CHAT') setShowChat(prev => !prev);
    else if (id === 'SEND_CHAT') handleCaregiverChat();
    else if (id === 'HELP') {
      setShowHelpMenu(true);
      speakChildsVoice("I need help.");
    }
    else if (id === 'CLOSE_HELP') {
      setShowHelpMenu(false);
    }
    else if (id === 'HELP_TOUCH') {
      speakChildsVoice("Someone is touching me inappropriately.");
      setShowHelpMenu(false);
    }
    else if (id === 'HELP_HURT') {
      speakChildsVoice("I am hurt.");
      setShowHelpMenu(false);
    }
    else if (id === 'HELP_SICK') {
      speakChildsVoice("I feel sick.");
      setShowHelpMenu(false);
    }
    else if (id === 'HELP_LOST') {
      speakChildsVoice("I am lost.");
      setShowHelpMenu(false);
    }
    else if (id.length === 1) {
      setCurrentWord(prev => prev + id);
      speakChildsVoice(id);
    } else {
      speakChildsVoice(id);
      setCurrentWord(""); 
    }
  };

  const handleSelectionRef = useRef(handleSelection);
  useEffect(() => {
    handleSelectionRef.current = handleSelection;
  });

  useEffect(() => {
    const handleManualSelection = (e: any) => {
      handleSelectionRef.current(e.detail.id);
    };
    window.addEventListener('manualSelection', handleManualSelection);
    return () => {
      window.removeEventListener('manualSelection', handleManualSelection);
    };
  }, []);

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
      inputAudioContextRef.current = inputCtx;
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
          onopen: () => {
            setIsActive(true); 
            setStatus('CORE LINK OK');
            // Stream audio from mic to Maggie
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.outputTranscription) setMaggieMsg(msg.serverContent.outputTranscription.text);
            
            const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buf = await decodeAudioData(decode(audio), ctx, 24000, 1);
              const src = ctx.createBufferSource(); 
              src.buffer = buf; 
              src.connect(ctx.destination);
              src.addEventListener('ended', () => sourcesRef.current.delete(src));
              src.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buf.duration;
              sourcesRef.current.add(src);
            }

            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => { setIsActive(false); setStatus('LINK CLOSED'); }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are MAGGIE.AI, the Mission Assistant. Real-time audio interaction enabled.
          User is "Pilot" (non-verbal autistic child). Persona: Friendly, warm, superhero mission commander.
          Use context from pilot movements/selections to encourage communication and body awareness.`,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) { setStatus('LINK_ERROR'); }
  };

  const handleCaregiverChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || isChatThinking) return;

    const userMsg = chatInput;
    setChatInput("");
    setChatHistory(prev => [...prev, {role: 'user', text: userMsg}]);
    setIsChatThinking(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: [...chatHistory, {role: 'user', text: userMsg}].map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{text: h.text}]
        })),
        config: {
          systemInstruction: "You are the Caregiver Assistance AI for EyeSpeak Herolink. Provide expert advice on autism communication, body awareness training, and mission data analysis. Be empathetic and professional.",
          thinkingConfig: { thinkingBudget: 4000 }
        }
      });
      setChatHistory(prev => [...prev, {role: 'ai', text: response.text || "No response received."}]);
    } catch (err) {
      setChatHistory(prev => [...prev, {role: 'ai', text: "ERROR: Failed to connect to mission intelligence."}]);
    } finally {
      setIsChatThinking(false);
    }
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
      <div className="flex justify-between items-center h-16 relative px-4">
         <div className="text-4xl text-hud font-black text-white drop-shadow-[0_0_15px_var(--cyan)]">
           EYESPEAK <span className="text-[var(--amber)]">HEROLINK 1</span>
         </div>
         <div className="flex gap-4">
            <HeroButton id="CAREGIVER_CHAT" label={showChat ? "CLOSE CONSOLE" : "CAREGIVER CONSOLE"} className="px-6 py-2 text-[10px]" active={focusedId === 'CAREGIVER_CHAT'} progress={focusedId === 'CAREGIVER_CHAT' ? dwellProgress : 0} />
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
              <canvas ref={faceCanvasRef} width="640" height="480" className="absolute inset-0 w-full h-full scale-x-[-1]" />
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

          <div className="flex-1 hud-panel rounded-xl p-8 flex flex-col gap-6 relative overflow-hidden">
             
             {/* Caregiver Chat Overlay */}
             {showChat && (
               <div className="absolute inset-0 z-50 bg-[var(--bg-0)] p-8 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
                 <div className="flex justify-between items-center border-b border-[var(--stroke)] pb-4">
                   <h3 className="text-hud text-[var(--cyan)] font-black">CAREGIVER INTELLIGENCE CONSOLE</h3>
                   <button onClick={() => setShowChat(false)} className="text-[var(--bad)] font-bold">X</button>
                 </div>
                 <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    {chatHistory.length === 0 && <p className="text-[var(--muted)] text-xs italic">Awaiting caregiver input for mission analysis...</p>}
                    {chatHistory.map((h, i) => (
                      <div key={i} className={`flex flex-col ${h.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg text-xs font-bold ${h.role === 'user' ? 'bg-[var(--cyan)]/10 text-[var(--cyan)] border border-[var(--cyan)]/30' : 'bg-[var(--amber)]/10 text-[var(--amber)] border border-[var(--amber)]/30'}`}>
                          {h.text}
                        </div>
                      </div>
                    ))}
                    {isChatThinking && <div className="flex gap-2 items-center text-[var(--amber)] text-[10px] animate-pulse">THINKING...</div>}
                 </div>
                 <form onSubmit={handleCaregiverChat} className="flex gap-2">
                   <input 
                    type="text" 
                    value={chatInput} 
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Ask mission intelligence for advice..."
                    className="flex-1 bg-[var(--bg-1)] border border-[var(--stroke)] p-4 rounded text-[var(--txt)] text-xs focus:outline-none focus:border-[var(--cyan)]"
                   />
                   <HeroButton id="SEND_CHAT" label="TRANSMIT" className="px-8 py-2 text-[10px]" active={focusedId === 'SEND_CHAT'} progress={focusedId === 'SEND_CHAT' ? dwellProgress : 0} />
                 </form>
               </div>
             )}

             {/* Help Menu Overlay */}
             {showHelpMenu && (
               <div className="absolute inset-0 z-40 bg-[var(--bg-0)] p-8 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
                 <div className="flex justify-between items-center border-b border-[var(--stroke)] pb-4">
                   <h3 className="text-hud text-[var(--bad)] font-black text-2xl">EMERGENCY HELP</h3>
                   <HeroButton id="CLOSE_HELP" label="CLOSE" className="px-6 py-2 text-[10px]" active={focusedId === 'CLOSE_HELP'} progress={focusedId === 'CLOSE_HELP' ? dwellProgress : 0} />
                 </div>
                 <div className="flex-1 grid grid-cols-2 gap-6 mt-4">
                   {HELP_OPTIONS.map(opt => (
                     <HeroButton 
                       key={opt.id} id={opt.id} label={opt.label} icon={opt.icon}
                       className="hex-btn flex-col text-2xl font-black bg-[var(--bad)]/10 border-[var(--bad)]"
                       active={focusedId === opt.id} progress={focusedId === opt.id ? dwellProgress : 0}
                       locked={lockInId === opt.id}
                     />
                   ))}
                 </div>
               </div>
             )}

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

             <div className="w-full bg-[var(--cyan)]/5 border border-[var(--stroke)] p-6 rounded-2xl relative shadow-inner flex-1 flex flex-col">
                <div className="absolute -top-3 left-4 bg-[var(--bg-0)] px-2 text-[8px] text-[var(--cyan)] font-bold">MISSION_COMMS_LIVE</div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <p className="text-[var(--txt)] text-sm font-bold leading-relaxed italic opacity-90">
                    "{maggieMsg}"
                  </p>
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--stroke)] flex gap-2 items-center">
                   <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-[var(--ok)] animate-ping' : 'bg-[var(--bad)]'}`}></div>
                   <span className="text-[8px] font-bold text-[var(--muted)]">{isActive ? 'MIC_ACTIVE' : 'MIC_IDLE'}</span>
                </div>
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
      className={`hex-btn ${className} ${locked ? 'lock-in' : ''} cursor-pointer`}
      onClick={(e) => {
         // Manual click support
         const target = e.currentTarget.closest('[data-gaze-id]');
         if (target) {
            const clickEvt = new CustomEvent('manualSelection', { detail: { id } });
            window.dispatchEvent(clickEvt);
         }
      }}
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