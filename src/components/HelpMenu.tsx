// =============================================
// HelpMenu — Emergency help overlay
// =============================================

import React from 'react';
import HeroButton from './HeroButton';
import { HELP_OPTIONS } from '../constants';

interface HelpMenuProps {
    onClose: () => void;
    focusedId: string | null;
    dwellProgress: number;
    lockInId: string | null;
}

const HelpMenu: React.FC<HelpMenuProps> = ({
    onClose, focusedId, dwellProgress, lockInId,
}) => (
    <div className="absolute inset-0 z-40 bg-[var(--bg-0)] p-8 flex flex-col gap-4">
        <div className="flex justify-between items-center border-b border-[var(--stroke)] pb-4">
            <h3 className="text-hud text-[var(--bad)] font-black text-2xl">
                EMERGENCY HELP
            </h3>
            <HeroButton
                id="CLOSE_HELP"
                label="CLOSE"
                className="px-6 py-2 text-[10px]"
                active={focusedId === 'CLOSE_HELP'}
                progress={focusedId === 'CLOSE_HELP' ? dwellProgress : 0}
            />
        </div>

        <div className="flex-1 grid grid-cols-2 gap-6 mt-4">
            {HELP_OPTIONS.map(opt => (
                <HeroButton
                    key={opt.id}
                    id={opt.id}
                    label={opt.label}
                    icon={opt.icon}
                    className="hex-btn flex-col text-2xl font-black bg-[var(--bad)]/10 border-[var(--bad)]"
                    active={focusedId === opt.id}
                    progress={focusedId === opt.id ? dwellProgress : 0}
                    locked={lockInId === opt.id}
                />
            ))}
        </div>
    </div>
);

export default HelpMenu;
