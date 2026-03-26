/**
 * Web Audio API Synthesis & Playback
 */

import { VOICES, GRID, ROWS_PER_VOICE, deriveEnsemble, getActiveKey, pixelToMidi } from './music-engine.js';

let audioCtx = null;
let isPlaying = false;
let scheduledNodes = [];
let playbackStartTime = 0;
let playbackTempo = 100;
let animFrameId = null;

export function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

export function playGrid(grid, tempo, onAnimationStep, onPlaybackFinished) {
  if (isPlaying) stopPlayback();
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  isPlaying = true;
  scheduledNodes = [];
  const beatDur = 60 / tempo / 2; // Eighth note duration
  const now = audioCtx.currentTime + 0.1;
  const ensemble = deriveEnsemble(grid);

  VOICES.forEach((voice, vi) => {
    for (let col = 0; col < GRID; col++) {
      const active = getActiveKey(grid, col);
      for (let b = 0; b < ROWS_PER_VOICE; b++) {
        const row = voice.rows[b];
        const px = grid[row][col];
        const { midi, vel } = pixelToMidi(px, voice, active.root, active.mode);
        if (midi < 0) continue;

        // Simple duration check for ties (placeholder for Phase 3)
        let dur = 1;
        
        const noteTime = now + (col * ROWS_PER_VOICE + b) * beatDur;
        const noteDur = dur * beatDur;
        const volume = 0.02 + (vel / 127) * 0.06;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = ensemble.waves[vi];
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

  playbackStartTime = now;
  playbackTempo = tempo;
  
  // Hand off animation to UI manager via callback
  const totalDur = GRID * ROWS_PER_VOICE * beatDur;
  startInternalAnimation(beatDur, onAnimationStep);
  
  setTimeout(() => {
    isPlaying = false;
    cancelAnimationFrame(animFrameId);
    if (onPlaybackFinished) onPlaybackFinished();
  }, totalDur * 1000 + 500);
}

export function stopPlayback() {
  isPlaying = false;
  cancelAnimationFrame(animFrameId);
  scheduledNodes.forEach(n => { try { n.stop(); } catch(e) {} });
  scheduledNodes = [];
}

function startInternalAnimation(beatDur, onStep) {
  function animate() {
    if (!isPlaying || !audioCtx) return;
    const elapsed = audioCtx.currentTime - playbackStartTime;
    const currentEighth = elapsed / beatDur;
    if (onStep) onStep(currentEighth);
    animFrameId = requestAnimationFrame(animate);
  }
  animFrameId = requestAnimationFrame(animate);
}

export function getAudioState() {
    return { isPlaying, audioCtx, playbackStartTime };
}
