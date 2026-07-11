import { state } from './state.js';
import { playBtn, audioContainers, audioSelectedName, svgElements } from './dom.js';
import { playTrack, pauseTrack, seek, setOnPlaybackEnded } from './player.js';
import { openDistortionPanel, openCompressorPanel } from './fxPanels.js';

function togglePlayIcon() {
    playBtn.children[0].classList.toggle('d-none');
    playBtn.children[1].classList.toggle('d-none');
}

export function initUI() {
    playBtn.addEventListener('click', () => {
        togglePlayIcon();
        state.isPlaying = !state.isPlaying;

        if (state.isPlaying) {
            playTrack();
        } else {
            pauseTrack();
        }
    });

    setOnPlaybackEnded(() => {
        togglePlayIcon();
    });

    audioContainers.forEach(c => {
        c.addEventListener('click', () => {
            audioContainers.forEach(el => el.classList.toggle('is-active', el === c));
            state.currentMode = c.dataset.mode;
            audioSelectedName.textContent = c.querySelector('.track-type').textContent;
        });
    });

    document.querySelectorAll('.effect').forEach(effect => {
        effect.addEventListener('click', () => {
            const type = effect.dataset.effect;

            if (type === 'distorsion') {
                openDistortionPanel();
            } else {
                openCompressorPanel();
            }
        });
    });

    svgElements.forEach(el => {
        el.addEventListener('click', (e) => {
            if (!state.audioBuffer) return;

            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;

            seek(percent);
        });
    });
}