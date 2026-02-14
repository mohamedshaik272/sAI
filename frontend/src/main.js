import { initAvatar, updateLipSync, stopLipSync } from './avatar.js';

const getServerUrl = () => {
    const host = window.location.hostname;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${host}:8000/ws/conversation`;
};

let ws = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

const micBtn = document.getElementById('mic-btn');
const statusEl = document.getElementById('status');

function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
}

function connect() {
    const url = getServerUrl();
    setStatus('connecting');
    ws = new WebSocket(url);

    ws.onopen = () => setStatus('ready');
    ws.onclose = () => {
        setStatus('offline');
        setTimeout(connect, 2000);
    };
    ws.onerror = () => {};

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'transcript') {
            setStatus('processing');
        } else if (data.type === 'audio') {
            setStatus('speaking');
            playAudio(data.audio);
        } else if (data.type === 'error') {
            setStatus('error');
        }
    };
}

async function playAudio(base64Audio) {
    const audioBytes = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
    const blob = new Blob([audioBytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);

    const audioContext = new AudioContext();
    const source = audioContext.createMediaElementSource(audio);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    source.connect(analyser);
    analyser.connect(audioContext.destination);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    audio.onplay = () => {
        const update = () => {
            if (!audio.paused) {
                analyser.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
                updateLipSync(avg / 255);
                requestAnimationFrame(update);
            }
        };
        update();
    };

    audio.onended = () => {
        stopLipSync();
        setStatus('ready');
        URL.revokeObjectURL(url);
    };

    await audio.play();
}

async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

    mediaRecorder.onstop = async () => {
        setStatus('processing');
        const webmBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const wavBlob = await convertToWav(webmBlob);
        const base64 = await blobToBase64(wavBlob);

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'audio', audio: base64 }));
        }

        stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start();
    isRecording = true;
    micBtn.classList.add('recording');
    setStatus('listening');
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        micBtn.classList.remove('recording');
    }
}

async function convertToWav(webmBlob) {
    const audioContext = new AudioContext();
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numChannels = 1;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    const channelData = audioBuffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < length; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

function blobToBase64(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.readAsDataURL(blob);
    });
}

function enterFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    screen.orientation?.lock?.('portrait').catch(() => {});
}

micBtn.addEventListener('mousedown', startRecording);
micBtn.addEventListener('mouseup', stopRecording);
micBtn.addEventListener('mouseleave', stopRecording);
micBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
micBtn.addEventListener('touchend', stopRecording);

document.getElementById('fullscreen-btn')?.addEventListener('click', enterFullscreen);

initAvatar();
connect();
