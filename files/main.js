import { state } from './state.js';
import { WIDTH, HEIGHT } from './config.js';
import { svgElements, audioContainers, timeLabel } from './dom.js';
import { computePeaks } from './waveform.js';
import { audioCtx, renderProcessedBuffer } from './audioEngine.js';
import { draw } from './render.js';
import { initUI } from './ui.js';
import { formatTime } from './player.js';

svgElements.forEach(el => {
    el.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    el.style.width = '100%';
    el.style.height = '100%';
});

async function loadWave(audio) {
    const buf = await audio.arrayBuffer();
    state.audioBuffer = await audioCtx.decodeAudioData(buf);

    state.waves.original = computePeaks(state.audioBuffer.getChannelData(0));

    const processedBuffer = await renderProcessedBuffer();
    state.waves.processed = computePeaks(processedBuffer.getChannelData(0));

    audioContainers.forEach(el => {
        el.querySelector('.track-title').textContent = audio.name;
    });

    state.duration = state.audioBuffer.duration;
    timeLabel.textContent = `0:00/${formatTime(state.duration)}`;

    draw();
}

document.addEventListener('DOMContentLoaded', async () => {
    initUI();

    const audio = await getAudio();
    loadWave(audio);
});