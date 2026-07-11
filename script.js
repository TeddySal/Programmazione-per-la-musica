const audioCtx = new AudioContext();

const BARS = 350;
const HEIGHT = 200;
const WIDTH = 700;

const svg = document.querySelectorAll('#waveform svg');

svg.forEach(el => {
    el.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    el.style.width = '100%';
    el.style.height = '100%';
});

let audioBuffer;
let waves = {
    original: [],
    processed: []
}
let currentMode = 'original';
let progress = 0;
let duration;
let effects = [
    { type: "shaper", options: { type: 'overdrive', drive: 0 } },
    { type: "filter", options: { type: "highpass", frequency: 0 } },
    { type: "reverb", options: { } }
];
let track = null;
let isPlaying = false;
let startTime = 0;
let offset = 0;
let stoppedManually = false;

const audioContainers = document.querySelectorAll('.audio-container');
const playBtn = document.querySelector('.play');
const selectEffects = document.querySelector('.effect-select');
const returnBtn = document.querySelector('.return');

let shaper = audioCtx.createWaveShaper();
let filter = audioCtx.createBiquadFilter();

shaper = audioCtx.createWaveShaper();
shaper.oversample = '4x';
shaper.curve = makeDistorsionCurve(effects[0].options.drive);
filter = audioCtx.createBiquadFilter();
filter.type = effects[1].options.type;
filter.frequency.value = effects[1].options.frequency;


shaper.connect(filter);
filter.connect(audioCtx.destination);

document.addEventListener('DOMContentLoaded', async () => {
    const audio = await getAudio();
    loadWave(audio);
});

async function loadWave(audio) {
    const buf = await audio.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(buf);

    waves.original = computePeaks(audioBuffer.getChannelData(0));
    const processedBuffer = await renderProcessedBuffer();
    waves.processed = computePeaks(processedBuffer.getChannelData(0));

    audioContainers.forEach(el => {
        el.querySelector('.track-title').textContent = audio.name;
    });

    duration = audioBuffer.duration;
    document.querySelector('.time').textContent = `0:00/${formatTime(duration)}`;

    draw();
}

function computeRMS(audioBuffer) {
    const data = audioBuffer.getChannelData(0);

    const block = Math.floor(data.length / BARS);
    const rms = [];

    for (let i = 0; i < BARS; i++) {
      let sum = 0;
      const start = i * block;
      const end = start + block;

      for (let j = start; j < end; j++) {
        sum += data[j] * data[j];
      }

      rms.push(Math.sqrt(sum / block));
    }

    const max = Math.max(...rms) || 1;
    return rms.map(v => v / max);
}

function computePeaks(data, bars = BARS) {
    const length = data.length;
    const peaks = new Array(bars);

    let globalMax = 0;

    for (let i = 0; i < bars; i++) {
        const start = Math.floor((i * length) / bars);
        const end = Math.floor(((i + 1) * length) / bars);

        let min = 0;
        let max = 0;
        let sumSquares = 0;
        let count = 0;

        for (let j = start; j < end; j++) {
            const val = data[j];

            if (val < min) min = val;
            if (val > max) max = val;

            sumSquares += val * val;
            count++;
        }

        const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
        const absPeak = Math.max(Math.abs(min), Math.abs(max));

        if (absPeak > globalMax) globalMax = absPeak;

        peaks[i] = { min, max, rms };
    }

    const normFactor = globalMax > 0 ? 1 / globalMax : 1;

    for (let i = 0; i < bars; i++) {
        peaks[i].min *= normFactor;
        peaks[i].max *= normFactor;
        peaks[i].rms *= normFactor;
    }

    return peaks;
}

async function renderProcessedBuffer() {
    const offlineCtx = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    const shaper = offlineCtx.createWaveShaper();
    shaper.oversample = '4x';
    shaper.curve = makeDistorsionCurve(effects[0].options.drive);

    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 0;

    source.connect(shaper);
    shaper.connect(filter);
    filter.connect(offlineCtx.destination);

    source.start(0);

    const renderedBuffer = await offlineCtx.startRendering();

    return renderedBuffer;
}

function draw() {
    const svgOriginal = svg[0];
    const svgProcessed = svg[1];

    svgOriginal.replaceChildren();
    svgProcessed.replaceChildren();

    drawWavePeaks(svgOriginal, waves.original, 'original');
    drawWavePeaks(svgProcessed, waves.processed, 'processed');

    drawProgress();
}

