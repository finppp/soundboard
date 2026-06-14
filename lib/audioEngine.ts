// Singleton Web Audio engine. All playback routes through the effects chain.

export type EffectSettings = {
  filter:      { enabled: boolean; type: BiquadFilterType; freq: number; q: number };
  distortion:  { enabled: boolean; amount: number };
  delay:       { enabled: boolean; time: number; feedback: number; mix: number };
  reverb:      { enabled: boolean; size: number; mix: number };
  compressor:  { enabled: boolean; threshold: number; ratio: number };
  tremolo:     { enabled: boolean; rate: number; depth: number };
  chorus:      { enabled: boolean; rate: number; depth: number };
  pan:         { value: number };
  reverse:     { enabled: boolean };
};

export const DEFAULT_EFFECTS: EffectSettings = {
  filter:     { enabled: false, type: "lowpass", freq: 2000, q: 1 },
  distortion: { enabled: false, amount: 40 },
  delay:      { enabled: false, time: 0.35, feedback: 0.4, mix: 0.4 },
  reverb:     { enabled: false, size: 0.5, mix: 0.4 },
  compressor: { enabled: false, threshold: -24, ratio: 8 },
  tremolo:    { enabled: false, rate: 5, depth: 0.6 },
  chorus:     { enabled: false, rate: 1.5, depth: 0.003 },
  pan:        { value: 0 },
  reverse:    { enabled: false },
};

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 256;
  const ab = new ArrayBuffer(n * 4);
  const curve = new Float32Array(ab);
  const k = amount === 0 ? 0.001 : amount * 4;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function generateIR(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * duration);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return ir;
}

function reverseBuffer(ctx: AudioContext, buf: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    out.copyToChannel(buf.getChannelData(ch).slice().reverse(), ch);
  }
  return out;
}

class AudioEngine {
  reverseEnabled = false;
  private pendingSettings: EffectSettings | null = null;
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private activeSources = new Map<string, AudioBufferSourceNode[]>();

  // Chain nodes
  private filterNode!: BiquadFilterNode;
  private distNode!: WaveShaperNode;
  private delayNode!: DelayNode;
  private delayFeedback!: GainNode;
  private delayWet!: GainNode;
  private delayDry!: GainNode;
  private reverbNode!: ConvolverNode;
  private reverbWet!: GainNode;
  private reverbDry!: GainNode;
  private compNode!: DynamicsCompressorNode;
  private tremoloGain!: GainNode;
  private tremoloLFO!: OscillatorNode;
  private tremoloLFOGain!: GainNode;
  private chorusDelay!: DelayNode;
  private chorusLFO!: OscillatorNode;
  private chorusLFOGain!: GainNode;
  private chorusWet!: GainNode;
  private chorusDry!: GainNode;
  private pannerNode!: StereoPannerNode;
  private chainIn!: GainNode; // everything connects to this

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.buildChain();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  private buildChain() {
    const ctx = this.ctx!;

    this.chainIn = ctx.createGain();

    // Filter
    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = "lowpass";
    this.filterNode.frequency.value = 20000;
    this.filterNode.Q.value = 0.707;

    // Distortion
    this.distNode = ctx.createWaveShaper();
    this.distNode.curve = makeDistortionCurve(0);
    this.distNode.oversample = "4x";

    // Delay (parallel wet/dry)
    this.delayNode     = ctx.createDelay(2.0);
    this.delayFeedback = ctx.createGain();
    this.delayWet      = ctx.createGain();
    this.delayDry      = ctx.createGain();
    this.delayNode.delayTime.value = 0.35;
    this.delayFeedback.gain.value  = 0;
    this.delayWet.gain.value       = 0;
    this.delayDry.gain.value       = 1;

    // Reverb (parallel wet/dry)
    this.reverbNode = ctx.createConvolver();
    this.reverbNode.buffer = generateIR(ctx, 1.5, 2);
    this.reverbWet  = ctx.createGain();
    this.reverbDry  = ctx.createGain();
    this.reverbWet.gain.value = 0;
    this.reverbDry.gain.value = 1;

    // Compressor
    this.compNode = ctx.createDynamicsCompressor();
    this.compNode.threshold.value = 0;
    this.compNode.ratio.value     = 1;
    this.compNode.knee.value      = 6;
    this.compNode.attack.value    = 0.003;
    this.compNode.release.value   = 0.25;

    // Tremolo
    this.tremoloGain    = ctx.createGain();
    this.tremoloLFO     = ctx.createOscillator();
    this.tremoloLFOGain = ctx.createGain();
    this.tremoloLFO.type             = "sine";
    this.tremoloLFO.frequency.value  = 5;
    this.tremoloLFOGain.gain.value   = 0;
    this.tremoloGain.gain.value      = 1;
    this.tremoloLFO.connect(this.tremoloLFOGain);
    this.tremoloLFOGain.connect(this.tremoloGain.gain);
    this.tremoloLFO.start();

    // Chorus (short delay modulated by LFO)
    this.chorusDelay   = ctx.createDelay(0.05);
    this.chorusLFO     = ctx.createOscillator();
    this.chorusLFOGain = ctx.createGain();
    this.chorusWet     = ctx.createGain();
    this.chorusDry     = ctx.createGain();
    this.chorusDelay.delayTime.value  = 0.02;
    this.chorusLFO.frequency.value    = 1.5;
    this.chorusLFOGain.gain.value     = 0;
    this.chorusWet.gain.value         = 0;
    this.chorusDry.gain.value         = 1;
    this.chorusLFO.connect(this.chorusLFOGain);
    this.chorusLFOGain.connect(this.chorusDelay.delayTime);
    this.chorusLFO.start();

    // Panner
    this.pannerNode = ctx.createStereoPanner();

    // --- Wire the chain ---
    const delayMix   = ctx.createGain();
    const reverbMix  = ctx.createGain();
    const chorusMix  = ctx.createGain();

    this.chainIn.connect(this.filterNode);
    this.filterNode.connect(this.distNode);

    // Delay split
    this.distNode.connect(this.delayDry);
    this.distNode.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayWet);
    this.delayDry.connect(delayMix);
    this.delayWet.connect(delayMix);

