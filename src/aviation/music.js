const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export function composeBeat(beat, theme, intensity, menu = false) {
  const step = beat % 16;
  const major = theme.mode === 'major';
  const tonic = 36 + ((theme.root - 36) % 12 + 12) % 12;
  const root = tonic + (major ? [0, 5, 7, 0] : [0, -3, 5, -5])[Math.floor(beat / 16) % 4];
  const notes = [];
  const note = (midi, duration, type, volume, kind = 'tone') => notes.push({ frequency: frequency(midi), duration, type, volume, kind });
  if (step % 8 === 0) {
    for (const interval of [12, major ? 16 : 15, 19, 26]) note(root + interval, menu ? 2.6 : 1.6, 'sine', 0.038, 'pad');
  }
  if (step % 2 === 0) note(root + (step === 6 || step === 14 ? 7 : 0), 0.19, 'triangle', menu ? 0.09 : 0.2);
  const melody = (major ? [[24, 28, 31, 33, 31, 28, 26, 31], [28, 31, 36, 35, 33, 31, 28, 26]] : [[24, 31, 27, 34, 31, 27, 26, 31], [24, 27, 31, 36, 34, 31, 27, 26]])[Math.floor(beat / 64) % 2];
  const phrase = (step + Math.floor(theme.root / 12)) % melody.length;
  if (step % 2 === 0 || !menu && intensity > 0.65) note(root + melody[phrase], menu ? 0.65 : 0.22, menu ? 'sine' : theme.voice ?? 'sine', 0.055 + intensity * 0.035);
  if (!menu) {
    if (step % 4 === 0) notes.push({ frequency: 125, duration: 0.18, type: 'sine', volume: 0.42, kind: 'kick' });
    if (step % 8 === 4) notes.push({ frequency: 1400, duration: 0.12, volume: 0.1, kind: 'snare' });
    if (step % 2 === 1 || intensity > 0.7) notes.push({ frequency: 7000, duration: step === 15 ? 0.13 : 0.045, volume: 0.035 + intensity * 0.018, kind: 'hat' });
    if (intensity > 0.8 && step % 4 === 2) note(root + 36, 0.12, 'triangle', 0.025);
  }
  return notes;
}
