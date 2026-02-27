// =============================================
// useGazeTracking — Face mesh + iris gaze
// =============================================
// Handles MediaPipe FaceMesh, iris tracking,
// blink detection, smoothing, and calibration.

import { useState, useRef, useCallback, useEffect } from 'react';
import type { GazePoint, UserSettings, CalibrationData } from '../types';
import { DEFAULT_SETTINGS } from '../constants';

interface EyeBoundingBox {
    minX: number; minY: number;
    maxX: number; maxY: number;
    width: number; height: number;
}

function getEyeBoundingBox(landmarks: any[], indices: number[]): EyeBoundingBox {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const idx of indices) {
        const p = landmarks[idx];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute Eye Aspect Ratio (EAR) from FaceMesh landmarks.
 * When the eye is closed, EAR drops below ~0.2.
 *
 * Uses landmarks:
 *   Left eye: 159 (top), 145 (bottom), 33 (outer), 133 (inner)
 *   Right eye: 386 (top), 374 (bottom), 362 (outer), 263 (inner)
 */
function computeEAR(landmarks: any[]): number {
    const dist = (a: any, b: any) =>
        Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    // Left eye
    const leftVertical = dist(landmarks[159], landmarks[145]);
    const leftHorizontal = dist(landmarks[33], landmarks[133]);
    const leftEAR = leftVertical / (leftHorizontal + 0.0001);

    // Right eye
    const rightVertical = dist(landmarks[386], landmarks[374]);
    const rightHorizontal = dist(landmarks[362], landmarks[263]);
    const rightEAR = rightVertical / (rightHorizontal + 0.0001);

    return (leftEAR + rightEAR) / 2;
}

export function useGazeTracking(settings: UserSettings = DEFAULT_SETTINGS) {
    const [gazePoint, setGazePoint] = useState<GazePoint>({ x: 0.5, y: 0.5 });
    const [isBlinking, setIsBlinking] = useState(false);
    const [isFaceDetected, setIsFaceDetected] = useState(false);

    const smoothedRef = useRef({ x: 0.5, y: 0.5 });
    const faceMeshRef = useRef<any>(null);
    const blinkStartRef = useRef<number | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const calibrationRef = useRef<CalibrationData | null>(null);

    // Load calibration from localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem('eyespeak_calibration');
            if (stored) {
                calibrationRef.current = JSON.parse(stored);
            }
        } catch { /* no calibration data */ }
    }, []);

    const initFaceMesh = useCallback(() => {
        if (typeof (window as any).FaceMesh === 'undefined') return null;

        const mesh = new (window as any).FaceMesh({
            locateFile: (file: string) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        mesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true, // Required for iris landmarks (468+)
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        mesh.onResults(onFaceResults);
        faceMeshRef.current = mesh;
        return mesh;
    }, []);

    const onFaceResults = useCallback((results: any) => {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            setIsFaceDetected(false);
            return;
        }

        setIsFaceDetected(true);
        const landmarks = results.multiFaceLandmarks[0];

        // --- Blink Detection ---
        const ear = computeEAR(landmarks);
        const now = Date.now();

        if (ear < settings.blinkThreshold) {
            if (!blinkStartRef.current) {
                blinkStartRef.current = now;
            } else if (now - blinkStartRef.current > settings.blinkMinDuration) {
                setIsBlinking(true);
                return; // Skip gaze update during blink
            }
        } else {
            blinkStartRef.current = null;
            setIsBlinking(false);
        }

        // --- Head tracking (nose tip) ---
        const noseTip = landmarks[1];
        let headX = 1.0 - (noseTip.x - 0.5) * settings.headSensitivity + 0.5;
        let headY = (noseTip.y - 0.5) * settings.headSensitivity + 0.5;

        // --- Iris tracking ---
        let gazeOffsetX = 0;
        let gazeOffsetY = 0;

        if (landmarks.length > 468) {
            const leftEyeBox = getEyeBoundingBox(landmarks, [33, 133, 159, 145]);
            const rightEyeBox = getEyeBoundingBox(landmarks, [362, 263, 386, 374]);
            const leftIris = landmarks[468];
            const rightIris = landmarks[473];

            const leftGazeX = 1.0 - (leftIris.x - leftEyeBox.minX) / leftEyeBox.width;
            const leftGazeY = (leftIris.y - leftEyeBox.minY) / leftEyeBox.height;
            const rightGazeX = 1.0 - (rightIris.x - rightEyeBox.minX) / rightEyeBox.width;
            const rightGazeY = (rightIris.y - rightEyeBox.minY) / rightEyeBox.height;

            const avgGazeX = (leftGazeX + rightGazeX) / 2;
            const avgGazeY = (leftGazeY + rightGazeY) / 2;

            gazeOffsetX = (avgGazeX - 0.5) * settings.gazeSensitivity;
            gazeOffsetY = (avgGazeY - 0.5) * settings.gazeSensitivity;

            // Draw iris dots on debug canvas
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    ctx.fillStyle = '#FFB020';
                    ctx.beginPath();
                    ctx.arc(leftIris.x * canvasRef.current.width, leftIris.y * canvasRef.current.height, 3, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(rightIris.x * canvasRef.current.width, rightIris.y * canvasRef.current.height, 3, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
        }

        // --- Combine head + iris ---
        let targetX = headX + gazeOffsetX;
        let targetY = headY + gazeOffsetY;

        // --- Apply calibration offset if available ---
        const cal = calibrationRef.current;
        if (cal) {
            targetX = (targetX - 0.5) * cal.scaleX + 0.5 + cal.offsetX;
            targetY = (targetY - 0.5) * cal.scaleY + 0.5 + cal.offsetY;
        }

        // Clamp
        targetX = Math.max(0, Math.min(1, targetX));
        targetY = Math.max(0, Math.min(1, targetY));

        // --- Smoothing ---
        const sf = settings.smoothingFactor;
        const smoothedX = smoothedRef.current.x + (targetX - smoothedRef.current.x) * sf;
        const smoothedY = smoothedRef.current.y + (targetY - smoothedRef.current.y) * sf;
        smoothedRef.current = { x: smoothedX, y: smoothedY };

        setGazePoint({ x: smoothedX, y: smoothedY });
    }, [settings]);

    const saveCalibration = useCallback((data: CalibrationData) => {
        calibrationRef.current = data;
        try {
            localStorage.setItem('eyespeak_calibration', JSON.stringify(data));
        } catch { /* storage unavailable */ }
    }, []);

    return {
        gazePoint,
        isBlinking,
        isFaceDetected,
        faceMeshRef,
        canvasRef,
        initFaceMesh,
        saveCalibration,
    };
}