    // Reverb split
    delayMix.connect(this.reverbDry);
    delayMix.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbWet);
    this.reverbDry.connect(reverbMix);
    this.reverbWet.connect(reverbMix);

    // Chorus split
    reverbMix.connect(this.chorusDry);
    reverbMix.connect(this.chorusDelay);
    this.chorusDelay.connect(this.chorusWet);
    this.chorusDry.connect(chorusMix);
    this.chorusWet.connect(chorusMix);

    chorusMix.connect(this.compNode);
    this.compNode.connect(this.tremoloGain);
    this.tremoloGain.connect(this.pannerNode);
    this.pannerNode.connect(ctx.destination);

    if (this.pendingSettings) {
      this.applySettings(this.pendingSettings);
      this.pendingSettings = null;
    }
  }

  async loadBuffer(id: string, url: string): Promise<void> {
    if (this.buffers.has(id)) return;
    try {
      const ctx = this.getCtx();
      const res = await fetch(url);
      const ab  = await res.arrayBuffer();
      this.buffers.set(id, await ctx.decodeAudioData(ab));
    } catch { /* ignore failed loads */ }
  }

  play(
    id: string,
    semitones: number,
    reversed: boolean,
    onEnd?: () => void,
  ): void {
    const ctx = this.getCtx();
    let buf = this.buffers.get(id);
    if (!buf) return;
    if (reversed) buf = reverseBuffer(ctx, buf);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.pow(2, semitones / 12);
    src.connect(this.chainIn);
    src.start();
    src.onended = () => {
      onEnd?.();
      const list = this.activeSources.get(id) ?? [];
      this.activeSources.set(id, list.filter((s) => s !== src));
    };
    this.activeSources.set(id, [...(this.activeSources.get(id) ?? []), src]);
  }

  stop(id: string): void {
    (this.activeSources.get(id) ?? []).forEach((s) => {
      try { s.stop(); } catch { /* already stopped */ }
    });
    this.activeSources.set(id, []);
  }

  removeBuffer(id: string): void {
    this.buffers.delete(id);
    this.stop(id);
  }

  // --- Effect setters (called by EffectsPanel) ---

  applySettings(fx: EffectSettings): void {
    this.reverseEnabled = fx.reverse.enabled;
    if (!this.ctx) { this.pendingSettings = fx; return; }
    const ctx = this.ctx;
    const t   = ctx.currentTime;
    const ramp = (param: AudioParam, val: number) =>
      param.setTargetAtTime(val, t, 0.015);

    // Filter
    this.filterNode.type = fx.filter.type;
    ramp(this.filterNode.frequency, fx.filter.enabled ? fx.filter.freq : 20000);
    ramp(this.filterNode.Q, fx.filter.enabled ? fx.filter.q : 0.707);

    // Distortion
    this.distNode.curve = makeDistortionCurve(fx.distortion.enabled ? fx.distortion.amount : 0);

    // Delay
    ramp(this.delayNode.delayTime,     fx.delay.time);
    ramp(this.delayFeedback.gain,      fx.delay.enabled ? fx.delay.feedback : 0);
    ramp(this.delayWet.gain,           fx.delay.enabled ? fx.delay.mix : 0);
    ramp(this.delayDry.gain,           fx.delay.enabled ? 1 - fx.delay.mix * 0.5 : 1);

    // Reverb
    if (fx.reverb.enabled) {
      const newBuf = generateIR(ctx, Math.max(0.2, fx.reverb.size * 4), 2);
      this.reverbNode.buffer = newBuf;
    }
    ramp(this.reverbWet.gain,   fx.reverb.enabled ? fx.reverb.mix : 0);
    ramp(this.reverbDry.gain,   fx.reverb.enabled ? 1 - fx.reverb.mix * 0.5 : 1);

    // Compressor
    ramp(this.compNode.threshold, fx.compressor.enabled ? fx.compressor.threshold : 0);
    ramp(this.compNode.ratio,     fx.compressor.enabled ? fx.compressor.ratio : 1);

    // Tremolo
    ramp(this.tremoloLFO.frequency, fx.tremolo.rate);
    ramp(this.tremoloLFOGain.gain,  fx.tremolo.enabled ? fx.tremolo.depth * 0.5 : 0);

    // Chorus
    ramp(this.chorusLFO.frequency,    fx.chorus.rate);
    ramp(this.chorusLFOGain.gain,     fx.chorus.enabled ? fx.chorus.depth : 0);
    ramp(this.chorusWet.gain,         fx.chorus.enabled ? 0.5 : 0);
    ramp(this.chorusDry.gain,         fx.chorus.enabled ? 0.5 : 1);

    // Pan
    ramp(this.pannerNode.pan, fx.pan.value);
  }
}

export const engine = new AudioEngine();
