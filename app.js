// ============================================================
//  SYNESTHESIA COMPOSER v2 — Image ↔ Classical Sheet Music
// ============================================================

const GRID = 32;
const ROWS_PER_VOICE = 8; // 8 rows per voice = 8 eighth notes per measure
const NUM_VOICES = 4;

const VOICES = [
  { id: 'S', name: 'Soprano', clef: 'treble',   rows: [], lo: 60, hi: 79 },
  { id: 'A', name: 'Alto',    clef: 'treble',   rows: [], lo: 52, hi: 72 },
  { id: 'T', name: 'Tenor',   clef: 'treble-8', rows: [], lo: 45, hi: 64 },
  { id: 'B', name: 'Bass',    clef: 'bass',     rows: [], lo: 36, hi: 55 },
];
// Compute row indices: voice 0 = rows 0-7, voice 1 = rows 8-15, etc.
VOICES.forEach((v, i) => { v.rows = Array.from({length: ROWS_PER_VOICE}, (_, j) => i * ROWS_PER_VOICE + j); });

const MODES = {
  major:  [0,2,4,5,7,9,11],
  minor:  [0,2,3,5,7,8,10],
  dorian: [0,2,3,5,7,9,10],
  lydian: [0,2,4,6,7,9,11],
};
const KEY_NAMES = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];

// State
let currentGrid = null;
let currentAbc = '';
let currentVisual = null;
let loadedImg = null;

// ---- Color Utilities ----
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    if (max === r) h = ((g-b)/d + (g<b?6:0))/6;
    else if (max === g) h = ((b-r)/d + 2)/6;
    else h = ((r-g)/d + 4)/6;
  }
  return { h: h*360, s, l };
}

function hslToRgb(h, s, l) {
  h /= 360;
  if (s === 0) return { r: Math.round(l*255), g: Math.round(l*255), b: Math.round(l*255) };
  const hue2rgb = (p,q,t) => {
    if (t<0) t+=1; if (t>1) t-=1;
    if (t<1/6) return p+(q-p)*6*t;
    if (t<1/2) return q;
    if (t<2/3) return p+(q-p)*(2/3-t)*6;
    return p;
  };
  const q = l<0.5 ? l*(1+s) : l+s-l*s;
  const p = 2*l - q;
  return {
    r: Math.round(hue2rgb(p,q,h+1/3)*255),
    g: Math.round(hue2rgb(p,q,h)*255),
    b: Math.round(hue2rgb(p,q,h-1/3)*255)
  };
}

// ---- Scale Utilities ----
function scaleNotes(root, mode, lo, hi) {
  const pat = MODES[mode];
  const notes = [];
  for (let m = lo; m <= hi; m++) {
    if (pat.includes(((m - root) % 12 + 12) % 12)) notes.push(m);
  }
  return notes;
}

// ---- MIDI ↔ ABC ----
function midiToAbc(midi) {
  const names = ['C','^C','D','_E','E','F','^F','G','_A','A','_B','B'];
  const oct = Math.floor(midi/12) - 1;
  const note = midi % 12;
  let abc = names[note];
  if (oct >= 5) {
    abc = abc.replace(/[A-G]/g, c => c.toLowerCase());
    for (let i = 0; i < oct-5; i++) abc += "'";
  } else {
    for (let i = 0; i < 4-oct; i++) abc += ",";
  }
  return abc;
}

// ---- Image → Grid ----
function imageToGrid(img) {
  const c = document.createElement('canvas');
  c.width = c.height = GRID;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, GRID, GRID);
  const d = ctx.getImageData(0, 0, GRID, GRID);
  const grid = [];
  for (let y = 0; y < GRID; y++) {
    grid[y] = [];
    for (let x = 0; x < GRID; x++) {
      const i = (y*GRID + x)*4;
      grid[y][x] = { r: d.data[i], g: d.data[i+1], b: d.data[i+2] };
    }
  }
  return grid;
}

