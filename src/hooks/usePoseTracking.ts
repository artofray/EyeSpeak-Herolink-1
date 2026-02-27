// =============================================
// usePoseTracking — MediaPipe Pose body tracking
// =============================================

import { useState, useRef, useCallback } from 'react';
import type { TrackerStatus } from '../types';

const VISIBILITY_THRESHOLD = 0.5;
const HIGH_VISIBILITY = 0.6;

const POSE_CONNECTIONS: [number, number][] = [
    [11, 12], [11, 23], [12, 24], [23, 24], // Torso
    [23, 25], [24, 26], [25, 27], [26, 28], // Legs
    [11, 13], [13, 15], [12, 14], [14, 16], // Arms
];

export function usePoseTracking() {
    const [trackers, setTrackers] = useState<TrackerStatus>({
        hmd: false, chest: false, waist: false, knees: false, feet: false,
    });

    const poseRef = useRef<any>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const initPose = useCallback(() => {
        if (typeof (window as any).Pose === 'undefined') return null;

        const pose = new (window as any).Pose({
            locateFile: (file: string) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        pose.onResults(onPoseResults);
        poseRef.current = pose;
        return pose;
    }, []);

    const onPoseResults = useCallback((results: any) => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const w = canvasRef.current.width;
        const h = canvasRef.current.height;
        ctx.clearRect(0, 0, w, h);

        if (!results.poseLandmarks) return;
        const lm = results.poseLandmarks;

        // Draw skeleton
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#28E7FF';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#28E7FF';

        for (const [from, to] of POSE_CONNECTIONS) {
            const p1 = lm[from];
            const p2 = lm[to];
            if (p1.visibility > VISIBILITY_THRESHOLD && p2.visibility > VISIBILITY_THRESHOLD) {
                ctx.beginPath();
                ctx.moveTo(p1.x * w, p1.y * h);
                ctx.lineTo(p2.x * w, p2.y * h);
                ctx.stroke();

                // Joint dots
                ctx.fillStyle = '#FFB020';
                ctx.beginPath();
                ctx.arc(p1.x * w, p1.y * h, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Reset shadow for performance
        ctx.shadowBlur = 0;

        // Update tracker status
        setTrackers({
            hmd: lm[0].visibility > HIGH_VISIBILITY,
            chest: lm[11].visibility > HIGH_VISIBILITY,
            waist: lm[23].visibility > HIGH_VISIBILITY,
            knees: lm[25].visibility > VISIBILITY_THRESHOLD || lm[26].visibility > VISIBILITY_THRESHOLD,
            feet: lm[27].visibility > VISIBILITY_THRESHOLD || lm[28].visibility > VISIBILITY_THRESHOLD,
        });
    }, []);

    return {
        trackers,
        poseRef,
        poseCanvasRef: canvasRef,
        initPose,
    };
}
