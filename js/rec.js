import { saveAudio } from './db.js';

const returnBtn = document.querySelector('.return');
const deleteRecModal = new bootstrap.Modal(document.getElementById('deleteRecModal'));
const recordContainer = document.querySelector('.record-container');
const recordingDevicesSelect = document.querySelector('.audio-input-select');
const recordBtn = document.querySelector('.record-btn');

const BARS = 350;
const HEIGHT = 200;
const WIDTH = 700;
const LIVE_BARS = BARS;

let mediaStream = null;
let mediaRecorder = null;
let audioCtx = new AudioContext();
let analyser = null;
let micSource = null;
let liveData = null;
let liveWave = [];
let animationId = null;
let chunks = [];

returnBtn.addEventListener('click', () => {
    deleteRecModal.show();
});

deleteRecModal._element.querySelector('.modal-danger').addEventListener('click', () => {
    window.location = 'index.html';
});

recordBtn.addEventListener('click', async () => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        recordBtn.childNodes[2].textContent = ' Stop ';
        await startRecording();
    } else {
        stopRecording();
    }
});

async function startRecording() {
    mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            deviceId: {
                exact: recordingDevicesSelect.value
            }
        }
    });

    setupAnalyser(mediaStream);

    mediaRecorder = new MediaRecorder(mediaStream);
    chunks = [];

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
            chunks.push(e.data);
        }
    }

    mediaRecorder.onstop = saveRecording;

    mediaRecorder.start();
}

function setupAnalyser(stream) {
    micSource = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    const bufferLenght = analyser.fftSize;
    liveData = new Uint8Array(bufferLenght);

    micSource.connect(analyser);
    drawLiveWaveform();
}

function drawLiveWaveform() {
    analyser.getByteTimeDomainData(liveData);

    const samplesPerFrame = Math.floor(liveData.length / 10);

    let min = 1;
    let max = -1;

    for (let i = 0; i < samplesPerFrame; i++) {
        const value = (liveData[i] - 128) / 128;
        
        if (value < min) min = value;
        if (value > max) max = value;
    }

    liveWave.push({min, max});

    if (liveWave.length > LIVE_BARS) {
        liveWave.shift();
    }

    drawLiveBars();

    animationId = requestAnimationFrame(drawLiveWaveform);
}

function drawLiveBars() {
    const svg = document.querySelector('#waveform svg');
    svg.replaceChildren();

    svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
    svg.setAttribute("preserveAspectRatio", "none");

    const step = WIDTH / LIVE_BARS;
    const center = HEIGHT / 2;

    liveWave.forEach((value, i) => {
        const height = Math.max(2, (value.max - value.min) * center);
        const top = center - (height / 2);
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");

        rect.setAttribute( "x", i * step);
        rect.setAttribute("y", top);
        rect.setAttribute("width", step * .8);
        rect.setAttribute("height", height);
        rect.setAttribute("rx", (step * 0.8) / 2);
        rect.setAttribute("fill", "var(--text)");

        svg.appendChild(rect);
    });
}

function stopRecording() {
    mediaRecorder.stop();
    mediaStream.getTracks().forEach(track => {
        track.stop();
    });
    cancelAnimationFrame(animationId);

    if (micSource) {
        micSource.disconnect();
    }

    analyser.disconnect();
}

async function saveRecording() {
    //const blob = new Blob(chunks, { type: "audio/webm" });
    const audio = new File(chunks, 'rec', { type: "audio/webm" })
    await saveAudio(audio);
    window.location = 'player.html';
}


document.addEventListener('DOMContentLoaded', async () => {
    await navigator.mediaDevices.getUserMedia({audio: true});

    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            devices.forEach(device => {
                if (device.kind === 'audioinput') {
                    addRecordingOption(device);
                }
            })
        })
        .catch(err => {
            console.log(err);
        });
});

recordingDevicesSelect.addEventListener('change', (e) => {
    console.log('changed');
});

function addRecordingOption(device) {
    const option = document.createElement('option');
    option.textContent = device.label;
    option.value = device.deviceId
    recordingDevicesSelect.appendChild(option);
}