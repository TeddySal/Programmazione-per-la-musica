import { getAudio, deleteAudio } from './db.js';

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
let processedBuffer;
let originalMaxPeak = 1.0;
let waves = {
    original: [],
    processed: []
}
let currentMode = 'original';
let progress = 0;
let duration = 0;

let effects = [
    { type: "normalizer", enabled: true, options: { peak: -5 } },
    { type: "compressor", enabled: false, options: { threshold: -24, ratio: 4, knee: 30, attack: 0.003, release: 0.25 } },
    { type: "shaper", enabled: false, options: { type: 'overdrive', drive: 0 } },
    { type: "eq3", enabled: false, options: { lowGain: 0, midGain: 0, highGain: 0 } },
    { type: "reverb", enabled: false, options: { buffer: null, depth: 1 } },
    { type: "tremolo", enabled: false, options: { frequency: 5, depth: 0.7 }},
    { type: "echo", enabled: false, options: { time: 0.3, feedback: 0.4, mix: 0.5 }},
    { type: "chorus", enabled: false, options: { rate: 1.2, depth: 0.003, delay: 0.025 }},
    { type: "flanger", enabled: false, options: { rate: 0.25, depth: 0.002, feedback: 0.2 }},
    { type: "gain", enabled: true, options: { gain: 1 }},
    { type: "limiter", enabled: true, options: { threshold: 0 } }
];

let track = null;
let isPlaying = false;
let isRepeating = false;
let startTime = 0;
let offset = 0;
let stoppedManually = false;

const audioContainers = document.querySelectorAll('.audio-container');
const playBtn = document.querySelector('.play');
const repeatBtn = document.querySelector('.repeat');
const backwardBtn = document.querySelector('.backward');
const selectEffects = document.querySelector('.effect-select');
const returnBtn = document.querySelector('.return');
const saveBtn = document.querySelector('.save .btn-danger');

function createEffectNode2(ctx, effect) {
    switch (effect.type) {
        case "compressor": {
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = effect.options.threshold;
            compressor.ratio.value = effect.options.ratio;
            compressor.knee.value = effect.options.knee;
            compressor.attack.value = effect.options.attack / 1000;
            compressor.release.value = effect.options.release / 1000;

            return compressor;
        }
        case "limiter": {
            const limiter = ctx.createDynamicsCompressor();
            limiter.threshold.value = effect.options.threshold;
            limiter.ratio.value = 20;
            limiter.knee.value = 0;
            limiter.attack.value = 0.001;
            limiter.release.value = 0.1;
            return limiter;
        }
        case "shaper": {
            const shaper = ctx.createWaveShaper();
            shaper.oversample = "4x";
            shaper.curve = makeDistorsionCurve(effect.options.drive, effect.options.type);
            return shaper;
        }
        case "eq3": {
            const low = ctx.createBiquadFilter();
            low.type = 'lowshelf';
            low.frequency.value = 150;
            low.gain.value = effect.options.lowGain;

            const mid = ctx.createBiquadFilter();
            mid.type = 'peaking';
            mid.frequency.value = 1000;
            mid.Q.value = 1;
            mid.gain.value = effect.options.midGain;

            const high = ctx.createBiquadFilter();
            high.type = 'highshelf';
            high.frequency.value = 6000;
            high.gain.value = effect.options.highGain;

            low.connect(mid);
            mid.connect(high);

            low.connect = (destination) => {
                high.connect(destination);
            }

            return low;
        }
        case "reverb": {
            if (effect.options.buffer === null) {
                return null;
            }

            const input = ctx.createGain();
            const output = ctx.createGain();

            const dryGain = ctx.createGain();
            const wetGain = ctx.createGain();
            const reverb = ctx.createConvolver();

            reverb.buffer = effect.options.buffer;

            dryGain.gain.value = 1 - effect.options.depth;
            wetGain.gain.value = effect.options.depth;

            input.connect(dryGain);
            dryGain.connect(output);

            input.connect(reverb);
            reverb.connect(wetGain);
            wetGain.connect(output);

            input.connect = function(destination) {
                output.connect(destination);
            };

            return input;
        }
        case "tremolo": {
            const input = ctx.createGain();
            const lfo = ctx.createOscillator();
            const depthNode = ctx.createGain();

            lfo.type = 'sine';
            lfo.frequency.value = effect.options.frequency;

            depthNode.gain.value = effect.options.depth;

            lfo.connect(depthNode);
            depthNode.connect(input.gain);

            lfo.start();

            return input;
        }
        case "echo": {
            const input = ctx.createGain();
            const output = ctx.createGain();

            const delayNode = ctx.createDelay(5.0); // Riserva fino a 5 secondi di memoria
            const feedbackGain = ctx.createGain();
            const wetGain = ctx.createGain();
            const dryGain = ctx.createGain();

            // 1. Parametri dalle opzioni dell'effetto (con valori di fallback)
            const time = effect.options.time !== undefined ? effect.options.time : 0.3;         // Ritardo in secondi (es. 0.3s = 300ms)
            const feedback = effect.options.feedback !== undefined ? effect.options.feedback : 0.4; // Ripetizioni (0.0 a 0.85)
            const mix = effect.options.mix !== undefined ? effect.options.mix : 0.5;             // Volume dell'eco (0.0 a 1.0)

            // Associa i valori ai nodi
            delayNode.delayTime.value = time;
            feedbackGain.gain.value = Math.min(feedback, 0.85); // Limite di sicurezza anti-fischio
            wetGain.gain.value = mix;
            dryGain.gain.value = 1; // Mantiene il suono originale nitido

            // 2. Catena Audio

            // Percorso DRY (Suono originale diretto)
            input.connect(dryGain);
            dryGain.connect(output);

            // Percorso WET (Ingresso -> Delay -> Wet -> Output)
            input.connect(delayNode);
            delayNode.connect(wetGain);
            wetGain.connect(output);

            // LOOP DI FEEDBACK (L'uscita del delay rientra in se stessa attraverso il feedbackGain)
            delayNode.connect(feedbackGain);
            feedbackGain.connect(delayNode);

            // 3. Wrapper per consentire il chaining dei nodi (.connect)
            input.connect = function(destination) {
                output.connect(destination);
            };
        
            return input;
        }
        case "chorus": {
            const input = ctx.createGain();
            const output = ctx.createGain();
            const dry = ctx.createGain();
            const wet = ctx.createGain();

            dry.gain.value = 0.6;
            wet.gain.value = 0.6;

            const delay = ctx.createDelay();
            delay.delayTime.value = 0.025; // 25ms

            const lfo = ctx.createOscillator();
            lfo.frequency.value = 1.2; // 1.2 Hz

            const depth = ctx.createGain();
            depth.gain.value = 0.003; // Depth della modulazione

            // Connessione LFO -> Delay
            lfo.connect(depth);
            depth.connect(delay.delayTime);

            // Routing audio
            input.connect(dry);
            dry.connect(output);

            input.connect(delay);
            delay.connect(wet);
            wet.connect(output);

            lfo.start();

            // Salviamo il riferimento per evitare che il Garbage Collector killi l'LFO
            output.lfo = lfo; 

            // Colleghiamo l'input all'output interno e restituiamo 'output' per la catena
            // O più semplicemente incapsuliamo l'input:
            return output;
        }
        case "flanger": {
            const input = ctx.createGain();
            const output = ctx.createGain();
            const feedback = ctx.createGain();

            const delay = ctx.createDelay();
            delay.delayTime.value = 0.003;

            feedback.gain.value = 0.5;

            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.25;

            const depth = ctx.createGain();
            depth.gain.value = 0.002;

            lfo.connect(depth);
            depth.connect(delay.delayTime);

            delay.connect(feedback);
            feedback.connect(delay);

            input.connect(output);
            input.connect(delay);
            delay.connect(output);

            lfo.start();

            input.connect = (destination) => {
                output.connect(destination);
            }

            return input;
        }
        case "gain": {
            const gainNode = ctx.createGain();
            gainNode.gain.value = effect.options.gain;
            return gainNode;
        }
        default:
            return null;
    }
}

