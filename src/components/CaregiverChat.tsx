// =============================================
// CaregiverChat — Caregiver intelligence console
// =============================================

import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { ChatMessage } from '../types';
import HeroButton from './HeroButton';

interface CaregiverChatProps {
    onClose: () => void;
    focusedId: string | null;
    dwellProgress: number;
}

const CaregiverChat: React.FC<CaregiverChatProps> = ({
    onClose, focusedId, dwellProgress,
}) => {
    const [chatInput, setChatInput] = useState('');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isThinking, setIsThinking] = useState(false);

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!chatInput.trim() || isThinking) return;

        const userMsg = chatInput;
        setChatInput('');
        setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
        setIsThinking(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [...chatHistory, { role: 'user', text: userMsg }].map(h => ({
                    role: h.role === 'user' ? 'user' : 'model',
                    parts: [{ text: h.text }],
                })),
                config: {
                    systemInstruction: `You are the Caregiver Assistance AI for EyeSpeak Herolink.
          Provide expert advice on:
          - Autism communication strategies
          - AAC (Augmentative and Alternative Communication) best practices
          - Body awareness training for non-verbal children
          - Interpreting the child's selections and patterns
          - Adjusting dwell time and sensitivity settings
          Be empathetic, professional, and evidence-based.
          Keep responses concise but thorough.`,
                },
            });

            setChatHistory(prev => [
                ...prev,
                { role: 'ai', text: response.text || 'No response received.' },
            ]);
        } catch (err) {
            console.error('Caregiver chat error:', err);
            setChatHistory(prev => [
                ...prev,
                { role: 'ai', text: 'ERROR: Failed to connect to mission intelligence.' },
            ]);
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <div className="absolute inset-0 z-50 bg-[var(--bg-0)] p-8 flex flex-col gap-4">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-[var(--stroke)] pb-4">
                <h3 className="text-hud text-[var(--cyan)] font-black">
                    CAREGIVER INTELLIGENCE CONSOLE
                </h3>
                <button
                    onClick={onClose}
                    className="text-[var(--bad)] font-bold hover:text-white transition-colors"
                >
                    ✕
                </button>
            </div>

            {/* Chat history */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {chatHistory.length === 0 && (
                    <p className="text-[var(--muted)] text-xs italic">
                        Ask questions about your child's progress, communication strategies, or system settings...
                    </p>
                )}
                {chatHistory.map((h, i) => (
                    <div
                        key={i}
                        className={`flex flex-col ${h.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                        <div
                            className={`max-w-[80%] p-3 rounded-lg text-xs font-bold ${h.role === 'user'
                                    ? 'bg-[var(--cyan)]/10 text-[var(--cyan)] border border-[var(--cyan)]/30'
                                    : 'bg-[var(--amber)]/10 text-[var(--amber)] border border-[var(--amber)]/30'
                                }`}
                        >
                            {h.text}
                        </div>
                    </div>
                ))}
                {isThinking && (
                    <div className="flex gap-2 items-center text-[var(--amber)] text-[10px] animate-pulse">
                        ANALYZING...
                    </div>
                )}
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Ask mission intelligence for advice..."
                    className="flex-1 bg-[var(--bg-1)] border border-[var(--stroke)] p-4 rounded text-[var(--txt)] text-xs focus:outline-none focus:border-[var(--cyan)]"
                />
                <HeroButton
                    id="SEND_CHAT"
                    label="TRANSMIT"
                    className="px-8 py-2 text-[10px]"
                    active={focusedId === 'SEND_CHAT'}
                    progress={focusedId === 'SEND_CHAT' ? dwellProgress : 0}
                />
            </form>
        </div>
    );
};

export default CaregiverChat;
