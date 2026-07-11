import { BARS, HEIGHT, WIDTH } from './config.js';

export function computeRMS(audioBuffer, bars = BARS) {
    const data = audioBuffer.getChannelData(0);
    const block = Math.floor(data.length / bars);
    const rms = [];

    for (let i = 0; i < bars; i++) {
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

export function computePeaks(data, bars = BARS) {
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

export function drawWavePeaks(svgEl, peaks, color) {
    const step = WIDTH / BARS;
    const gap = step * 0.2;
    const barWidth = step - gap;
    const centerY = HEIGHT / 2;

    peaks.forEach((p, i) => {
        const x = i * step + gap / 2;

        const yTop = centerY * (1 - p.max);
        const yBottom = centerY * (1 - p.min);
        const height = Math.max(1, yBottom - yTop);

        const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

        bar.setAttribute('x', x);
        bar.setAttribute('y', yTop);
        bar.setAttribute('width', barWidth);
        bar.setAttribute('height', height);
        bar.setAttribute('rx', barWidth / 2);
        bar.setAttribute('ry', barWidth / 2);
        bar.setAttribute('fill', color);

        svgEl.appendChild(bar);
    });
}

export function drawProgress(audioContainers, currentMode, progress) {
    const x = progress * WIDTH;

    audioContainers.forEach(container => {
        const mode = container.dataset.mode;
        const svgEl = container.querySelector('svg');

        svgEl.querySelectorAll('.playhead').forEach(e => e.remove());

        if (mode !== currentMode) return;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

        line.setAttribute('x', x);
        line.setAttribute('y', 0);
        line.setAttribute('width', 2);
        line.setAttribute('height', HEIGHT);
        line.setAttribute('fill', '#FF4D6D');
        line.classList.add('playhead');

        svgEl.appendChild(line);
    });
}