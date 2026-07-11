import audio from './AudioEngine.js';

export default class Reverb {
    constructor () {
        this.ctx = audio.audioCtx;

        this.convolver = this.ctx.createConvolver();
        this.loaded = false;
    }

    get node() { return this.convolver; }

    setOutput(node) {
        this.convolver.connect(node);
    }

    toDestination() {
        this.convolver.connect(audio.master);
    }

    async loadSample() {
        const res = await fetch('/wav/Giant Center Temporary Flown PA Matted Rink Seats (High Gain).wav');
        const arrayBuffer = await res.arrayBuffer();
        this.convolver.buffer = await this.ctx.decodeAudioData(arrayBuffer);

        this.loaded = true;
    }
}