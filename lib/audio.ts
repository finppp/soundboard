export function detectTrimPoints(
  buffer: AudioBuffer,
  threshold = 0.015,
  paddingMs = 60
): { start: number; end: number } {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const pad = Math.floor((paddingMs / 1000) * sr);
  let startSample = 0;
  let endSample = data.length - 1;

  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > threshold) { startSample = Math.max(0, i - pad); break; }
  }
  for (let i = data.length - 1; i >= 0; i--) {
    if (Math.abs(data[i]) > threshold) { endSample = Math.min(data.length - 1, i + pad); break; }
  }

  return { start: startSample / sr, end: endSample / sr };
}

export async function decodeAudioFile(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext();
  return ctx.decodeAudioData(arrayBuffer);
}

export async function trimAudioBuffer(
  buffer: AudioBuffer,
  startTime: number,
  endTime: number
): Promise<AudioBuffer> {
  const duration = endTime - startTime;
  const { sampleRate, numberOfChannels } = buffer;
  const length = Math.floor(duration * sampleRate);
  const offline = new OfflineAudioContext(numberOfChannels, length, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0, startTime, duration);
  return offline.startRendering();
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const dataSize = len * numCh * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const str = (offset: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));

  str(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([ab], { type: "audio/wav" });
}