function createEffectNode(ctx, effect) {
    switch (effect.type) {
        /* ===================================================================
           1. NODI NATIVI SINGOLI (Return diretto del nodo)
           =================================================================== */
        case "compressor": {
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = effect.options.threshold;
            compressor.ratio.value = effect.options.ratio;
            compressor.knee.value = effect.options.knee;
            compressor.attack.value = effect.options.attack / 1000;
            compressor.release.value = effect.options.release / 1000;
            return compressor;
        }

        case "limiter": {
            const limiter = ctx.createDynamicsCompressor();
            limiter.threshold.value = effect.options.threshold;
            limiter.ratio.value = 20;
            limiter.knee.value = 0;
            limiter.attack.value = 0.001;
            limiter.release.value = 0.1;
            return limiter;
        }

        case "shaper": {
            const shaper = ctx.createWaveShaper();
            shaper.oversample = "4x";
            shaper.curve = makeDistorsionCurve(effect.options.drive, effect.options.type);
            return shaper;
        }

        case "gain": {
            const gainNode = ctx.createGain();
            gainNode.gain.value = effect.options.gain;
            return gainNode;
        }

        /* ===================================================================
           2. NODI COMPOSITI (Pattern coerente: Input -> Interni -> Output)
           =================================================================== */
        case "eq3": {
            const input = ctx.createGain();
            const output = ctx.createGain();

            const low = ctx.createBiquadFilter();
            low.type = 'lowshelf';
            low.frequency.value = 150;
            low.gain.value = effect.options.lowGain;

            const mid = ctx.createBiquadFilter();
            mid.type = 'peaking';
            mid.frequency.value = 1000;
            mid.Q.value = 1;
            mid.gain.value = effect.options.midGain;

            const high = ctx.createBiquadFilter();
            high.type = 'highshelf';
            high.frequency.value = 6000;
            high.gain.value = effect.options.highGain;

            // Chain interna
            input.connect(low);
            low.connect(mid);
            mid.connect(high);
            high.connect(output);

            input.connect = destination => output.connect(destination);
            return input;
        }

        case "reverb": {
            if (!effect.options.buffer) return null;

            const input = ctx.createGain();
            const output = ctx.createGain();

            const dryGain = ctx.createGain();
            const wetGain = ctx.createGain();
            const reverb = ctx.createConvolver();

            reverb.buffer = effect.options.buffer;
            dryGain.gain.value = 1 - (effect.options.depth ?? 0.5);
            wetGain.gain.value = effect.options.depth ?? 0.5;

            // Dry path
            input.connect(dryGain);
            dryGain.connect(output);

            // Wet path
            input.connect(reverb);
            reverb.connect(wetGain);
            wetGain.connect(output);

            input.connect = destination => output.connect(destination);
            return input;
        }

        case "tremolo": {
            const input = ctx.createGain();
            const output = ctx.createGain();

            const lfo = ctx.createOscillator();
            const depthNode = ctx.createGain();

            lfo.type = 'sine';
            lfo.frequency.value = effect.options.frequency;
            depthNode.gain.value = effect.options.depth;

            // Connetti LFO al gain di input
            lfo.connect(depthNode);
            depthNode.connect(input.gain);

            // Audio passa da input a output
            input.connect(output);

            lfo.start();
            input.lfo = lfo; // Previene il Garbage Collection

            input.connect = destination => output.connect(destination);
            return input;
        }

        case "echo": {
            const input = ctx.createGain();
            const output = ctx.createGain();

            const delayNode = ctx.createDelay(5.0);
            const feedbackGain = ctx.createGain();
            const wetGain = ctx.createGain();
            const dryGain = ctx.createGain();

            const time = effect.options.time ?? 0.3;
            const feedback = effect.options.feedback ?? 0.4;
            const mix = effect.options.mix ?? 0.5;

            delayNode.delayTime.value = time;
            feedbackGain.gain.value = Math.min(feedback, 0.85);
            wetGain.gain.value = mix;
            dryGain.gain.value = 1;

            // Dry
            input.connect(dryGain);
            dryGain.connect(output);

            // Wet
            input.connect(delayNode);
            delayNode.connect(wetGain);
            wetGain.connect(output);

            // Feedback loop
            delayNode.connect(feedbackGain);
            feedbackGain.connect(delayNode);

            input.connect = destination => output.connect(destination);
            return input;
        }

        case "chorus": {
            const input = ctx.createGain();
            const output = ctx.createGain();
        
            const dry = ctx.createGain();
            const wet = ctx.createGain();

            dry.gain.value = 0.5;
            wet.gain.value = 0.5;
        
            const delay = ctx.createDelay();
            delay.delayTime.value = effect.options.delay;
        
            const lfo = ctx.createOscillator();
            lfo.frequency.value = effect.options.rate; // Opzionale: aggiunta manopola velocità
        
            const depth = ctx.createGain();
            depth.gain.value = effect.options.depth;
        
            // Modulazione
            lfo.connect(depth);
            depth.connect(delay.delayTime);
        
            // Audio routing
            input.connect(dry);
            dry.connect(output);
        
            input.connect(delay);
            delay.connect(wet);
            wet.connect(output);
        
            lfo.start();
            input.lfo = lfo;
        
            input.connect = destination => output.connect(destination);
            return input;
        }

        case "flanger": {
            const input = ctx.createGain();
            const output = ctx.createGain();
        
            const dry = ctx.createGain();
            const wet = ctx.createGain();
        
            dry.gain.value = 0.5;
            wet.gain.value = 0.5;
        
            const feedback = ctx.createGain();
            feedback.gain.value = Math.min(effect.options.feedback, 0.9);
        
            const delay = ctx.createDelay();
            delay.delayTime.value = 0.003;
        
            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = effect.options.rate;
        
            const depth = ctx.createGain();
            depth.gain.value = effect.options.depth;
        
            // Modulazione & Feedback
            lfo.connect(depth);
            depth.connect(delay.delayTime);
        
            delay.connect(feedback);
            feedback.connect(delay);
        
            // Audio routing
            input.connect(dry);
            dry.connect(output);
        
            input.connect(delay);
            delay.connect(wet);
            wet.connect(output);
        
            lfo.start();
            input.lfo = lfo;
        
            input.connect = destination => output.connect(destination);
            return input;
        }

        default:
            return null;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const audio = await getAudio();
    loadWave(audio);
});

