// =============================================
// EyeSpeak Herolink 1 — Main App
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ALPHABET, EMOTIONS, QUICK_WORDS, TRACKER_LIST, DEFAULT_SETTINGS } from './constants';
import { useGazeTracking } from './hooks/useGazeTracking';
import { usePoseTracking } from './hooks/usePoseTracking';
import { useDwell } from './hooks/useDwell';
import { useMaggieSession } from './hooks/useMaggieSession';
import { playDwellTick, playLockChime } from './utils/audioHelpers';
import { saveSessionHistory } from './utils/wordPrediction';
import HeroButton from './components/HeroButton';
import GazeReticle from './components/GazeReticle';
import WordPrediction from './components/WordPrediction';
import CalibrationScreen from './components/CalibrationScreen';
import CaregiverChat from './components/CaregiverChat';
import HelpMenu from './components/HelpMenu';

const App = () => {
    // --- UI state ---
    const [currentWord, setCurrentWord] = useState('');
    const [showChat, setShowChat] = useState(false);
    const [showHelpMenu, setShowHelpMenu] = useState(false);
    const [showCalibration, setShowCalibration] = useState(false);
    const [settings] = useState(DEFAULT_SETTINGS);

    // --- Video ref ---
    const videoRef = useRef<HTMLVideoElement>(null);

    // --- Hooks ---
    const gaze = useGazeTracking(settings);
    const pose = usePoseTracking();
    const maggie = useMaggieSession(settings);

    // Check if calibration exists on mount
    useEffect(() => {
        const hasCalibration = localStorage.getItem('eyespeak_calibration');
        if (!hasCalibration) {
            setShowCalibration(true);
        }
    }, []);

    // --- Selection handler ---
    const handleSelection = useCallback((id: string) => {
        // Audio feedback
        const audioCtx = maggie.getAudioContext();
        if (audioCtx) playLockChime(audioCtx);

        // Haptic feedback (mobile/tablet)
        if (navigator.vibrate) navigator.vibrate(50);

        if (id === 'BACKSPACE') {
            setCurrentWord(prev => prev.slice(0, -1));
        } else if (id === 'SPACE') {
            setCurrentWord(prev => prev + ' ');
        } else if (id === 'CLEAR') {
            setCurrentWord('');
        } else if (id === 'START_WITH_MAGGIE') {
            if (videoRef.current) {
                maggie.startSession(videoRef.current, pose.poseRef.current, gaze.faceMeshRef.current);
            }
        } else if (id === 'CAREGIVER_CHAT') {
            setShowChat(prev => !prev);
        } else if (id === 'SEND_CHAT') {
            // Handled by CaregiverChat component
        } else if (id === 'CALIBRATE') {
            setShowCalibration(true);
        } else if (id === 'HELP') {
            setShowHelpMenu(true);
            maggie.speakAsChild('I need help.');
            saveSessionHistory([{ word: 'HELP', timestamp: Date.now(), type: 'help' }]);
        } else if (id === 'CLOSE_HELP') {
            setShowHelpMenu(false);
        } else if (id.startsWith('HELP_')) {
            const helpText: Record<string, string> = {
                'HELP_TOUCH': 'Someone is touching me inappropriately.',
                'HELP_HURT': 'I am hurt.',
                'HELP_SICK': 'I feel sick.',
                'HELP_LOST': 'I am lost.',
            };
            maggie.speakAsChild(helpText[id] || 'I need help.');
            setShowHelpMenu(false);
            saveSessionHistory([{ word: id, timestamp: Date.now(), type: 'help' }]);
        } else if (id.startsWith('PREDICT_')) {
            const word = id.replace('PREDICT_', '');
            maggie.speakAsChild(word);
            maggie.sendContext(word, word, pose.trackers);
            setCurrentWord('');
            saveSessionHistory([{ word, timestamp: Date.now(), type: 'word' }]);
        } else if (id.length === 1) {
            // Single letter
            setCurrentWord(prev => prev + id);
            maggie.speakAsChild(id);
            maggie.sendContext(id, currentWord + id, pose.trackers);
            saveSessionHistory([{ word: id, timestamp: Date.now(), type: 'letter' }]);
        } else {
            // Quick word or emotion
            maggie.speakAsChild(id);
            maggie.sendContext(id, id, pose.trackers);
            setCurrentWord('');
            saveSessionHistory([{ word: id, timestamp: Date.now(), type: 'word' }]);
        }
    }, [maggie, pose, gaze, currentWord]);

    // --- Dwell hook (needs handleSelection) ---
    const dwell = useDwell(handleSelection, settings.dwellTime, gaze.isBlinking);

    // --- Manual click handler ---
    useEffect(() => {
        const handleManualClick = (e: any) => handleSelection(e.detail.id);
        window.addEventListener('manualSelection', handleManualClick);
        return () => window.removeEventListener('manualSelection', handleManualClick);
    }, [handleSelection]);

    // --- Gaze → dwell bridge ---
    useEffect(() => {
        dwell.checkDwell(gaze.gazePoint.x, gaze.gazePoint.y);
    }, [gaze.gazePoint]);

    // --- Dwell audio feedback ---
    const lastTickRef = useRef(0);
    useEffect(() => {
        if (dwell.dwellProgress > 0.1 && dwell.dwellProgress < 1) {
            const now = Date.now();
            if (now - lastTickRef.current > 150) {
                const audioCtx = maggie.getAudioContext();
                if (audioCtx) playDwellTick(audioCtx, dwell.dwellProgress);
                lastTickRef.current = now;
            }
        }
    }, [dwell.dwellProgress, maggie]);

    // --- Init tracking on mount ---
    useEffect(() => {
        gaze.initFaceMesh();
        pose.initPose();
        return () => maggie.cleanup();
    }, []);

    // --- Calibration ---
    if (showCalibration) {
        return (
            <CalibrationScreen
                gazePoint={gaze.gazePoint}
                onComplete={(data) => {
                    gaze.saveCalibration(data);
                    setShowCalibration(false);
                }}
                onSkip={() => setShowCalibration(false)}
            />
        );
    }

    return (
        <div className="h-screen w-screen p-6 flex flex-col gap-6 relative select-none">
            <div className="scanline-overlay" />
            <GazeReticle gazePoint={gaze.gazePoint} isBlinking={gaze.isBlinking} />

            {/* ---- HEADER ---- */}
            <div className="flex justify-between items-center h-16 relative px-4">
                <div className="text-4xl text-hud font-black text-white drop-shadow-[0_0_15px_var(--cyan)]">
                    EYESPEAK <span className="text-[var(--amber)]">HEROLINK 1</span>
                </div>
                <div className="flex gap-4">
                    <HeroButton
                        id="CALIBRATE"
                        label="CALIBRATE"
                        className="px-6 py-2 text-[10px]"
                        active={dwell.focusedId === 'CALIBRATE'}
                        progress={dwell.focusedId === 'CALIBRATE' ? dwell.dwellProgress : 0}
                    />
                    <HeroButton
                        id="CAREGIVER_CHAT"
                        label={showChat ? 'CLOSE CONSOLE' : 'CAREGIVER CONSOLE'}
                        className="px-6 py-2 text-[10px]"
                        active={dwell.focusedId === 'CAREGIVER_CHAT'}
                        progress={dwell.focusedId === 'CAREGIVER_CHAT' ? dwell.dwellProgress : 0}
                    />
                </div>
                <div className="absolute left-0 bottom-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[var(--cyan)] to-transparent opacity-50" />
            </div>

            {/* ---- MAIN CONTENT ---- */}
            <div className="flex-1 flex gap-6 overflow-hidden">

                {/* LEFT COLUMN: Tracking + Status */}
                <div className="w-1/4 flex flex-col gap-6">
                    <div className="flex-1 hud-panel rounded-lg overflow-hidden flex flex-col">
                        <div className="bg-[var(--cyan)]/10 px-4 py-1 text-[10px] font-bold border-b border-[var(--stroke)] flex justify-between items-center text-[var(--cyan)]">
                            <span>LIVE_TRACKING</span>
                            <div className="flex gap-1">
                                <div className="w-1 h-1 bg-[var(--cyan)] rounded-full animate-pulse" />
                                <div className="w-1 h-1 bg-[var(--cyan)] rounded-full animate-pulse" style={{ animationDelay: '100ms' }} />
                            </div>
                        </div>
                        <div className="flex-1 relative bg-black/50">
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover opacity-40 grayscale contrast-150" />
                            <canvas ref={pose.poseCanvasRef} width="640" height="480" className="absolute inset-0 w-full h-full scale-x-[-1]" />
                            <canvas ref={gaze.canvasRef} width="640" height="480" className="absolute inset-0 w-full h-full scale-x-[-1]" />
                            {!maggie.isActive && (
                                <div className="absolute inset-0 flex items-center justify-center p-4">
                                    <HeroButton
                                        id="START_WITH_MAGGIE"
                                        label="START MISSION"
                                        className="w-full py-6 text-sm"
                                        active={dwell.focusedId === 'START_WITH_MAGGIE'}
                                        progress={dwell.focusedId === 'START_WITH_MAGGIE' ? dwell.dwellProgress : 0}
                                    />
                                </div>
                            )}
                            {/* Blink indicator */}
                            {gaze.isBlinking && (
                                <div className="absolute top-2 right-2 bg-[var(--amber)]/80 text-[8px] font-bold px-2 py-1 rounded text-black">
                                    BLINK
                                </div>
                            )}
                            {/* Face detection indicator */}
                            {!gaze.isFaceDetected && maggie.isActive && (
                                <div className="absolute bottom-2 left-2 bg-[var(--bad)]/80 text-[8px] font-bold px-2 py-1 rounded text-white animate-pulse">
                                    NO FACE DETECTED
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tracker Status */}
                    <div className="hud-panel rounded-lg p-6 flex flex-col gap-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-hud text-xs text-[var(--amber)]">TRACKER STATUS</span>
                            <div className="w-3 h-3 border border-[var(--cyan)] rotate-45" />
                        </div>
                        {TRACKER_LIST.map(t => (
                            <div key={t.id} className="flex items-center justify-between text-[10px] font-bold">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-sm ${(pose.trackers as any)[t.id] ? 'bg-[var(--ok)] animate-pulse' : 'bg-[var(--bad)]'}`} />
                                    <span className="text-[var(--txt)]">{t.label}</span>
                                </div>
                                <span className={(pose.trackers as any)[t.id] ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}>
                                    {(pose.trackers as any)[t.id] ? 'CONNECTED' : 'OFFLINE'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* MIDDLE COLUMN: Communication Hub */}
                <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                    {/* Emotion bar */}
                    <div className="grid grid-cols-5 gap-4 h-28">
                        {EMOTIONS.map(e => (
                            <HeroButton
                                key={e.id} id={e.id} label={e.label} icon={e.icon}
                                className="hex-btn flex-col"
                                active={dwell.focusedId === e.id}
                                progress={dwell.focusedId === e.id ? dwell.dwellProgress : 0}
                                locked={dwell.lockInId === e.id}
                            />
                        ))}
                    </div>

                    {/* Main panel */}
                    <div className="flex-1 hud-panel rounded-xl p-8 flex flex-col gap-6 relative overflow-hidden">
                        {showChat && (
                            <CaregiverChat
                                onClose={() => setShowChat(false)}
                                focusedId={dwell.focusedId}
                                dwellProgress={dwell.dwellProgress}
                            />
                        )}

                        {showHelpMenu && (
                            <HelpMenu
                                onClose={() => setShowHelpMenu(false)}
                                focusedId={dwell.focusedId}
                                dwellProgress={dwell.dwellProgress}
                                lockInId={dwell.lockInId}
                            />
                        )}

                        {/* Word input bar */}
                        <div className="relative h-20 bg-[var(--cyan)]/5 border border-[var(--stroke)] rounded-lg flex items-center px-8">
                            <div className="absolute -top-3 left-4 bg-[var(--bg-0)] px-2 text-[10px] text-[var(--cyan)] font-bold">
                                TRANSMISSION_INPUT:. \
                            </div>
                            <div className="text-4xl font-black tracking-widest text-[var(--txt)] drop-shadow-[0_0_15px_var(--cyan)] uppercase">
                                {currentWord || <span className="text-[var(--bg-1)] animate-pulse">_</span>}
                            </div>
                            <div className="ml-auto flex gap-4">
                                <HeroButton
                                    id="BACKSPACE" label="DEL" className="px-6 py-2 text-xs"
                                    active={dwell.focusedId === 'BACKSPACE'}
                                    progress={dwell.focusedId === 'BACKSPACE' ? dwell.dwellProgress : 0}
                                    locked={dwell.lockInId === 'BACKSPACE'}
                                />
                            </div>
                        </div>

                        {/* Word predictions */}
                        <WordPrediction
                            currentWord={currentWord}
                            focusedId={dwell.focusedId}
                            dwellProgress={dwell.dwellProgress}
                            lockInId={dwell.lockInId}
                        />

                        {/* Alphabet grid */}
                        <div className="flex-1 grid grid-cols-10 gap-3">
                            {ALPHABET.map(letter => (
                                <HeroButton
                                    key={letter} id={letter} label={letter}
                                    className="hex-btn text-xl font-bold"
                                    active={dwell.focusedId === letter}
                                    progress={dwell.focusedId === letter ? dwell.dwellProgress : 0}
                                    locked={dwell.lockInId === letter}
                                />
                            ))}
                        </div>

                        {/* Quick words */}
                        <div className="grid grid-cols-7 gap-2 h-16">
                            {QUICK_WORDS.map(word => (
                                <HeroButton
                                    key={word} id={word} label={word}
                                    className="hex-btn text-[10px] font-black"
                                    active={dwell.focusedId === word}
                                    progress={dwell.focusedId === word ? dwell.dwellProgress : 0}
                                    locked={dwell.lockInId === word}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Maggie AI */}
                <div className="w-1/4 flex flex-col gap-6">
                    <div className="flex-1 hud-panel rounded-lg overflow-hidden flex flex-col items-center p-6 relative">
                        {/* Maggie avatar */}
                        <div className="w-48 h-48 rounded-full border-4 border-[var(--cyan)]/30 mb-6 relative overflow-hidden flex items-center justify-center bg-[var(--cyan)]/10 shadow-[0_0_50px_var(--cyan)]/20">
                            <div className="absolute inset-0 bg-gradient-to-t from-[var(--cyan)]/20 to-transparent" />
                            <div className="w-32 h-40 bg-[var(--txt)]/10 rounded-t-full relative">
                                <div className="absolute top-8 left-4 w-4 h-4 bg-[var(--txt)] rounded-full animate-pulse shadow-[0_0_15px_#fff]" />
                                <div className="absolute top-8 right-4 w-4 h-4 bg-[var(--txt)] rounded-full animate-pulse shadow-[0_0_15px_#fff]" />
                                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-8 h-1 bg-[var(--cyan-2)] rounded-full" />
                            </div>
                        </div>

                        <div className="text-hud text-xl font-black text-[var(--txt)] mb-1">MAGGIE.AI</div>
                        <div className="text-[10px] font-bold text-[var(--amber)] mb-8 uppercase tracking-widest">
                            {maggie.status}
                        </div>

                        {/* Comms panel */}
                        <div className="w-full bg-[var(--cyan)]/5 border border-[var(--stroke)] p-6 rounded-2xl relative shadow-inner flex-1 flex flex-col">
                            <div className="absolute -top-3 left-4 bg-[var(--bg-0)] px-2 text-[8px] text-[var(--cyan)] font-bold">
                                MISSION_COMMS_LIVE
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                <p className="text-[var(--txt)] text-sm font-bold leading-relaxed italic opacity-90">
                                    "{maggie.maggieMsg}"
                                </p>
                            </div>
                            <div className="mt-4 pt-4 border-t border-[var(--stroke)] flex gap-2 items-center">
                                <div className={`w-2 h-2 rounded-full ${maggie.isActive ? 'bg-[var(--ok)] animate-ping' : 'bg-[var(--bad)]'}`} />
                                <span className="text-[8px] font-bold text-[var(--muted)]">
                                    {maggie.isActive ? 'MIC_ACTIVE' : 'MIC_IDLE'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ---- FOOTER ---- */}
            <div className="h-8 flex justify-between items-center text-[8px] font-black text-[var(--muted)]/50 border-t border-[var(--stroke)]">
                <div className="flex gap-4">
                    <span>OASIS_MODULE: EyeSpeak_1</span>
                    <span>PILOT_ID: AUTHENTICATED</span>
                </div>
                <div className="flex gap-2 items-center">
                    <div className="w-2 h-2 rounded-full bg-[var(--ok)]" />
                    <span>NEURAL_LINK_STABLE</span>
                </div>
            </div>
        </div>
    );
};

export default App;
