// =============================================
// useDwell — Dwell-based selection logic
// =============================================
// Checks if the gaze is "dwelling" on a UI element
// long enough to trigger a selection.

import { useState, useRef, useCallback } from 'react';
import { DEFAULT_SETTINGS } from '../constants';

interface DwellState {
    focusedId: string | null;
    dwellProgress: number; // 0..1
    lockInId: string | null;
}

export function useDwell(
    onSelect: (id: string) => void,
    dwellTime: number = DEFAULT_SETTINGS.dwellTime,
    isBlinking: boolean = false
) {
    const [state, setState] = useState<DwellState>({
        focusedId: null,
        dwellProgress: 0,
        lockInId: null,
    });

    const dwellStartRef = useRef<number | null>(null);
    const lastSelectedRef = useRef<string | null>(null);
    const focusedIdRef = useRef<string | null>(null);

    const checkDwell = useCallback((gazeX: number, gazeY: number) => {
        // Don't process during blinks
        if (isBlinking) {
            dwellStartRef.current = null;
            setState(prev => ({ ...prev, dwellProgress: 0 }));
            return;
        }

        const screenX = gazeX * window.innerWidth;
        const screenY = gazeY * window.innerHeight;
        const element = document.elementFromPoint(screenX, screenY);
        const target = element?.closest('[data-gaze-id]');
        const targetId = target?.getAttribute('data-gaze-id') || null;

        if (targetId && targetId !== focusedIdRef.current) {
            // Started looking at a new target
            focusedIdRef.current = targetId;
            dwellStartRef.current = Date.now();
            setState({ focusedId: targetId, dwellProgress: 0, lockInId: null });
        } else if (!targetId) {
            // Looking at nothing
            focusedIdRef.current = null;
            dwellStartRef.current = null;
            setState({ focusedId: null, dwellProgress: 0, lockInId: null });
        } else if (targetId === focusedIdRef.current && dwellStartRef.current) {
            // Still dwelling on same target
            const elapsed = Date.now() - dwellStartRef.current;
            const progress = Math.min(1, elapsed / dwellTime);

            if (progress >= 1 && targetId !== lastSelectedRef.current) {
                // Selection triggered!
                onSelect(targetId);
                lastSelectedRef.current = targetId;

                setState({ focusedId: targetId, dwellProgress: 1, lockInId: targetId });

                // Reset after lockIn animation
                setTimeout(() => {
                    setState(prev => ({ ...prev, lockInId: null }));
                }, 300);

                // Allow re-selection after cooldown
                setTimeout(() => {
                    lastSelectedRef.current = null;
                }, 800);
            } else {
                setState(prev => ({ ...prev, dwellProgress: progress }));
            }
        }
    }, [onSelect, dwellTime, isBlinking]);

    return {
        ...state,
        checkDwell,
    };
}