function setOriginalAudioBuffer(buffer) {
    const rawData = buffer.getChannelData(0);
    
    // Troviamo il picco assoluto più alto del brano originale
    let max = 0;
    for (let i = 0; i < rawData.length; i++) {
        const abs = Math.abs(rawData[i]);
        if (abs > max) max = abs;
    }
    
    // Evitiamo divisioni per zero
    originalMaxPeak = max > 0 ? max : 1.0;
}

async function loadWave(audio) {
    const buf = await audio.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(buf);

    setOriginalAudioBuffer(audioBuffer);

    waves.original = computePeaks(audioBuffer.getChannelData(0));
    processedBuffer = await renderProcessedBuffer();
    waves.processed = computePeaks(processedBuffer.getChannelData(0));

    audioContainers.forEach(el => {
        el.querySelector('.track-title').textContent = audio.name;
    });

    duration = audioBuffer.duration;
    document.querySelector('.time').textContent = `0:00/${formatTime(duration)}`;

    draw();
}

function computePeaks(data, bars = BARS, referenceMax = 1.0) {
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
        //const absPeak = Math.max(Math.abs(min), Math.abs(max));

        //if (absPeak > globalMax) globalMax = absPeak;

        peaks[i] = {
            min: min / referenceMax,
            max: max / referenceMax,
            rms: rms / referenceMax
        };
    }

    /*const normFactor = globalMax > 0 ? 1 / globalMax : 1;

    for (let i = 0; i < bars; i++) {
        peaks[i].min *= normFactor;
        peaks[i].max *= normFactor;
        peaks[i].rms *= normFactor;
    }*/

    return peaks;
}

function normalizeBuffer(buffer, targetDb = 0) {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;

    // 1. ANALISI: Trova il picco massimo assoluto (tra tutti i canali)
    let maxPeak = 0;

    for (let c = 0; c < numChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < length; i++) {
            const abs = Math.abs(data[i]);
            if (abs > maxPeak) {
                maxPeak = abs;
            }
        }
    }

    // Se la traccia è completamente silenziosa, restituiamo il buffer così com'è
    if (maxPeak === 0) return buffer;

    // 2. CALCOLO GAIN: Converte i dBFS in valore ampiezza lineare
    // Es:  0 dBFS -> 1.0
    //     -1 dBFS -> ~0.891
    //     -3 dBFS -> ~0.707
    const targetLinear = Math.pow(10, targetDb / 20);

    // Fattore di moltiplicazione da applicare a ogni campione
    const gainFactor = targetLinear / maxPeak;

    // 3. APPLICAZIONE: Crea un nuovo AudioBuffer e scala tutti i campioni
    // Usiamo un OfflineAudioContext fittizio per istanziare pulitamente il nuovo buffer
    const ctx = new OfflineAudioContext(numChannels, length, sampleRate);
    const normalizedBuffer = ctx.createBuffer(numChannels, length, sampleRate);

    for (let c = 0; c < numChannels; c++) {
        const inputData = buffer.getChannelData(c);
        const outputData = normalizedBuffer.getChannelData(c);

        for (let i = 0; i < length; i++) {
            outputData[i] = inputData[i] * gainFactor;
        }
    }

    return normalizedBuffer;
}

