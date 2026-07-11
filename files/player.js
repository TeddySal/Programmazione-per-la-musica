import { state } from './state.js';
import { audioCtx, shaper } from './audioEngine.js';
import { draw } from './render.js';
import { timeLabel } from './dom.js';

let onPlaybackEnded = () => {};

export function setOnPlaybackEnded(callback) {
    onPlaybackEnded = callback;
}

export function getCurrentTime() {
    if (!state.isPlaying) return state.offset;
    return state.offset + (audioCtx.currentTime - state.startTime);
}

export function formatTime(time) {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function updateUI() {
    const current = getCurrentTime();
    timeLabel.textContent = `${formatTime(current)}/${formatTime(state.duration)}`;
}

export function playTrack() {
    if (state.track) {
        state.track.stop();
        state.track.disconnect();
    }

    state.track = audioCtx.createBufferSource();
    state.track.buffer = state.audioBuffer;

    if (state.currentMode === 'original') {
        state.track.connect(audioCtx.destination);
    }

    if (state.currentMode === 'processed') {
        state.track.connect(shaper);
    }

    state.stoppedManually = false;

    state.track.onended = () => {
        if (state.stoppedManually) return;

        state.isPlaying = false;
        state.offset = 0;
        state.progress = 1;

        cancelAnimationFrame(state.raf);
        draw();
        onPlaybackEnded();
    };

    state.startTime = audioCtx.currentTime;
    state.track.start(0, state.offset);
    updateProgress();
}

export function pauseTrack() {
    if (!state.track) return;

    state.stoppedManually = true;
    state.track.stop();
    state.offset += audioCtx.currentTime - state.startTime;

    cancelAnimationFrame(state.raf);
}

export function updateProgress() {
    if (!state.isPlaying) return;

    const current = state.offset + (audioCtx.currentTime - state.startTime);
    const duration = state.track?.buffer?.duration || 1;

    state.progress = current / duration;

    draw();
    updateUI();

    state.raf = requestAnimationFrame(updateProgress);
}

export function seek(percent) {
    state.progress = percent;
    state.offset = percent * state.audioBuffer.duration;

    draw();

    if (state.isPlaying) {
        state.track.stop();
        playTrack();
    }
}