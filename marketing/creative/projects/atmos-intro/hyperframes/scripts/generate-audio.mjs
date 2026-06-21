import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const hyperframesDir = path.resolve(path.dirname(__filename), "..");
const projectDir = path.resolve(hyperframesDir, "..");
const outputPath = path.join(projectDir, "artifacts/audio/atmos-ambient.wav");
const previewOutputPath = path.join(hyperframesDir, "assets/audio/atmos-ambient.wav");

const sampleRate = 48_000;
const channels = 2;
const durationSeconds = 30;
const totalFrames = sampleRate * durationSeconds;
const twoPi = Math.PI * 2;
const bpm = 96;
const beat = 60 / bpm;
const halfBeat = beat / 2;
const bar = beat * 4;
const transitionSeconds = 1.55;

const cues = [
  {
    name: "brand",
    start: 0,
    chord: [73.42, 110, 146.83, 220, 293.66],
    pad: 0.92,
    arp: 0.04,
    drums: 0.06,
    shimmer: 0.28,
  },
  {
    name: "context",
    start: 3.7,
    chord: [58.27, 116.54, 174.61, 233.08, 293.66],
    pad: 0.82,
    arp: 0.22,
    drums: 0.3,
    shimmer: 0.34,
  },
  {
    name: "agents",
    start: 7.8,
    chord: [87.31, 130.81, 174.61, 261.63, 349.23],
    pad: 0.76,
    arp: 0.68,
    drums: 0.45,
    shimmer: 0.52,
  },
  {
    name: "parallel",
    start: 12.1,
    chord: [65.41, 130.81, 196, 261.63, 329.63],
    pad: 0.7,
    arp: 0.56,
    drums: 0.92,
    shimmer: 0.36,
  },
  {
    name: "worktree",
    start: 16.5,
    chord: [55, 110, 164.81, 220, 277.18],
    pad: 0.8,
    arp: 0.36,
    drums: 0.74,
    shimmer: 0.28,
  },
  {
    name: "review",
    start: 20.9,
    chord: [65.41, 98, 146.83, 196, 293.66],
    pad: 0.82,
    arp: 0.74,
    drums: 0.84,
    shimmer: 0.5,
  },
  {
    name: "close",
    start: 25.4,
    chord: [73.42, 110, 146.83, 220, 293.66],
    pad: 0.94,
    arp: 0.2,
    drums: 0.22,
    shimmer: 0.38,
  },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function globalEnvelope(time) {
  return smoothstep(0, 1.7, time) * (1 - smoothstep(28.6, 30, time));
}

function cuePair(time) {
  let index = 0;
  for (let cueIndex = 0; cueIndex < cues.length - 1; cueIndex += 1) {
    if (time >= cues[cueIndex + 1].start) index = cueIndex + 1;
  }

  const current = cues[index];
  const next = cues[Math.min(index + 1, cues.length - 1)];
  const previous = cues[Math.max(index - 1, 0)];

  if (next !== current && time > next.start - transitionSeconds) {
    const mix = smoothstep(next.start - transitionSeconds, next.start + transitionSeconds, time);
    return { a: current, b: next, mix };
  }

  if (previous !== current && time < current.start + transitionSeconds) {
    const mix = smoothstep(current.start - transitionSeconds, current.start + transitionSeconds, time);
    return { a: previous, b: current, mix };
  }

  return { a: current, b: current, mix: 0 };
}

function hashNoise(index) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function tone(freq, time, phase = 0) {
  return Math.sin(twoPi * freq * time + phase);
}

function pulse(time, period, decay) {
  const phase = time % period;
  return Math.exp(-phase * decay);
}

function percussiveTone(freq, local, decay, amount = 1) {
  if (local < 0 || local > 0.48) return 0;
  const sweep = freq + Math.exp(-local * 24) * freq * 0.65;
  return Math.sin(twoPi * sweep * local) * Math.exp(-local * decay) * amount;
}

function clickNoise(frame, local, decay, amount = 1) {
  if (local < 0 || local > 0.18) return 0;
  return hashNoise(frame) * Math.exp(-local * decay) * amount;
}

function cueValue(a, b, mix, key) {
  return lerp(a[key], b[key], mix);
}

function chordLayer(cue, time, layer) {
  let pad = 0;
  for (let noteIndex = 0; noteIndex < cue.chord.length; noteIndex += 1) {
    const base = cue.chord[noteIndex];
    const noteWeight = noteIndex < 2 ? 0.031 : 0.018;
    const drift = Math.sin(twoPi * (0.017 + noteIndex * 0.005) * time + layer) * 0.55;
    pad += tone(base, time, drift + noteIndex * 0.58 + layer) * noteWeight;
    pad += tone(base * 1.004, time, noteIndex * 0.87 + layer * 0.4) * noteWeight * 0.36;
  }
  return pad;
}

function arpLayer(cue, time, density) {
  const stepPeriod = density > 0.62 ? halfBeat : beat;
  const stepPhase = time % stepPeriod;
  const stepIndex = Math.floor(time / stepPeriod);
  const octave = stepIndex % 3 === 0 ? 2 : 3;
  const note = cue.chord[(stepIndex + 2) % cue.chord.length] * octave;
  const accent = stepIndex % 4 === 0 ? 1.15 : 0.86;
  const arpEnv = Math.exp(-stepPhase * (density > 0.62 ? 9.5 : 7.3));
  return (tone(note, time) * 0.036 + tone(note * 2.01, time) * 0.008) * arpEnv * accent;
}

function writeString(buffer, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    buffer.writeUInt8(value.charCodeAt(index), offset + index);
  }
}

