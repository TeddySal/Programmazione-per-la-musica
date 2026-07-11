import { state } from './state.js';
import { updateShaperDrive } from './audioEngine.js';
import { draw } from './render.js';

const modalEl = document.getElementById('exampleModal');
const modal = new bootstrap.Modal(modalEl);
const modalBody = modalEl.querySelector('.modal-body');

function distortionPanelHTML() {
    return `
        <div class="fx-panel">
            <div class="fx-header">
                <h5 class="fx-title">Distorsion</h5>
                <div class="fx-status">Active</div>
            </div>
            <div class="fx-body">
                <div class="fx-control" data-param="drive">
                    <div class="fx-label">Drive</div>
                    <input type="range" class="fx-slider" min="0" max="100" value="0">
                    <div class="fx-scale">
                        <span>1</span>
                        <span>100</span>
                    </div>
                </div>
                <div class="fx-toggle">
                    <label>
                        <input type="checkbox" checked>
                        Enabled
                    </label>
                </div>
            </div>
        </div>
    `;
}

function compressorPanelHTML() {
    return `
        <div class="fx-panel">
            <div class="fx-header">
                <h5 class="fx-title">Compressor</h5>
                <div class="fx-status">Active</div>
            </div>
            <div class="fx-body">
                <div class="fx-control">
                    <div class="fx-label">Threshold</div>
                    <input type="range" class="fx-slider" min="-60" max="0" value="-24">
                    <div class="fx-scale">
                        <span>-60</span>
                        <span>-24</span>
                        <span>0</span>
                    </div>
                </div>
                <div class="fx-control">
                    <div class="fx-label">Ratio</div>
                    <input type="range" class="fx-slider" min="1" max="20" value="4">
                    <div class="fx-scale">
                        <span>1:1</span>
                        <span>4:1</span>
                        <span>20:1</span>
                    </div>
                </div>
                <div class="fx-control">
                    <div class="fx-label">Attack</div>
                    <input type="range" class="fx-slider" min="0" max="100" value="10">
                </div>
                <div class="fx-control">
                    <div class="fx-label">Release</div>
                    <input type="range" class="fx-slider" min="10" max="1000" value="250">
                </div>
                <div class="fx-toggle">
                    <label>
                        <input type="checkbox" checked>
                        Enabled
                    </label>
                </div>
            </div>
        </div>
    `;
}

function bindDriveSlider() {
    const driveControl = modalBody.querySelector('.fx-control[data-param="drive"]');
    const slider = driveControl.querySelector('.fx-slider');

    slider.addEventListener('change', (e) => {
        state.effects[0].options.drive = e.target.value;
        updateShaperDrive(draw);
    });
}

export function openDistortionPanel() {
    modalBody.innerHTML = distortionPanelHTML();
    bindDriveSlider();
    modal.show();
}

export function openCompressorPanel() {
    modalBody.innerHTML = compressorPanelHTML();
    modal.show();
}