// CS2 Competitive MR12 Game State Engine with Team Selection, Real CS Spawns & Human Online Play

class CS2GameManager {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // Match Rules: Competitive MR12
    this.maxRounds = 24;
    this.targetWins = 13;
    this.currentRound = 1;
    this.ctScore = 0;
    this.tScore = 0;
    this.consecutiveLosses = { CT: 0, T: 0 };

    this.phase = 'freeze';
    this.roundTime = 115;
    this.freezeTime = 15;
    this.phaseTimer = this.freezeTime;

    // C4 Bomb State
    this.c4Planted = false;
    this.c4Timer = 40.0;
    this.c4Pos = null;
    this.c4Site = null;
    this.c4Mesh = null;
    this.lastBeepTime = 0;

    // Entities
    this.mapBuilder = new CS2MapBuilder(this.scene);
    this.player = new CS2Player(this.camera, this.scene, this.mapBuilder);
    this.bots = []; // BOTS REMOVED FROM LOBBIES AS REQUESTED
    this.selectedMap = 'dust2';
    this.selectedTeam = 'CT';

    // FPS Counter tracking
    this.frameCount = 0;
    this.fpsLastTime = performance.now();
    this.currentFPS = 60;

    this.radarCanvas = document.getElementById('radar-canvas');
    this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;
    this.net = new CS2NetworkManager(this);