// ---- Analyze column for key/mode ----
function columnKey(grid, col) {
  let hSum = 0, sSum = 0;
  for (let r = 0; r < GRID; r++) {
    const hsl = rgbToHsl(grid[r][col].r, grid[r][col].g, grid[r][col].b);
    hSum += hsl.h;
    sSum += hsl.s;
  }
  const avgH = hSum / GRID;
  const avgS = sSum / GRID;
  const root = Math.round(avgH / 30) % 12;
  let mode;
  if (avgS > 0.6) mode = 'major';
  else if (avgS > 0.4) mode = 'lydian';
  else if (avgS > 0.2) mode = 'dorian';
  else mode = 'minor';
  return { root, mode };
}

function deriveTimeSig(imgW, imgH) {
  const ar = imgW / imgH;
  if (ar > 1.8) return '12/8';
  if (ar > 1.4) return '6/8';
  if (ar > 1.05) return '4/4';
  if (ar > 0.85) return '3/4';
  return '2/4';
}

function deriveTempo(grid) {
  let edgeCount = 0;
  for (let y = 0; y < GRID-1; y++) {
    for (let x = 0; x < GRID-1; x++) {
      const c1 = grid[y][x], c2 = grid[y][x+1], c3 = grid[y+1][x];
      const diff1 = Math.abs(c1.r-c2.r) + Math.abs(c1.g-c2.g) + Math.abs(c1.b-c2.b);
      const diff2 = Math.abs(c1.r-c3.r) + Math.abs(c1.g-c3.g) + Math.abs(c1.b-c3.b);
      if (diff1 > 100) edgeCount++;
      if (diff2 > 100) edgeCount++;
    }
  }
  const maxEdges = (GRID-1)*GRID*2;
  const density = edgeCount / maxEdges;
  return Math.round(60 + density * 120);
}

// ---- Map pixel to MIDI note ----
function pixelToMidi(px, voice, root, mode) {
  const scale = scaleNotes(root, mode, voice.lo, voice.hi);
  if (scale.length === 0) return { midi: 60, vel: 64 };
  const { h, s, l } = rgbToHsl(px.r, px.g, px.b);
  const pIdx = Math.round((h / 360) * (scale.length - 1));
  const midi = scale[Math.min(pIdx, scale.length - 1)];
  const vel = Math.round(30 + s * 97); // 30-127
  return { midi, vel, l };
}

// ---- Grid → ABC with ties & dynamics ----
function gridToAbc(grid, title, timeSig, tempo) {
  let abc = 'X:1\n';
  abc += 'T:' + title + '\n';
  abc += 'M:' + timeSig + '\n';
  abc += 'L:1/8\n'; // Base unit = eighth note
  abc += 'Q:1/4=' + tempo + '\n';

  const { root: gRoot, mode: gMode } = columnKey(grid, 0);
  const keyStr = KEY_NAMES[gRoot] + (gMode === 'minor' ? 'm' : gMode === 'dorian' ? 'Dor' : gMode === 'lydian' ? 'Lyd' : '');
  abc += 'K:' + keyStr + '\n';

  VOICES.forEach(v => {
    abc += 'V:' + v.id + ' clef=' + v.clef + ' name="' + v.name + '"\n';
  });

  const rgbMeta = {};
  const DYN = ['!ppp!','!pp!','!p!','!mp!','!mf!','!f!','!ff!','!fff!'];

  VOICES.forEach(voice => {
    abc += '[V:' + voice.id + ']\n';
    rgbMeta[voice.id] = [];
    let line = '';

    for (let col = 0; col < GRID; col++) {
      const { root, mode } = columnKey(grid, col);
      const scale = scaleNotes(root, mode, voice.lo, voice.hi);

      // Collect notes for this measure
      const measureNotes = [];
      for (let b = 0; b < ROWS_PER_VOICE; b++) {
        const row = voice.rows[b];
        const px = grid[row][col];
        rgbMeta[voice.id].push({r: px.r, g: px.g, b: px.b});

        if (scale.length === 0) {
          measureNotes.push({ midi: -1, vel: 0, l: 0 }); // rest
        } else {
          measureNotes.push(pixelToMidi(px, voice, root, mode));
        }
      }

      // Group consecutive same-pitch notes into tied longer notes
      let i = 0;
      let beatInMeasure = 0;

      // Dynamic at start of measure
      if (measureNotes[0].vel > 0) {
        const dynIdx = Math.min(7, Math.floor((measureNotes[0].vel - 30) / 12));
        line += DYN[dynIdx];
      }

      while (i < measureNotes.length) {
        const n = measureNotes[i];
        if (n.midi < 0 || n.l < 0.12) {
          // Rest (very dark pixel = silence)
          line += 'z ';
          i++;
          beatInMeasure++;
          continue;
        }

        // Count consecutive same pitch for ties (legato)
        let runLen = 1;
        while (i + runLen < measureNotes.length &&
               measureNotes[i + runLen].midi === n.midi &&
               measureNotes[i + runLen].l > 0.12) {
          // Tie if lightness > 0.45 (medium-bright pixels sustain)
          if (measureNotes[i + runLen - 1].l > 0.45) {
            runLen++;
          } else {
            break;
          }
        }

        // Convert run length to ABC duration
        const noteAbc = midiToAbc(n.midi);
        if (runLen === 1) {
          line += noteAbc + ' ';
        } else if (runLen === 2) {
          line += noteAbc + '2 ';
        } else if (runLen === 3) {
          line += noteAbc + '3 ';
        } else if (runLen === 4) {
          line += noteAbc + '4 ';
        } else {
          line += noteAbc + '' + runLen + ' ';
        }

        i += runLen;
        beatInMeasure += runLen;
      }

      line += '| ';
      if ((col+1) % 4 === 0) line += '\n';
    }
    abc += line.trim() + '\n';
  });

  // RGB metadata for inversion
  abc += '% === RGB_META_START ===\n';
  VOICES.forEach(voice => {
    const data = rgbMeta[voice.id].map(c => c.r + '.' + c.g + '.' + c.b).join(';');
    abc += '% V:' + voice.id + ':' + data + '\n';
  });
  abc += '% === RGB_META_END ===\n';

  return abc;
}

