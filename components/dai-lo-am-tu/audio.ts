// Three-channel mixer for "Đại Lôi Âm Tự", built with Web Audio API only (no audio files).
// Channel 1: ambient wind. Channel 2: reserved for chanting (no approved recordings yet, not built).
// Channel 3: personal sound effects (wooden fish, bead click, bell). Sound effects play only on the
// local device, never to other people.

export interface MixerSettings {
  ambient: number; // 0..1
  sfx: number; // 0..1
  ambientOn: boolean;
}

export const DEFAULT_MIX: MixerSettings = { ambient: 0.35, sfx: 0.4, ambientOn: true };
export const MIX_STORAGE_KEY = "dai-lo-am-tu:mix:v1";

export function loadMix(): MixerSettings {
  try {
    const raw = window.localStorage.getItem(MIX_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MIX };
    const r = JSON.parse(raw) as Partial<MixerSettings>;
    const clamp = (v: unknown, fallback: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
    return {
      ambient: clamp(r.ambient, DEFAULT_MIX.ambient),
      sfx: clamp(r.sfx, DEFAULT_MIX.sfx),
      ambientOn: typeof r.ambientOn === "boolean" ? r.ambientOn : DEFAULT_MIX.ambientOn,
    };
  } catch {
    return { ...DEFAULT_MIX };
  }
}

export function saveMix(mix: MixerSettings): void {
  try {
    window.localStorage.setItem(MIX_STORAGE_KEY, JSON.stringify(mix));
  } catch {
    // Storage blocked: the mixer still works for this visit.
  }
}

export class ZenAudio {
  private ctx: AudioContext | null = null;
  private ambientBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private clickBuffer: AudioBuffer | null = null;
  private failed = false;
  private settings: MixerSettings;

  constructor(settings: MixerSettings) {
    this.settings = { ...settings };
  }

  // Must be called from a user gesture (browsers block audio before one).
  ensure(): boolean {
    if (this.failed) return false;
    if (!this.ctx) {
      try {
        const Ctor: typeof AudioContext =
          window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctor();
        this.ctx = ctx;
        this.ambientBus = ctx.createGain();
        this.sfxBus = ctx.createGain();
        this.ambientBus.connect(ctx.destination);
        this.sfxBus.connect(ctx.destination);
        this.clickBuffer = this.makeNoise(0.05);
        this.startAmbient();
      } catch {
        this.failed = true;
        return false;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
    this.applyGains();
    return true;
  }

  setSettings(settings: MixerSettings): void {
    this.settings = { ...settings };
    this.applyGains();
  }

  playWood(): void {
    const ctx = this.readyCtx();
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime;
    [
      { freq: 180, amp: 0.9 },
      { freq: 360, amp: 0.35 },
    ].forEach(({ freq, amp }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(amp, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain).connect(this.sfxBus as GainNode);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  playBead(): void {
    const ctx = this.readyCtx();
    if (!ctx || !this.sfxBus || !this.clickBuffer) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = this.clickBuffer;
    filter.type = "bandpass";
    filter.frequency.value = 1100;
    filter.Q.value = 4;
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.05);
  }

  playBell(): void {
    const ctx = this.readyCtx();
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime;
    [528, 1056].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(i === 0 ? 0.35 : 0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      osc.connect(gain).connect(this.sfxBus as GainNode);
      osc.start(t);
      osc.stop(t + 3.6);
    });
  }

  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend().catch(() => undefined);
    else if (this.settings.ambientOn || this.settings.sfx > 0) void this.ctx.resume().catch(() => undefined);
  }

  dispose(): void {
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.failed = true;
  }

  private readyCtx(): AudioContext | null {
    if (!this.ctx || this.failed || this.ctx.state !== "running") return null;
    return this.ctx;
  }

  private makeNoise(seconds: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private startAmbient(): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambientBus) return;
    const noise = ctx.createBufferSource();
    noise.buffer = this.makeNoise(4);
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 500;
    filter.Q.value = 0.5;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.5;
    noise.connect(filter).connect(windGain).connect(this.ambientBus);
    noise.start();

    // Slow swell so the wind breathes instead of hissing flat.
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 0.08;
    depth.gain.value = 0.08;
    lfo.connect(depth).connect(this.ambientBus.gain);
    lfo.start();
  }

  private applyGains(): void {
    if (!this.ctx) return;
    if (this.ambientBus) {
      this.ambientBus.gain.value = this.settings.ambientOn ? this.settings.ambient * 0.5 : 0;
    }
    if (this.sfxBus) this.sfxBus.gain.value = this.settings.sfx * 0.8;
  }
}
