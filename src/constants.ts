// =============================================
// EyeSpeak Herolink 1 — Constants
// =============================================

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const SPECIAL_KEYS = [
    { id: 'SPACE', label: '␣' },
    { id: 'BACKSPACE', label: 'DEL' },
    { id: 'CLEAR', label: 'CLR' },
];

export const EMOTIONS = [
    { id: 'HUNGRY', label: 'HUNGRY', icon: '🍔', color: 'amber' },
    { id: 'THIRSTY', label: 'THIRSTY', icon: '🥤', color: 'cyan' },
    { id: 'HAPPY', label: 'HAPPY', icon: '😊', color: 'green' },
    { id: 'SAD', label: 'SAD', icon: '☹️', color: 'amber' },
    { id: 'HELP', label: 'HELP', icon: '🆘', color: 'blue' },
] as const;

export const QUICK_WORDS = ["MOM", "DAD", "PLAY", "YES", "NO", "HI", "BYE"];

export const HELP_OPTIONS = [
    { id: 'HELP_TOUCH', label: 'BAD TOUCH', icon: '🛑' },
    { id: 'HELP_HURT', label: 'I AM HURT', icon: '🩹' },
    { id: 'HELP_SICK', label: 'I FEEL SICK', icon: '🤢' },
    { id: 'HELP_LOST', label: 'I AM LOST', icon: '🗺️' },
] as const;

export const TRACKER_LIST = [
    { id: 'hmd', label: 'HEAD' },
    { id: 'chest', label: 'CHEST' },
    { id: 'waist', label: 'WAIST' },
    { id: 'knees', label: 'KNEES' },
    { id: 'feet', label: 'FEET' },
] as const;

// Default settings (user-configurable)
export const DEFAULT_SETTINGS = {
    dwellTime: 1500,        // ms to dwell before selection
    smoothingFactor: 0.15,  // gaze smoothing (0.05 = very smooth, 0.4 = responsive)
    gazeSensitivity: 3.5,   // iris gaze multiplier
    headSensitivity: 2.5,   // head movement multiplier
    blinkThreshold: 0.2,    // EAR below this = blink
    blinkMinDuration: 80,   // ms minimum for a blink
    voiceName: 'Puck',      // child's TTS voice
    maggieVoice: 'Kore',    // Maggie's TTS voice
};

// AAC core vocabulary for word prediction (~200 most common)
export const CORE_VOCABULARY = [
    "MOM", "DAD", "HELP", "YES", "NO", "HI", "BYE", "PLAY", "STOP", "GO",
    "MORE", "DONE", "WANT", "NEED", "LIKE", "LOVE", "EAT", "DRINK", "SLEEP",
    "BATH", "BOOK", "TOY", "BALL", "DOG", "CAT", "HAPPY", "SAD", "HURT",
    "SICK", "TIRED", "HOT", "COLD", "BIG", "SMALL", "UP", "DOWN", "IN",
    "OUT", "ON", "OFF", "OPEN", "CLOSE", "COME", "HERE", "THERE", "THIS",
    "THAT", "WHAT", "WHERE", "WHO", "WHY", "HOW", "WHEN", "PLEASE", "THANK",
    "SORRY", "GOOD", "BAD", "NEW", "OLD", "NICE", "FUN", "HOME", "SCHOOL",
    "PARK", "CAR", "BUS", "WATER", "MILK", "JUICE", "FOOD", "BREAD", "APPLE",
    "BANANA", "COOKIE", "CANDY", "ICE", "CREAM", "PIZZA", "CHICKEN", "FISH",
    "RED", "BLUE", "GREEN", "YELLOW", "BLACK", "WHITE", "PINK", "PURPLE",
    "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "FRIEND", "BROTHER", "SISTER", "BABY", "BOY", "GIRL", "MAN",
    "WOMAN", "TEACHER", "DOCTOR", "MUSIC", "SING", "DANCE", "RUN", "WALK",
    "SIT", "STAND", "JUMP", "LOOK", "SEE", "HEAR", "FEEL", "THINK", "KNOW",
    "MAKE", "GIVE", "TAKE", "PUT", "GET", "FIND", "SHOW", "TELL", "SAY",
    "ASK", "READ", "WRITE", "DRAW", "COLOR", "CUT", "PUSH", "PULL", "WASH",
    "CLEAN", "OUTSIDE", "INSIDE", "TODAY", "AGAIN", "ALL", "SOME", "MANY",
    "VERY", "REALLY", "ALSO", "JUST", "STILL", "AWAY", "BACK", "HELLO",
];
