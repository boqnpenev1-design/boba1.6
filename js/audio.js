// CS2 Audio Engine with Authentic Sound Library & Procedural Fallback
// Uses real CS2 weapon, bomb, and player audio samples uploaded in weapons/ and player/

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
    this.audioCache = {};

    // Audio file mappings
    this.soundPaths = {
      // Rifles & Snipers
      ak47: 'weapons/ak47/ak47_01.wav',
      m4a1: 'weapons/m4a1/m4a1_silencer_01.wav',
      m4a1s: 'weapons/m4a1/m4a1_silencer_01.wav',
      m4a4: 'weapons/m4a1/m4a1_us_01.wav',
      galil: 'weapons/galilar/galil_01.wav',
      galilar: 'weapons/galilar/galil_01.wav',
      famas: 'weapons/famas/famas_01.wav',
      aug: 'weapons/aug/aug_01.wav',
      sg553: 'weapons/sg556/sg556_01.wav',
      sg556: 'weapons/sg556/sg556_01.wav',
      awp: 'weapons/awp/awp_01.wav',
      ssg08: 'weapons/ssg08/ssg08_01.wav',
      scout: 'weapons/ssg08/ssg08_01.wav',
      g3sg1: 'weapons/g3sg1/g3sg1_01.wav',
      scar20: 'weapons/scar20/scar20_01.wav',

      // Pistols
      glock: 'weapons/glock18/glock_01.wav',
      glock18: 'weapons/glock18/glock_01.wav',
      usp: 'weapons/usp/usp_01.wav',
      usp_unsilenced: 'weapons/usp/usp_unsilenced_01.wav',
      p250: 'weapons/p250/p250_01.wav',
      deagle: 'weapons/deagle/deagle_01.wav',
      dualberettas: 'weapons/elite/elites_01.wav',
      elite: 'weapons/elite/elites_01.wav',
      fiveseven: 'weapons/fiveseven/fiveseven_01.wav',
      tec9: 'weapons/tec9/tec9_02.wav',
      cz75: 'weapons/cz75a/cz75_01.wav',
      cz75a: 'weapons/cz75a/cz75_01.wav',
      revolver: 'weapons/revolver/revolver-1_01.wav',

      // SMGs & Heavy
      mac10: 'weapons/mac10/mac10_01.wav',
      mp9: 'weapons/mp9/mp9_01.wav',
      mp7: 'weapons/mp7/mp7_01.wav',
      mp5: 'weapons/mp5/mp5_01.wav',
      mp5sd: 'weapons/mp5/mp5_01.wav',
      ump45: 'weapons/ump45/ump45_02.wav',
      p90: 'weapons/p90/p90_01.wav',
      bizon: 'weapons/bizon/bizon_01.wav',
      nova: 'weapons/nova/nova-1.wav',
      xm1014: 'weapons/xm1014/xm1014-1.wav',
      mag7: 'weapons/mag7/mag7_01.wav',
      sawedoff: 'weapons/sawedoff/sawedoff-1.wav',
      m249: 'weapons/m249/m249-1.wav',
      negev: 'weapons/negev/negev_01.wav',

      // Melee & Utility
      knife_slash: 'weapons/knife/knife_deploy1.wav',
      knife_hit: 'weapons/knife/knife_hit_01.wav',

      // Authentic CS2 Weapon Reload Sounds
      ak47_clipout: 'weapons/ak47/ak47_clipout.wav',
      ak47_clipin: 'weapons/ak47/ak47_clipin.wav',
      ak47_boltpull: 'weapons/ak47/ak47_boltpull.wav',

      m4a1_clipout: 'weapons/m4a1/m4a1_clipout.wav',
      m4a1_clipin: 'weapons/m4a1/m4a1_clipin.wav',
      m4a1_boltpull: 'weapons/m4a1/m4a1_boltback.wav',

      awp_clipout: 'weapons/awp/awp_clipout.wav',
      awp_clipin: 'weapons/awp/awp_clipin.wav',
      awp_boltforward: 'weapons/awp/awp_boltforward.wav',

      deagle_clipout: 'weapons/deagle/de_clipout.wav',
      deagle_clipin: 'weapons/deagle/de_clipin.wav',
      deagle_slide: 'weapons/deagle/de_slideforward.wav',

      usp_clipout: 'weapons/usp/usp_clipout.wav',
      usp_clipin: 'weapons/usp/usp_clipin.wav',
      usp_slide: 'weapons/usp/usp_sliderelease.wav',

      glock_clipout: 'weapons/glock18/glock_clipout.wav',
      glock_clipin: 'weapons/glock18/glock_clipin.wav',
      glock_slide: 'weapons/glock18/glock_sliderelease.wav',

      p90_clipout: 'weapons/p90/p90_clipout.wav',
      p90_clipin: 'weapons/p90/p90_clipin.wav',
      p90_boltpull: 'weapons/p90/p90_boltback.wav',

      xm1014_shell: 'weapons/xm1014/xm1014_insertshell_01.wav',
      zoom: 'weapons/awp/zoom.wav',

      // Authentic Grenade & Utility SFX
      grenade_throw: 'weapons/hegrenade/grenade_throw.wav',
      flash_explode: 'weapons/flashbang/flashbang_explode1.wav',
      flash_ring: 'weapons/flashbang/explosion_ring.wav',
      smoke_emit: 'weapons/smokegrenade/smoke_emit.wav',
      smoke_clear: 'weapons/smokegrenade/smoke_clear.wav',
      molotov_smash: 'weapons/molotov/molotov_smash_01.wav',
      molotov_fire: 'weapons/molotov/fire_loop_1.wav',
      he_detonate: 'weapons/hegrenade/hegrenade_detonate_02.wav',
      he_bounce: 'weapons/hegrenade/he_bounce-1.wav',

      // C4 Bomb
      c4_beep: 'weapons/c4/c4_beep2.wav',
      c4_beep_urgent: 'weapons/c4/c4_beep2_10sec.wav',
      c4_plant: 'weapons/c4/c4_plant.wav',
      c4_disarm_start: 'weapons/c4/c4_disarmstart.wav',
      c4_disarm_finish: 'weapons/c4/c4_disarmfinish.wav',
      c4_explode: 'weapons/c4/c4_explode1.wav',
      c4_key: 'weapons/c4/key_press1.wav',

      // Player Damage & Foley (Real CS2 WAV files)
      jump: 'player/effort_m_01.wav',
      land: 'player/land.wav',
      land2: 'player/land2.wav',
      round_start: 'player/pl_respawn.wav',
      round_end_ct: 'weapons/party_horn_01.wav',
      round_end_t: 'weapons/c4/c4_disarmfinish.wav',
      bullet_impact: 'weapons/debris1.wav',
      damage1: 'player/damage1.wav',
      damage2: 'player/damage2.wav',
      damage3: 'player/damage3.wav',
      death: 'player/death1.wav',
      headshot_armor: 'player/headshot_armor_01.wav',
      footstep_sand: 'player/footsteps/sand_01.wav',
      footstep_tile: 'player/footsteps/tile_01.wav',
      footstep_wood: 'player/footsteps/wood_01.wav'
    };
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

      // Preload all audio samples (eliminates in-game decode hitching on first shot)
      Object.keys(this.soundPaths).forEach(k => {
        this.preloadSample(k, this.soundPaths[k]);
      });
    } catch (e) {
      console.warn("AudioContext init postponed", e);
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

  preloadSample(key, url) {
    if (this.audioCache[key] || !this.ctx) return;
    fetch(url)
      .then(res => res.arrayBuffer())
      .then(buffer => this.ctx.decodeAudioData(buffer))
      .then(decoded => {
        this.audioCache[key] = decoded;
      })
      .catch(() => {
        // Fallback procedural synthesizer active if fetch fails
      });
  }

  playSound(key, targetGain = 'sfx', volume = 1.0) {
    this.ensureContext();
    if (!this.ctx) return;

    if (this.audioCache[key]) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.audioCache[key];
      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
      source.connect(gainNode);

      const dest = targetGain === 'c4' ? this.c4Gain : this.sfxGain;
      gainNode.connect(dest);
      source.start(0);
      return;
    }

    // Attempt on-demand load or fallback to procedural
    const url = this.soundPaths[key];
    if (url) {
      fetch(url)
        .then(res => res.arrayBuffer())
        .then(buffer => this.ctx.decodeAudioData(buffer))
        .then(decoded => {
          this.audioCache[key] = decoded;
          const source = this.ctx.createBufferSource();
          source.buffer = decoded;
          const gainNode = this.ctx.createGain();
          gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
          source.connect(gainNode);
          const dest = targetGain === 'c4' ? this.c4Gain : this.sfxGain;
          gainNode.connect(dest);
          source.start(0);
        })
        .catch(() => {
          this.playProceduralFallback(key);
        });
    } else {
      this.playProceduralFallback(key);
    }
  }

  playProceduralFallback(key) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (key.includes('gun') || key === 'ak47' || key === 'm4a1' || key === 'awp') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);
      gain.gain.setValueAtTime(0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  // Gunfire with authentic per-weapon CS audio sample lookup
  playGunshot(weaponType = 'rifle', weaponId = 'ak47', isSilenced = false) {
    const wid = (weaponId || 'ak47').toLowerCase().replace(/[^a-z0-9]/g, '');
    let key = wid;

    if (wid === 'm4a1' || wid === 'm4a1s') {
      key = isSilenced ? 'm4a1' : 'm4a4';
    } else if (wid === 'usp') {
      key = isSilenced ? 'usp' : 'usp_unsilenced';
    } else if (wid === 'galilar') {
      key = 'galil';
    } else if (wid === 'sg553') {
      key = 'sg556';
    }

    if (this.soundPaths[key]) {
      this.playSound(key, 'sfx');
    } else if (this.soundPaths[wid]) {
      this.playSound(wid, 'sfx');
    } else if (weaponType === 'sniper' || wid.includes('awp') || wid.includes('scout') || wid.includes('ssg')) {
      this.playSound('awp', 'sfx');
    } else if (weaponType === 'shotgun') {
      this.playSound('xm1014', 'sfx');
    } else if (weaponType === 'smg') {
      this.playSound('p90', 'sfx');
    } else if (weaponType === 'pistol') {
      this.playSound('glock', 'sfx');
    } else {
      this.playSound('ak47', 'sfx');
    }
  }

  playKnifeSlash() {
    this.playSound('knife_slash', 'sfx');
  }

  playKnifeHit() {
    this.playSound('knife_hit', 'sfx');
  }

  playHeadshotDink() {
    this.playSound('headshot_armor', 'sfx', 1.2);
  }

  playReload(weaponId = 'ak47') {
    const wid = (weaponId || 'ak47').toLowerCase();
    if (wid === 'ak47' || wid === 'galil' || wid === 'sg553') {
      this.playSound('ak47_clipout', 'sfx', 0.9);
      setTimeout(() => this.playSound('ak47_clipin', 'sfx', 0.9), 900);
      setTimeout(() => this.playSound('ak47_boltpull', 'sfx', 0.9), 1700);
    } else if (wid === 'm4a1' || wid === 'm4a1s' || wid === 'm4a4' || wid === 'famas' || wid === 'aug') {
      this.playSound('m4a1_clipout', 'sfx', 0.9);
      setTimeout(() => this.playSound('m4a1_clipin', 'sfx', 0.9), 850);
      setTimeout(() => this.playSound('m4a1_boltpull', 'sfx', 0.9), 1650);
    } else if (wid === 'awp' || wid === 'ssg08' || wid === 'scar20' || wid === 'g3sg1') {
      this.playSound('awp_clipout', 'sfx', 0.9);
      setTimeout(() => this.playSound('awp_clipin', 'sfx', 0.9), 1100);
      setTimeout(() => this.playSound('awp_boltforward', 'sfx', 0.9), 2000);
    } else if (wid === 'deagle') {
      this.playSound('deagle_clipout', 'sfx', 0.85);
      setTimeout(() => this.playSound('deagle_clipin', 'sfx', 0.85), 750);
      setTimeout(() => this.playSound('deagle_slide', 'sfx', 0.85), 1500);
    } else if (wid === 'usp' || wid === 'p250' || wid === 'fiveseven') {
      this.playSound('usp_clipout', 'sfx', 0.8);
      setTimeout(() => this.playSound('usp_clipin', 'sfx', 0.8), 700);
      setTimeout(() => this.playSound('usp_slide', 'sfx', 0.8), 1400);
    } else if (wid === 'glock' || wid === 'tec9' || wid === 'cz75' || wid === 'dualberettas') {
      this.playSound('glock_clipout', 'sfx', 0.8);
      setTimeout(() => this.playSound('glock_clipin', 'sfx', 0.8), 700);
      setTimeout(() => this.playSound('glock_slide', 'sfx', 0.8), 1400);
    } else if (wid === 'p90' || wid === 'bizon' || wid === 'mp7' || wid === 'mp9' || wid === 'mp5sd' || wid === 'mac10' || wid === 'ump45') {
      this.playSound('p90_clipout', 'sfx', 0.9);
      setTimeout(() => this.playSound('p90_clipin', 'sfx', 0.9), 900);
      setTimeout(() => this.playSound('p90_boltpull', 'sfx', 0.9), 1700);
    } else if (wid === 'xm1014' || wid === 'nova' || wid === 'mag7' || wid === 'sawedoff') {
      this.playSound('xm1014_shell', 'sfx', 0.8);
      setTimeout(() => this.playSound('xm1014_shell', 'sfx', 0.8), 500);
      setTimeout(() => this.playSound('xm1014_shell', 'sfx', 0.8), 1000);
    } else {
      this.playSound('ak47_clipin', 'sfx', 0.8);
    }
  }

  playWeaponReload(weaponId) {
    this.playReload(weaponId);
  }

  playWeaponEquip(weaponId = 'usp') {
    const wid = (weaponId || 'usp').toLowerCase();
    if (wid === 'knife') {
      this.playSound('knife_slash', 'sfx', 0.6);
    } else {
      this.playSound('usp_slide', 'sfx', 0.5);
    }
  }

  playGrenadeThrow() {
    this.playSound('grenade_throw', 'sfx', 1.0);
  }

  playFlashbangExplode() {
    this.playSound('flash_explode', 'sfx', 1.0);
    setTimeout(() => this.playSound('flash_ring', 'sfx', 0.8), 100);
  }

  playSmokeEmit() {
    this.playSound('smoke_emit', 'sfx', 1.0);
  }

  playSmokeClear() {
    this.playSound('smoke_clear', 'sfx', 0.8);
  }

  playMolotovDetonate() {
    this.playSound('molotov_smash', 'sfx', 1.0);
    setTimeout(() => this.playSound('molotov_fire', 'sfx', 0.9), 180);
  }

  playHEDetonate() {
    this.playSound('he_detonate', 'sfx', 1.0);
  }

  playZoom() {
    this.playSound('zoom', 'sfx');
  }

  playC4Beep(urgency = 1) {
    if (urgency > 0.75) {
      this.playSound('c4_beep_urgent', 'c4', 1.0);
    } else {
      this.playSound('c4_beep', 'c4', 0.9);
    }
  }

  playC4CodeBeep() {
    this.playSound('c4_key', 'c4', 0.5);
  }

  playDefuseKitSnip() {
    this.playSound('c4_disarm_start', 'sfx', 0.8);
  }

  playExplosion() {
    this.playSound('c4_explode', 'sfx', 1.4);
  }

  playFootstep() {
    this.playSound('footstep_sand', 'sfx', 0.35);
  }

  playJump() {
    this.playSound('jump', 'sfx', 0.65);
    this.playSound('footstep_sand', 'sfx', 0.35);
  }

  playLand() {
    this.playSound('land', 'sfx', 0.85);
  }

  playRoundStart() {
    this.playSound('round_start', 'sfx', 0.95);
  }

  playRoundEnd(winner = 'CT') {
    if (winner === 'CT') {
      this.playSound('round_end_ct', 'sfx', 0.32);
    } else {
      this.playSound('round_end_t', 'sfx', 0.32);
    }
  }

  playDamage() {
    const r = Math.random();
    if (r < 0.33) this.playSound('damage1', 'sfx', 0.85);
    else if (r < 0.66) this.playSound('damage2', 'sfx', 0.85);
    else this.playSound('damage3', 'sfx', 0.85);
  }

  playRadioTone(kind = 'beep') {
    this.ensureContext();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(kind === 'win' ? 520 : 650, t);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }
}

window.csAudio = new CS2AudioSystem();
