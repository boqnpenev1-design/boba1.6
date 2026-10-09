// CS2 Web Audio Procedural Sound Synthesizer Engine
// Provides authentic tactical shooter audio without requiring external audio asset downloads

class CS2AudioSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.c4Gain = null;
    this.initialized = false;
    this.masterVol = 0.7;
    this.sfxVol = 0.8;
    this.c4Vol = 0.9;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.masterVol, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVol, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.c4Gain = this.ctx.createGain();
      this.c4Gain.gain.setValueAtTime(this.c4Vol, this.ctx.currentTime);
      this.c4Gain.connect(this.masterGain);

      this.initialized = true;
    } catch (e) {
      console.warn("AudioContext init delayed until user interaction", e);
    }
  }

  ensureContext() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolumes(master, sfx, c4) {
    this.masterVol = master;
    this.sfxVol = sfx;
    this.c4Vol = c4;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.masterVol, this.ctx.currentTime);
    }
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.sfxVol, this.ctx.currentTime);
    }
    if (this.c4Gain && this.ctx) {
      this.c4Gain.gain.setValueAtTime(this.c4Vol, this.ctx.currentTime);
    }
  }

  // Gunfire sound synthesized via envelope shaping and filtered noise bursts
  playGunshot(weaponType = 'rifle', isSilenced = false) {
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    
    // 1. Initial transient crack (Oscillator pitch drop)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    
    let baseFreq = 260;
    let oscDecay = 0.08;
    let noiseFilterFreq = 1600;
    let noiseDecay = 0.18;

    if (weaponType === 'sniper') { // AWP
      baseFreq = 180;
      oscDecay = 0.22;
      noiseFilterFreq = 2800;
      noiseDecay = 0.45;
    } else if (weaponType === 'pistol') {
      baseFreq = 340;
      oscDecay = 0.05;
      noiseFilterFreq = 1400;
      noiseDecay = 0.12;
    } else if (weaponType === 'shotgun') {
      baseFreq = 120;
      oscDecay = 0.14;
      noiseFilterFreq = 2200;
      noiseDecay = 0.28;
    } else if (weaponType === 'smg') {
      baseFreq = 380;
      oscDecay = 0.04;
      noiseFilterFreq = 1800;
      noiseDecay = 0.10;
    }

    if (isSilenced) {
      noiseFilterFreq = 900;
      noiseDecay = 0.08;
    }

    osc.type = weaponType === 'sniper' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + oscDecay);

    oscGain.gain.setValueAtTime(0.7, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + oscDecay);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + oscDecay);

    // 2. Gunpowder explosion / White Noise tail
    const bufferSize = Math.floor(this.ctx.sampleRate * noiseDecay);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = isSilenced ? 'lowpass' : 'bandpass';
    filter.frequency.setValueAtTime(noiseFilterFreq, t);
    filter.Q.setValueAtTime(isSilenced ? 1.0 : 2.5, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(isSilenced ? 0.3 : 0.85, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + noiseDecay);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    whiteNoise.start(t);
    whiteNoise.stop(t + noiseDecay);
  }

  // Knife slash
  playKnifeSlash() {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.1);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // Knife hit
  playKnifeHit() {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // Headshot "dink" ping
  playHeadshotDink() {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2400, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.18);

    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  // Reload clack
  playReload() {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Magazine drop
    this.createMechanicalClick(t, 600, 0.05);
    // Magazine insert
    this.createMechanicalClick(t + 0.45, 900, 0.06);
    // Bolt rack
    this.createMechanicalClick(t + 1.1, 1400, 0.08);
  }

  createMechanicalClick(time, freq, dur) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(100, time + dur);
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + dur);
  }

  // C4 Beep with accelerating pitch and tempo
  playC4Beep(urgency = 1) {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Urgency scales frequency higher as bomb reaches 0s
    const pitch = 950 + urgency * 180;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, t);

    const dur = 0.08;
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(this.c4Gain);
    osc.start(t);
    osc.stop(t + dur);
  }

  // C4 Arming code keystroke
  playC4CodeBeep() {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const freq = 1200 + Math.random() * 400;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.c4Gain);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // Defuse kit snipping sound
  playDefuseKitSnip() {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.08);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // C4 Massive Bomb Explosion
  playExplosion() {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Sub-bass rumble
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(140, t);
    subOsc.frequency.exponentialRampToValueAtTime(25, t + 2.5);

    subGain.gain.setValueAtTime(1.0, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);

    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);
    subOsc.start(t);
    subOsc.stop(t + 2.5);

    // Blast wave noise
    const bufferSize = Math.floor(this.ctx.sampleRate * 3.0);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const blastNoise = this.ctx.createBufferSource();
    blastNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 3.0);

    const blastGain = this.ctx.createGain();
    blastGain.gain.setValueAtTime(1.0, t);
    blastGain.gain.exponentialRampToValueAtTime(0.001, t + 3.0);

    blastNoise.connect(filter);
    filter.connect(blastGain);
    blastGain.connect(this.sfxGain);

    blastNoise.start(t);
    blastNoise.stop(t + 3.0);
  }

  // Footstep thud
  playFootstep() {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(100 + Math.random() * 30, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // Radio announcer voice chords (Tactical radio announcement tone)
  playRadioTone(kind = 'beep') {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (kind === 'start') {
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.setValueAtTime(650, t + 0.08);
    } else if (kind === 'win') {
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.setValueAtTime(880, t + 0.12);
    } else {
      osc.frequency.setValueAtTime(700, t);
    }

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.25);
  }
}

// Global audio singleton
window.csAudio = new CS2AudioSystem();
