const importButton = document.querySelector('.bi-box-arrow-in-down');
const trackPicker = document.querySelector('#trackPicker');
const recordButton = document.querySelector('.record-btn');

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