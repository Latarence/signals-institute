// Synthesized sound: no audio files. The WebAudio graph is created on the first user gesture
// (call unlock() from a click/tap handler). Every call is a no-op until then, and while muted.

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private bedGain: GainNode | null = null;
  private bedOsc: OscillatorNode | null = null;
  private bedFilter: BiquadFilterNode | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = w.AudioContext || w.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = this.noise.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      ch[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    // a soft continuous bed (filtered triangle), silent until bed() raises it
    this.bedOsc = ctx.createOscillator();
    this.bedOsc.type = "triangle";
    this.bedOsc.frequency.value = 110;
    this.bedFilter = ctx.createBiquadFilter();
    this.bedFilter.type = "lowpass";
    this.bedFilter.frequency.value = 600;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0;
    this.bedOsc.connect(this.bedFilter).connect(this.bedGain).connect(this.master);
    this.bedOsc.start();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.02);
  }

  tone(freq: number, dur: number, gain: number, type: OscillatorType = "sine", delay = 0, freqEnd?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  burst(dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, freqEnd?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  /** Continuous bed: level 0..1, pitch in Hz. Smoothly follows each call. */
  bed(level: number, pitch = 110, bright = 600): void {
    const ctx = this.ctx;
    if (!ctx || !this.bedGain || !this.bedOsc || !this.bedFilter) return;
    const t = ctx.currentTime;
    this.bedGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.12, t, 0.08);
    this.bedOsc.frequency.setTargetAtTime(pitch, t, 0.1);
    this.bedFilter.frequency.setTargetAtTime(bright, t, 0.1);
  }
  silence(): void {
    this.bed(0);
  }

  // presets shared by the games
  ui(): void {
    this.tone(1200, 0.04, 0.07, "sine");
  }
  place(pitch = 760): void {
    this.tone(pitch, 0.09, 0.2, "triangle", 0, pitch * 0.7);
    this.burst(0.05, "bandpass", pitch * 2, 3, 0.14);
  }
  erase(): void {
    this.tone(300, 0.1, 0.16, "triangle", 0, 180);
    this.burst(0.06, "lowpass", 900, 1, 0.1);
  }
  invalid(): void {
    this.tone(150, 0.12, 0.12, "square", 0, 120);
  }
  start(): void {
    this.tone(392, 0.12, 0.13, "triangle");
    this.tone(523, 0.16, 0.11, "triangle", 0.08);
  }
  tick(i = 0): void {
    this.tone(660 + i * 40, 0.05, 0.06, "sine");
  }
  fail(): void {
    this.tone(220, 0.3, 0.16, "sawtooth", 0, 110);
    this.burst(0.3, "lowpass", 800, 1, 0.2, 150);
  }
  win(): void {
    // three measured notes, settling down rather than climbing
    this.tone(784, 0.5, 0.15, "sine");
    this.tone(659, 0.55, 0.14, "sine", 0.13);
    this.tone(523, 0.9, 0.16, "sine", 0.26);
    this.tone(1046, 0.9, 0.04, "sine", 0.26);
  }
  mark(i: number): void {
    this.tone(880 + i * 220, 0.18, 0.09, "sine");
  }
}