// ---- ABC → Grid (Inversion) ----
function abcToGrid(abcString) {
  const grid = Array.from({length: GRID}, () => Array.from({length: GRID}, () => ({r:128,g:128,b:128})));
  const lines = abcString.split('\n');
  let inMeta = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '% === RGB_META_START ===') { inMeta = true; continue; }
    if (line === '% === RGB_META_END ===') { inMeta = false; continue; }
    if (!inMeta) continue;
    const vm = line.match(/^% V:(\w+):(.+)$/);
    if (!vm) continue;
    const voice = VOICES.find(v => v.id === vm[1]);
    if (!voice) continue;
    vm[2].split(';').forEach((pxStr, noteIdx) => {
      const parts = pxStr.split('.');
      if (parts.length !== 3) return;
      const col = Math.floor(noteIdx / ROWS_PER_VOICE);
      const beatIdx = noteIdx % ROWS_PER_VOICE;
      if (col < GRID) {
        const row = voice.rows[beatIdx];
        grid[row][col] = { r: parseInt(parts[0]), g: parseInt(parts[1]), b: parseInt(parts[2]) };
      }
    });
  }
  return grid;
}

// ---- Drawing ----
function drawPreview(img) {
  const c = document.getElementById('preview-canvas');
  const size = 512;
  const ar = img.width / img.height;
  c.width = ar >= 1 ? size : Math.round(size * ar);
  c.height = ar >= 1 ? Math.round(size / ar) : size;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
}

function drawGrid(grid, canvasId) {
  const c = document.getElementById(canvasId || 'grid-canvas');
  const ctx = c.getContext('2d');
  const cellW = c.width / GRID;
  const cellH = c.height / GRID;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const { r, g, b } = grid[y][x];
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x*cellW, y*cellH, cellW+1, cellH+1);
    }
  }
}

