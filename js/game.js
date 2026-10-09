// CS2 Competitive Engine: Zero Bots, Real CS Spawns, 15s Freezetime, Fully Visible C4,
// Buy Zone + 20s Buy Time Restriction, Weapon Refund, and Zero Screen Text Banners

class CS2GameManager {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // Competitive MR12 Rules
    this.maxRounds = 24;
    this.targetWins = 13;
    this.currentRound = 1;
    this.ctScore = 0;
    this.tScore = 0;
    this.consecutiveLosses = { CT: 0, T: 0 };

    // Round Phases: 'freeze' (15s buy time) -> 'live' (1:55) -> 'round_over'
    this.phase = 'freeze';
    this.freezeTime = 15.0; // Official 15-second freezetime
    this.roundTime = 115.0; // 1:55 live round time
    this.phaseTimer = this.freezeTime;

    // C4 Bomb State
    this.c4Planted = false;
    this.c4Timer = 40.0;
    this.c4Pos = null;
    this.c4Site = null;
    this.c4Mesh = null;
    this.lastBeepTime = 0;

    // Weapon Refund History (Last purchased item in buy menu)
    this.purchaseHistory = [];

    // Entities (Zero bots in match)
    this.mapBuilder = new CS2MapBuilder(this.scene);
    this.player = new CS2Player(this.camera, this.scene, this.mapBuilder);
    this.selectedMap = 'dust2';
    this.selectedTeam = 'CT';

    // Performance & Throttling Timers
    this.frameCount = 0;
    this.fpsLastTime = performance.now();
    this.currentFPS = 144;
    this.lastRadarTime = 0;
    this.lastNetTime = 0;
    this.lastTimerText = '';
    this.lastPhaseText = '';

    // Cache HUD DOM Elements
    this.hudEls = {
      ctScore: document.getElementById('ct-score'),
      tScore: document.getElementById('t-score'),
      sbCtScore: document.getElementById('sb-ct-score'),
      sbTScore: document.getElementById('sb-t-score'),
      health: document.getElementById('hud-health'),
      armor: document.getElementById('hud-armor'),
      money: document.getElementById('hud-money'),
      buyCash: document.getElementById('buy-menu-cash'),
      helmet: document.getElementById('hud-helmet'),
      kit: document.getElementById('hud-kit'),
      weaponName: document.getElementById('hud-weapon-name'),
      ammoClip: document.getElementById('hud-ammo-clip'),
      ammoReserve: document.getElementById('hud-ammo-reserve'),
      roundTimer: document.getElementById('round-timer'),
      roundPhaseLabel: document.getElementById('round-phase-label'),
      bombClock: document.getElementById('bomb-clock'),
      netGraphFPS: document.getElementById('net-graph-fps'),
      buyzoneBox: document.getElementById('hud-buyzone')
    };

    // State dirty checker
    this.cachedHUD = {
      ctScore: -1,
      tScore: -1,
      health: -1,
      armor: -1,
      money: -1,
      helmetVisible: null,
      kitVisible: null,
      weaponName: '',
      clip: -1,
      reserve: -1,
      buyzoneActive: null
    };

    this.radarCanvas = document.getElementById('radar-canvas');
    this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;
    this.net = new CS2NetworkManager(this);