async function renderProcessedBuffer() {
    if (!audioBuffer) return;

    const normEffect = effects.find(e => e.type === 'normalizer' && e.enabled);

    const workingBuffer = normEffect ? normalizeBuffer(audioBuffer, normEffect.options.peak) : audioBuffer;

    const offlineCtx = new OfflineAudioContext(workingBuffer.numberOfChannels, workingBuffer.length, workingBuffer.sampleRate);

    const source = offlineCtx.createBufferSource();
    source.buffer = workingBuffer;

    let currentNode = source;

    effects.forEach(effect => {
        if (!effect.enabled || effect.type === 'normalizer') return;

        const node = createEffectNode(offlineCtx, effect);

        if (node) {
            currentNode.connect(node);
            currentNode = node
        }
    });

    currentNode.connect(offlineCtx.destination);

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

function drawWavePeaks(svgEl, peaks, type) {
    const rect = svgEl.getBoundingClientRect();
    const HEIGHT = svgEl.viewBox?.baseVal?.height || rect.height || 100;
    const WIDTH = svgEl.viewBox?.baseVal?.width || rect.width || 800;

    const step = WIDTH / BARS;
    const gap = step * 0.2;
    const barWidth = step - gap;
    const centerY = HEIGHT / 2;

    svgEl.innerHTML = '';

    peaks.forEach((p, i) => {
        const x = i * step + gap / 2;

        const safeMax = Math.max(-1.0, Math.min(1.0, p.max));
        const safeMin = Math.max(-1.0, Math.min(1.0, p.min));

        const yTop = centerY * (1 - safeMax);
        const yBottom = centerY * (1 - safeMin);
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

        bar.setAttribute("fill", "#3F3F46");

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
    if (isPlaying) {
        track.stop();
        track.disconnect();
        await audioCtx.suspend();
    }
    await deleteAudio();
    window.location = 'index.html';
});

returnBtn.addEventListener('click', () => {
    deleteAudioModal.show();
});

saveBtn.addEventListener('click', () => {
    if (processedBuffer) {
        saveProcessedAudio(processedBuffer, 'proccessed_audio.wav');
    }
});

function saveProcessedAudio(buffer, filename) {
    if (!buffer) {
        console.error("Nessun AudioBuffer disponibile da scaricare!");
        return;
    }

    const wavBlob = audioBufferToWav(buffer);

    const url = URL.createObjectURL(wavBlob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;

    document.body.appendChild(anchor);
    anchor.click();

    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM Lineare
    const bitDepth = 16; // 16-bit PCM (Standard CD)

    let result;
    if (numChannels === 2) {
        // Interleave stereo (L/R/L/R...)
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        result = new Float32Array(left.length + right.length);
        for (let i = 0; i < left.length; i++) {
            result[i * 2] = left[i];
            result[i * 2 + 1] = right[i];
        }
    } else {
        // Mono
        result = buffer.getChannelData(0);
    }

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const bufferLength = result.length * bytesPerSample;
    const headerLength = 44;
    const arrayBuffer = new ArrayBuffer(headerLength + bufferLength);
    const view = new DataView(arrayBuffer);

    /* Header RIFF */
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + bufferLength, true);
    writeString(view, 8, 'WAVE');
    /* Sub-chunk "fmt " */
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 per PCM)
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    /* Sub-chunk "data" */
    writeString(view, 36, 'data');
    view.setUint32(40, bufferLength, true);

    // Scrive i dati audio Float32 convertiti in Int16
    let offset = 44;
    for (let i = 0; i < result.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, result[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}

audioContainers.forEach(c => {
    c.addEventListener('click', (e) => {
        audioContainers.forEach(el => el.classList.toggle('is-active', el === c));
        currentMode = c.dataset.mode;
        document.querySelector('.audio-selected-name').textContent = c.querySelector('.track-type').textContent;

        if (isPlaying) {
            offset = getCurrentTime(); 

            playTrack(); 
        } else {
            draw();
            updateUI();
        }
    });
});

const effectsModal = new bootstrap.Modal(document.getElementById('effectsModal'));

function updateModalUI(modalBody, effect) {
    const activeBtn = modalBody.querySelector('.fx-status');
    const panel = modalBody.querySelector('.fx-panel');

    if (activeBtn) {
        activeBtn.classList.toggle('is-active', effect.enabled);
        activeBtn.classList.toggle('is-disabled', !effect.enabled);
        activeBtn.textContent = effect.enabled ? 'ON' : 'OFF';
    }

    if (panel) {
        panel.classList.toggle('active', effect.enabled);
    }
}

document.querySelectorAll(".effect").forEach(effectBtn => {
    effectBtn.addEventListener("click", async (e) => {
        const type = effectBtn.dataset.effect;
        const modalBody = effectsModal._element.querySelector('.modal-body');
        const currentEffect = effects.find(e => e.type === type);

        modalBody.dataset.effectType = type;

        switch (type) {
            case "normalizer": modalBody.innerHTML = showNormalizerOptions(); break;
            case "compressor": modalBody.innerHTML = showCompressorOptions(); break;
            case "shaper": modalBody.innerHTML = showDistorsionOptions(); break;
            case "eq3": modalBody.innerHTML = showEq3Options(); break;
            case "reverb": modalBody.innerHTML = showReverbOptions(); break;
            case "tremolo": modalBody.innerHTML = showTremoloOptions(); break;
            case "echo": modalBody.innerHTML = showEchoOptions(); break;
            case "chorus": modalBody.innerHTML = showChorusOptions(); break;
            case "flanger": modalBody.innerHTML = showFlangerOptions(); break;
        }

        updateModalUI(modalBody, currentEffect);

        const activeBtn = modalBody.querySelector('.fx-status');
        if (activeBtn) {
            activeBtn.onclick = async () => {
                currentEffect.enabled = !currentEffect.enabled;

                effectBtn.classList.toggle('active', currentEffect.enabled);
                updateModalUI(modalBody, currentEffect);

                if (type === 'reverb' && currentEffect.enabled && !currentEffect.options.buffer) {
                    await loadImpulseResponse();
                }

                await updateEffect(type, null, null);
            };
        }   

        effectsModal.show();
    });
});

const modalElement = effectsModal._element;

modalElement.addEventListener('input', (e) => {
    if (!e.target.classList.contains('fx-slider')) return;

    const modalBody = modalElement.querySelector('.modal-body');
    const type = modalBody.dataset.effectType;
    const param = e.target.dataset.param;
    const unit = e.target.dataset.unit;
    const rawVal = Number(e.target.value);
    
    let formattedVal = rawVal;

    switch (unit) {
        case 'percent':
            formattedVal = `${Math.round(rawVal * 100)}%`;
            break;
        case 'ms':
            formattedVal = `${Math.round(rawVal * 1000)} ms`;
            break;
        case 'hz':
            formattedVal = `${rawVal} Hz`;
            break;
        case 'db':
            formattedVal = `${rawVal} dB`;
            break;
        case 'ratio':
            formattedVal = `${rawVal}:1`;
            break; 
    }

    const valDisplay = e.target.closest('.fx-control')?.querySelector('.fx-val-badge');
    if (valDisplay) valDisplay.textContent = formattedVal; 

    if (type === 'eq3') {
        const lowVal = Number(modalBody.querySelector('[data-param="lowGain"]')?.value || 0);
        const midVal = Number(modalBody.querySelector('[data-param="midGain"]')?.value || 0);
        const highVal = Number(modalBody.querySelector('[data-param="highGain"]')?.value || 0);

        const yLow = 130 - (lowVal * 4.5);
        const yMid = 130 - (midVal * 4.5);
        const yHigh = 130 - (highVal * 4.5);

        const newPathD = `
            M 50,${yLow} 
            L 100,${yLow} 
            C 130,${yLow} 150,130 180,130 
            C 210,130 225,${yMid} 250,${yMid} 
            C 275,${yMid} 290,130 320,130 
            C 350,130 370,${yHigh} 400,${yHigh} 
            L 460,${yHigh}
        `.replace(/\s+/g, ' ').trim();

        const path = document.getElementById('eq-curve') || document.getElementById('eq3-path');
        if (path) path.setAttribute('d', newPathD);
    }
});

modalElement.addEventListener('change', async (e) => {
    const modalBody = modalElement.querySelector('.modal-body');
    const type = modalBody.dataset.effectType;

    // Gestione Slider
    if (e.target.classList.contains('fx-slider')) {
        const param = e.target.dataset.param;
        const rawVal = Number(e.target.value);

        const finalValue = (type === 'filter' && param === 'frequency') 
            ? sliderToLogFreq(rawVal) 
            : rawVal;

        await updateEffect(type, param, finalValue);
    }

    // Gestione Select Dropdown (es. Reverb Preset)
    if (e.target.classList.contains('form-select')) {
        const value = e.target.value;

        if (type === 'reverb') {
            await loadImpulseResponse(value);
        }

        await updateEffect(type, "type", value);
    }
});

document.querySelectorAll('.foot .vertical-slider').forEach(slider => {
    slider.addEventListener('input', async (e) => {
        e.stopPropagation();

        const type = e.target.dataset.effect;
        const param = e.target.dataset.param;
        const value = Number(e.target.value);

        const valBadge = e.target.closest('.slider-popover')?.querySelector('.limiter-val-badge');
        if (valBadge) {
            valBadge.textContent = `${value} dB`;
        }
        
        await updateEffect(type, param, value);
    });
});

document.querySelector('[data-effect=normalization]').addEventListener('click', (e) => {
    const popover = e.target.nextElementSibling;

    popover.classList.toggle('show');

    const badge = popover.querySelector('.norm-val-badge');

    badge.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Impedisce il va-a-capo
            badge.blur();   // Toglie il focus
        }
    });

    badge.addEventListener('blur', async () => {
        let text = badge.textContent.trim();
        let val = parseFloat(text);
        
        if (isNaN(val)) val = 0;
        if (val > 0) val = 0;

        badge.textContent = `${val} db`;
        
        await updateEffect("normalizer", "peak", val);
    });
});