// ---- MIDI File Builder ----
function buildMidiFile(grid, tempo, title) {
  const TPQ = 480;
  const EIGHTH = TPQ / 2;

  function vlq(v) {
    const b = [v & 0x7F];
    v >>= 7;
    while (v > 0) { b.push((v & 0x7F) | 0x80); v >>= 7; }
    return b.reverse();
  }
  function u16(v) { return [(v>>8)&0xFF, v&0xFF]; }
  function u32(v) { return [(v>>24)&0xFF,(v>>16)&0xFF,(v>>8)&0xFF,v&0xFF]; }
  function textEvent(type, str) {
    const bytes = new TextEncoder().encode(str);
    return [...vlq(0), 0xFF, type, ...vlq(bytes.length), ...bytes];
  }

  const tracks = [];

  // Track 0: conductor (tempo + title)
  const t0 = [];
  t0.push(...textEvent(0x03, title)); // Track name
  const usPerQN = Math.round(60000000 / tempo);
  t0.push(...vlq(0), 0xFF, 0x51, 0x03, (usPerQN>>16)&0xFF, (usPerQN>>8)&0xFF, usPerQN&0xFF);
  t0.push(...vlq(0), 0xFF, 0x2F, 0x00);
  tracks.push(t0);

  // Tracks 1-4: SATB
  VOICES.forEach((voice, vi) => {
    const t = [];
    t.push(...textEvent(0x03, voice.name));
    // Program change (piano = 0)
    t.push(...vlq(0), 0xC0 | vi, 0);

    let prevEnd = 0;

    for (let col = 0; col < GRID; col++) {
      const { root, mode } = columnKey(grid, col);

      for (let b = 0; b < ROWS_PER_VOICE; b++) {
        const row = voice.rows[b];
        const px = grid[row][col];
        const { midi, vel, l } = pixelToMidi(px, voice, root, mode);

        if (l < 0.12) continue; // Rest

        const startTick = (col * ROWS_PER_VOICE + b) * EIGHTH;

        // Check consecutive same-pitch for tied duration
        let dur = 1;
        while (b + dur < ROWS_PER_VOICE) {
          const nextRow = voice.rows[b + dur];
          const nextPx = grid[nextRow][col];
          const next = pixelToMidi(nextPx, voice, root, mode);
          if (next.midi === midi && next.l > 0.12 && rgbToHsl(grid[voice.rows[b+dur-1]][col].r, grid[voice.rows[b+dur-1]][col].g, grid[voice.rows[b+dur-1]][col].b).l > 0.45) {
            dur++;
          } else break;
        }
        const durTicks = dur * EIGHTH;

        // Note on
        const onDelta = startTick - prevEnd;
        t.push(...vlq(Math.max(0, onDelta)), 0x90 | vi, midi, vel);
        // Note off
        t.push(...vlq(durTicks), 0x80 | vi, midi, 0);
        prevEnd = startTick + durTicks;

        b += dur - 1; // Skip tied beats
      }
    }

    t.push(...vlq(0), 0xFF, 0x2F, 0x00);
    tracks.push(t);
  });

  // Assemble file
  const header = [0x4D,0x54,0x68,0x64, ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(TPQ)];
  let file = [...header];
  tracks.forEach(td => {
    file.push(0x4D,0x54,0x72,0x6B, ...u32(td.length), ...td);
  });
  return new Uint8Array(file);
}

// ---- Web Audio Playback ----
let audioCtx = null;
let isPlaying = false;
let scheduledNodes = [];
let playbackStartTime = 0;
let playbackTempo = 100;
let animFrameId = null;

function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

function playGrid(grid, tempo) {
  if (isPlaying) stopPlayback();
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  // Chrome suspends AudioContext after inactivity — must resume on user gesture
  if (audioCtx.state === 'suspended') audioCtx.resume();
  isPlaying = true;
  scheduledNodes = [];
  const beatDur = 60 / tempo / 2; // Eighth note duration in seconds
  const now = audioCtx.currentTime + 0.1;
  const waveforms = ['sine', 'triangle', 'square', 'sawtooth'];

  VOICES.forEach((voice, vi) => {
    for (let col = 0; col < GRID; col++) {
      const { root, mode } = columnKey(grid, col);

      for (let b = 0; b < ROWS_PER_VOICE; b++) {
        const row = voice.rows[b];
        const px = grid[row][col];
        const { midi, vel, l } = pixelToMidi(px, voice, root, mode);
        if (l < 0.12) continue;

        // Tied duration
        let dur = 1;
        while (b + dur < ROWS_PER_VOICE) {
          const nRow = voice.rows[b + dur];
          const nPx = grid[nRow][col];
          const n = pixelToMidi(nPx, voice, root, mode);
          if (n.midi === midi && n.l > 0.12 && rgbToHsl(grid[voice.rows[b+dur-1]][col].r, grid[voice.rows[b+dur-1]][col].g, grid[voice.rows[b+dur-1]][col].b).l > 0.45) {
            dur++;
          } else break;
        }

        const noteTime = now + (col * ROWS_PER_VOICE + b) * beatDur;
        const noteDur = dur * beatDur;
        const volume = 0.02 + (vel / 127) * 0.06;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = waveforms[vi];
        osc.frequency.value = midiToFreq(midi);
        gain.gain.setValueAtTime(0, noteTime);
        gain.gain.linearRampToValueAtTime(volume, noteTime + 0.015);
        gain.gain.setValueAtTime(volume * 0.7, noteTime + noteDur * 0.7);
        gain.gain.linearRampToValueAtTime(0, noteTime + noteDur - 0.01);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(noteTime);
        osc.stop(noteTime + noteDur);
        scheduledNodes.push(osc);

        b += dur - 1;
      }
    }
  });

  const totalDur = GRID * ROWS_PER_VOICE * beatDur;
  playbackStartTime = now;
  playbackTempo = tempo;
  startPlaybackAnimation(beatDur);
  setTimeout(() => { isPlaying = false; cancelAnimationFrame(animFrameId); drawGrid(grid, 'grid-canvas'); }, totalDur * 1000 + 500);
}

