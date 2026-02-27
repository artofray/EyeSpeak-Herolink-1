// =============================================
// EyeSpeak Herolink 1 — Type Definitions
// =============================================

export interface GazePoint {
    x: number;
    y: number;
}

export interface TrackerStatus {
    hmd: boolean;
    chest: boolean;
    waist: boolean;
    knees: boolean;
    feet: boolean;
}

export interface ChatMessage {
    role: 'user' | 'ai';
    text: string;
}

export interface CalibrationPoint {
    screenX: number;
    screenY: number;
    gazeX: number;
    gazeY: number;
}

export interface CalibrationData {
    points: CalibrationPoint[];
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
    timestamp: number;
}

export interface UserSettings {
    dwellTime: number;
    smoothingFactor: number;
    gazeSensitivity: number;
    headSensitivity: number;
    blinkThreshold: number;
    blinkMinDuration: number;
    voiceName: string;
    maggieVoice: string;
}

export interface SessionHistoryEntry {
    word: string;
    timestamp: number;
    type: 'letter' | 'word' | 'emotion' | 'help';
}