    window.csGameManager = this;
    this.createC4Prop();
  }

  createC4Prop() {
    const group = new THREE.Group();
    const packGeo = new THREE.BoxGeometry(0.35, 0.15, 0.25);
    const packMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
    const pack = new THREE.Mesh(packGeo, packMat);
    group.add(pack);

    const padGeo = new THREE.BoxGeometry(0.15, 0.04, 0.15);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = 0.09;
    group.add(pad);

    const ledGeo = new THREE.SphereGeometry(0.03, 8, 8);
    this.c4LedMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const led = new THREE.Mesh(ledGeo, this.c4LedMat);
    led.position.set(0.08, 0.11, 0.06);
    group.add(led);

    this.c4Mesh = group;
    this.c4Mesh.visible = false;
    this.scene.add(this.c4Mesh);
  }

  // Connect to competitive server (Dust 2 or Mirage)
  connectToServer(mapName) {
    this.selectedMap = mapName;

    // Build chosen map
    if (mapName === 'mirage') {
      this.mapBuilder.buildMirage();
      document.getElementById('radar-map-name').innerText = 'DE_MIRAGE';
      document.getElementById('sb-map-name').innerText = 'MIRAGE';
    } else {
      this.mapBuilder.buildDust2();
      document.getElementById('radar-map-name').innerText = 'DE_DUST2';
      document.getElementById('sb-map-name').innerText = 'DUST II';
    }

    // Open Team Select Screen
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('team-select-screen').classList.remove('hidden');
  }

  // Player chooses team on split screen
  chooseTeam(team) {
    this.selectedTeam = team;
    this.player.setTeam(team);
    document.getElementById('team-select-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');

    document.getElementById('game-canvas-container').requestPointerLock();

    // Check if other players are active in a live round
    const remotePlayersCount = Object.keys(this.net.remotePlayers).length;
    if (this.phase === 'live' && remotePlayersCount > 0) {
      this.player.enterSpectatorMode();
      this.showAnnouncement('ROUND IN PROGRESS — SPECTATING (A / D TO CYCLE)', 'neutral');
    } else {
      // Spawn immediately at authentic CS team spawn!
      this.startRound();
    }
  }

  startRound() {
    this.phase = 'freeze';
    this.phaseTimer = this.freezeTime;
    this.c4Planted = false;
    this.c4Timer = 40.0;
    this.c4Mesh.visible = false;

    // Reset HUD alerts
    document.getElementById('c4-planted-alert').classList.add('hidden');
    document.getElementById('announcement-banner').classList.add('hidden');
    document.getElementById('action-prompt').classList.add('hidden');
    document.getElementById('interaction-bar-container').classList.add('hidden');
    document.getElementById('spectator-hud').classList.add('hidden');

    // Spawn Player at authentic CS spawn point!
    const spawns = this.mapBuilder.spawnPoints[this.player.team];
    const spawnIndex = Math.floor(Math.random() * spawns.length);
    this.player.respawn(spawns[spawnIndex]);

    if (this.currentRound === 13) {
      this.handleHalftimeSwap();
    }

    window.csAudio.playRadioTone('start');
  }

  handleHalftimeSwap() {
    const newTeam = this.player.team === 'CT' ? 'T' : 'CT';
    this.player.setTeam(newTeam);
    this.player.money.set(800);
    this.showAnnouncement('HALFTIME - SWITCHING SIDES', 'neutral');
  }

  onC4Planted(position, siteName) {
    this.c4Planted = true;
    this.c4Timer = 40.0;
    this.c4Pos = position;
    this.c4Site = siteName;

    this.c4Mesh.position.set(position.x, 0.08, position.z);
    this.c4Mesh.visible = true;

    document.getElementById('c4-planted-alert').classList.remove('hidden');
    this.showAnnouncement(`THE BOMB HAS BEEN PLANTED AT ${siteName}!`, 't-win');
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
      this.showAnnouncement(`COUNTER-TERRORISTS WIN (${reason})`, 'ct-win');
      window.csAudio.playRadioTone('win');
    } else {
      this.tScore++;
      this.consecutiveLosses.T = 0;
      this.consecutiveLosses.CT++;
      this.showAnnouncement(`TERRORISTS WIN (${reason})`, 't-win');
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
    const winner = this.ctScore >= this.targetWins ? 'COUNTER-TERRORISTS' : 'TERRORISTS';
    this.showAnnouncement(`MATCH COMPLETE &bull; ${winner} VICTORY!`, 'neutral');
    setTimeout(() => {
      document.getElementById('hud').classList.add('hidden');
      document.getElementById('main-menu').classList.remove('hidden');
      document.exitPointerLock();
    }, 6000);
  }

  showAnnouncement(text, styleClass) {
    const banner = document.getElementById('announcement-banner');
    if (!banner) return;
    banner.className = `announcement ${styleClass}`;
    banner.innerText = text;
    banner.classList.remove('hidden');
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
      for (const site of this.mapBuilder.bombZones) {
        const dist = Math.hypot(this.player.position.x - site.x, this.player.position.z - site.z);
        if (dist <= site.radius) {
          inSite = site.id;
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
            this.onC4Planted(
              { x: this.player.position.x, y: 0.1, z: this.player.position.z },
              `BOMBSITE ${inSite}`
            );
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
      if (distToC4 < 3.2) {
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

    // Draw Bombsite A and B markers
    this.mapBuilder.bombZones.forEach(site => {
      const rx = (site.x - this.player.position.x) * scale;
      const rz = (site.z - this.player.position.z) * scale;

      ctx.fillStyle = 'rgba(255, 59, 48, 0.4)';
      ctx.beginPath();
      ctx.arc(rx, rz, site.radius * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(site.id, rx - 4, rz + 4);
    });

    if (this.c4Planted && this.c4Pos) {
      const rx = (this.c4Pos.x - this.player.position.x) * scale;
      const rz = (this.c4Pos.z - this.player.position.z) * scale;
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(rx, rz, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw other connected human players
    Object.values(this.net.remotePlayers).forEach(p => {
      const rx = (p.pos.x - this.player.position.x) * scale;
      const rz = (p.pos.z - this.player.position.z) * scale;
      ctx.fillStyle = p.team === this.player.team ? (p.team === 'CT' ? '#5b97d5' : '#d58936') : '#ff3b30';
      ctx.beginPath();
      ctx.arc(rx, rz, 4, 0, Math.PI * 2);
      ctx.fill();
    });

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

      const fpsEl = document.getElementById('net-graph-fps');
      if (fpsEl) {
        fpsEl.innerText = `${this.currentFPS} FPS | 12ms | TICK 64`;
      }
    }
  }

  update(dt, currentTime) {
    this.updateFPSCounter(currentTime);

    if (this.phase === 'freeze') {
      this.phaseTimer -= dt;
      document.getElementById('round-phase-label').innerText = 'BUY PHASE (FREEZETIME)';
      document.getElementById('round-timer').innerText = `0:${Math.ceil(this.phaseTimer).toString().padStart(2, '0')}`;
      if (this.phaseTimer <= 0) {
        this.phase = 'live';
        this.phaseTimer = this.roundTime;
        document.getElementById('round-phase-label').innerText = 'ROUND LIVE';
      }
    } else if (this.phase === 'live') {
      this.phaseTimer -= dt;
      const mins = Math.floor(this.phaseTimer / 60);
      const secs = Math.floor(this.phaseTimer % 60);
      document.getElementById('round-timer').innerText = `${mins}:${secs.toString().padStart(2, '0')}`;

      if (this.c4Planted) {
        this.c4Timer -= dt;
        document.getElementById('bomb-clock').innerText = `${Math.max(0, this.c4Timer).toFixed(1)}s`;

        const beepInterval = Math.max(0.12, this.c4Timer / 40.0);
        if (currentTime / 1000 - this.lastBeepTime > beepInterval) {
          this.lastBeepTime = currentTime / 1000;
          const urgency = 1.0 - (this.c4Timer / 40.0);
          window.csAudio.playC4Beep(urgency);

          if (this.c4LedMat) this.c4LedMat.color.set(0xffffff);
          setTimeout(() => { if (this.c4LedMat) this.c4LedMat.color.set(0xff0000); }, 50);
        }

        if (this.c4Timer <= 0) {
          this.c4Planted = false;
          this.c4Mesh.visible = false;
          window.csAudio.playExplosion();
          this.endRound('T', 'TARGET BOMBED & DESTROYED');
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
    this.renderRadar();
    this.net.sendPlayerState(this.player);
  }

  updateHUD() {
    document.getElementById('ct-score').innerText = this.ctScore;
    document.getElementById('t-score').innerText = this.tScore;
    document.getElementById('sb-ct-score').innerText = this.ctScore;
    document.getElementById('sb-t-score').innerText = this.tScore;

    document.getElementById('hud-health').innerText = this.player.health.get();
    document.getElementById('hud-armor').innerText = this.player.armor.get();
    document.getElementById('hud-money').innerText = this.player.money.get();
    document.getElementById('buy-menu-cash').innerText = `$${this.player.money.get()}`;

    const helmetEl = document.getElementById('hud-helmet');
    if (helmetEl) helmetEl.style.display = this.player.hasHelmet ? 'inline-block' : 'none';

    const kitEl = document.getElementById('hud-kit');
    if (kitEl) {
      if (this.player.team === 'CT' && this.player.hasDefuseKit) kitEl.classList.remove('hidden');
      else kitEl.classList.add('hidden');
    }

    if (this.player.activeWeapon) {
      document.getElementById('hud-weapon-name').innerText = this.player.activeWeapon.name;
      if (this.player.activeWeapon.clip) {
        document.getElementById('hud-ammo-clip').innerText = this.player.clipAmmo.get();
        document.getElementById('hud-ammo-reserve').innerText = this.player.reserveAmmo.get();
      } else {
        document.getElementById('hud-ammo-clip').innerText = '-';
        document.getElementById('hud-ammo-reserve').innerText = '-';
      }
    }
  }
}

window.CS2GameManager = CS2GameManager;