function stopPlayback() {
  isPlaying = false;
  cancelAnimationFrame(animFrameId);
  scheduledNodes.forEach(n => { try { n.stop(); } catch(e) {} });
  scheduledNodes = [];
  if (currentGrid) drawGrid(currentGrid, 'grid-canvas');
}

function startPlaybackAnimation(beatDur) {
  const c = document.getElementById('grid-canvas');
  const ctx = c.getContext('2d');
  const cellW = c.width / GRID;
  const totalEighths = GRID * ROWS_PER_VOICE;

  function animate() {
    if (!isPlaying || !audioCtx) return;
    const elapsed = audioCtx.currentTime - playbackStartTime;
    const currentEighth = elapsed / beatDur;
    const currentCol = Math.floor(currentEighth / ROWS_PER_VOICE);
    const subBeat = (currentEighth % ROWS_PER_VOICE) / ROWS_PER_VOICE;

    // Redraw grid
    drawGrid(currentGrid, 'grid-canvas');

    // Draw completed columns overlay (dim)
    if (currentCol > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, currentCol * cellW, c.height);
    }

    // Draw current column highlight
    if (currentCol < GRID) {
      ctx.fillStyle = 'rgba(167, 139, 250, 0.3)';
      ctx.fillRect(currentCol * cellW, 0, cellW, c.height);

      // Thin bright scanline at exact sub-beat position
      const scanY = subBeat * c.height;
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentCol * cellW, scanY);
      ctx.lineTo((currentCol + 1) * cellW, scanY);
      ctx.stroke();
    }

    // Dim future columns slightly less
    if (currentCol + 1 < GRID) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect((currentCol + 1) * cellW, 0, c.width - (currentCol + 1) * cellW, c.height);
    }

    animFrameId = requestAnimationFrame(animate);
  }
  animFrameId = requestAnimationFrame(animate);
}

// ---- UI ----
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const canvasSection = document.getElementById('canvas-section');
const scoreSection = document.getElementById('score-section');
const invertSection = document.getElementById('invert-section');
const composeBtn = document.getElementById('compose-btn');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const downloadBtn = document.getElementById('download-btn');
const invertBtn = document.getElementById('invert-btn');
const scoreTitleInput = document.getElementById('score-title');

// Drag & Drop
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

function handleFile(file) {
  if (!file.type.startsWith('image/')) return;
  const img = new Image();
  img.onload = () => {
    loadedImg = img;
    drawPreview(img);
    currentGrid = imageToGrid(img);
    drawGrid(currentGrid, 'grid-canvas');

    const timeSig = deriveTimeSig(img.width, img.height);
    const tempo = deriveTempo(currentGrid);
    const { root, mode } = columnKey(currentGrid, 0);
    document.getElementById('stat-time').textContent = '⏱ ' + timeSig;
    document.getElementById('stat-tempo').textContent = '🎵 ' + tempo + ' BPM';
    document.getElementById('stat-key').textContent = '🔑 ' + KEY_NAMES[root] + ' ' + mode;

    // Default title from filename
    if (!scoreTitleInput.value) {
      scoreTitleInput.value = file.name.replace(/\.[^.]+$/, '');
    }

    canvasSection.classList.remove('hidden');
    scoreSection.classList.add('hidden');
    invertSection.classList.add('hidden');
  };
  img.src = URL.createObjectURL(file);
}

