// CS2 Competitive MR12 Game State Engine & Match Director

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

    // Phase: 'freeze', 'live', 'round_over', 'match_over'
    this.phase = 'freeze';
    this.roundTime = 115; // 1:55 in seconds
    this.freezeTime = 15; // 15s buy time
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
    this.bots = [];
    this.selectedMap = 'dust2';
    this.selectedTeam = 'CT';

    // Radar Canvas
    this.radarCanvas = document.getElementById('radar-canvas');
    this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;

    // Network Engine
    this.net = new CS2NetworkManager(this);

    // Initialize 3D C4 Mesh
    this.createC4Prop();
  }

  createC4Prop() {
    const group = new THREE.Group();
    // C4 main pack
    const packGeo = new THREE.BoxGeometry(0.35, 0.15, 0.25);
    const packMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
    const pack = new THREE.Mesh(packGeo, packMat);
    group.add(pack);

    // Keypad & wires
    const padGeo = new THREE.BoxGeometry(0.15, 0.04, 0.15);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = 0.09;
    group.add(pad);

    // Flashing red LED
    const ledGeo = new THREE.SphereGeometry(0.03, 8, 8);
    this.c4LedMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const led = new THREE.Mesh(ledGeo, this.c4LedMat);
    led.position.set(0.08, 0.11, 0.06);
    group.add(led);

    this.c4Mesh = group;
    this.c4Mesh.visible = false;
    this.scene.add(this.c4Mesh);
  }

  startMatch(mapName, team) {
    this.selectedMap = mapName;
    this.selectedTeam = team;
    this.currentRound = 1;
    this.ctScore = 0;
    this.tScore = 0;
    this.consecutiveLosses = { CT: 0, T: 0 };

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

    // Configure Player
    this.player.setTeam(team);
    this.player.money.set(800);

    // Spawn 5v5 Bots
    this.spawnMatchBots();

    // Start Round 1
    this.startRound();
  }

  spawnMatchBots() {
    // Clear existing bots
    this.bots.forEach(b => this.scene.remove(b.mesh));
    this.bots = [];

    const ctNames = ['Vitaly', 'Dmitriy', 'Chris', 'Gabe', 'Sasha'];
    const tNames = ['Ivan', 'Boris', 'Alexei', 'Yuri', 'Viktor'];

    // If player is CT: spawn 4 CT bot allies and 5 T bot enemies
    if (this.selectedTeam === 'CT') {
      for (let i = 0; i < 4; i++) {
        this.bots.push(new CS2Bot(`Bot ${ctNames[i]}`, 'CT', this.scene, this.mapBuilder));
      }
      for (let i = 0; i < 5; i++) {
        this.bots.push(new CS2Bot(`Bot ${tNames[i]}`, 'T', this.scene, this.mapBuilder));
      }
    } else {
      for (let i = 0; i < 5; i++) {
        this.bots.push(new CS2Bot(`Bot ${ctNames[i]}`, 'CT', this.scene, this.mapBuilder));
      }
      for (let i = 0; i < 4; i++) {
        this.bots.push(new CS2Bot(`Bot ${tNames[i]}`, 'T', this.scene, this.mapBuilder));
      }
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

    // Spawn Player
    const playerSpawns = this.mapBuilder.spawnPoints[this.player.team];
    const spawnIndex = Math.floor(Math.random() * playerSpawns.length);
    this.player.respawn(playerSpawns[spawnIndex]);

    // Spawn Bots
    let ctIdx = 0;
    let tIdx = 0;
    this.bots.forEach(bot => {
      const spawns = this.mapBuilder.spawnPoints[bot.team];
      const s = bot.team === 'CT' ? spawns[ctIdx++ % spawns.length] : spawns[tIdx++ % spawns.length];
      bot.spawn(s);
    });

    // Halftime side swap check (Round 13)
    if (this.currentRound === 13) {
      this.handleHalftimeSwap();
    }

    window.csAudio.playRadioTone('start');
  }

  handleHalftimeSwap() {
    // Swap teams at halftime
    const newTeam = this.player.team === 'CT' ? 'T' : 'CT';
    this.player.setTeam(newTeam);
    this.player.money.set(800);
    this.bots.forEach(b => {
      b.team = b.team === 'CT' ? 'T' : 'CT';
      b.cash = 800;
    });
    this.showAnnouncement("HALFTIME - SWITCHING SIDES", "neutral");
  }

  // Called when C4 is planted
  onC4Planted(position, siteName) {
    this.c4Planted = true;
    this.c4Timer = 40.0;
    this.c4Pos = position;
    this.c4Site = siteName;

    this.c4Mesh.position.set(position.x, 0.08, position.z);
    this.c4Mesh.visible = true;

    // Alert CT and T
    document.getElementById('c4-planted-alert').classList.remove('hidden');
    this.showAnnouncement(`THE BOMB HAS BEEN PLANTED AT ${siteName}!`, 't-win');
    window.csAudio.playRadioTone('alert');

    // Retarget all bots to bombsite
    this.bots.forEach(b => b.chooseNextObjective(true, this.c4Pos));
  }

  onC4Defused() {
    this.c4Planted = false;
    this.c4Mesh.visible = false;
    document.getElementById('c4-planted-alert').classList.add('hidden');
    this.endRound('CT', 'BOMB DEFUSED');
  }

  onEntityKilled(attacker, victim, weapon, isHeadshot, victimTeam) {
    // Add to Killfeed HUD
    this.addToKillfeed(attacker, victim, weapon, isHeadshot, victimTeam);

    // Economy Kill Reward for local player
    if (attacker === 'Player') {
      const reward = (this.player.activeWeapon && this.player.activeWeapon.killReward) || 300;
      this.player.money.add(reward);
    }

    // Check round victory condition
    this.checkEliminationVictory();
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

  checkEliminationVictory() {
    if (this.phase !== 'live') return;

    // Count alive on CT & T
    let ctAlive = (this.player.team === 'CT' && this.player.health.get() > 0) ? 1 : 0;
    let tAlive = (this.player.team === 'T' && this.player.health.get() > 0) ? 1 : 0;

    this.bots.forEach(b => {
      if (b.isAlive) {
        if (b.team === 'CT') ctAlive++;
        else tAlive++;
      }
    });

    // Update Header Alive indicators
    document.getElementById('ct-alive-count').innerText = `${ctAlive} ALIVE`;
    document.getElementById('t-alive-count').innerText = `${tAlive} ALIVE`;

    if (ctAlive === 0 && !this.c4Planted) {
      this.endRound('T', 'COUNTER-TERRORISTS ELIMINATED');
    } else if (tAlive === 0) {
      if (!this.c4Planted) {
        this.endRound('CT', 'TERRORISTS ELIMINATED');
      }
      // If bomb is planted, CTs must still defuse before winning!
    }
  }

  endRound(winner, reason) {
    if (this.phase === 'round_over') return;
    this.phase = 'round_over';
    this.phaseTimer = 5; // 5s transition

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

    // Award Economy Bonuses
    const winBonus = 3250;
    const lossBonusBase = 1400;

    if (this.player.team === winner) {
      this.player.money.add(winBonus);
    } else {
      const streak = this.consecutiveLosses[this.player.team];
      const bonus = Math.min(3400, lossBonusBase + streak * 500);
      this.player.money.add(bonus);
    }

    // Cap money at CS2 maximum $16,000
    if (this.player.money.get() > 16000) {
      this.player.money.set(16000);
    }

    // Check Match Point / Match Over
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

  // Handle Plant / Defuse Keys and Prompts
  handleObjectives(dt) {
    if (this.phase !== 'live') return;

    const actionPrompt = document.getElementById('action-prompt');
    const promptText = document.getElementById('action-prompt-text');
    const progressTrack = document.getElementById('interaction-bar-container');
    const progressFill = document.getElementById('interaction-progress-fill');
    const progressTitle = document.getElementById('interaction-title');

    // 1. Terrorist Planting C4
    if (this.player.team === 'T' && !this.c4Planted && this.player.inventory[5]) {
      // Check if in bombsite A or B zone
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
          this.player.plantProgress += dt / 3.2; // 3.2s plant time
          progressTrack.classList.remove('hidden');
          progressTitle.innerText = `ARMING C4 ON SITE ${inSite}...`;
          progressFill.style.width = `${Math.min(100, this.player.plantProgress * 100)}%`;
          window.csAudio.playC4CodeBeep();

          if (this.player.plantProgress >= 1.0) {
            this.player.isPlanting = false;
            this.player.plantProgress = 0;
            this.player.inventory[5] = null; // Drop C4
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

    // 2. Counter-Terrorist Defusing C4
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

  // Draw 2D Minimap / Radar
  renderRadar() {
    if (!this.radarCtx) return;
    const ctx = this.radarCtx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 0.75; // Map units to radar pixels

    ctx.clearRect(0, 0, w, h);

    // Save and rotate radar with player yaw for rotating radar orientation
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-this.player.yaw);

    // Draw Bombsites A & B
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

    // Draw Planted C4
    if (this.c4Planted && this.c4Pos) {
      const rx = (this.c4Pos.x - this.player.position.x) * scale;
      const rz = (this.c4Pos.z - this.player.position.z) * scale;
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(rx, rz, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Bots
    this.bots.forEach(bot => {
      if (!bot.isAlive) return;
      const rx = (bot.position.x - this.player.position.x) * scale;
      const rz = (bot.position.z - this.player.position.z) * scale;

      // Only draw enemies if spotted or friendly teammates
      const isFriendly = bot.team === this.player.team;
      ctx.fillStyle = isFriendly ? (bot.team === 'CT' ? '#5b97d5' : '#d58936') : '#ff3b30';
      ctx.beginPath();
      ctx.arc(rx, rz, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();

    // Draw Player Pointer in center (always pointing UP)
    ctx.fillStyle = '#00ff66';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.closePath();
    ctx.fill();
  }

  // Update Game Loop per Tick
  update(dt, currentTime) {
    // 1. Phase & Timers
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

      // 2. C4 Bomb Tick Countdown
      if (this.c4Planted) {
        this.c4Timer -= dt;
        document.getElementById('bomb-clock').innerText = `${Math.max(0, this.c4Timer).toFixed(1)}s`;

        // Accelerating Beep Frequency
        const beepInterval = Math.max(0.12, this.c4Timer / 40.0);
        if (currentTime / 1000 - this.lastBeepTime > beepInterval) {
          this.lastBeepTime = currentTime / 1000;
          const urgency = 1.0 - (this.c4Timer / 40.0);
          window.csAudio.playC4Beep(urgency);

          // LED flash
          if (this.c4LedMat) this.c4LedMat.color.set(0xffffff);
          setTimeout(() => { if (this.c4LedMat) this.c4LedMat.color.set(0xff0000); }, 50);
        }

        // Bomb Detonation
        if (this.c4Timer <= 0) {
          this.c4Planted = false;
          this.c4Mesh.visible = false;
          window.csAudio.playExplosion();
          this.endRound('T', 'TARGET BOMBED & DESTROYED');
        }
      } else {
        // Round time ran out (CT Victory by default if C4 not planted)
        if (this.phaseTimer <= 0) {
          this.endRound('CT', 'TIME RAN OUT');
        }
      }
    }

    // 3. Update Player, Objectives, and Bots
    this.player.update(dt, currentTime, this.bots, this);
    this.handleObjectives(dt);

    this.bots.forEach(bot => {
      bot.update(dt, currentTime, this.player, this.bots, this);
    });

    // 4. Update HUD
    this.updateHUD();

    // 5. Draw Radar
    this.renderRadar();

    // 6. Network sync
    this.net.sendPlayerState(this.player);
  }

  updateHUD() {
    // Scores
    document.getElementById('ct-score').innerText = this.ctScore;
    document.getElementById('t-score').innerText = this.tScore;
    document.getElementById('sb-ct-score').innerText = this.ctScore;
    document.getElementById('sb-t-score').innerText = this.tScore;

    // Player Stats from AntiCheat canaries
    document.getElementById('hud-health').innerText = this.player.health.get();
    document.getElementById('hud-armor').innerText = this.player.armor.get();
    document.getElementById('hud-money').innerText = this.player.money.get();
    document.getElementById('buy-menu-cash').innerText = `$${this.player.money.get()}`;

    // Helmet & Kit indicators
    const helmetEl = document.getElementById('hud-helmet');
    if (helmetEl) helmetEl.style.display = this.player.hasHelmet ? 'inline-block' : 'none';

    const kitEl = document.getElementById('hud-kit');
    if (kitEl) {
      if (this.player.team === 'CT' && this.player.hasDefuseKit) kitEl.classList.remove('hidden');
      else kitEl.classList.add('hidden');
    }

    // Weapon & Ammo
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
