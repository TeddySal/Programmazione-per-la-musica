import { state } from './state.js';
import { makeDistortionCurve } from './distortion.js';
import { computePeaks } from './waveform.js';

export const audioCtx = new AudioContext();

export const shaper = audioCtx.createWaveShaper();
export const filter = audioCtx.createBiquadFilter();

shaper.oversample = '4x';
shaper.curve = makeDistortionCurve(state.effects[0].options.drive, state.effects[0].options.type);

filter.type = state.effects[1].options.type;
filter.frequency.value = state.effects[1].options.frequency;

shaper.connect(filter);
filter.connect(audioCtx.destination);

export async function renderProcessedBuffer() {
    const offlineCtx = new OfflineAudioContext(1, state.audioBuffer.length, state.audioBuffer.sampleRate);

    const source = offlineCtx.createBufferSource();
    source.buffer = state.audioBuffer;

    const offlineShaper = offlineCtx.createWaveShaper();
    offlineShaper.oversample = '4x';
    offlineShaper.curve = makeDistortionCurve(state.effects[0].options.drive, state.effects[0].options.type);

    const offlineFilter = offlineCtx.createBiquadFilter();
    offlineFilter.type = 'highpass';
    offlineFilter.frequency.value = 0;

    source.connect(offlineShaper);
    offlineShaper.connect(offlineFilter);
    offlineFilter.connect(offlineCtx.destination);

    source.start(0);

    return offlineCtx.startRendering();
}

export async function updateShaperDrive(onUpdated) {
    const drive = state.effects[0].options.drive;
    shaper.curve = makeDistortionCurve(drive, state.effects[0].options.type);

    const processedBuffer = await renderProcessedBuffer();
    state.waves.processed = computePeaks(processedBuffer.getChannelData(0));

    onUpdated();
}