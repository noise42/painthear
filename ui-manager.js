/**
 * UI & DOM Management (Canvas, Event Listeners)
 */

import { GRID } from './music-engine.js';

export function drawPreview(img) {
  const c = document.getElementById('preview-canvas');
  const size = 512;
  const ar = img.width / img.height;
  c.width = ar >= 1 ? size : Math.round(size * ar);
  c.height = ar >= 1 ? Math.round(size / ar) : size;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
}

export function drawGrid(grid, canvasId) {
  const c = document.getElementById(canvasId || 'grid-canvas');
  const size = 512;
  if (grid.aspectRatio) {
    if (grid.aspectRatio >= 1) {
      c.width = size;
      c.height = Math.round(size / grid.aspectRatio);
    } else {
      c.height = size;
      c.width = Math.round(size * grid.aspectRatio);
    }
  }

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

export function updateStats(stats) {
    if (stats.time) document.getElementById('stat-time').textContent = '⏱ ' + stats.time;
    if (stats.tempo) document.getElementById('stat-tempo').textContent = '🎵 ' + stats.tempo + ' BPM';
    if (stats.key) document.getElementById('stat-key').textContent = '🔑 ' + stats.key;
    if (stats.ensemble) document.getElementById('stat-ensemble').textContent = stats.ensemble.emoji + ' ' + stats.ensemble.name;
}

export function drawAnimationOverlay(canvasId, grid, currentEighth, NUM_VOICES) {
    const c = document.getElementById(canvasId);
    if (!c) return;
    const ctx = c.getContext('2d');
    const cellW = c.width / GRID;
    const currentCol = Math.floor(currentEighth / 8);
    const subBeat = (currentEighth % 8) / 8;

    // Redraw grid first
    drawGrid(grid, canvasId);

    // Dim past
    if (currentCol > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, currentCol * cellW, c.height);
    }

    // Highlight current
    if (currentCol < GRID) {
        ctx.fillStyle = 'rgba(167, 139, 250, 0.3)';
        ctx.fillRect(currentCol * cellW, 0, cellW, c.height);

        // 4 Voice Scanlines
        ctx.strokeStyle = 'rgba(244, 114, 182, 0.9)';
        ctx.lineWidth = 2;
        for (let vi = 0; vi < NUM_VOICES; vi++) {
            const scanY = (vi + subBeat) * (c.height / NUM_VOICES);
            ctx.beginPath();
            ctx.moveTo(currentCol * cellW, scanY);
            ctx.lineTo((currentCol + 1) * cellW, scanY);
            ctx.stroke();
        }
    }

    // Dim future
    if (currentCol + 1 < GRID) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect((currentCol + 1) * cellW, 0, c.width - (currentCol + 1) * cellW, c.height);
    }
}