function writeWav(samples) {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  writeString(buffer, 0, "RIFF");
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeString(buffer, 8, "WAVE");
  writeString(buffer, 12, "fmt ");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  writeString(buffer, 36, "data");
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const value = clamp(samples[index], -1, 1);
    buffer.writeInt16LE(Math.round(value * 32767), 44 + index * bytesPerSample);
  }

  return buffer;
}

const dry = new Float32Array(totalFrames * channels);

for (let frame = 0; frame < totalFrames; frame += 1) {
  const time = frame / sampleRate;
  const env = globalEnvelope(time);
  const { a, b, mix } = cuePair(time);
  const padAmount = cueValue(a, b, mix, "pad");
  const arpAmount = cueValue(a, b, mix, "arp");
  const drumAmount = cueValue(a, b, mix, "drums");
  const shimmerAmount = cueValue(a, b, mix, "shimmer");

  const beatPhase = time % beat;
  const halfPhase = time % halfBeat;
  const beatIndex = Math.floor(time / beat);

  const pad = lerp(chordLayer(a, time, 0), chordLayer(b, time, 1.7), mix) * padAmount;
  const arp = lerp(arpLayer(a, time, arpAmount), arpLayer(b, time, arpAmount), mix) * arpAmount;

  const kickPattern = drumAmount < 0.35 ? beatIndex % 4 === 0 : drumAmount < 0.72 ? beatIndex % 4 === 0 || beatIndex % 4 === 2 : beatIndex % 2 === 0;
  const snarePattern = drumAmount > 0.58 && beatIndex % 4 === 2;
  const hatPattern = drumAmount > 0.42 || (drumAmount > 0.24 && beatIndex % 2 === 1);

  let drums = 0;
  if (kickPattern) drums += percussiveTone(54, beatPhase, 9.2, 0.34);
  if (snarePattern) drums += clickNoise(frame, beatPhase, 18, 0.1) + percussiveTone(172, beatPhase, 16, 0.035);
  if (hatPattern) drums += clickNoise(frame * 3 + 17, halfPhase, 52, 0.028);
  drums *= drumAmount;

  const subPeriod = drumAmount > 0.7 ? beat : bar;
  const sub = tone(lerp(a.chord[0], b.chord[0], mix) * 0.5, time) * pulse(time, subPeriod, 4.9) * (0.04 + drumAmount * 0.06);
  const shimmer = tone(740 + Math.sin(twoPi * 0.08 * time) * 22, time) * 0.008 * shimmerAmount;

  const mono = (pad + arp + drums + sub + shimmer) * env;
  const pan = Math.sin(twoPi * 0.034 * time);

  dry[frame * 2] = mono * (0.82 - pan * 0.08);
  dry[frame * 2 + 1] = mono * (0.82 + pan * 0.08);
}

const wet = new Float32Array(dry.length);
wet.set(dry);

const delayA = Math.round(sampleRate * 0.29);
const delayB = Math.round(sampleRate * 0.57);
const delayC = Math.round(sampleRate * 0.93);

for (let frame = 0; frame < totalFrames; frame += 1) {
  for (let channel = 0; channel < channels; channel += 1) {
    const index = frame * channels + channel;
    if (frame >= delayA) {
      wet[index] += wet[(frame - delayA) * channels + 1 - channel] * 0.17;
    }
    if (frame >= delayB) {
      wet[index] += wet[(frame - delayB) * channels + channel] * 0.085;
    }
    if (frame >= delayC) {
      wet[index] += wet[(frame - delayC) * channels + 1 - channel] * 0.04;
    }
  }
}

let peak = 0;
for (const sample of wet) {
  peak = Math.max(peak, Math.abs(sample));
}

const targetPeak = 0.76;
const gain = peak > 0 ? targetPeak / peak : 1;
for (let index = 0; index < wet.length; index += 1) {
  wet[index] *= gain;
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(previewOutputPath), { recursive: true });
await fs.writeFile(outputPath, writeWav(wet));
await fs.copyFile(outputPath, previewOutputPath);
console.log(`wrote ${outputPath}`);
console.log(`wrote ${previewOutputPath}`);
