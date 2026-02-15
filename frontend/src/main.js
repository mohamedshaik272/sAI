import { initAvatar, updateLipSync, stopLipSync } from './avatar.js';

const getServerUrl = () => {
    const host = window.location.hostname;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${host}:8000/ws/conversation`;
};

let ws = null;
let isRecording = false;
let audioContext = null;
let reconnectTimer = null;
let pingInterval = null;

function ensureAudioContext() {
    if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioContext();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

const micBtn = document.getElementById('mic-btn');
const statusEl = document.getElementById('status');

function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
}

function connect() {
    // Prevent stacking multiple reconnect attempts
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
        setStatus('ready');
        // Keepalive ping every 15s to prevent idle timeout
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
        isRecording = false;
        micBtn.classList.remove('recording');
        reconnectTimer = setTimeout(connect, 2000);
    };

    ws.onerror = () => {};

    ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }

        if (data.type === 'pong') {
            // keepalive response, ignore
        } else if (data.type === 'transcript') {
            setStatus(`heard: "${data.text}"`);
        } else if (data.type === 'audio') {
            setStatus('speaking');
            playAudio(data.audio);
        } else if (data.type === 'error') {
            setStatus('error: ' + (data.message || ''));
        } else if (data.type === 'listening') {
            setStatus('listening...');
        } else if (data.type === 'processing') {
            setStatus('processing...');
        }
    };
}

async function playAudio(base64Audio) {
    try {
        const ctx = ensureAudioContext();
        const audioBytes = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
        const audioBuffer = await ctx.decodeAudioData(audioBytes.buffer.slice(0));

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;

        source.connect(analyser);
        analyser.connect(ctx.destination);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let playing = true;

        const update = () => {
            if (!playing) return;
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
            updateLipSync(avg / 255);
            requestAnimationFrame(update);
        };

        source.onended = () => {
            playing = false;
            stopLipSync();
            setStatus('ready');
        };

        source.start(0);
        update();
    } catch (err) {
        console.error('Audio playback failed:', err);
        setStatus('ready');
    }
}

function startListening() {
    // Unlock audio context on user gesture (required for mobile playback)
    ensureAudioContext();

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'start_listening' }));
        isRecording = true;
        micBtn.classList.add('recording');
    }
}

function stopListening() {
    if (isRecording && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop_listening' }));
        isRecording = false;
        micBtn.classList.remove('recording');
        setStatus('processing...');
    }
}

function enterFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    screen.orientation?.lock?.('portrait').catch(() => {});
}

micBtn.addEventListener('mousedown', startListening);
micBtn.addEventListener('mouseup', stopListening);
micBtn.addEventListener('mouseleave', stopListening);
micBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startListening(); });
micBtn.addEventListener('touchend', stopListening);

document.getElementById('fullscreen-btn')?.addEventListener('click', enterFullscreen);

initAvatar();
connect();