// Compose
composeBtn.addEventListener('click', () => {
  if (!currentGrid || !loadedImg) return;
  try {
    const timeSig = deriveTimeSig(loadedImg.width, loadedImg.height);
    const tempo = deriveTempo(currentGrid);
    const title = scoreTitleInput.value || 'Synesthesia Composition';
    currentAbc = gridToAbc(currentGrid, title, timeSig, tempo);
    currentVisual = ABCJS.renderAbc('paper', currentAbc, { responsive: 'resize' });
    scoreSection.classList.remove('hidden');
  } catch(e) {
    console.error('Compose error:', e);
  }
});

// Play
playBtn.addEventListener('click', () => {
  if (!currentGrid) return;
  playGrid(currentGrid, deriveTempo(currentGrid));
});

// Stop
stopBtn.addEventListener('click', stopPlayback);

// Download MIDI
downloadBtn.addEventListener('click', () => {
  if (!currentGrid) return;
  const tempo = deriveTempo(currentGrid);
  const title = scoreTitleInput.value || 'Synesthesia Composition';
  const midiData = buildMidiFile(currentGrid, tempo, title);
  const blob = new Blob([midiData], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = title.replace(/[^a-zA-Z0-9]/g, '_') + '.mid';
  a.click();
  URL.revokeObjectURL(url);
});

// Invert
invertBtn.addEventListener('click', () => {
  if (!currentAbc) return;
  const invertedGrid = abcToGrid(currentAbc);
  drawGrid(invertedGrid, 'invert-canvas');
  invertSection.classList.remove('hidden');
});

// ============================================================
//  MIDI → IMAGE: Reverse Pipeline
// ============================================================

// ---- Minimal MIDI Parser ----
function parseMidi(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  let pos = 0;

  function readU16() { const v = (data[pos]<<8)|data[pos+1]; pos+=2; return v; }
  function readU32() { const v = (data[pos]<<24)|(data[pos+1]<<16)|(data[pos+2]<<8)|data[pos+3]; pos+=4; return v; }
  function readVLQ() {
    let v = 0;
    while (true) {
      const b = data[pos++];
      v = (v << 7) | (b & 0x7F);
      if (!(b & 0x80)) break;
    }
    return v;
  }
  function readStr(n) { let s=''; for(let i=0;i<n;i++) s+=String.fromCharCode(data[pos++]); return s; }

  // Header
  const hdrId = readStr(4); // "MThd"
  const hdrLen = readU32();
  const format = readU16();
  const nTracks = readU16();
  const tpq = readU16();
  if (hdrId !== 'MThd') throw new Error('Not a MIDI file');

  let tempo = 500000; // default 120 BPM
  const tracks = [];

  for (let t = 0; t < nTracks; t++) {
    const trkId = readStr(4); // "MTrk"
    const trkLen = readU32();
    const trkEnd = pos + trkLen;
    const notes = [];
    let absTick = 0;
    let runningStatus = 0;
    const activeNotes = {}; // midi -> {tick, vel}

    while (pos < trkEnd) {
      const delta = readVLQ();
      absTick += delta;

      let status = data[pos];
      if (status < 0x80) {
        // Running status
        status = runningStatus;
      } else {
        pos++;
        if (status >= 0x80 && status < 0xF0) runningStatus = status;
      }

      const type = status & 0xF0;

      if (status === 0xFF) {
        // Meta event
        const metaType = data[pos++];
        const metaLen = readVLQ();
        if (metaType === 0x51 && metaLen === 3) {
          tempo = (data[pos]<<16)|(data[pos+1]<<8)|data[pos+2];
        }
        pos += metaLen;
      } else if (type === 0x90) {
        // Note on
        const note = data[pos++];
        const vel = data[pos++];
        if (vel > 0) {
          activeNotes[note] = { tick: absTick, vel };
        } else {
          // vel=0 is note off
          if (activeNotes[note]) {
            notes.push({ midi: note, vel: activeNotes[note].vel, start: activeNotes[note].tick, end: absTick });
            delete activeNotes[note];
          }
        }
      } else if (type === 0x80) {
        // Note off
        const note = data[pos++];
        pos++; // vel
        if (activeNotes[note]) {
          notes.push({ midi: note, vel: activeNotes[note].vel, start: activeNotes[note].tick, end: absTick });
          delete activeNotes[note];
        }
      } else if (type === 0xC0 || type === 0xD0) {
        pos++; // 1 data byte
      } else if (type === 0xF0 || type === 0xF7) {
        const len = readVLQ();
        pos += len;
      } else {
        pos += 2; // 2 data bytes (most channel messages)
      }
    }
    pos = trkEnd;
    if (notes.length > 0) tracks.push(notes);
  }

  const bpm = Math.round(60000000 / tempo);
  return { tracks, tpq, bpm };
}

// ---- MIDI notes → 32×32 grid ----
function midiToGrid(parsed) {
  const grid = Array.from({length: GRID}, () =>
    Array.from({length: GRID}, () => ({r: 10, g: 10, b: 15})) // near-black background
  );

  const { tracks, tpq } = parsed;
  const eighthTick = tpq / 2; // ticks per eighth note
  const totalEighths = GRID * ROWS_PER_VOICE; // 32 measures × 8 eighths
  const totalTicks = totalEighths * eighthTick;

  // Assign tracks to voices (up to 4)
  const voiceTracks = tracks.slice(0, NUM_VOICES);

  voiceTracks.forEach((notes, vi) => {
    const voice = VOICES[vi];
    if (!voice) return;

    notes.forEach(note => {
      // Map tick position to grid position
      const startEighth = Math.floor(note.start / eighthTick);
      const endEighth = Math.ceil(note.end / eighthTick);
      if (startEighth >= totalEighths) return;

      const col = Math.floor(startEighth / ROWS_PER_VOICE);
      const beatStart = startEighth % ROWS_PER_VOICE;

      // Map MIDI pitch to hue (0-360)
      const pitchRange = voice.hi - voice.lo;
      const clampedMidi = Math.max(voice.lo, Math.min(voice.hi, note.midi));
      const hue = ((clampedMidi - voice.lo) / pitchRange) * 330; // 0-330 to avoid red wrapping

      // Map velocity to saturation
      const sat = Math.max(0.15, Math.min(1, (note.vel - 20) / 100));

      // Map duration to lightness (longer = brighter)
      const durEighths = Math.min(ROWS_PER_VOICE, endEighth - startEighth);
      const lightness = 0.25 + (durEighths / ROWS_PER_VOICE) * 0.5;

      // Fill grid cells for this note's duration
      for (let b = 0; b < durEighths; b++) {
        const beat = beatStart + b;
        if (beat >= ROWS_PER_VOICE) break;
        if (col >= GRID) break;
        const row = voice.rows[beat];
        const rgb = hslToRgb(hue, sat, lightness);
        grid[row][col] = rgb;
      }
    });
  });

  return grid;
}

// ---- MIDI playback with cursor on generated grid ----
let midiGrid = null;
let midiTempo = 120;

function playMidiGrid() {
  if (!midiGrid) return;
  // Reuse the existing playGrid + cursor animation on the midi-grid-canvas
  if (isPlaying) stopPlayback();
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  isPlaying = true;
  scheduledNodes = [];

  const beatDur = 60 / midiTempo / 2;
  const now = audioCtx.currentTime + 0.1;
  const waveforms = ['sine', 'triangle', 'square', 'sawtooth'];

  VOICES.forEach((voice, vi) => {
    for (let col = 0; col < GRID; col++) {
      for (let b = 0; b < ROWS_PER_VOICE; b++) {
        const row = voice.rows[b];
        const px = midiGrid[row][col];
        const { h, s, l } = rgbToHsl(px.r, px.g, px.b);
        if (l < 0.15 && s < 0.1) continue; // Skip near-black (background)

        // Check tied
        let dur = 1;
        while (b + dur < ROWS_PER_VOICE) {
          const nRow = voice.rows[b + dur];
          const nPx = midiGrid[nRow][col];
          const nHsl = rgbToHsl(nPx.r, nPx.g, nPx.b);
          if (Math.abs(nHsl.h - h) < 15 && nHsl.l > 0.15) dur++;
          else break;
        }

        const freq = midiToFreq(Math.round(voice.lo + (h / 330) * (voice.hi - voice.lo)));
        const volume = 0.02 + s * 0.06;
        const noteTime = now + (col * ROWS_PER_VOICE + b) * beatDur;
        const noteDur = dur * beatDur;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = waveforms[vi];
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, noteTime);
        gain.gain.linearRampToValueAtTime(volume, noteTime + 0.015);
        gain.gain.setValueAtTime(volume * 0.7, noteTime + noteDur * 0.7);
        gain.gain.linearRampToValueAtTime(0, noteTime + noteDur - 0.01);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(noteTime);
        osc.stop(noteTime + noteDur);
        scheduledNodes.push(osc);
        b += dur - 1;
      }
    }
  });

  playbackStartTime = now;
  // Cursor animation on the midi grid canvas
  startMidiPlaybackAnimation(beatDur);
  const totalDur = GRID * ROWS_PER_VOICE * beatDur;
  setTimeout(() => {
    isPlaying = false;
    cancelAnimationFrame(animFrameId);
    drawGrid(midiGrid, 'midi-grid-canvas');
  }, totalDur * 1000 + 500);
}