function drawWave(svgEl, data, type) {
    const step = WIDTH / BARS;  
    const barW = step * 0.6;  

    data.forEach((v, i) => {    
        const h = v * HEIGHT;   
        const x = i * step; 
        const y = (HEIGHT - h) / 2; 
        const bar = document.createElementNS(   
            "http://www.w3.org/2000/svg",   
            "rect"  
        );  
        bar.setAttribute("x", x);   
        bar.setAttribute("y", y);   
        bar.setAttribute("width", barW);    
        bar.setAttribute("height", Math.max(2, h)); 
        bar.setAttribute("fill", 
            type === 'original' ? "#3F3F46": "#FF4D6D");    
        bar.setAttribute("opacity", type === "original" ? 0.9 : 0.6);  
        svgEl.appendChild(bar); 
    });
}

function drawWavePeaks(svgEl, peaks, type) {
    const step = WIDTH / BARS;
    const gap = step * 0.2;
    const barWidth = step - gap;
    const centerY = HEIGHT / 2;

    peaks.forEach((p, i) => {
        const x = i * step + gap / 2;

        const yTop = centerY * (1 - p.max);
        const yBottom = centerY * (1 - p.min);
        const height = Math.max(1, yBottom - yTop);

        const bar = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "rect"
        );

        bar.setAttribute("x", x);
        bar.setAttribute("y", yTop);
        bar.setAttribute("width", barWidth);
        bar.setAttribute("height", height);
        bar.setAttribute("rx", barWidth / 2);
        bar.setAttribute("ry", barWidth / 2);

        bar.setAttribute("fill","#3F3F46");

        svgEl.appendChild(bar);
    });
}

function drawProgress() {
    const x = progress * WIDTH;

    audioContainers.forEach(container => {
        const mode = container.dataset.mode;
        const svgEl = container.querySelector("svg");

        svgEl.querySelectorAll(".playhead").forEach(e => e.remove());

        if (mode !== currentMode) return;

        const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "rect"
        );

        line.setAttribute("x", x);
        line.setAttribute("y", 0);
        line.setAttribute("width", 2);
        line.setAttribute("height", HEIGHT);
        line.setAttribute("fill", "#FF4D6D");
        line.classList.add("playhead");

        svgEl.appendChild(line);
    });
}

const deleteAudioModal = new bootstrap.Modal(document.getElementById('deleteAudioModal'));

deleteAudioModal._element.querySelector('.modal-danger').addEventListener('click', async () => {
    await deleteAudio();
    window.location = 'index.html';
});

returnBtn.addEventListener('click', () => {
    deleteAudioModal.show();
});

audioContainers.forEach(c => {
    c.addEventListener('click', (e) => {
        audioContainers.forEach(el => el.classList.toggle('is-active', el === c));
        currentMode = c.dataset.mode;
        document.querySelector('.audio-selected-name').textContent = c.querySelector('.track-type').textContent;
    });
});

const effectsModal = new bootstrap.Modal(document.getElementById('effectsModal'));

document.querySelectorAll(".effect").forEach(effect => {
    effect.addEventListener("click", () => {
        const type = effect.dataset.effect;
        if (type === 'distorsion') {
            effectsModal._element.querySelector('.modal-body').innerHTML = showDistorsionOptions();

        } else {
            effectsModal._element.querySelector('.modal-body').innerHTML = showCompressorOptions();
        }

        effectsModal._element.querySelectorAll('.modal-body .fx-panel .fx-body .fx-control').forEach(el => {
            console.log(el);
            const slider = el.querySelector('.fx-slider');
            slider.addEventListener('change', (e) => {
                console.log(e.target.value);
                const drive = e.target.value;
                effects[0].options.drive = drive;
                updateShaperDrive();
            });
        })
        
        effectsModal.show();
    });
});

async function updateShaperDrive() {
    const drive = effects[0].options.drive;
    shaper.curve = makeDistorsionCurve(drive);
    const processedBuffer = await renderProcessedBuffer();
    waves.processed = computePeaks(processedBuffer.getChannelData(0));
    draw();
}

function showCompressorOptions() {
    return `
        <div class="fx-panel">

            <div class="fx-header">
                <h5 class="fx-title">Compressor</h5>
                <div class="fx-status">Active</div>
            </div>

            <div class="fx-body">

                <div class="fx-control">
                    <div class="fx-label">Threshold</div>
                    <input type="range" class="fx-slider" min="-60" max="0" value="-24">
                    <div class="fx-scale">
                        <span>-60</span>
                        <span>-24</span>
                        <span>0</span>
                    </div>
                </div>

                <div class="fx-control">
                    <div class="fx-label">Ratio</div>
                    <input type="range" class="fx-slider" min="1" max="20" value="4">
                    <div class="fx-scale">
                        <span>1:1</span>
                        <span>4:1</span>
                        <span>20:1</span>
                    </div>
                </div>

                <div class="fx-control">
                    <div class="fx-label">Attack</div>
                    <input type="range" class="fx-slider" min="0" max="100" value="10">
                </div>

                <div class="fx-control">
                    <div class="fx-label">Release</div>
                    <input type="range" class="fx-slider" min="10" max="1000" value="250">
                </div>

                <div class="fx-toggle">
                    <label>
                        <input type="checkbox" checked>
                        Enabled
                    </label>
                </div>

            </div>

        </div>
    `;
}

