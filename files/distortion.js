export function makeDistortionCurve(drive, mode) {
    if (drive === 0) {
        const curve = new Float32Array(2);
        curve[0] = -1;
        curve[1] = 1;
        return curve;
    }

    const n_samples = 256;
    const curve = new Float32Array(n_samples);
    const gain = Math.exp(drive * 0.05);

    for (let i = 0; i < n_samples; i++) {
        const x = (i * 2) / n_samples - 1;
        const driven = x * gain;

        switch (mode) {
            case 'overdrive':
                curve[i] = driven / (1 + Math.abs(driven));
                break;
            case 'saturate':
                curve[i] = Math.tanh(driven) / Math.tanh(gain);
                break;
            case 'hardclip': {
                const threshold = 1 / gain;
                curve[i] = Math.max(-threshold, Math.min(threshold, driven));
                curve[i] /= threshold;
                break;
            }
            case 'sine':
                curve[i] = Math.tanh(Math.sin(driven * Math.PI * 0.5));
                break;
            default:
                curve[i] = x;
        }
    }

    return curve;
}