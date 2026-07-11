import { state } from './state.js';
import { svgElements, audioContainers } from './dom.js';
import { drawWavePeaks, drawProgress } from './waveform.js';

export function draw() {
    const [svgOriginal, svgProcessed] = svgElements;

    svgOriginal.replaceChildren();
    svgProcessed.replaceChildren();

    drawWavePeaks(svgOriginal, state.waves.original, '#3F3F46');
    drawWavePeaks(svgProcessed, state.waves.processed, '#FF4D6D');

    drawProgress(audioContainers, state.currentMode, state.progress);
}