function showDistorsionOptions() {
    return `
        <div class="fx-panel">

            <div class="fx-header">
                <h5 class="fx-title">Distorsion</h5>
                <div class="fx-status">Active</div>
            </div>

            <div class="fx-body">

                <div class="fx-control">
                    <div class="fx-label">Drive</div>
                    <input type="range" class="fx-slider" min="0" max="100" value="0">
                    <div class="fx-scale">
                        <span>1</span>
                        <span>100</span>
                    </div>
                </div>

                <div class="fx-toggle">
                    <label>
                        <input type="checkbox" checked>
                        Enabled
                    </label>
                </div>

            </div>

        </div>
    `;
}

function togglePlayBtn() {
    playBtn.children[0].classList.toggle('d-none');
    playBtn.children[1].classList.toggle('d-none');
}

playBtn.addEventListener('click', () => {
    togglePlay();
});

document.addEventListener('keypress', (e) => {
    if (e.code === 'Space') {
        togglePlay();
    }
});

function togglePlay() {
    togglePlayBtn();
    isPlaying = !isPlaying;
    if (isPlaying) {
        playTrack();
    } else {
        pauseTrack();
    } 
}
 
function getCurrentTime() {
    if (!isPlaying) return;

    return offset + (audioCtx.currentTime - startTime);
}

function formatTime(time) {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

function updateUI() {
    const current = getCurrentTime();
    document.querySelector('.time').textContent = `${formatTime(current)}/${duration}`;
}

function makeDistorsionCurve(drive) {  
    if (drive === 0) {
        const curve = new Float32Array(2);
        curve[0] = -1;
        curve[1] = 1;
        return curve;
    } 

    const n_samples = 256;
    const curve = new Float32Array(n_samples);
    const mode = effects[0].options.type;

    // 0–100 → 0–20 dB → gain lineare
    const driveDb = (drive / 100) * 40;
    const gain = Math.pow(10, driveDb / 20);

    for (let i = 0; i < n_samples; i++) {
        const x = (i * 2) /( n_samples - 1) - 1;
        const driven = x * gain;
    
        switch (mode) {
            case 'overdrive':
                curve[i] = driven / (1 + Math.abs(driven));
                break;
            case 'saturate':
                curve[i] = Math.tanh(driven) / Math.tanh(gain);
                break;
            case 'hardclip':
                curve[i] = Math.max(-1, Math.min(1, driven));
                break;
            case 'sine':
                curve[i] = Math.tanh(Math.sin(driven * Math.PI * 0.5));
                break;
            case 'cubic':
                curve[i] = 1.5 * driven - 0.5 * Math.pow(driven, 3);
                break;
            default:
                curve[i] = x;
        }
    }
    return curve;
}

async function playTrack() {
    if (track) {
        track.stop();
        track.disconnect();
    }
    track = audioCtx.createBufferSource();
    track.buffer = audioBuffer;

    if (currentMode === 'original') {
        track.connect(audioCtx.destination);
    }

    if (currentMode === 'processed') {
        track.connect(shaper);
    }

    stoppedManually = false;
    track.onended = () => {
        if (stoppedManually) return;
        isPlaying = false;
        offset = 0;
        progress = 1;
        togglePlayBtn();
        cancelAnimationFrame(raf);
        draw();
    }
    startTime = audioCtx.currentTime
    track.start(0, offset);
    updateProgress();
}

async function pauseTrack() {
    if (!track) return;

    stoppedManually = true;
    track.stop();

    offset += audioCtx.currentTime - startTime;
    cancelAnimationFrame(raf);
}

let raf = null;

function updateProgress() {
    if (!isPlaying) return; 

    const current = offset + (audioCtx.currentTime - startTime);    
    const duration = track?.buffer?.duration || 1;  
    progress = current / duration;  
    draw(); 
    updateUI();
    raf = requestAnimationFrame(updateProgress);
}

svg.forEach(el => {
    el.addEventListener('click', (e) => {
        if (!audioBuffer) return;

        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;

        const percent = x / rect.width;

        seek(percent);
    });
});

function seek(percent) {
    progress = percent;
    offset = percent * audioBuffer.duration;

    draw();


    if (isPlaying) {
        track.stop();
        playTrack();
    }
}