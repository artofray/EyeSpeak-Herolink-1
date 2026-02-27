// =============================================
// WordPrediction — Predictive word suggestions
// =============================================

import React from 'react';
import HeroButton from './HeroButton';
import { predictWords } from '../utils/wordPrediction';

interface WordPredictionProps {
    currentWord: string;
    focusedId: string | null;
    dwellProgress: number;
    lockInId: string | null;
}

const WordPrediction: React.FC<WordPredictionProps> = ({
    currentWord, focusedId, dwellProgress, lockInId,
}) => {
    const predictions = predictWords(currentWord);

    if (predictions.length === 0) return null;

    return (
        <div className="flex gap-2 mb-2">
            <span className="text-[8px] text-[var(--cyan)] font-bold self-center mr-2 tracking-widest">
                PREDICT:
            </span>
            {predictions.map(word => (
                <HeroButton
                    key={`pred-${word}`}
                    id={`PREDICT_${word}`}
                    label={word}
                    className="px-4 py-2 text-[10px] font-black border-[var(--amber)]/40"
                    active={focusedId === `PREDICT_${word}`}
                    progress={focusedId === `PREDICT_${word}` ? dwellProgress : 0}
                    locked={lockInId === `PREDICT_${word}`}
                />
            ))}
        </div>
    );
};

export default WordPrediction;
