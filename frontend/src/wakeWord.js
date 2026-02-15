// Wake word detection module — "Hey sAI"
// Uses Web Speech API for wake phrase detection, MediaRecorder for command capture,
// and AnalyserNode for silence-based auto-stop.

// Common ways Chrome SpeechRecognition hears "hey sai"
const WAKE_PHRASE_VARIANTS = [
    'hey sai', 'hey say', 'hey sie', 'hey si',
    'hey sigh', 'hey psy', 'hey s a i',
    'hey sorry',  // very common misrecognition
    'hey siri',   // sometimes heard as this
    'a sai', 'hey sci', 'hey sy',
    'hey aside',  // sometimes with trailing words
];

const SILENCE_THRESHOLD = 0.015;      // RMS below this = silence
const SILENCE_DURATION_MS = 1500;     // Silence needed to auto-stop after speech
const MAX_RECORDING_MS = 15000;       // Hard cap on recording length
const PRE_SPEECH_TIMEOUT_MS = 4000;   // Time to wait for speech after wake word

const State = Object.freeze({
    IDLE: 'idle',
    ACTIVATED: 'activated',
    PROCESSING: 'processing',
    SPEAKING: 'speaking',
});

let state = State.IDLE;

let recognition = null;
let mediaStream = null;
let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyserNode = null;
let silenceTimer = null;
let maxRecordingTimer = null;
let preSpeechTimer = null;
let silenceCheckInterval = null;

// Callbacks set via initWakeWord
let _onStateChange = null;
let _onCommandAudio = null;
let _onError = null;

function containsWakePhrase(transcript) {
    const t = transcript.toLowerCase().trim();
    // Check if any variant appears near the end of the transcript (last 30 chars)
    // to avoid false positives from random mid-sentence matches
    const tail = t.slice(-30);
    return WAKE_PHRASE_VARIANTS.some(v => tail.includes(v));
}

function setState(newState) {
    state = newState;
    _onStateChange?.(newState);
}

// --- Wake Word Detection (IDLE state) ---

function startWakeWordListening() {
    setState(State.IDLE);

    if (recognition) {
        recognition.onend = null;
        try { recognition.abort(); } catch {}
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        _onError?.('Wake word not supported in this browser. Use Chrome or Edge.');
        return;
    }

    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;

    recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
            for (let j = 0; j < event.results[i].length; j++) {
                const transcript = event.results[i][j].transcript;
                console.log(`[WakeWord] Heard: "${transcript}" (alt ${j}, final: ${event.results[i].isFinal})`);
                if (containsWakePhrase(transcript)) {
                    console.log('[WakeWord] Wake phrase detected!');
                    recognition.onend = null;
                    recognition.abort();
                    transitionToActivated();
                    return;
                }
            }
        }
    };

    recognition.onstart = () => {
        console.log('[WakeWord] SpeechRecognition started — listening for "hey sai"');
    };

    recognition.onend = () => {
        console.log('[WakeWord] SpeechRecognition ended, state:', state);
        if (state === State.IDLE) {
            setTimeout(() => {
                if (state === State.IDLE) {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.warn('[WakeWord] Restart failed:', e.message);
                    }
                }
            }, 300);
        }
    };

    recognition.onerror = (event) => {
        console.warn('[WakeWord] SpeechRecognition error:', event.error);
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        if (event.error === 'not-allowed') {
            _onError?.('Microphone permission denied — click the page and reload');
        }
    };

    try {
        recognition.start();
    } catch (e) {
        console.warn('[WakeWord] Initial start failed (needs user gesture):', e.message);
        // Defer to first user click
        document.addEventListener('click', () => {
            if (state === State.IDLE && recognition) {
                try { recognition.start(); } catch {}
            }
        }, { once: true });
    }
}

// --- Command Recording (ACTIVATED state) ---

async function transitionToActivated() {
    console.log('[WakeWord] Transitioning to ACTIVATED — recording command');
    setState(State.ACTIVATED);

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];

        // AnalyserNode for silence detection
        audioContext = new AudioContext();
        if (audioContext.state === 'suspended') await audioContext.resume();
        const source = audioContext.createMediaStreamSource(mediaStream);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048;
        source.connect(analyserNode);

        // MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : 'audio/mp4';

        mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.onstop = () => finishRecording();

        mediaRecorder.start(250);
        startSilenceDetection();

        maxRecordingTimer = setTimeout(() => {
            if (state === State.ACTIVATED) stopRecording();
        }, MAX_RECORDING_MS);

    } catch (err) {
        console.error('[WakeWord] Mic access failed:', err);
        _onError?.('Microphone access denied');
        startWakeWordListening();
    }
}

// --- Silence Detection ---

function startSilenceDetection() {
    const bufferLength = analyserNode.fftSize;
    const dataArray = new Float32Array(bufferLength);
    let speechDetected = false;

    preSpeechTimer = setTimeout(() => {
        if (!speechDetected && state === State.ACTIVATED) {
            cancelRecording();
        }
    }, PRE_SPEECH_TIMEOUT_MS);

    silenceCheckInterval = setInterval(() => {
        if (state !== State.ACTIVATED) {
            clearInterval(silenceCheckInterval);
            return;
        }

        analyserNode.getFloatTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / bufferLength);

        if (rms > SILENCE_THRESHOLD) {
            if (!speechDetected) {
                speechDetected = true;
                clearTimeout(preSpeechTimer);
            }
            if (silenceTimer) {
                clearTimeout(silenceTimer);
                silenceTimer = null;
            }
        } else if (speechDetected && !silenceTimer) {
            silenceTimer = setTimeout(() => {
                if (state === State.ACTIVATED) stopRecording();
            }, SILENCE_DURATION_MS);
        }
    }, 100);
}

// --- Recording Stop / Cleanup ---

function stopRecording() {
    clearTimeout(maxRecordingTimer);
    clearTimeout(silenceTimer);
    clearTimeout(preSpeechTimer);
    clearInterval(silenceCheckInterval);
    silenceTimer = null;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

function cancelRecording() {
    stopRecording();
    cleanupMedia();
    startWakeWordListening();
}

function finishRecording() {
    setState(State.PROCESSING);
    cleanupMedia();

    if (audioChunks.length === 0) {
        startWakeWordListening();
        return;
    }

    const mimeType = audioChunks[0].type || 'audio/webm';
    const blob = new Blob(audioChunks, { type: mimeType });
    audioChunks = [];
    const format = mimeType.includes('mp4') ? 'mp4' : 'webm';

    const reader = new FileReader();
    reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        _onCommandAudio?.(base64, format);
    };
    reader.readAsDataURL(blob);
}

function cleanupMedia() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
    }
    analyserNode = null;
    mediaRecorder = null;
}

// --- Public API ---

export function initWakeWord({ onStateChange, onCommandAudio, onError }) {
    _onStateChange = onStateChange;
    _onCommandAudio = onCommandAudio;
    _onError = onError;
    startWakeWordListening();
}

export function setSpeaking() {
    setState(State.SPEAKING);
}

export function notifySpeakingDone() {
    if (state === State.SPEAKING || state === State.PROCESSING) {
        startWakeWordListening();
    }
}

export function getState() {
    return state;
}
