/**
 * @file soundEngine.ts
 * @description Web Audio API synthesis for realistic GMAW / MIG short-circuit arc sizzling sound,
 * spark crackles, contactor clicks, and auditory coaching alerts.
 */

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  // Continuous arc audio nodes
  private noiseNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private buzzOsc: OscillatorNode | null = null;
  private buzzGain: GainNode | null = null;
  private isArcSoundPlaying: boolean = false;

  constructor() {
    // Lazy initialize on first user interaction
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.isArcSoundPlaying) {
      this.stopArcSound();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Contactor relay click on trigger pull
   */
  public playContactorClick() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  /**
   * Start authentic MIG short-circuit buzzing arc sound
   */
  public startArcSound(voltage_V = 19.5, ctwd_mm = 12) {
    if (this.isMuted || this.isArcSoundPlaying) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      this.isArcSoundPlaying = true;

      // 1. White Noise crackle buffer (2 seconds loop)
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // High density random pops for sizzling frying bacon sound
        output[i] = (Math.random() * 2 - 1) * (Math.random() > 0.85 ? 1.0 : 0.4);
      }

      this.noiseNode = this.ctx.createBufferSource();
      this.noiseNode.buffer = noiseBuffer;
      this.noiseNode.loop = true;

      // Bandpass filter to sculpt arc sizzling frequency (1.2kHz - 4.5kHz)
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'bandpass';
      this.filterNode.frequency.setValueAtTime(1800 + (voltage_V - 15) * 80, this.ctx.currentTime);
      this.filterNode.Q.setValueAtTime(2.2, this.ctx.currentTime);

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(0.12, this.ctx.currentTime);

      this.noiseNode.connect(this.filterNode);
      this.filterNode.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      // 2. Short-circuit 100-150Hz harmonic fundamental buzz
      this.buzzOsc = this.ctx.createOscillator();
      this.buzzOsc.type = 'sawtooth';
      const baseFreq = 110 + (voltage_V - 15) * 6; // Pitch shifts with voltage
      this.buzzOsc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);

      this.buzzGain = this.ctx.createGain();
      this.buzzGain.gain.setValueAtTime(0.06, this.ctx.currentTime);

      this.buzzOsc.connect(this.buzzGain);
      this.buzzGain.connect(this.ctx.destination);

      this.noiseNode.start();
      this.buzzOsc.start();
    } catch (err) {
      console.warn('Audio start failed:', err);
    }
  }

  public updateArcSound(voltage_V: number, ctwd_mm: number) {
    if (!this.isArcSoundPlaying || !this.ctx) return;
    if (this.filterNode) {
      const freq = 1600 + (voltage_V - 15) * 100 + (ctwd_mm - 12) * 40;
      this.filterNode.frequency.setTargetAtTime(Math.max(600, Math.min(6000, freq)), this.ctx.currentTime, 0.05);
    }
    if (this.buzzOsc) {
      const baseFreq = 110 + (voltage_V - 15) * 7;
      this.buzzOsc.frequency.setTargetAtTime(Math.max(70, Math.min(260, baseFreq)), this.ctx.currentTime, 0.05);
    }
  }

  public stopArcSound() {
    if (!this.isArcSoundPlaying) return;
    this.isArcSoundPlaying = false;

    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(0.001, this.ctx.currentTime, 0.04);
    }
    if (this.buzzGain && this.ctx) {
      this.buzzGain.gain.setTargetAtTime(0.001, this.ctx.currentTime, 0.04);
    }

    setTimeout(() => {
      try {
        if (this.noiseNode) {
          this.noiseNode.stop();
          this.noiseNode.disconnect();
          this.noiseNode = null;
        }
        if (this.buzzOsc) {
          this.buzzOsc.stop();
          this.buzzOsc.disconnect();
          this.buzzOsc = null;
        }
      } catch {
        // cleanup
      }
    }, 60);
  }

  /**
   * Warning chime when student drifts out of acceptable angle/speed envelope
   */
  public playWarningBeep() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    osc.frequency.setValueAtTime(440, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.16);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.16);
  }
}

export const soundEngine = new SoundEngine();
