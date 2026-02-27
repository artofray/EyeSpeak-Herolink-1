// =============================================
// useMaggieSession — Gemini Live Audio session
// =============================================

import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { encodePCM, decodePCM, pcmToAudioBuffer, playLockChime } from '../utils/audioHelpers';
import type { TrackerStatus, UserSettings } from '../types';
import { DEFAULT_SETTINGS } from '../constants';

export function useMaggieSession(settings: UserSettings = DEFAULT_SETTINGS) {
    const [isActive, setIsActive] = useState(false);
    const [status, setStatus] = useState('READY TO HELP!');
    const [maggieMsg, setMaggieMsg] = useState(
        'Welcome back, Pilot! Core link stable. Ready for mission briefing?'
    );

    const sessionRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    const getAudioContext = useCallback((): AudioContext | null => {
        return audioContextRef.current;
    }, []);

    const startSession = useCallback(async (
        videoElement: HTMLVideoElement,
        poseProcessor: any,
        faceProcessor: any
    ) => {
        if (isActive) return;

        try {
            setStatus('INITIALIZING...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: { width: 640, height: 480 },
            });

            videoElement.srcObject = stream;

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            const inputCtx = new AudioCtx({ sampleRate: 16000 });
            const outputCtx = new AudioCtx({ sampleRate: 24000 });
            inputAudioContextRef.current = inputCtx;
            audioContextRef.current = outputCtx;

            // Start camera loop for pose + face tracking
            const camera = new (window as any).Camera(videoElement, {
                onFrame: async () => {
                    if (videoElement) {
                        if (poseProcessor) await poseProcessor.send({ image: videoElement });
                        if (faceProcessor) await faceProcessor.send({ image: videoElement });
                    }
                },
                width: 640,
                height: 480,
            });
            camera.start();

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                callbacks: {
                    onopen: () => {
                        setIsActive(true);
                        setStatus('CORE LINK OK');

                        // Stream microphone audio to Maggie
                        const source = inputCtx.createMediaStreamSource(stream);
                        const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
                        scriptProcessor.onaudioprocess = (e) => {
                            const inputData = e.inputBuffer.getChannelData(0);
                            const int16 = new Int16Array(inputData.length);
                            for (let i = 0; i < inputData.length; i++) {
                                int16[i] = inputData[i] * 32768;
                            }
                            const pcmBlob = {
                                data: encodePCM(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputCtx.destination);
                    },

                    onmessage: async (msg: any) => {
                        // Handle transcription
                        if (msg.serverContent?.outputTranscription) {
                            setMaggieMsg(msg.serverContent.outputTranscription.text);
                        }

                        // Handle audio output
                        const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audio && audioContextRef.current) {
                            const ctx = audioContextRef.current;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                            const buf = await pcmToAudioBuffer(decodePCM(audio), ctx, 24000, 1);
                            const src = ctx.createBufferSource();
                            src.buffer = buf;
                            src.connect(ctx.destination);
                            src.addEventListener('ended', () => sourcesRef.current.delete(src));
                            src.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += buf.duration;
                            sourcesRef.current.add(src);
                        }

                        // Handle interruptions
                        if (msg.serverContent?.interrupted) {
                            sourcesRef.current.forEach(s => s.stop());
                            sourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                        }
                    },

                    onclose: () => {
                        setIsActive(false);
                        setStatus('LINK CLOSED');
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: `You are MAGGIE.AI, the Mission Assistant for EyeSpeak Herolink.
          The user is "Pilot" — a non-verbal child learning to communicate.
          Persona: Friendly, warm superhero mission commander.
          Keep responses SHORT (1-2 sentences). Be encouraging.
          Use context from pilot movements/selections to encourage communication.
          Celebrate every letter and word as a mission success.
          Never be condescending. Treat the Pilot as capable and heroic.`,
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: settings.maggieVoice },
                        },
                    },
                },
            });

            sessionRef.current = await sessionPromise;
        } catch (err) {
            console.error('MAGGIE SESSION ERROR:', err);
            setStatus('LINK_ERROR');
        }
    }, [isActive, settings]);

    const sendContext = useCallback(async (
        selection: string,
        currentWord: string,
        trackers: TrackerStatus
    ) => {
        if (!sessionRef.current) return;

        const contextPayload = {
            selection,
            currentWord,
            pose: trackers,
            timestamp: new Date().toISOString(),
        };

        try {
            sessionRef.current.sendRealtimeInput({
                text: `[PILOT_SYSTEM_DATA] ${JSON.stringify(contextPayload)}. Provide a brief, supportive response.`,
            });
        } catch (err) {
            console.error('Context send error:', err);
        }
    }, []);

    const speakAsChild = useCallback(async (text: string) => {
        if (!text.trim()) return;

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-preview-tts',
                contents: [{ parts: [{ text }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: settings.voiceName },
                        },
                    },
                },
            });

            const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (audioData && audioContextRef.current) {
                const ctx = audioContextRef.current;
                const buf = await pcmToAudioBuffer(decodePCM(audioData), ctx, 24000, 1);
                const src = ctx.createBufferSource();
                src.buffer = buf;
                src.connect(ctx.destination);
                src.start();
            }
        } catch (err) {
            console.error('TTS error:', err);
        }
    }, [settings]);

    const cleanup = useCallback(() => {
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }
        sourcesRef.current.forEach(s => { try { s.stop(); } catch { } });
        sourcesRef.current.clear();
    }, []);

    return {
        isActive,
        status,
        maggieMsg,
        startSession,
        sendContext,
        speakAsChild,
        getAudioContext,
        cleanup,
    };
}
