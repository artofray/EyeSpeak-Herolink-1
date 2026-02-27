// =============================================
// CalibrationScreen — 5-point gaze calibration
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CalibrationData, GazePoint } from '../types';

interface CalibrationScreenProps {
    gazePoint: GazePoint;
    onComplete: (data: CalibrationData) => void;
    onSkip: () => void;
}

const CALIBRATION_POINTS = [
    { x: 0.5, y: 0.5, label: 'CENTER' },
    { x: 0.15, y: 0.15, label: 'TOP LEFT' },
    { x: 0.85, y: 0.15, label: 'TOP RIGHT' },
    { x: 0.15, y: 0.85, label: 'BOTTOM LEFT' },
    { x: 0.85, y: 0.85, label: 'BOTTOM RIGHT' },
];

const HOLD_TIME = 2000; // 2 seconds per point

const CalibrationScreen: React.FC<CalibrationScreenProps> = ({
    gazePoint, onComplete, onSkip,
}) => {
    const [currentPoint, setCurrentPoint] = useState(0);
    const [holdProgress, setHoldProgress] = useState(0);
    const [collected, setCollected] = useState<{ screenX: number; screenY: number; gazeX: number; gazeY: number }[]>([]);

    const holdStartRef = useRef<number | null>(null);
    const gazeAccumRef = useRef<{ x: number[]; y: number[] }>({ x: [], y: [] });
    const animFrameRef = useRef<number>(0);

    const target = CALIBRATION_POINTS[currentPoint];

    const processCalibration = useCallback((points: typeof collected) => {
        // Compute average offset and scale
        let totalOffsetX = 0, totalOffsetY = 0;

        for (const p of points) {
            totalOffsetX += p.screenX - p.gazeX;
            totalOffsetY += p.screenY - p.gazeY;
        }

        const offsetX = totalOffsetX / points.length;
        const offsetY = totalOffsetY / points.length;

        const data: CalibrationData = {
            points: points.map(p => ({
                screenX: p.screenX,
                screenY: p.screenY,
                gazeX: p.gazeX,
                gazeY: p.gazeY,
            })),
            offsetX,
            offsetY,
            scaleX: 1.0,
            scaleY: 1.0,
            timestamp: Date.now(),
        };

        onComplete(data);
    }, [onComplete]);

    useEffect(() => {
        const tick = () => {
            // Accumulate gaze samples
            gazeAccumRef.current.x.push(gazePoint.x);
            gazeAccumRef.current.y.push(gazePoint.y);

            if (!holdStartRef.current) {
                holdStartRef.current = Date.now();
            }

            const elapsed = Date.now() - holdStartRef.current;
            const progress = Math.min(1, elapsed / HOLD_TIME);
            setHoldProgress(progress);

            if (progress >= 1) {
                // Sample collected: average the gaze during hold
                const samples = gazeAccumRef.current;
                const avgX = samples.x.reduce((a, b) => a + b, 0) / samples.x.length;
                const avgY = samples.y.reduce((a, b) => a + b, 0) / samples.y.length;

                const newPoint = {
                    screenX: target.x,
                    screenY: target.y,
                    gazeX: avgX,
                    gazeY: avgY,
                };

                const newCollected = [...collected, newPoint];
                setCollected(newCollected);

                if (currentPoint < CALIBRATION_POINTS.length - 1) {
                    setCurrentPoint(prev => prev + 1);
                    setHoldProgress(0);
                    holdStartRef.current = null;
                    gazeAccumRef.current = { x: [], y: [] };
                } else {
                    processCalibration(newCollected);
                }
                return;
            }

            animFrameRef.current = requestAnimationFrame(tick);
        };

        animFrameRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [gazePoint, currentPoint, target, collected, processCalibration]);

    return (
        <div className="fixed inset-0 z-[9999] bg-[var(--bg-0)] flex items-center justify-center">
            {/* Grid background */}
            <div className="absolute inset-0 opacity-10"
                style={{
                    backgroundImage: 'linear-gradient(var(--stroke) 1px, transparent 1px), linear-gradient(90deg, var(--stroke) 1px, transparent 1px)',
                    backgroundSize: '30px 30px',
                }}
            />

            {/* Instructions */}
            <div className="absolute top-12 left-1/2 -translate-x-1/2 text-center z-10">
                <h2 className="text-hud text-2xl text-[var(--cyan)] font-black mb-2">
                    GAZE CALIBRATION
                </h2>
                <p className="text-[var(--muted)] text-sm">
                    Look at the glowing dot for 2 seconds. Point {currentPoint + 1} of {CALIBRATION_POINTS.length}.
                </p>
            </div>

            {/* Skip button */}
            <button
                onClick={onSkip}
                className="absolute top-12 right-12 text-[var(--muted)] text-xs hover:text-[var(--amber)] z-10"
            >
                SKIP CALIBRATION →
            </button>

            {/* Calibration dot */}
            <div
                className="absolute w-20 h-20 flex items-center justify-center transition-all duration-500"
                style={{
                    left: `${target.x * 100}%`,
                    top: `${target.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                }}
            >
                {/* Progress ring */}
                <svg className="absolute w-20 h-20" viewBox="0 0 80 80">
                    <circle
                        cx="40" cy="40" r="35"
                        fill="none"
                        stroke="var(--stroke)"
                        strokeWidth="2"
                    />
                    <circle
                        cx="40" cy="40" r="35"
                        fill="none"
                        stroke="var(--cyan)"
                        strokeWidth="3"
                        strokeDasharray={`${holdProgress * 220} 220`}
                        strokeLinecap="round"
                        transform="rotate(-90 40 40)"
                        style={{ filter: 'drop-shadow(0 0 8px var(--cyan))' }}
                    />
                </svg>

                {/* Center dot */}
                <div
                    className="w-4 h-4 rounded-full bg-[var(--cyan)]"
                    style={{
                        boxShadow: `0 0 ${20 + holdProgress * 30}px var(--cyan)`,
                        transform: `scale(${1 + holdProgress * 0.5})`,
                    }}
                />

                {/* Label */}
                <div className="absolute -bottom-8 text-[8px] text-[var(--amber)] font-bold tracking-widest">
                    {target.label}
                </div>
            </div>

            {/* Progress dots */}
            <div className="absolute bottom-12 flex gap-4">
                {CALIBRATION_POINTS.map((_, i) => (
                    <div
                        key={i}
                        className={`w-3 h-3 rounded-full border border-[var(--stroke)] ${i < currentPoint ? 'bg-[var(--ok)]' :
                                i === currentPoint ? 'bg-[var(--cyan)] animate-pulse' :
                                    'bg-transparent'
                            }`}
                    />
                ))}
            </div>
        </div>
    );
};

export default CalibrationScreen;
