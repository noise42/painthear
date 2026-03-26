/**
 * High-level Synesthesia Mapping Logic (Image ↔ Music)
 */

import { rgbToOklch, oklchToRgb, rgbToHsl } from './color.js';
import { vlq, textEvent } from './midi-core.js';

export const GRID = 32;
export const ROWS_PER_VOICE = 8;
export const NUM_VOICES = 4;

export const VOICES = [
  { id: 'S', name: 'Soprano', clef: 'treble',   rows: [], lo: 60, hi: 79 },
  { id: 'A', name: 'Alto',    clef: 'treble',   rows: [], lo: 52, hi: 72 },
  { id: 'T', name: 'Tenor',   clef: 'treble-8', rows: [], lo: 45, hi: 64 },
  { id: 'B', name: 'Bass',    clef: 'bass',     rows: [], lo: 36, hi: 55 },
];
VOICES.forEach((v, i) => { v.rows = Array.from({length: ROWS_PER_VOICE}, (_, j) => i * ROWS_PER_VOICE + j); });

export const MODES = {
  major:  [0,2,4,5,7,9,11],
  minor:  [0,2,3,5,7,8,10],
  dorian: [0,2,3,5,7,9,10],
  lydian: [0,2,4,6,7,9,11],
};
export const KEY_NAMES = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];

export function scaleNotes(root, mode, lo, hi) {
  const pat = MODES[mode];
  const notes = [];
  for (let m = lo; m <= hi; m++) {
    if (pat.includes(((m - root) % 12 + 12) % 12)) notes.push(m);
  }
  return notes;
}

export function imageToGrid(img) {
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

/**
 * Improvement 2: Circle of Fifths Key Signature Detection
 * Uses circular mean of hues to deterministically select a key.
 */
export function deriveSectionKey(grid, startCol, count) {
  let sinSum = 0, cosSum = 0, lSum = 0;
  for (let c = startCol; c < startCol + count; c++) {
    for (let r = 0; r < GRID; r++) {
      const { L, h } = rgbToOklch(grid[r][c].r, grid[r][c].g, grid[r][c].b);
      const rad = h * Math.PI / 180;
      sinSum += Math.sin(rad);
      cosSum += Math.cos(rad);
      lSum += L;
    }
  }
  const num = count * GRID;
  const avgRad = Math.atan2(sinSum / num, cosSum / num);
  const avgH = (avgRad * 180 / Math.PI + 360) % 360;
  const avgL = lSum / num;

  const keyIndex = Math.round(avgH / 30) % 12;
  const mode = avgL >= 0.5 ? 'major' : 'minor';
  
  return { root: keyIndex, mode, avgH, avgL };
}

export function getActiveKey(grid, col) {
  const secStart = Math.floor(col / 8) * 8;
  const sec = deriveSectionKey(grid, secStart, 8);
  return { root: sec.root, mode: sec.mode, isTemp: false, baseRoot: sec.root, baseMode: sec.mode };
}

/**
 * Final Note Mapping with OKLch Support (Improvement 6)
 */
export function pixelToMidi(px, voice, root, mode) {
  const scale = scaleNotes(root, mode, voice.lo, voice.hi);
  if (scale.length === 0) return { midi: -1, vel: 0, l: 0 };
  
  const { L, C, h } = rgbToOklch(px.r, px.g, px.b);
  if (L < 0.15 || C < 0.05) return { midi: -1, vel: 0, l: 0 };
  
  const rawMidi = voice.lo + (h / 360) * (voice.hi - voice.lo);
  let closestMidi = scale[0];
  let minDiff = Infinity;
  for (const n of scale) {
    const diff = Math.abs(n - rawMidi);
    if (diff < minDiff) { minDiff = diff; closestMidi = n; }
  }

  const vel = Math.round(30 + (C / 0.4) * 97);
  return { midi: closestMidi, vel, L, h };
}

export const ENSEMBLES = {
  brass: { name: 'Brass Section', emoji: '🎺', midi: [56, 60, 57, 58], waves: ['square', 'sawtooth', 'square', 'sawtooth'] },
  winds: { name: 'Woodwinds', emoji: '🪈', midi: [73, 68, 71, 70], waves: ['sine', 'triangle', 'sine', 'triangle'] },
  strings: { name: 'String Quartet', emoji: '🎻', midi: [40, 41, 42, 43], waves: ['sawtooth', 'triangle', 'sawtooth', 'square'] },
  keys: { name: 'Keyboards/Mallets', emoji: '🎹', midi: [11, 12, 0, 4], waves: ['sine', 'sine', 'triangle', 'sine'] }
};

export function deriveEnsemble(grid) {
  let sumH = 0, sumC = 0, sumL = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const { L, C, h } = rgbToOklch(grid[y][x].r, grid[y][x].g, grid[y][x].b);
      sumH += h; sumC += C; sumL += L;
    }
  }
  const avgH = sumH / (GRID*GRID), avgC = sumC / (GRID*GRID), avgL = sumL / (GRID*GRID);

  if (avgC > 0.15 && (avgH < 60 || avgH > 300)) return ENSEMBLES.brass;
  if (avgC > 0.12 && avgH >= 120 && avgH <= 240 && avgL >= 0.4) return ENSEMBLES.winds;
  if (avgL < 0.4 || avgC < 0.1) return ENSEMBLES.strings;
  return ENSEMBLES.keys;
}