function sliderToLogFreq(sliderVal, minHz = 20, maxHz = 20000) {
    const minLog = Math.log(minHz);
    const maxLog = Math.log(maxHz);

    return Math.round(Math.exp(minLog + sliderVal * (maxLog - minLog)));
}

function freqToLogSlider(freqHz, minHz = 20, maxHz = 20000) {
    const safeFreq = Math.max(minHz, Math.min(maxHz, freqHz));
    const minLog = Math.log(minHz);
    const maxLog = Math.log(maxHz);

    return (Math.log(safeFreq) - minLog) / (maxLog - minLog);
}

function showCompressorOptions() {
    const effect = effects.find(e => e.type === 'compressor');
    const compressor = effect.options;
    const isEnabled = effect.enabled;

    return `
        <div class="fx-panel">

            <div class="fx-header">
                <svg xmlns="http://www.w3.org/2000/svg" data-bs-dismiss="modal" aria-label="Close" width="30" height="30" fill="currentColor" class="bi bi-x" viewBox="0 0 16 16">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"></path>
                </svg>
                <h5 class="fx-title">Compressor</h5>
                <div class="fx-status">${isEnabled ? 'On' : 'Off'}</div>
            </div>

            <div class="fx-body">
                <div class="fx-control">
                    <label class="d-flex justify-content-between align-content-center">
                        <span class="fx-label">Threshold</span>
                        <span class="fx-val-badge">${compressor.threshold} dB</span>
                    </label>
                    <input type="range" class="fx-slider" min="-60" max="0" value="-24" data-param="threshold" data-unit="db">
                    <div class="fx-scale">
                        <span>-60</span>
                        <span>-24</span>
                        <span>0</span>
                    </div>
                </div>

                <div class="fx-control">
                    <label class="d-flex justify-content-between align-content-center">
                        <span class="fx-label">Ratio</span>
                        <span class="fx-val-badge">${compressor.ratio} dB</span>
                    </label>
                    <input type="range" class="fx-slider" min="1" max="20" value="4" data-param="ratio" data-unit="db">
                    <div class="fx-scale">
                        <span>1:1</span>
                        <span>4:1</span>
                        <span>20:1</span>
                    </div>
                </div>

                <div class="fx-control">
                    <label class="d-flex justify-content-between align-content-center">
                        <span class="fx-label">Attack</span>
                        <span class="fx-val-badge">${compressor.attack} ms</span>
                    </label>
                    <input type="range" class="fx-slider" min="0" max="1000" value="3" step="1" data-param="attack" data-unit="ms">
                </div>

                <div class="fx-control">
                    <label class="d-flex justify-content-between align-content-center">
                        <span class="fx-label">Release</span>
                        <span class="fx-val-badge">${compressor.release} ms</span>
                    </label>
                    <input type="range" class="fx-slider" min="10" max="1000" value="250" step="10" data-param="release" data-unit="ms">
                </div>



            </div>

        </div>
    `;
}

