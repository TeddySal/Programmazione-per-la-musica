export const state = {
    audioBuffer: null,
    waves: { original: [], processed: [] },
    currentMode: 'original',
    progress: 0,
    duration: 0,
    effects: [
        { type: 'shaper', options: { type: 'overdrive', drive: 0 } },
        { type: 'filter', options: { type: 'highpass', frequency: 0 } },
        { type: 'reverb', options: {} }
    ],
    track: null,
    isPlaying: false,
    startTime: 0,
    offset: 0,
    stoppedManually: false,
    raf: null
};