function startMidiPlaybackAnimation(beatDur) {
  const c = document.getElementById('midi-grid-canvas');
  const ctx = c.getContext('2d');
  const cellW = c.width / GRID;

  function animate() {
    if (!isPlaying || !audioCtx) return;
    const elapsed = audioCtx.currentTime - playbackStartTime;
    const currentEighth = elapsed / beatDur;
    const currentCol = Math.floor(currentEighth / ROWS_PER_VOICE);
    const subBeat = (currentEighth % ROWS_PER_VOICE) / ROWS_PER_VOICE;

    drawGrid(midiGrid, 'midi-grid-canvas');

    if (currentCol > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, currentCol * cellW, c.height);
    }
    if (currentCol < GRID) {
      ctx.fillStyle = 'rgba(167,139,250,0.3)';
      ctx.fillRect(currentCol * cellW, 0, cellW, c.height);
      ctx.strokeStyle = 'rgba(244,114,182,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentCol * cellW, subBeat * c.height);
      ctx.lineTo((currentCol+1) * cellW, subBeat * c.height);
      ctx.stroke();
    }
    if (currentCol+1 < GRID) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect((currentCol+1)*cellW, 0, c.width-(currentCol+1)*cellW, c.height);
    }
    animFrameId = requestAnimationFrame(animate);
  }
  animFrameId = requestAnimationFrame(animate);
}

