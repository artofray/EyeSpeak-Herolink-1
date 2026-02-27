// =============================================
// HeroButton — Gaze-selectable hexagonal button
// =============================================

import React from 'react';

interface HeroButtonProps {
    id: string;
    label: string;
    icon?: string;
    className?: string;
    active: boolean;
    progress: number;
    locked?: boolean;
}

const HeroButton: React.FC<HeroButtonProps> = ({
    id, label, icon, className = '', active, progress, locked = false,
}) => {
    const glow = 0.15 + progress * 0.85;
    const scale = 1 + progress * 0.08;
    const charging = active && progress > 0 && progress < 1;

    const handleClick = () => {
        window.dispatchEvent(
            new CustomEvent('manualSelection', { detail: { id } })
        );
    };

    return (
        <div
            data-gaze-id={id}
            className={`hex-btn ${className} ${locked ? 'lock-in' : ''} cursor-pointer`}
            onClick={handleClick}
            style={{
                transform: `scale(${locked ? 1.15 : scale})`,
                borderColor: locked
                    ? 'var(--amber)'
                    : `rgba(40, 231, 255, ${0.25 + 0.45 * progress})`,
                boxShadow: locked
                    ? '0 0 50px var(--amber)'
                    : `0 0 ${24 * glow}px rgba(40, 231, 255, ${0.25 + 0.55 * progress})`,
                transition: locked
                    ? 'all 0.1s'
                    : 'transform 0.1s, box-shadow 0.1s, border-color 0.1s',
            }}
        >
            <div className="hex-btn-inner" />

            {/* Energy Orbit Particles during charging */}
            {charging && (
                <>
                    <div
                        className="energy-particle"
                        style={{ animation: `orbit ${1.5 - progress}s linear infinite` }}
                    />
                    <div
                        className="energy-particle"
                        style={{
                            animation: `orbit ${1.8 - progress}s linear infinite reverse`,
                            opacity: 0.5,
                        }}
                    />
                </>
            )}

            {/* Fill energy from bottom during dwell */}
            {active && !locked && (
                <div
                    className="absolute inset-0 bg-[var(--cyan)]/10 z-0 transition-all ease-linear"
                    style={{ height: `${progress * 100}%`, top: 'auto', bottom: 0 }}
                />
            )}

            {/* Content */}
            <div className="relative z-20 flex flex-col items-center gap-1">
                {icon && (
                    <span className="text-2xl drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                        {icon}
                    </span>
                )}
                <span
                    className={`${active ? 'text-[var(--amber)] font-black' : 'text-[var(--txt)]'
                        } transition-colors duration-200 tracking-tighter`}
                >
                    {label}
                </span>
            </div>
        </div>
    );
};

export default HeroButton;