function showDistorsionOptions() {
    const effect = effects.find(e => e.type === "shaper");
    const isEnabled = effect.enabled;
    const drive = effect.options.drive;

    return `
        <div class="fx-panel">

            <div class="fx-header">
                <svg xmlns="http://www.w3.org/2000/svg" data-bs-dismiss="modal" aria-label="Close" width="30" height="30" fill="currentColor" class="bi bi-x" viewBox="0 0 16 16">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"></path>
                </svg>
                <h5 class="fx-title">Distorsion</h5>
                <div class="fx-status">${isEnabled ? "On" : "Off"}</div>
            </div>

            <div class="fx-body">

                <div class="fx-control">
                    <select class="form-select" aria-label="Default select example" data-param="algorithm">
                      <option value="overdrive" selected>Overdrive</option>
                      <option value="saturate">Saturate</option>
                      <option value="hardclip">Hard clip</option>
                      <option value="sine">Sine</option>
                      <option value="cubic">Cubic</option>
                    </select>
                </div>

                <div class="fx-control">
                    <div class="d-flex justify-content-between align-content-center">
                        <div class="fx-label">Drive</div>
                        <span class="fx-val-badge">${drive}</span>
                    </div>

                    <input type="range" class="fx-slider" min="0" max="100" value="${drive}" data-param="drive" data-unit="db">
                    <div class="fx-scale">
                        <span>1</span>
                        <span>100</span>
                    </div>
                </div>

            </div>

        </div>
    `;
}

function showEq3Options() {
    const eq = effects.find(e => e.type === 'eq3')?.options || { lowGain: 0, midGain: 0, highGain: 0 };

    return `
        <div class="fx-panel">

            <div class="d-flex justify-content-between align-items-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" data-bs-dismiss="modal" aria-label="Close" width="30" height="30" fill="currentColor" class="bi bi-x" viewBox="0 0 16 16">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"></path>
                </svg>
                <h5 class="m-0">3-Band Equalizer</h5>
                <button class="btn btn-sm fx-status ${effects.find(e => e.type === 'eq3')?.enabled ? 'is-active' : 'is-disabled'}">
                    ${effects.find(e => e.type === 'eq3')?.enabled ? 'ON' : 'OFF'}
                </button>
            </div>

            <div class="fx-control">
            <!--
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 260" width="100%">
                    <path id="eq-curve" 
                          d="M 50,130 L 120,130 C 160,130 180,130 220,130 L 290,130 C 330,130 350,130 390,130 L 460,130" 
                          fill="none" 
                          stroke="#FF4D6D" 
                          stroke-width="3.5" 
                          stroke-linecap="round"
                          style="transition: d 0.08s ease-out;" />
                </svg>
                -->
            </div>

            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between align-content-center">
                    <span class="fx-label">Low (150 Hz)</span>
                    <span class="fx-val-badge">${eq.lowGain} dB</span>
                </label>
                <input type="range" class="fx-slider" min="-20" max="20" step="1" value="${eq.lowGain}" data-param="lowGain" data-unit="db">
            </div>

            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between align-content-center">
                    <span class="fx-label">Mid (1 kHz)</span>
                    <span class="fx-val-badge">${eq.midGain} dB</span>
                </label>
                <input type="range" class="fx-slider" min="-20" max="20" step="1" value="${eq.midGain}" data-param="midGain" data-unit="db">
            </div>

            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between align-content-center">
                    <span class="fx-label">High (6 kHz)</span>
                    <span class="fx-val-badge">${eq.highGain} dB</span>
                </label>
                <input type="range" class="fx-slider" min="-20" max="20" step="1" value="${eq.highGain}" data-param="highGain" data-unit="db">
            </div>
        </div>
    `;
}

