/**
 * Low-level Binary MIDI Parser & Builder
 */

export function vlq(v) {
  const b = [v & 0x7F];
  v >>= 7;
  while (v > 0) { b.push((v & 0x7F) | 0x80); v >>= 7; }
  return b.reverse();
}

export function u16(v) { return [(v >> 8) & 0xFF, v & 0xFF]; }
export function u32(v) { return [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]; }

export function textEvent(type, str) {
  const bytes = new TextEncoder().encode(str);
  return [0xFF, type, ...vlq(bytes.length), ...bytes];
}

/**
 * Builds a MIDI Type 1 file buffer from note events
 */
export function buildMidiFile(tracksData, tpq = 480) {
  const header = [0x4D, 0x54, 0x68, 0x64, ...u32(6), ...u16(1), ...u16(tracksData.length), ...u16(tpq)];
  let file = [...header];

  tracksData.forEach(td => {
    file.push(0x4D, 0x54, 0x72, 0x6B, ...u32(td.length), ...td);
  });

  return new Uint8Array(file);
}

/**
 * Minimal MIDI Parser
 */
export function parseMidi(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  let pos = 0;

  function readU16() { const v = (data[pos] << 8) | data[pos + 1]; pos += 2; return v; }
  function readU32() { const v = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3]; pos += 4; return v; }
  function readVLQ() {
    let v = 0;
    while (true) {
      const b = data[pos++];
      v = (v << 7) | (b & 0x7F);
      if (!(b & 0x80)) break;
    }
    return v;
  }
  function readStr(n) { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(data[pos++]); return s; }

  // Header
  const hdrId = readStr(4);
  const hdrLen = readU32();
  const format = readU16();
  const nTracks = readU16();
  const tpq = readU16();
  if (hdrId !== 'MThd') throw new Error('Not a MIDI file');

  let tempo = 500000; 
  const tracks = [];
  const programs = new Set();
  const keySignatures = []; 
  const globalCCs = {}; // Store all CCs encountered

  for (let t = 0; t < nTracks; t++) {
    const trkId = readStr(4);
    const trkLen = readU32();
    const trkEnd = pos + trkLen;
    const notes = [];
    let absTick = 0;
    let runningStatus = 0;
    let currentBend = 8192; 
    let currentCCs = {};
    const activeNotes = {};

    while (pos < trkEnd) {
      const delta = readVLQ();
      absTick += delta;

      let status = data[pos];
      if (status < 0x80) {
        status = runningStatus;
      } else {
        pos++;
        if (status >= 0x80 && status < 0xF0) runningStatus = status;
      }

      const type = status & 0xF0;

      if (status === 0xFF) {
        const metaType = data[pos++];
        const metaLen = readVLQ();
        if (metaType === 0x51 && metaLen === 3) {
          tempo = (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2];
        } else if (metaType === 0x59) {
            const sfRaw = data[pos];
            const sf = sfRaw > 127 ? sfRaw - 256 : sfRaw;
            keySignatures.push({ tick: absTick, sf, mi: data[pos+1] });
        }
        pos += metaLen;
      } else if (type === 0x90) {
        const note = data[pos++];
        const vel = data[pos++];
        if (vel > 0) {
          activeNotes[note] = { tick: absTick, vel, bend: currentBend, ccs: { ...currentCCs } };
        } else {
          if (activeNotes[note]) {
            notes.push({ midi: note, vel: activeNotes[note].vel, start: activeNotes[note].tick, end: absTick, bend: activeNotes[note].bend, ccs: activeNotes[note].ccs });
            delete activeNotes[note];
          }
        }
      } else if (type === 0x80) {
        const note = data[pos++];
        pos++;
        if (activeNotes[note]) {
          notes.push({ midi: note, vel: activeNotes[note].vel, start: activeNotes[note].tick, end: absTick, bend: activeNotes[note].bend, ccs: activeNotes[note].ccs });
          delete activeNotes[note];
        }
      } else if (type === 0xC0) {
        programs.add(data[pos++]);
      } else if (type === 0xE0) {
        const lsb = data[pos++];
        const msb = data[pos++];
        currentBend = (msb << 7) | lsb;
      } else if (type === 0xB0) {
        const controller = data[pos++];
        const value = data[pos++];
        currentCCs[controller] = value;
        globalCCs[controller] = value; // Store globally
      } else {
        if (type === 0xD0) pos += 1;
        else pos += 2;
      }
    }
    pos = trkEnd;
    if (notes.length > 0) tracks.push(notes);
  }

  const bpm = Math.round(60000000 / tempo);
  return { tracks, tpq, bpm, programs: Array.from(programs), keySignatures, controllers: globalCCs };
}
