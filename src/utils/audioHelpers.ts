// =============================================
// Audio Helpers — encode/decode PCM audio
// =============================================

export const encodePCM = (bytes: Uint8Array): string =>
    btoa(Array.from(bytes).map(c => String.fromCharCode(c)).join(''));

export const decodePCM = (base64: string): Uint8Array =>
    new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));

export async function pcmToAudioBuffer(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }

    return buffer;
}

/**
 * Create a short tick sound that rises in pitch with progress.
 * Used during dwell to give audio feedback to the child.
 */
export function playDwellTick(
    ctx: AudioContext,
    progress: number
): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Pitch rises from 300Hz to 900Hz as dwell progresses
    osc.frequency.value = 300 + progress * 600;
    osc.type = 'sine';

    gain.gain.value = 0.05; // Very quiet
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
}

/**
 * Play a confirmation chime when a selection is locked in.
 */
export function playLockChime(ctx: AudioContext): void {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.frequency.value = 523; // C5
    osc2.frequency.value = 659; // E5
    osc1.type = 'sine';
    osc2.type = 'sine';

    gain.gain.value = 0.08;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.2);
}