function showReverbOptions() {
    const effect = effects.find(e => e.type === "reverb");
    const isEnabled = effect.enabled;

    return `
        <div class="fx-panel">

            <div class="fx-header">
                <svg xmlns="http://www.w3.org/2000/svg" data-bs-dismiss="modal" aria-label="Close" width="30" height="30" fill="currentColor" class="bi bi-x" viewBox="0 0 16 16">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"></path>
                </svg>
                <h5 class="fx-title">Reverb</h5>
                <div class="fx-status">${isEnabled ? "On" : "Off"}</div>
            </div>

            <div class="fx-body">

                <div class="fx-control">
                    <select class="form-select" aria-label="Default select example" data-param="filter">
                      <option value="Large Long Echo Hall.wav" selected>Large Long Echo Hall</option>
                      <option value="Musikvereinsaal.wav">Musikvereinsaal</option>
                      <option value="Nice Drum Room.wav">Nice Drum Room</option>
                      <option value="Scala Milan Opera Hall.wav">Scala Milan Opera Hall</option>
                    </select>
                </div>


                <div class="fx-control mb-3">
                    <label class="d-flex justify-content-between justify-content-center">
                        <span class="fx-label">Mix Dry/Wet</span>
                        <span class="fx-val-badge">${Math.round(effect.options.depth * 100)}%</span>
                    </label>
                    <input type="range" class="fx-slider" min="0" max="1" step="0.01" value="${effect.options.depth}" data-param="depth" data-unit="percent">
                </div>
            </div>

        </div>
    `;
}

function showTremoloOptions() {
    const tremolo = effects.find(e => e.type === 'tremolo')?.options;
    const isEnabled = effects.find(e => e.type === 'tremolo')?.enabled;

    return `
        <div class="fx-panel" data-effect-type="tremolo">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" data-bs-dismiss="modal" aria-label="Close" width="30" height="30" fill="currentColor" class="bi bi-x" viewBox="0 0 16 16">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"></path>
                </svg>
                <h5 class="m-0">Tremolo</h5>
                <button class="btn btn-sm fx-status ${isEnabled ? 'is-active' : 'is-disabled'}">
                    ${isEnabled ? 'ON' : 'OFF'}
                </button>
            </div>

            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between justify-content-center">
                    <span class="fx-label">Velocità (Rate)</span>
                    <span class="fx-val-badge">${tremolo.frequency} Hz</span>
                </label>
                <input type="range" class="fx-slider" min="1" max="15" step="0.5" value="${tremolo.frequency}" data-param="frequency" data-unit="hz">
            </div>

            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between justify-content-center">
                    <span class="fx-label">Profondità (Depth)</span>
                    <span class="fx-val-badge">${Math.round(tremolo.depth * 100)}%</span>
                </label>
                <input type="range" class="fx-slider" min="0" max="1" step="0.05" value="${tremolo.depth}" data-param="depth" data-unit="percent">
            </div>
        </div>
    `;
}

function showEchoOptions() {
    const echo = effects.find(e => e.type === 'echo')?.options || { time: 0.3, feedback: 0.4, mix: 0.5 };
    const isEnabled = effects.find(e => e.type === 'echo')?.enabled;

    return `
        <div class="fx-panel" data-effect-type="echo">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" data-bs-dismiss="modal" aria-label="Close" width="30" height="30" fill="currentColor" class="bi bi-x" viewBox="0 0 16 16">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"></path>
                </svg>
                <h5 class="m-0">Echo</h5>
                <button class="btn btn-sm fx-status ${isEnabled ? 'is-active' : 'is-disabled'}">
                    ${isEnabled ? 'ON' : 'OFF'}
                </button>
            </div>

            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between justify-content-center">
                    <span class="fx-label">Time</span>
                    <span class="fx-val-badge">${Math.round(echo.time * 1000)} ms</span>
                </label>
                <input type="range" class="fx-slider" min="0.05" max="1.0" step="0.05" value="${echo.time}" data-param="time" data-unit="ms">
            </div>

            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between justify-content-center">
                    <span class="fx-label">Feedback</span>
                    <span class="fx-val-badge">${Math.round(echo.feedback * 100)}%</span>
                </label>
                <input type="range" class="fx-slider" min="0" max="0.85" step="0.05" value="${echo.feedback}" data-param="feedback" data-unit="percent">
            </div>

            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between justify-content-center">
                    <span class="fx-label">Dry/Wet</span>
                    <span class="fx-val-badge">${Math.round(echo.mix * 100)}%</span>
                </label>
                <input type="range" class="fx-slider" min="0" max="1" step="0.05" value="${echo.mix}" data-param="mix" data-unit="percent">
            </div>
        </div>
    `;
}

function showChorusOptions() {
    const chorus = effects.find(e => e.type === 'chorus')?.options;
    const isEnabled = effects.find(e => e.type === 'chorus')?.enabled;

    return `
        <div class="fx-panel" data-effect-type="chorus">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" data-bs-dismiss="modal" aria-label="Close" width="30" height="30" fill="currentColor" class="bi bi-x" viewBox="0 0 16 16">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"></path>
                </svg>
                <h5 class="m-0">Chorus</h5>
                <button class="btn btn-sm fx-status ${isEnabled ? 'is-active' : 'is-disabled'}">
                    ${isEnabled ? 'ON' : 'OFF'}
                </button>
            </div>

            <!-- Rate: espresso in Hz -->
            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between align-items-center">
                    <span class="fx-label">Rate</span>
                    <span class="fx-val-badge">${chorus.rate} Hz</span>
                </label>
                <input type="range" class="fx-slider" min="0.1" max="5.0" step="0.1" value="${chorus.rate}" data-param="rate" data-unit="hz">
            </div>

            <!-- Depth: convertito in millisecondi per l'interfaccia UI -->
            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between align-items-center">
                    <span class="fx-label">Depth</span>
                    <span class="fx-val-badge">${(chorus.depth * 1000).toFixed(1)} ms</span>
                </label>
                <input type="range" class="fx-slider" min="0.0005" max="0.008" step="0.0005" value="${chorus.depth}" data-param="depth" data-unit="ms">
            </div>

            <!-- Delay: convertito in millisecondi per l'interfaccia UI -->
            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between align-items-center">
                    <span class="fx-label">Delay</span>
                    <span class="fx-val-badge">${(chorus.delay * 1000).toFixed(0)} ms</span>
                </label>
                <input type="range" class="fx-slider" min="0.010" max="0.040" step="0.001" value="${chorus.delay}" data-param="delay" data-unit="ms">
            </div>
        </div>
    `;
}