// ---- MIDI Upload UI Wiring ----
const midiDropZone = document.getElementById('midi-drop-zone');
const midiFileInput = document.getElementById('midi-file-input');
const midiImageSection = document.getElementById('midi-image-section');
const midiPlayBtn = document.getElementById('midi-play-btn');
const midiStopBtn = document.getElementById('midi-stop-btn');

midiDropZone.addEventListener('dragover', (e) => { e.preventDefault(); midiDropZone.classList.add('dragover'); });
midiDropZone.addEventListener('dragleave', () => midiDropZone.classList.remove('dragover'));
midiDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  midiDropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleMidiFile(e.dataTransfer.files[0]);
});
midiDropZone.addEventListener('click', () => midiFileInput.click());
midiFileInput.addEventListener('change', (e) => { if (e.target.files.length) handleMidiFile(e.target.files[0]); });

function handleMidiFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = parseMidi(e.target.result);
      console.log('Parsed MIDI:', parsed.tracks.length, 'tracks,', parsed.bpm, 'BPM');
      midiTempo = parsed.bpm;
      midiGrid = midiToGrid(parsed);
      drawGrid(midiGrid, 'midi-grid-canvas');
      midiImageSection.classList.remove('hidden');
      // Hide image→music sections
      canvasSection.classList.add('hidden');
      scoreSection.classList.add('hidden');
      invertSection.classList.add('hidden');
    } catch(err) {
      console.error('MIDI parse error:', err);
      alert('Could not parse MIDI file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

midiPlayBtn.addEventListener('click', playMidiGrid);
midiStopBtn.addEventListener('click', () => {
  stopPlayback();
  if (midiGrid) drawGrid(midiGrid, 'midi-grid-canvas');
});
