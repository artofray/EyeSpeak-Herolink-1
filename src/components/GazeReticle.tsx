// =============================================
// GazeReticle — Targeting cursor overlay
// =============================================

import React from 'react';
import type { GazePoint } from '../types';

interface GazeReticleProps {
    gazePoint: GazePoint;
    isBlinking: boolean;
}

const GazeReticle: React.FC<GazeReticleProps> = ({ gazePoint, isBlinking }) => (
    <div
        className="targeting-reticle w-16 h-16 flex items-center justify-center"
        style={{
            left: `${gazePoint.x * 100}%`,
            top: `${gazePoint.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            opacity: isBlinking ? 0.3 : 1,
            transition: 'opacity 0.1s',
        }}
    >
        <div className="absolute inset-0 border-2 border-[var(--cyan)] rounded-full rotating" />
        <div className="absolute inset-2 border border-[var(--amber)] rounded-full" />
        <div className="w-1 h-1 bg-white rounded-full" />
        {isBlinking && (
            <div className="absolute -bottom-6 text-[8px] text-[var(--amber)] font-bold tracking-wider">
                BLINK
            </div>
        )}
    </div>
);

export default GazeReticle;