function showFlangerOptions() {
    const flanger = effects.find(e => e.type === 'flanger')?.options;
    const isEnabled = effects.find(e => e.type === 'flanger')?.enabled;

    return `
        <div class="fx-panel" data-effect-type="flanger">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" data-bs-dismiss="modal" aria-label="Close" width="30" height="30" fill="currentColor" class="bi bi-x" viewBox="0 0 16 16">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"></path>
                </svg>
                <h5 class="m-0">Flanger</h5>
                <button class="btn btn-sm fx-status ${isEnabled ? 'is-active' : 'is-disabled'}">
                    ${isEnabled ? 'ON' : 'OFF'}
                </button>
            </div>

            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between align-items-center">
                    <span class="fx-label">Rate</span>
                    <span class="fx-val-badge">${flanger.rate} Hz</span>
                </label>
                <input type="range" class="fx-slider" min="0.05" max="2.0" step="0.05" value="${flanger.rate}" data-param="rate" data-unit="hz">
            </div>

            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between align-items-center">
                    <span class="fx-label">Depth</span>
                    <span class="fx-val-badge">${(flanger.depth * 1000).toFixed(1)} ms</span>
                </label>
                <input type="range" class="fx-slider" min="0.0005" max="0.005" step="0.0001" value="${flanger.depth}" data-param="depth" data-unit="ms">
            </div>

            <div class="fx-control mb-3">
                <label class="d-flex justify-content-between align-items-center">
                    <span class="fx-label">Feedback</span>
                    <span class="fx-val-badge">${Math.round(flanger.feedback * 100)} %</span>
                </label>
                <input type="range" class="fx-slider" min="0" max="0.85" step="0.01" value="${flanger.feedback}" data-param="feedback" data-unit="percent">
            </div>
        </div>
    `;
}

function makeDistorsionCurve(drive, mode = "overdrive") {  
    if(drive === 0){
        const curve = new Float32Array(256);
        for(let i=0;i<256;i++){
            curve[i] = (i * 2) / 255 - 1;
        }
        return curve;
    }

    const n_samples = 44100;
    const curve = new Float32Array(n_samples);

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
                const clamped = Math.max(-1, Math.min(1, driven));
                curve[i] = 1.5 * clamped - 0.5 * Math.pow(clamped, 3);
                break;
            default:
                curve[i] = x;
        }
    }
    return curve;
}

async function loadImpulseResponse(ir = "Large Long Echo Hall.wav") {
    try {
        const res = await fetch('/IR/'+ir);
        const arrayBuffer = await res.arrayBuffer();
        const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        await updateEffect("reverb", "buffer", decodedBuffer);
        return decodedBuffer;
    } catch (error) {
        console.error(error);
    }
}


async function updateEffect(type, param, value) {
    const effect = effects.find(e => e.type === type);
    if (!effect) return;

    effect.options[param] = value;

    processedBuffer = await renderProcessedBuffer();
    waves.processed = computePeaks(processedBuffer.getChannelData(0), BARS, originalMaxPeak);
    draw();

    refreshPlaybackIfPlaying();
}


function togglePlayBtn() {
    playBtn.children[0].classList.toggle('d-none');
    playBtn.children[1].classList.toggle('d-none');
}

playBtn.addEventListener('click', () => {
    togglePlay();
});

repeatBtn.addEventListener('click', (e) => {
    isRepeating = e.target.closest('.repeat-svg').classList.toggle('active');
});

backwardBtn.addEventListener('click', (e) => {
    seek(0);
    e.target.classList.add('active');
    setTimeout(() => e.target.classList.remove('active'), 500);
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
    if (!isPlaying) return offset;

    return offset + (audioCtx.currentTime - startTime);
}

function formatTime(time) {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

function updateUI() {
    const current = getCurrentTime();
    const validDuration = duration || audioBuffer?.duration || 1;
    document.querySelector('.time').textContent = `${formatTime(current)}/${formatTime(validDuration)}`;
}

async function playTrack() {
    if (track) {
        track.onended = null;
        stoppedManually = true;
        track.stop();
        track.disconnect();
    }
    track = audioCtx.createBufferSource();
    track.buffer = (currentMode === 'processed') ? processedBuffer : audioBuffer;;

    track.connect(audioCtx.destination);

    stoppedManually = false;

    track.onended = () => {
        if (stoppedManually) return;

        if (isRepeating) {
            offset = 0;
            playTrack();
        } else {
            isPlaying = false;
            offset = 0;
            progress = 1;
            togglePlayBtn();
            cancelAnimationFrame(raf);
            draw();
            updateUI();
        }
    }
    startTime = audioCtx.currentTime
    track.start(0, offset);
    isPlaying = true;
    if (raf) cancelAnimationFrame(raf);
    updateProgress();
}

async function pauseTrack() {
    if (!track) return;

    track.onended = null;
    stoppedManually = true;
    track.stop();

    offset += audioCtx.currentTime - startTime;
    cancelAnimationFrame(raf);
}

function refreshPlaybackIfPlaying() {
    if (!isPlaying) return;

    const currentTime = getCurrentTime() % track.buffer.duration;

    if (track) {
        track.onended = null;
        stoppedManually = true;
        track.stop();
        track.disconnect();
    }

    track = audioCtx.createBufferSource();
    track.buffer = (currentMode === 'processed') ? processedBuffer : audioBuffer;
    track.connect(audioCtx.destination);

    stoppedManually = false;

    track.onended = () => {
        if (stoppedManually) return;
        if (isRepeating) {
            offset = 0;
            playTrack();
        } else {
            isPlaying = false;
            offset = 0;
            progress = 1;
            togglePlayBtn();
            cancelAnimationFrame(raf);
            draw();
            updateUI();
        }
    };

    offset = currentTime;
    startTime = audioCtx.currentTime;

    track.start(0, offset);
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