export function midiToAbc(midi) {
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

export function deriveTimeSig(w, h) { return '4/4'; } // Simplified for now
export function deriveTempo(grid) {
  let Lsum = 0;
  grid.forEach(row => row.forEach(px => {
    const { L } = rgbToOklch(px.r, px.g, px.b);
    Lsum += L;
  }));
  const avgL = Lsum / (GRID * GRID);
  return Math.round(60 + avgL * 120);
}
export function columnKey(grid, col) {
  return deriveSectionKey(grid, col, 8);
}

export function gridToAbc(grid, title, timeSig, tempo) {
  let abc = 'X:1\n';
  abc += 'T:' + title + '\n';
  abc += 'M:' + timeSig + '\n';
  abc += 'L:1/8\n';
  abc += 'Q:1/4=' + tempo + '\n';

  const secStart = deriveSectionKey(grid, 0, 8);
  const keyStr = KEY_NAMES[secStart.root] + (secStart.mode === 'minor' ? 'm' : '');
  abc += 'K:' + keyStr + '\n';

  VOICES.forEach(v => {
    abc += 'V:' + v.id + ' clef=' + v.clef + ' name="' + v.name + '"\n';
  });

  VOICES.forEach(voice => {
    abc += '[V:' + voice.id + ']\n';
    let line = '';
    let lastMidi = -1;

    for (let col = 0; col < GRID; col++) {
      const active = getActiveKey(grid, col);
      if (col % 8 === 0) {
        const kStr = KEY_NAMES[active.baseRoot] + (active.baseMode === 'minor' ? 'm' : '');
        line += `[K:${kStr}] `;
      }

      for (let b = 0; b < ROWS_PER_VOICE; b++) {
        const px = grid[voice.rows[b]][col];
        let { midi, vel, L } = pixelToMidi(px, voice, active.root, active.mode);
        if (midi < 0) continue;

        if (lastMidi !== -1) {
            let bestMidi = midi;
            let minLeap = Math.abs(midi - lastMidi);
            for (let oct = -2; oct <= 2; oct++) {
                if (oct === 0) continue;
                let altMidi = midi + (oct * 12);
                if (altMidi >= voice.lo && altMidi <= voice.hi) {
                    let leap = Math.abs(altMidi - lastMidi);
                    if (leap < minLeap) { minLeap = leap; bestMidi = altMidi; }
                }
            }
            midi = bestMidi;
        }
        lastMidi = midi;

        let grammarDur = 1;
        if (L >= 0.85) grammarDur = 8;
        else if (L >= 0.70) grammarDur = 4;
        else if (L >= 0.45) grammarDur = 2;
        
        const maxInMeasure = ROWS_PER_VOICE - b;
        let dur = 1;
        const targetDur = Math.min(grammarDur, maxInMeasure);
        while (dur < targetDur) {
            const next = pixelToMidi(grid[voice.rows[b+dur]][col], voice, active.root, active.mode);
            const suggNext = pixelToMidi(grid[voice.rows[b+dur]][col], voice, active.root, active.mode).midi;
            const suggCurr = pixelToMidi(px, voice, active.root, active.mode).midi;
            if (suggNext === suggCurr && next.L > 0.4) dur++;
            else break;
        }

        const noteAbc = midiToAbc(midi);
        if (dur === 1) line += noteAbc + ' ';
        else line += noteAbc + dur + ' ';
        b += dur - 1;
      }
      line += '| ';
      if ((col+1) % 4 === 0) line += '\n';
    }
    abc += line.trim() + '\n';
  });
  return abc;
}

export const SF_TO_ROOT = { '0':0, '1':7, '2':2, '3':9, '4':4, '5':11, '6':6, '-6':6, '-5':1, '-4':8, '-3':3, '-2':10, '-1':5 };

export function midiToGrid(parsed) {
  let aspectRatio = 1.0;
  let bgColor = { r: 20, g: 20, b: 25 };

  // Improvement 13: Extract Metadata from Composition (Global Controller Changes)
  const ccs = parsed.controllers || {};
  if (ccs[100] !== undefined && ccs[101] !== undefined) {
      const w = (ccs[100] << 7) | ccs[101];
      const h = (ccs[102] << 7) | ccs[103];
      if (w > 0 && h > 0) aspectRatio = w / h;
  }
  if (ccs[104] !== undefined) {
      bgColor = { r: ccs[104] * 2, g: ccs[105] * 2, b: ccs[106] * 2 };
  }

  const grid = Array.from({length: GRID}, () =>
    Array.from({length: GRID}, () => ({...bgColor}))
  );
  grid.aspectRatio = aspectRatio;

  const { tracks, tpq, programs, keySignatures } = parsed;
  const eighthTick = tpq / 2;
  const totalEighths = GRID * ROWS_PER_VOICE;

  const SF_TO_ROOT = { '0':0, '1':1, '2':2, '3':3, '4':4, '5':5, '6':6, '-5':7, '-4':8, '-3':9, '-2':10, '-1':11 };

  let ensembleFilter = 'keys';
  if (programs.length > 0) {
    const p = programs[0];
    if (p >= 56 && p <= 61) ensembleFilter = 'brass';
    else if (p >= 40 && p <= 45) ensembleFilter = 'strings';
    else if (p >= 68 && p <= 75) ensembleFilter = 'winds';
  }

  const voiceTracks = tracks.slice(0, NUM_VOICES);
  voiceTracks.forEach((notes, vi) => {
    const voice = VOICES[vi];
    if (!voice) return;

    notes.forEach(note => {
      const startEighth = Math.floor(note.start / eighthTick);
      if (startEighth >= totalEighths) return;
      const col = Math.floor(startEighth / ROWS_PER_VOICE);
      const beatStart = startEighth % ROWS_PER_VOICE;

      let activeKey = { sf: 0, mi: 0 };
      for (const ks of keySignatures) { if (ks.tick <= note.start) activeKey = ks; else break; }
      const root = SF_TO_ROOT[activeKey.sf] || 0;
      
      const delta85 = (note.ccs && note.ccs[85] !== undefined) ? note.ccs[85] - 64 : 0;
      const delta86 = (note.ccs && note.ccs[86] !== undefined) ? note.ccs[86] - 64 : 0;
      const originalSuggestedMidi = note.midi - delta85 - delta86;
      
      const pitchRange = voice.hi - voice.lo;
      const idealHue = ((originalSuggestedMidi - voice.lo) / pitchRange) * 360;
      
      const bendValue = note.bend || 8192;
      const bendOffset = bendValue - 8192;
      const residual = (bendOffset / 2048) * 15.0;
      let hue = (idealHue + residual + 360) % 360;

      let chroma = Math.max(0.05, (note.vel - 30) / 97 * 0.4);
      const durTicks = note.end - note.start;
      const durEighths = Math.round(durTicks / (tpq / 2));
      
      // Improvement 5: Symmetric Lightness Reconstruction (Boosted for Vibrancy)
      let lightness = 0.45;
      if (durEighths >= 8) lightness = 0.95;
      else if (durEighths >= 4) lightness = 0.82;
      else if (durEighths >= 2) lightness = 0.65;

      // Removed Ensemble Filters to ensure "Inversion Purity"
      const rgb = oklchToRgb(lightness, chroma, hue);
      for (let b = 0; b < durEighths; b++) {
        const beat = beatStart + b;
        if (beat >= ROWS_PER_VOICE || col >= GRID) break;
        grid[voice.rows[beat]][col] = rgb;
      }
    });
  });

  return grid;
}

export function generateMidiTracks(grid, tempo, title, timeSig, origW = 1024, origH = 1024) {
    const TPQ = 480;
    const EIGHTH = TPQ / 2;
    const tracks = [];

    // Calculate background color (average of desaturated/silent pixels)
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    grid.forEach(row => row.forEach(px => {
        const { L, C } = rgbToOklch(px.r, px.g, px.b);
        if (L < 0.15 || C < 0.05) {
            rSum += px.r; gSum += px.g; bSum += px.b; count++;
        }
    }));
    const bgR = count > 0 ? Math.round(rSum / count) : 20;
    const bgG = count > 0 ? Math.round(gSum / count) : 20;
    const bgB = count > 0 ? Math.round(bSum / count) : 25;

    const t0 = [];
    const metaEvents = [];
    metaEvents.push({ tick: 0, data: textEvent(0x03, title) });
    // CC-based encoding (Composition-Native Metadata)
    t0.push(...vlq(0), 0xB0, 100, (origW >> 7) & 0x7F, ...vlq(0), 0xB0, 101, origW & 0x7F);
    t0.push(...vlq(0), 0xB0, 102, (origH >> 7) & 0x7F, ...vlq(0), 0xB0, 103, origH & 0x7F);
    t0.push(...vlq(0), 0xB0, 104, (bgR >> 1) & 0x7F, ...vlq(0), 0xB0, 105, (bgG >> 1) & 0x7F, ...vlq(0), 0xB0, 106, (bgB >> 1) & 0x7F);

    const [num, den] = timeSig.split('/').map(Number);
    const denPow = Math.log2(den);
    metaEvents.push({ tick: 0, data: [0xFF, 0x58, 0x04, num, denPow, 0x18, 0x08] });
    const usPerQN = Math.round(60000000 / tempo);
    metaEvents.push({ tick: 0, data: [0xFF, 0x51, 0x03, (usPerQN>>16)&0xFF, (usPerQN>>8)&0xFF, usPerQN&0xFF] });

    const SF_MAP = [0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1];
    for (let sec = 0; sec < GRID/8; sec++) {
        const active = deriveSectionKey(grid, sec * 8, 8);
        const sf = SF_MAP[active.root];
        const mi = active.mode === 'minor' ? 1 : 0;
        metaEvents.push({ tick: sec * 8 * ROWS_PER_VOICE * EIGHTH, data: [0xFF, 0x59, 0x02, (sf < 0 ? 256 + sf : sf), mi] });
    }
    metaEvents.sort((a, b) => a.tick - b.tick);
    let lastTick = 0;
    metaEvents.forEach(e => { t0.push(...vlq(e.tick - lastTick), ...e.data); lastTick = e.tick; });
    t0.push(...vlq(0), 0xFF, 0x2F, 0x00);
    tracks.push(t0);

    const score = Array.from({length: NUM_VOICES}, () => []);
    const lastMidi = new Array(NUM_VOICES).fill(-1);

    for (let col = 0; col < GRID; col++) {
        const active = getActiveKey(grid, col);
        for (let b = 0; b < ROWS_PER_VOICE; b++) {
            VOICES.forEach((voice, vi) => {
                const px = grid[voice.rows[b]][col];
                let { midi, vel, L, h } = pixelToMidi(px, voice, active.root, active.mode);
                let origMidi = midi;
                let cc85 = 64, cc86 = 64; 

                if (midi >= 0) {
                    if (lastMidi[vi] !== -1) {
                        let bestMidi = midi, minLeap = Math.abs(midi - lastMidi[vi]);
                        for (let oct = -2; oct <= 2; oct++) {
                            if (oct === 0) continue;
                            let altMidi = midi + (oct * 12);
                            if (altMidi >= voice.lo && altMidi <= voice.hi) {
                                let leap = Math.abs(altMidi - lastMidi[vi]);
                                if (leap < minLeap) { minLeap = leap; bestMidi = altMidi; }
                            }
                        }
                        midi = bestMidi;
                    }
                    cc85 = 64 + (midi - origMidi);
                    lastMidi[vi] = midi;
                }
                score[vi].push({ midi, origMidi, vel, L, h, cc85, cc86, tick: (col * ROWS_PER_VOICE + b) * EIGHTH });
            });
        }
    }

     // Pass 2: Parallel Motion Cleanup (Note-Aware)
    // We iterate by slices but only apply changes to the START of a note interaction
    for (let t = 1; t < score[0].length; t++) {
        for (let i = 0; i < NUM_VOICES; i++) {
            for (let j = i + 1; j < NUM_VOICES; j++) {
                const n1_prev = score[i][t-1], n2_prev = score[j][t-1], n1 = score[i][t], n2 = score[j][t];
                if (n1.midi < 0 || n2.midi < 0 || n1_prev.midi < 0 || n2_prev.midi < 0) continue;
                
                // Only act if BOTH voices just started or just moved
                if (n1.midi === n1_prev.midi && n2.midi === n2_prev.midi) continue;

                if (Math.sign(n1.midi - n1_prev.midi) === Math.sign(n2.midi - n2_prev.midi)) {
                    const int1 = Math.abs(n1_prev.midi - n2_prev.midi) % 12, int2 = Math.abs(n1.midi - n2.midi) % 12;
                    if ((int1 === 7 || int1 === 0) && int1 === int2) {
                        let shift = (n1.midi + 12 <= VOICES[i].hi) ? 12 : (n1.midi - 12 >= VOICES[i].lo ? -12 : 0);
                        if (shift !== 0) {
                            // Apply shift to N1 and ALL subsequent eighths that belong to the SAME original note
                            const targetOrig = n1.origMidi;
                            for (let future = t; future < score[i].length; future++) {
                                if (score[i][future].origMidi === targetOrig) {
                                    score[i][future].midi += shift;
                                    score[i][future].cc86 = 64 + shift;
                                } else break;
                            }
                        }
                    }
                }
            }
        }
    }

    const ensemble = deriveEnsemble(grid);
    VOICES.forEach((voice, vi) => {
        const t = [];
        t.push(...vlq(0), ...textEvent(0x03, voice.name), ...vlq(0), 0xC0 | vi, ensemble.midi[vi]);
        let prevEnd = 0;
        const vScore = score[vi];
        for (let b = 0; b < vScore.length; b++) {
            const n = vScore[b];
            if (n.midi < 0) continue;
            let grammarDur = 1;
            if (n.L >= 0.85) grammarDur = 8; else if (n.L >= 0.70) grammarDur = 4; else if (n.L >= 0.45) grammarDur = 2;
            let dur = 1, maxInMeasure = 8 - (b % 8), targetDur = Math.min(grammarDur, maxInMeasure);
            while (dur < targetDur && b + dur < vScore.length) {
                const next = vScore[b + dur];
                if (next.origMidi === n.origMidi && next.L > 0.4) dur++; else break;
            }
            const idealHue = ((n.origMidi - voice.lo) / (voice.hi - voice.lo)) * 360;
            let residual = (n.h - idealHue + 540) % 360 - 180;
            const bendValue = 8192 + Math.round((residual / 15.0) * 2048);
            t.push(...vlq(Math.max(0, n.tick - prevEnd)), 0xE0|vi, bendValue&0x7F, (bendValue>>7)&0x7F);
            t.push(...vlq(0), 0xB0|vi, 85, n.cc85, ...vlq(0), 0xB0|vi, 86, n.cc86, ...vlq(0), 0x90|vi, n.midi, n.vel);
            t.push(...vlq(dur * EIGHTH), 0x80 | vi, n.midi, 0);
            prevEnd = n.tick + (dur * EIGHTH);
            b += dur - 1;
        }
        t.push(...vlq(0), 0xFF, 0x2F, 0x00);
        tracks.push(t);
    });
    return tracks;
}