    window.csGameManager = this;
    this.createC4Prop();
  }

  // Highly visible 3D C4 Prop with flashing red/white beacon light
  createC4Prop() {
    const group = new THREE.Group();

    // Main Explosive Pack
    const packGeo = new THREE.BoxGeometry(0.5, 0.22, 0.35);
    const packMat = new THREE.MeshLambertMaterial({ color: 0x9a6835 });
    const pack = new THREE.Mesh(packGeo, packMat);
    group.add(pack);

    // Electronics & Keypad
    const padGeo = new THREE.BoxGeometry(0.25, 0.06, 0.2);
    const padMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = 0.13;
    group.add(pad);

    // Blinking LED Indicator
    const ledGeo = new THREE.SphereGeometry(0.05, 8, 8);
    this.c4LedMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const led = new THREE.Mesh(ledGeo, this.c4LedMat);
    led.position.set(0.12, 0.16, 0.08);
    group.add(led);

    // Dynamic Point Light Beacon
    this.c4BeaconLight = new THREE.PointLight(0xff0000, 1.5, 12);
    this.c4BeaconLight.position.set(0.12, 0.25, 0.08);
    group.add(this.c4BeaconLight);

    this.c4Mesh = group;
    this.c4Mesh.visible = false;
    this.scene.add(this.c4Mesh);
  }

  connectToServer(mapName) {
    this.selectedMap = mapName;

    if (mapName === 'mirage') {
      this.mapBuilder.buildMirage();
      const rMap = document.getElementById('radar-map-name');
      const sbMap = document.getElementById('sb-map-name');
      if (rMap) rMap.innerText = 'DE_MIRAGE';
      if (sbMap) sbMap.innerText = 'MIRAGE';
    } else {
      this.mapBuilder.buildDust2();
      const rMap = document.getElementById('radar-map-name');
      const sbMap = document.getElementById('sb-map-name');
      if (rMap) rMap.innerText = 'DE_DUST2';
      if (sbMap) sbMap.innerText = 'DUST II';
    }

    // Connect to shared multiplayer room for this map
    this.net.autoJoinPublicServer(mapName, (role) => {
      console.log(`Connected to online server ${mapName} as ${role}`);
    });

    // Open team selection split-screen
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('team-select-screen').classList.remove('hidden');
  }

  chooseTeam(team) {
    this.selectedTeam = team;
    this.player.setTeam(team);

    document.getElementById('team-select-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('game-canvas-container').requestPointerLock();

    this.startRound();
  }

  startRound() {
    this.phase = 'freeze';
    this.phaseTimer = this.freezeTime;
    this.c4Planted = false;
    this.c4Timer = 40.0;
    this.c4Mesh.visible = false;
    this.purchaseHistory = [];

    // Reset HUD
    document.getElementById('c4-planted-alert').classList.add('hidden');
    document.getElementById('action-prompt').classList.add('hidden');
    document.getElementById('interaction-bar-container').classList.add('hidden');
    document.getElementById('spectator-hud').classList.add('hidden');

    window.csAudio.playRadioTone('start');

    // Spawn player immediately at authentic CS spawn point
    const spawns = this.mapBuilder.spawnPoints[this.player.team];
    const s = spawns[Math.floor(Math.random() * spawns.length)];
    this.player.respawn(s);

    if (this.currentRound === 13) {
      this.handleHalftimeSwap();
    }
  }

  handleHalftimeSwap() {
    const newTeam = this.player.team === 'CT' ? 'T' : 'CT';
    this.player.setTeam(newTeam);
    this.player.money.set(800);
  }

  // Authentic CS2 Buy Zone & Buy Time Rules
  canBuy() {
    // 1. Freezetime: always allowed to buy
    if (this.phase === 'freeze') return true;

    // 2. Live Round: only allowed within the first 20 seconds AND inside buy zone
    if (this.phase === 'live') {
      const liveSecondsElapsed = this.roundTime - this.phaseTimer;
      if (liveSecondsElapsed <= 20.0) {
        return this.mapBuilder.isInBuyZone(this.player.team, this.player.position);
      }
    }
    return false;
  }

  // Weapon Refund System: Sell back last purchased weapon for 100% refund
  refundLastPurchase() {
    if (!this.canBuy() || this.purchaseHistory.length === 0) {
      alert("No weapons eligible for refund or buy time expired.");
      return;
    }

    const last = this.purchaseHistory.pop();
    this.player.money.add(last.cost);

    if (last.slot === 1) {
      this.player.inventory[1] = null;
      this.player.switchSlot(2);
    } else if (last.slot === 2) {
      this.player.inventory[2] = this.player.team === 'CT' ? CS2_WEAPONS.usp : CS2_WEAPONS.glock;
      this.player.switchSlot(2);
    }

    window.csAudio.playRadioTone('buy');
    this.updateHUD();
  }

  onC4Planted(position, siteName) {
    this.c4Planted = true;
    this.c4Timer = 40.0;
    this.c4Pos = position;
    this.c4Site = siteName;

    // Explicitly elevated Y position so bomb is 100% visible on platforms
    const posY = (position.y !== undefined ? position.y : 0.1) + 0.1;
    this.c4Mesh.position.set(position.x, posY, position.z);
    this.c4Mesh.visible = true;

    document.getElementById('c4-planted-alert').classList.remove('hidden');
    window.csAudio.playRadioTone('alert');
  }

  onC4Defused() {
    this.c4Planted = false;
    this.c4Mesh.visible = false;
    document.getElementById('c4-planted-alert').classList.add('hidden');
    this.endRound('CT', 'BOMB DEFUSED');
  }

  onEntityKilled(attacker, victim, weapon, isHeadshot, victimTeam) {
    this.addToKillfeed(attacker, victim, weapon, isHeadshot, victimTeam);

    if (attacker === 'Player') {
      const reward = (this.player.activeWeapon && this.player.activeWeapon.killReward) || 300;
      this.player.money.add(reward);
    }
  }

  addToKillfeed(attacker, victim, weapon, isHeadshot, victimTeam) {
    const feed = document.getElementById('killfeed');
    if (!feed) return;

    const row = document.createElement('div');
    row.className = 'kill-row';

    const attackerTeam = victimTeam === 'CT' ? 't' : 'ct';
    const hsIcon = isHeadshot ? '<span class="kill-headshot">🎯</span>' : '';

    row.innerHTML = `
      <span class="kill-killer ${attackerTeam}">${attacker}</span>
      <span class="kill-weapon">[${weapon}]</span>
      ${hsIcon}
      <span class="kill-victim ${victimTeam.toLowerCase()}">${victim}</span>
    `;

    feed.appendChild(row);
    setTimeout(() => {
      if (row.parentNode) row.parentNode.removeChild(row);
    }, 6000);
  }

  endRound(winner, reason) {
    if (this.phase === 'round_over') return;
    this.phase = 'round_over';
    this.phaseTimer = 5;

    if (winner === 'CT') {
      this.ctScore++;
      this.consecutiveLosses.CT = 0;
      this.consecutiveLosses.T++;
      window.csAudio.playRadioTone('win');
    } else {
      this.tScore++;
      this.consecutiveLosses.T = 0;
      this.consecutiveLosses.CT++;
      window.csAudio.playRadioTone('win');
    }

    const winBonus = 3250;
    const lossBonusBase = 1400;

    if (this.player.team === winner) {
      this.player.money.add(winBonus);
    } else {
      const streak = this.consecutiveLosses[this.player.team];
      const bonus = Math.min(3400, lossBonusBase + streak * 500);
      this.player.money.add(bonus);
    }

    if (this.player.money.get() > 16000) {
      this.player.money.set(16000);
    }

    if (this.ctScore >= this.targetWins || this.tScore >= this.targetWins) {
      setTimeout(() => this.endMatch(), 4000);
    } else {
      setTimeout(() => {
        this.currentRound++;
        this.startRound();
      }, 5000);
    }
  }

  endMatch() {
    this.phase = 'match_over';
    setTimeout(() => {
      document.getElementById('hud').classList.add('hidden');
      document.getElementById('main-menu').classList.remove('hidden');
      document.exitPointerLock();
    }, 6000);
  }

  handleObjectives(dt) {
    if (this.phase !== 'live' || this.player.isSpectating) return;

    const actionPrompt = document.getElementById('action-prompt');
    const promptText = document.getElementById('action-prompt-text');
    const progressTrack = document.getElementById('interaction-bar-container');
    const progressFill = document.getElementById('interaction-progress-fill');
    const progressTitle = document.getElementById('interaction-title');

    // T planting C4
    if (this.player.team === 'T' && !this.c4Planted && this.player.inventory[5]) {
      let inSite = null;
      let siteY = 0.1;
      for (let i = 0; i < this.mapBuilder.bombZones.length; i++) {
        const site = this.mapBuilder.bombZones[i];
        const dist = Math.hypot(this.player.position.x - site.x, this.player.position.z - site.z);
        if (dist <= site.radius) {
          inSite = site.id;
          siteY = site.y || 0.1;
          break;
        }
      }

      if (inSite) {
        actionPrompt.classList.remove('hidden');
        promptText.innerText = `HOLD [E] TO PLANT C4 ON SITE ${inSite}`;

        if (this.player.keys[this.player.keybinds.use]) {
          this.player.isPlanting = true;
          this.player.plantProgress += dt / 3.2;
          progressTrack.classList.remove('hidden');
          progressTitle.innerText = `ARMING C4 ON SITE ${inSite}...`;
          progressFill.style.width = `${Math.min(100, this.player.plantProgress * 100)}%`;
          window.csAudio.playC4CodeBeep();

          if (this.player.plantProgress >= 1.0) {
            this.player.isPlanting = false;
            this.player.plantProgress = 0;
            this.player.inventory[5] = null;
            progressTrack.classList.add('hidden');
            const plantPos = { x: this.player.position.x, y: siteY, z: this.player.position.z };
            this.onC4Planted(plantPos, `BOMBSITE ${inSite}`);

            // Broadcast to network
            if (this.net) {
              if (this.net.isHost) {
                this.net.broadcast({ type: 'plant_c4', pos: plantPos, site: `BOMBSITE ${inSite}` });
              } else if (this.net.hostConnection && this.net.hostConnection.open) {
                this.net.hostConnection.send({ type: 'plant_c4', pos: plantPos, site: `BOMBSITE ${inSite}` });
              }
            }
          }
          return;
        } else {
          this.player.plantProgress = 0;
          progressTrack.classList.add('hidden');
        }
      } else {
        actionPrompt.classList.add('hidden');
      }
    }

    // CT defusing C4
    if (this.player.team === 'CT' && this.c4Planted && this.c4Pos) {
      const distToC4 = Math.hypot(this.player.position.x - this.c4Pos.x, this.player.position.z - this.c4Pos.z);
      if (distToC4 < 3.8) {
        actionPrompt.classList.remove('hidden');
        const kitText = this.player.hasDefuseKit ? '(DEFUSE KIT - 5s)' : '(NO KIT - 10s)';
        promptText.innerText = `HOLD [E] TO DEFUSE C4 ${kitText}`;

        if (this.player.keys[this.player.keybinds.use]) {
          this.player.isDefusing = true;
          const defuseDuration = this.player.hasDefuseKit ? 5.0 : 10.0;
          this.player.defuseProgress += dt / defuseDuration;
          progressTrack.classList.remove('hidden');
          progressTitle.innerText = 'DEFUSING EXPLOSIVE...';
          progressFill.style.width = `${Math.min(100, this.player.defuseProgress * 100)}%`;

          if (Math.random() < 0.2) window.csAudio.playDefuseKitSnip();

          if (this.player.defuseProgress >= 1.0) {
            this.player.isDefusing = false;
            this.player.defuseProgress = 0;
            progressTrack.classList.add('hidden');
            this.onC4Defused();

            // Broadcast defusal
            if (this.net) {
              if (this.net.isHost) {
                this.net.broadcast({ type: 'defuse_c4' });
              } else if (this.net.hostConnection && this.net.hostConnection.open) {
                this.net.hostConnection.send({ type: 'defuse_c4' });
              }
            }
          }
          return;
        } else {
          this.player.defuseProgress = 0;
          progressTrack.classList.add('hidden');
        }
      } else {
        actionPrompt.classList.add('hidden');
      }
    }
  }

  renderRadar() {
    if (!this.radarCtx) return;
    const ctx = this.radarCtx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 0.75;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-this.player.yaw);

    const bZones = this.mapBuilder.bombZones;
    for (let i = 0; i < bZones.length; i++) {
      const site = bZones[i];
      const rx = (site.x - this.player.position.x) * scale;
      const rz = (site.z - this.player.position.z) * scale;

      ctx.fillStyle = 'rgba(255, 59, 48, 0.4)';
      ctx.beginPath();
      ctx.arc(rx, rz, site.radius * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(site.id, rx - 4, rz + 4);
    }

    if (this.c4Planted && this.c4Pos) {
      const rx = (this.c4Pos.x - this.player.position.x) * scale;
      const rz = (this.c4Pos.z - this.player.position.z) * scale;
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(rx, rz, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    const remPlayers = Object.values(this.net.remotePlayers);
    for (let i = 0; i < remPlayers.length; i++) {
      const p = remPlayers[i];
      const rx = (p.pos.x - this.player.position.x) * scale;
      const rz = (p.pos.z - this.player.position.z) * scale;
      ctx.fillStyle = p.team === this.player.team ? (p.team === 'CT' ? '#5b97d5' : '#d58936') : '#ff3b30';
      ctx.beginPath();
      ctx.arc(rx, rz, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.fillStyle = '#00ff66';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.closePath();
    ctx.fill();
  }

  updateFPSCounter(currentTime) {
    this.frameCount++;
    if (currentTime - this.fpsLastTime >= 500) {
      this.currentFPS = Math.round((this.frameCount * 1000) / (currentTime - this.fpsLastTime));
      this.frameCount = 0;
      this.fpsLastTime = currentTime;

      if (this.hudEls.netGraphFPS) {
        this.hudEls.netGraphFPS.innerText = `${this.currentFPS} FPS | 8ms | TICK 64`;
      }
    }
  }

  update(dt, currentTime) {
    this.updateFPSCounter(currentTime);

    // Freezetime phase
    if (this.phase === 'freeze') {
      this.phaseTimer -= dt;
      if (this.lastPhaseText !== 'FREEZETIME') {
        this.lastPhaseText = 'FREEZETIME';
        this.hudEls.roundPhaseLabel.innerText = 'FREEZETIME';
      }
      const secsLeft = Math.max(0, Math.ceil(this.phaseTimer));
      const timerStr = `0:${secsLeft.toString().padStart(2, '0')}`;
      if (this.lastTimerText !== timerStr) {
        this.lastTimerText = timerStr;
        this.hudEls.roundTimer.innerText = timerStr;
      }

      if (this.phaseTimer <= 0) {
        this.phase = 'live';
        this.phaseTimer = this.roundTime;
        this.lastPhaseText = 'LIVE';
        this.hudEls.roundPhaseLabel.innerText = 'ROUND LIVE';
        window.csAudio.playRadioTone('start');
      }
    } else if (this.phase === 'live') {
      this.phaseTimer -= dt;
      const mins = Math.max(0, Math.floor(this.phaseTimer / 60));
      const secs = Math.max(0, Math.floor(this.phaseTimer % 60));
      const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      if (this.lastTimerText !== timerStr) {
        this.lastTimerText = timerStr;
        this.hudEls.roundTimer.innerText = timerStr;
      }

      if (this.c4Planted) {
        this.c4Timer -= dt;
        this.hudEls.bombClock.innerText = `${Math.max(0, this.c4Timer).toFixed(1)}s`;

        const beepInterval = Math.max(0.12, this.c4Timer / 40.0);
        if (currentTime / 1000 - this.lastBeepTime > beepInterval) {
          this.lastBeepTime = currentTime / 1000;
          const urgency = 1.0 - (this.c4Timer / 40.0);
          window.csAudio.playC4Beep(urgency);

          // Flash light & LED
          if (this.c4LedMat) this.c4LedMat.color.set(0xffffff);
          if (this.c4BeaconLight) this.c4BeaconLight.intensity = 3.5;
          setTimeout(() => {
            if (this.c4LedMat) this.c4LedMat.color.set(0xff0000);
            if (this.c4BeaconLight) this.c4BeaconLight.intensity = 1.0;
          }, 60);
        }

        if (this.c4Timer <= 0) {
          this.c4Planted = false;
          this.c4Mesh.visible = false;
          window.csAudio.playExplosion();
          this.endRound('T', 'TARGET DESTROYED');
        }
      } else {
        if (this.phaseTimer <= 0) {
          this.endRound('CT', 'TIME RAN OUT');
        }
      }
    }

    this.player.update(dt, currentTime, this);
    this.handleObjectives(dt);
    this.updateHUD();

    if (currentTime - this.lastRadarTime > 40) {
      this.lastRadarTime = currentTime;
      this.renderRadar();
    }

    if (currentTime - this.lastNetTime > 50) {
      this.lastNetTime = currentTime;
      this.net.sendPlayerState(this.player);
    }
  }

  updateHUD() {
    const p = this.player;
    const h = this.hudEls;
    const c = this.cachedHUD;

    if (c.ctScore !== this.ctScore) {
      c.ctScore = this.ctScore;
      h.ctScore.innerText = this.ctScore;
      h.sbCtScore.innerText = this.ctScore;
    }
    if (c.tScore !== this.tScore) {
      c.tScore = this.tScore;
      h.tScore.innerText = this.tScore;
      h.sbTScore.innerText = this.tScore;
    }

    const curHp = p.health.get();
    if (c.health !== curHp) {
      c.health = curHp;
      h.health.innerText = curHp;
    }

    const curArmor = p.armor.get();
    if (c.armor !== curArmor) {
      c.armor = curArmor;
      h.armor.innerText = curArmor;
    }

    const curMoney = p.money.get();
    if (c.money !== curMoney) {
      c.money = curMoney;
      h.money.innerText = curMoney;
      h.buyCash.innerText = `$${curMoney}`;
    }

    if (c.helmetVisible !== p.hasHelmet) {
      c.helmetVisible = p.hasHelmet;
      if (h.helmet) h.helmet.style.display = p.hasHelmet ? 'inline-block' : 'none';
    }

    const showKit = (p.team === 'CT' && p.hasDefuseKit);
    if (c.kitVisible !== showKit) {
      c.kitVisible = showKit;
      if (h.kit) {
        if (showKit) h.kit.classList.remove('hidden');
        else h.kit.classList.add('hidden');
      }
    }

    // Buyzone active state
    const inBuy = this.canBuy();
    if (c.buyzoneActive !== inBuy) {
      c.buyzoneActive = inBuy;
      if (h.buyzoneBox) {
        if (inBuy) h.buyzoneBox.classList.remove('inactive');
        else h.buyzoneBox.classList.add('inactive');
      }
    }

    if (p.activeWeapon) {
      if (c.weaponName !== p.activeWeapon.name) {
        c.weaponName = p.activeWeapon.name;
        h.weaponName.innerText = p.activeWeapon.name;
      }
      if (p.activeWeapon.clip) {
        const curClip = p.clipAmmo.get();
        const curRes = p.reserveAmmo.get();
        if (c.clip !== curClip) {
          c.clip = curClip;
          h.ammoClip.innerText = curClip;
        }
        if (c.reserve !== curRes) {
          c.reserve = curRes;
          h.ammoReserve.innerText = curRes;
        }
      } else {
        if (c.clip !== -1) {
          c.clip = -1;
          h.ammoClip.innerText = '-';
          h.ammoReserve.innerText = '-';
        }
      }
    }
  }
}

window.CS2GameManager = CS2GameManager;
