import { saveAudio } from './db.js';

const importButton = document.querySelector('.bi-box-arrow-in-down');
const trackPicker = document.querySelector('#trackPicker');
const recordButton = document.querySelector('.record-btn');
const overlay = document.querySelector('#fullscreen-drop-overlay');
let  dragCounter = 0;

importButton.addEventListener('click', () => {
    trackPicker.click();
});

trackPicker.addEventListener('change', async (e) => {
    const audio = e.target.files?.[0];
    if (!audio) return;

    await saveAudio(audio);

    window.location = 'player.html';
});

recordButton.addEventListener('click', () => {
    window.location = 'rec.html';
});

window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    overlay.classList.add('active');
})

window.addEventListener('dragover', (e) => {
    e.preventDefault();
});

window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
        overlay.classList.remove('active');
    }
});

window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.remove('active');

    const files = e.dataTransfer.files;

    if (files.length > 0) {
        const file = files[0];

        if (!file.type.startsWith('audio/')) {
            alert('Per favore carica un file audio valido.')
            return;
        }

        await saveAudio(file);
        window.location.href = 'player.html';
    }
});