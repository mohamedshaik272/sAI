import { initAvatar, updateLipSync, stopLipSync, setEmotion, switchModel } from './avatar.js';
import { initWakeWord, notifySpeakingDone, setSpeaking } from './wakeWord.js';

// Character definitions: each maps a VRM model to an ElevenLabs voice
const CHARACTERS = [
    { name: 'SpongeBob', vrm: '/models/spongebob.vrm',  voiceId: 'fBD19tfE58bkETeiwUoC' },
    { name: 'sAI',       vrm: '/models/avatar.vrm',     voiceId: 's3TPKV1kjDlVtZbl4Ksh' },
];
let currentCharIndex = 0;

const getServerUrl = () => {
    const host = window.location.hostname;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${host}:8000/ws/conversation`;
};

let ws = null;
let reconnectTimer = null;
let pingInterval = null;

// Audio element for TTS playback — unlocked from the start overlay click
const audioEl = new Audio();
audioEl.volume = 1.0;

const statusEl = document.getElementById('status');
const wakeIndicator = document.getElementById('wake-indicator');

function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
}

function updateIndicator(state) {
    if (!wakeIndicator) return;
    wakeIndicator.className = 'wake-indicator';
    if (state === 'idle') wakeIndicator.classList.add('listening');
    else if (state === 'activated') wakeIndicator.classList.add('recording');
    else if (state === 'processing') wakeIndicator.classList.add('processing');
}

function connect() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        return;
    }

    const url = getServerUrl();
    setStatus('connecting');
    ws = new WebSocket(url);

    ws.onopen = () => {
        setStatus('listening for "hey sai"');
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 15000);
    };

    ws.onclose = () => {
        setStatus('offline');
        if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
        reconnectTimer = setTimeout(connect, 2000);
    };

    ws.onerror = () => {};

    ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }

        if (data.type === 'pong') {
            // keepalive response
        } else if (data.type === 'transcript') {
            setStatus(`heard: "${data.text}"`);
        } else if (data.type === 'audio') {
            setStatus('speaking');
            setSpeaking();
            playAudio(data.audio, data.emotion || 'neutral', data.amplitudes, data.amplitudeBucketMs);
        } else if (data.type === 'error') {
            setStatus('error: ' + (data.message || ''));
            notifySpeakingDone();
        } else if (data.type === 'processing') {
            setStatus('processing...');
        }
    };
}

function playAudio(base64Audio, emotion, amplitudes, bucketMs) {
    const audioBytes = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
    console.log(`[Audio] Received ${audioBytes.length} bytes, attempting playback`);

    const blob = new Blob([audioBytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);

    // Reuse the pre-unlocked audio element
    audioEl.src = url;
    let playing = true;
    const bucketDuration = (bucketMs || 50) / 1000;

    setEmotion(emotion);

    audioEl.onended = () => {
        console.log('[Audio] Playback ended');
        playing = false;
        stopLipSync();
        setEmotion('neutral');
        setStatus('listening for "hey sai"');
        URL.revokeObjectURL(url);
        notifySpeakingDone();
    };

    audioEl.onerror = (e) => {
        console.error('[Audio] Playback error:', e);
        playing = false;
        setStatus('listening for "hey sai"');
        URL.revokeObjectURL(url);
        notifySpeakingDone();
    };

    const update = () => {
        if (!playing) return;
        if (amplitudes && amplitudes.length > 0 && !audioEl.paused) {
            const bucketIndex = Math.floor(audioEl.currentTime / bucketDuration);
            const clampedIndex = Math.min(bucketIndex, amplitudes.length - 1);
            const nextIndex = Math.min(clampedIndex + 1, amplitudes.length - 1);
            const fraction = (audioEl.currentTime / bucketDuration) - bucketIndex;
            const interpolated = amplitudes[clampedIndex] * (1 - fraction)
                               + amplitudes[nextIndex] * fraction;
            updateLipSync(interpolated);
        } else {
            updateLipSync(0.3 + Math.random() * 0.4);
        }
        requestAnimationFrame(update);
    };

    audioEl.play()
        .then(() => {
            console.log('[Audio] Playback started');
            update();
        })
        .catch((err) => {
            console.error('[Audio] play() blocked:', err);
            setStatus('click page to enable audio');
            // Wait for a click then retry
            document.addEventListener('click', () => {
                audioEl.play().then(() => {
                    console.log('[Audio] Playback started after click');
                    setStatus('speaking');
                    update();
                }).catch(() => {
                    setStatus('listening for "hey sai"');
                    notifySpeakingDone();
                });
            }, { once: true });
        });
}

function enterFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    screen.orientation?.lock?.('portrait').catch(() => {});
}

document.getElementById('fullscreen-btn')?.addEventListener('click', enterFullscreen);

// Character toggle button
document.getElementById('character-btn')?.addEventListener('click', () => {
    currentCharIndex = (currentCharIndex + 1) % CHARACTERS.length;
    const char = CHARACTERS[currentCharIndex];
    switchModel(char.vrm);
    setStatus(`switched to ${char.name}`);
    const btn = document.getElementById('character-btn');
    if (btn) btn.title = char.name;
    console.log(`[Character] Switched to ${char.name} (voice: ${char.voiceId})`);
});

// Load avatar immediately (visual only, no audio)
initAvatar();

// Defer audio + wake word until user taps the start overlay
const overlay = document.getElementById('start-overlay');
function startApp() {
    // Unlock audio element from this click context
    audioEl.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    audioEl.play().then(() => audioEl.pause()).catch(() => {});
    console.log('[Audio] Element unlocked via start overlay');

    overlay?.classList.add('hidden');

    connect();
    initWakeWord({
        onStateChange: (newState) => {
            updateIndicator(newState);
            const labels = {
                idle: 'listening for "hey sai"',
                activated: 'listening...',
                processing: 'processing...',
                speaking: 'speaking',
            };
            setStatus(labels[newState] || newState);
        },
        onCommandAudio: (base64, format) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                const voiceId = CHARACTERS[currentCharIndex].voiceId;
                ws.send(JSON.stringify({ type: 'audio_data', audio: base64, format, voiceId }));
            }
        },
        onError: (message) => {
            console.error('[WakeWord]', message);
            setStatus('error: ' + message);
        },
    });
}

if (overlay) {
    overlay.addEventListener('click', startApp, { once: true });
} else {
    // Fallback if overlay not found
    startApp();
}
