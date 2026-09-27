/** Synthesized audio: no network requests, music files, or third-party assets. */
export class RaceAudio {
  constructor() { this.enabled = false; this.context = null; }
  async enable(value) {
    this.enabled = value;
    if (!value) { if (this.gain) this.gain.gain.value = 0; return; }
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) { this.enabled = false; return; }
        this.context = new AudioContext();
        this.engine = this.context.createOscillator();
        this.engine.type = 'sawtooth';
        this.filter = this.context.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 180;
        this.gain = this.context.createGain();
        this.gain.gain.value = 0;
        this.engine.connect(this.filter).connect(this.gain).connect(this.context.destination);
        this.engine.start();
      }
      await this.context.resume();
    } catch { this.enabled = false; }
  }
  update(sim) {
    if (!this.context) return;
    const time = this.context.currentTime;
    const active = this.enabled && sim.phase === 'racing';
    this.gain.gain.setTargetAtTime(active ? 0.04 : 0, time, 0.08);
    const gearSpeed = sim.speed < 30 ? sim.speed : sim.speed % 56 + 30;
    this.engine.frequency.setTargetAtTime(35 + gearSpeed * 1.1, time, 0.1);
    this.filter.frequency.setTargetAtTime(sim.boosting ? 500 : 160 + sim.speed, time, 0.1);
  }
  effect(type) {
    if (!this.enabled || !this.context) return;
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    oscillator.type = type === 'crash' ? 'sawtooth' : 'sine';
    oscillator.frequency.setValueAtTime(type === 'crash' ? 100 : type === 'go' ? 660 : 880, t);
    oscillator.frequency.exponentialRampToValueAtTime(type === 'crash' ? 22 : 440, t + 0.22);
    gain.gain.setValueAtTime(type === 'crash' ? 0.16 : 0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(t);
    oscillator.stop(t + 0.31);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  dispose() { if (this.context) void this.context.close().catch(() => {}); }
}
