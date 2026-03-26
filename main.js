/**
 * Main Entry Point - Synesthesia Composer
 */

import { GRID, NUM_VOICES, KEY_NAMES, SF_TO_ROOT, imageToGrid, deriveTimeSig, deriveTempo, deriveEnsemble, columnKey, gridToAbc, midiToGrid, generateMidiTracks } from './music-engine.js';
import { buildMidiFile, parseMidi } from './midi-core.js';
import { playGrid, stopPlayback } from './audio-synth.js';
import { drawPreview, drawGrid, updateStats, drawAnimationOverlay } from './ui-manager.js';

// State
let currentGrid = null;
let currentAbc = '';
let loadedImg = null;

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const midiInput = document.getElementById('midi-input'); // New in HTML soon
const canvasSection = document.getElementById('canvas-section');
const scoreSection = document.getElementById('score-section');
const invertSection = document.getElementById('invert-section');
const composeBtn = document.getElementById('compose-btn');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const downloadBtn = document.getElementById('download-btn');
const invertBtn = document.getElementById('invert-btn');
const scoreTitleInput = document.getElementById('score-title');

// Initialize
function init() {
    setupEventListeners();
}

function setupEventListeners() {
    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    dropZone.addEventListener('click', (e) => {
        // Prevents double-trigger if clicking buttons or specific labels inside the zone
        if (e.target === dropZone || e.target.closest('p')) {
            fileInput.click();
        }
    });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });
    if (midiInput) {
        midiInput.addEventListener('change', (e) => { if (e.target.files.length) handleMidiFile(e.target.files[0]); });
    }

    // Actions
    composeBtn.addEventListener('click', composeScore);
    playBtn.addEventListener('click', startPlayback);
    stopBtn.addEventListener('click', stopPlayback);
    downloadBtn.addEventListener('click', downloadMidi);
    invertBtn.addEventListener('click', previewShadow);
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
        loadedImg = img;
        drawPreview(img);
        currentGrid = imageToGrid(img);
        drawGrid(currentGrid);

        const timeSig = deriveTimeSig(img.width, img.height);
        const tempo = deriveTempo(currentGrid);
        const ensemble = deriveEnsemble(currentGrid);
        const { root, mode } = columnKey(currentGrid, 0);
        
        updateStats({
            time: timeSig,
            tempo: tempo,
            key: KEY_NAMES[root] + ' ' + mode,
            ensemble: ensemble
        });

        if (!scoreTitleInput.value) {
            scoreTitleInput.value = file.name.replace(/\.[^.]+$/, '');
        }

        canvasSection.classList.remove('hidden');
        scoreSection.classList.add('hidden');
        invertSection.classList.add('hidden');
    };
    img.src = URL.createObjectURL(file);
}

function composeScore() {
    if (!currentGrid) return;
    const tempo = deriveTempo(currentGrid);
    const title = scoreTitleInput.value || 'Synesthesia Composition';
    let timeSig = '4/4';
    if (loadedImg) {
        timeSig = deriveTimeSig(loadedImg.width, loadedImg.height);
    }
    
    currentAbc = gridToAbc(currentGrid, title, timeSig, tempo);
    if (window.ABCJS) {
        ABCJS.renderAbc('paper', currentAbc, { responsive: 'resize' });
    }
    scoreSection.classList.remove('hidden');
    scoreSection.scrollIntoView({ behavior: 'smooth' });
}

function startPlayback() {
    if (!currentGrid) return;
    const tempo = deriveTempo(currentGrid);
    playGrid(currentGrid, tempo, (currentEighth) => {
        drawAnimationOverlay('grid-canvas', currentGrid, currentEighth, NUM_VOICES);
    }, () => {
        drawGrid(currentGrid, 'grid-canvas');
    });
}

function downloadMidi() {
    if (!currentGrid) return;
    const tempo = deriveTempo(currentGrid);
    const title = (scoreTitleInput.value || 'Synesthesia-Composition').trim();
    const timeSig = loadedImg ? deriveTimeSig(loadedImg.width, loadedImg.height) : '4/4';
    const w = loadedImg ? loadedImg.width : 1024;
    const h = loadedImg ? loadedImg.height : 1024;
    
    const tracks = generateMidiTracks(currentGrid, tempo, title, timeSig, w, h);
    const midiData = buildMidiFile(tracks);
    const blob = new Blob([midiData], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    const safeName = title.replace(/[^a-z0-9_\-]/gi, '_') || 'composition';
    a.download = safeName + '.mid';
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

function previewShadow() {
    if (!currentGrid) return;
    const tempo = deriveTempo(currentGrid);
    const title = scoreTitleInput.value || 'Synesthesia Composition';
    let timeSig = '4/4';
    let w = 1024, h = 1024;
    if (loadedImg) {
        timeSig = deriveTimeSig(loadedImg.width, loadedImg.height);
        w = loadedImg.width; h = loadedImg.height;
    }

    try {
        const tracks = generateMidiTracks(currentGrid, tempo, title, timeSig, w, h);
        const midiBuffer = buildMidiFile(tracks);
        const parsed = parseMidi(midiBuffer.buffer || midiBuffer);
        const generatedGrid = midiToGrid(parsed);
        drawGrid(generatedGrid, 'invert-canvas');
        invertSection.classList.remove('hidden');
        invertSection.scrollIntoView({ behavior: 'smooth' });
    } catch(e) {
        console.error("Preview Shadow error:", e);
    }
}

function handleMidiFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const parsed = parseMidi(e.target.result);
        const grid = midiToGrid(parsed);
        currentGrid = grid;
        loadedImg = null; 
        
        drawGrid(grid, 'grid-canvas');
        canvasSection.classList.remove('hidden');
        
        const tempo = parsed.bpm || 120;
        const firstKS = parsed.keySignatures[0] || { sf: 0, mi: 0 };
        const root = SF_TO_ROOT[firstKS.sf] || 0;
        const mode = firstKS.mi === 1 ? 'minor' : 'major';

        updateStats({
            time: '4/4',
            tempo: tempo,
            key: KEY_NAMES[root] + ' ' + mode,
            ensemble: { name: 'MIDI Import', emoji: '🎶' }
        });

        scoreTitleInput.value = file.name.replace(/\.[^.]+$/, '');
        composeScore();
    };
    reader.readAsArrayBuffer(file);
}

// Start app
init();
