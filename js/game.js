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

  // Highly visible 3D C4 Prop with authentic CS digital display & flashing beacon light
  createC4Prop() {
    const group = new THREE.Group();

    // Canvas Texture for Authentic C4 Keypad & LCD Screen ("7355608")
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1c1f24';
    ctx.fillRect(0, 0, 256, 256);

    // LCD screen
    ctx.fillStyle = '#0a0d0a';
    ctx.fillRect(15, 15, 226, 70);
    ctx.strokeStyle = '#333a42';
    ctx.lineWidth = 4;
    ctx.strokeRect(15, 15, 226, 70);

    ctx.fillStyle = '#ff2222';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('7355608', 128, 50);

    // Keypad grid
    ctx.fillStyle = '#2a2e36';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(35 + c * 68, 100 + r * 35, 52, 28);
        ctx.fillStyle = '#dddddd';
        ctx.font = 'bold 16px sans-serif';
        const num = (r === 3 && c === 1) ? '0' : String(r * 3 + c + 1);
        ctx.fillText(num, 35 + c * 68 + 26, 100 + r * 35 + 14);
        ctx.fillStyle = '#2a2e36';
      }
    }
    const c4FaceTex = new THREE.CanvasTexture(canvas);

    // Main Explosive Pack (Dual C4 Bricks)
    const packGeo = new THREE.BoxGeometry(0.52, 0.22, 0.36);
    const packMat = new THREE.MeshLambertMaterial({ color: 0x8a704e });
    const pack = new THREE.Mesh(packGeo, packMat);
    pack.position.y = 0.11;
    group.add(pack);

    // Silver Mounting Frame & Duct Tape
    const tapeGeo = new THREE.BoxGeometry(0.54, 0.08, 0.12);
    const tapeMat = new THREE.MeshLambertMaterial({ color: 0x7c8088 });
    const tape = new THREE.Mesh(tapeGeo, tapeMat);
    tape.position.set(0, 0.18, -0.08);
    group.add(tape);

    // Keypad Faceplate with LCD Screen
    const padGeo = new THREE.BoxGeometry(0.26, 0.04, 0.24);
    const padMat = new THREE.MeshStandardMaterial({ map: c4FaceTex, roughness: 0.4 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(0, 0.23, 0.04);
    group.add(pad);

    // Detonator Wires (Red & Yellow)
    const wireMatR = new THREE.MeshBasicMaterial({ color: 0xee2222 });
    const wireMatY = new THREE.MeshBasicMaterial({ color: 0xeebb22 });
    const wireR = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 6), wireMatR);
    wireR.position.set(-0.16, 0.22, 0.02);
    wireR.rotation.z = Math.PI / 3;
    group.add(wireR);
    const wireY = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 6), wireMatY);
    wireY.position.set(-0.14, 0.22, 0.06);
    wireY.rotation.z = Math.PI / 3.2;
    group.add(wireY);

    // Highly Visible Blinking LED Indicator & Point Light
    const ledGeo = new THREE.SphereGeometry(0.045, 8, 8);
    this.c4LedMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const led = new THREE.Mesh(ledGeo, this.c4LedMat);
    led.position.set(0.10, 0.26, -0.06);
    group.add(led);

    this.c4Light = new THREE.PointLight(0xff0000, 0, 10);
    this.c4Light.position.set(0.10, 0.35, -0.06);
    group.add(this.c4Light);

    this.c4Mesh = group;
    this.c4Mesh.visible = false;
    this.scene.add(this.c4Mesh);
  }

  connectToServer(mapName = 'dust2') {
    this.selectedMap = 'dust2';

    this.mapBuilder.buildDust2();
    const rMap = document.getElementById('radar-map-name');
    const sbMap = document.getElementById('sb-map-name');
    if (rMap) rMap.innerText = 'DE_DUST2';
    if (sbMap) sbMap.innerText = 'DUST II';

    // Connect to shared multiplayer room for Dust 2
    this.net.autoJoinPublicServer('dust2', (role) => {
      console.log(`Connected to online server dust2 as ${role}`);
    });

    try {
      if (document.exitPointerLock) document.exitPointerLock();
    } catch (e) {}

    // Open team selection split-screen
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('team-select-screen').classList.remove('hidden');
  }

  chooseTeam(team) {
    this.selectedTeam = team;
    this.playerInMatch = true;
    this.player.setTeam(team);

    document.getElementById('team-select-screen').classList.add('hidden');
    // Auto-fullscreen to prevent Ctrl+W/Ctrl+N browser shortcuts during gameplay
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) {}
    document.getElementById('hud').classList.remove('hidden');
    try {
      const lockPromise = document.getElementById('game-canvas-container').requestPointerLock();
      if (lockPromise && typeof lockPromise.catch === 'function') {
        lockPromise.catch(() => {});
      }
    } catch (e) {}

    // If joining client while round is currently LIVE, spectate until next round starts!
    if (!this.net.isHost && this.phase === 'live') {
      this.player.enterSpectatorMode();
    } else {
      this.startRound();
    }
  }

  startRound() {
    this.phase = 'freeze';
    this.phaseEndTime = Date.now() + this.freezeTime * 1000;
    this.phaseTimer = this.freezeTime;
    this.liveRoundStartTime = 0;
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

    // First round / Halftime: Strictly pistol + knife + ammo (No free grenades)
    if (this.currentRound === 1 || this.currentRound === 13) {
      this.player.inventory[1] = null;
      this.player.inventory[4] = null;
      this.player.grenades = [];
      if (this.player.team === 'CT') {
        this.player.inventory[2] = CS2_WEAPONS.usp;
        this.player.inventory[5] = null;
      } else {
        this.player.inventory[2] = CS2_WEAPONS.glock;
        this.player.inventory[5] = CS2_WEAPONS.c4;
      }
      this.player.switchSlot(2);
    }

    // Spawn player immediately at authentic CS spawn point
    const spawns = (this.mapBuilder && this.mapBuilder.spawnPoints && this.mapBuilder.spawnPoints[this.player.team]) || [];
    const s = spawns.length > 0 ? spawns[Math.floor(Math.random() * spawns.length)] : null;
    this.player.respawn(s);

    // If host, notify all connected clients to start new round
    if (this.net && this.net.isHost) {
      this.net.broadcast({
        type: 'round_start',
        round: this.currentRound,
        phaseEndTime: this.phaseEndTime
      });
    }

    if (this.currentRound === 13) {
      this.handleHalftimeSwap();
    }
  }

  handleHalftimeSwap() {
    const newTeam = this.player.team === 'CT' ? 'T' : 'CT';
    this.player.setTeam(newTeam);
    this.player.money.set(800);
  }

  // Authentic CS2 Buy Zone & Buy Time Rules (Strict 20s Window in Buy Zone)
  canBuy() {
    const inZone = this.mapBuilder.isInBuyZone(this.player.team, this.player.position);
    if (!inZone) return false;

    // 1. Freezetime: allowed within Buy Zone
    if (this.phase === 'freeze') return true;

    // 2. Live Round: strictly allowed only within the first 20.0 seconds
    if (this.phase === 'live') {
      const elapsed = this.liveRoundStartTime > 0 ? (Date.now() - this.liveRoundStartTime) / 1000 : (this.roundTime - this.phaseTimer);
      return elapsed <= 20.0;
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

    // Broadcast round end to all connected clients
    if (this.net && this.net.isHost) {
      this.net.broadcast({
        type: 'round_end',
        winner: winner,
        reason: reason
      });
    }

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

  // Automatic Team Elimination Check
  checkRoundElimination() {
    if (this.phase !== 'live') return;

    let livingCT = 0;
    let livingT = 0;

    // Check local player
    if (this.player.health.get() > 0 && !this.player.isSpectating) {
      if (this.player.team === 'CT') livingCT++;
      else livingT++;
    }

    // Check remote players
    Object.values(this.net.remotePlayers).forEach(p => {
      const hp = (p.data && p.data.health !== undefined) ? p.data.health : 100;
      if (hp > 0) {
        if (p.team === 'CT') livingCT++;
        else livingT++;
      }
    });

    const totalCT = (this.player.team === 'CT' ? 1 : 0) + Object.values(this.net.remotePlayers).filter(p => p.team === 'CT').length;
    const totalT = (this.player.team === 'T' ? 1 : 0) + Object.values(this.net.remotePlayers).filter(p => p.team === 'T').length;

    // When both teams have had players participating
    if (totalCT > 0 && totalT > 0) {
      if (livingT === 0 && !this.c4Planted) {
        this.endRound('CT', 'TERRORISTS ELIMINATED');
      } else if (livingCT === 0) {
        this.endRound('T', 'COUNTER-TERRORISTS ELIMINATED');
      }
    }
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

          const nowMs = performance.now();
          if (nowMs - (this.lastPlantBeepTime || 0) > 340) {
            this.lastPlantBeepTime = nowMs;
            window.csAudio.playC4CodeBeep();
          }

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

          const nowMs = performance.now();
          if (nowMs - (this.lastDefuseAudioTime || 0) > 800) {
            this.lastDefuseAudioTime = nowMs;
            window.csAudio.playDefuseKitSnip();
          }

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
    const scale = 0.68;

    ctx.clearRect(0, 0, w, h);

    // Radar Background & Outer Ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#0f141c';
    ctx.fillRect(0, 0, w, h);

    // World to Radar Transform: Straight ahead in direction of view is always UP (-Y)
    const toRadar = (wx, wz) => {
      const dx = wx - this.player.position.x;
      const dz = wz - this.player.position.z;
      const lx = (dx * Math.cos(this.player.yaw) - dz * Math.sin(this.player.yaw)) * scale;
      const ly = (dx * Math.sin(this.player.yaw) + dz * Math.cos(this.player.yaw)) * scale;
      return { x: cx + lx, y: cy + ly };
    };

    // Authentic CS2 Dust 2 Radar Minimap Corridors & Layout
    const mapPaths = [
      // Long A Corridor
      [{ x: -65, z: 35 }, { x: -20, z: 25 }, { x: 30, z: 20 }, { x: 65, z: 10 }, { x: 65, z: -80 }, { x: 28, z: -118 }],
      // Catwalk / Short A
      [{ x: -30, z: 10 }, { x: 0, z: -10 }, { x: 18, z: -40 }, { x: 28, z: -118 }],
      // Mid & Doors to CT Spawn
      [{ x: -65, z: 35 }, { x: -30, z: 10 }, { x: -18, z: -45 }, { x: -5, z: -98 }],
      // B Tunnels (Upper & Lower) to B Site
      [{ x: -65, z: 35 }, { x: -85, z: 10 }, { x: -85, z: -70 }, { x: -72, z: -98 }],
      // CT Spawn to B Site & Doors
      [{ x: -5, z: -98 }, { x: -45, z: -98 }, { x: -72, z: -98 }],
      // CT Spawn to A Site
      [{ x: -5, z: -98 }, { x: 15, z: -98 }, { x: 28, z: -118 }]
    ];

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw thick minimap roadway base
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#222d3d';
    for (const path of mapPaths) {
      ctx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const pt = toRadar(path[i].x, path[i].z);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }

    // Draw inner minimap corridor highlight
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#324258';
    for (const path of mapPaths) {
      ctx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const pt = toRadar(path[i].x, path[i].z);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }

    // Bombsites A & B
    const bZones = this.mapBuilder.bombZones;
    for (let i = 0; i < bZones.length; i++) {
      const site = bZones[i];
      const pt = toRadar(site.x, site.z);

      ctx.fillStyle = 'rgba(235, 65, 45, 0.45)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, site.radius * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#eb412d';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 13px Chakra Petch, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(site.id, pt.x, pt.y);
    }

    // C4 Planted Indicator on Radar
    if (this.c4Planted && this.c4Pos) {
      const pt = toRadar(this.c4Pos.x, this.c4Pos.z);
      const pulse = 1 + 0.3 * Math.sin(performance.now() * 0.008);
      ctx.fillStyle = '#ff2211';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // Friendly Teammates (ENEMIES ARE HIDDEN ON RADAR)
    const remPlayers = Object.values(this.net.remotePlayers);
    for (let i = 0; i < remPlayers.length; i++) {
      const p = remPlayers[i];
      if (p.team !== this.player.team) continue; // Only friendly teammates appear on radar

      const pt = toRadar(p.pos.x, p.pos.z);
      ctx.fillStyle = p.team === 'CT' ? '#5b97d5' : '#e5a035';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player Directional Arrow (Center of Radar pointing UP)
    ctx.fillStyle = '#00ff66';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx - 6, cy + 6);
    ctx.lineTo(cx, cy + 3);
    ctx.lineTo(cx + 6, cy + 6);
    ctx.closePath();
    ctx.fill();

    // View Angle Cone
    ctx.fillStyle = 'rgba(0, 255, 102, 0.08)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 32, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
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

    const now = Date.now();

    // Freezetime phase (Timestamp-backed, immune to alt-tab / menu pause)
    if (this.phase === 'freeze') {
      const secsLeft = Math.max(0, Math.ceil((this.phaseEndTime - now) / 1000));
      this.phaseTimer = secsLeft;

      if (this.lastPhaseText !== 'FREEZETIME') {
        this.lastPhaseText = 'FREEZETIME';
        this.hudEls.roundPhaseLabel.innerText = 'FREEZETIME';
      }
      const timerStr = `0:${secsLeft.toString().padStart(2, '0')}`;
      if (this.lastTimerText !== timerStr) {
        this.lastTimerText = timerStr;
        this.hudEls.roundTimer.innerText = timerStr;
      }

      if (now >= this.phaseEndTime) {
        this.phase = 'live';
        this.phaseEndTime = now + this.roundTime * 1000;
        this.liveRoundStartTime = now;
        this.phaseTimer = this.roundTime;
        this.lastPhaseText = 'LIVE';
        this.hudEls.roundPhaseLabel.innerText = 'ROUND LIVE';
        window.csAudio.playRadioTone('start');
      }
    } else if (this.phase === 'live') {
      const totalSecs = Math.max(0, Math.floor((this.phaseEndTime - now) / 1000));
      this.phaseTimer = totalSecs;

      const mins = Math.max(0, Math.floor(totalSecs / 60));
      const secs = Math.max(0, totalSecs % 60);
      const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      if (this.lastTimerText !== timerStr) {
        this.lastTimerText = timerStr;
        this.hudEls.roundTimer.innerText = timerStr;
      }

      if (this.c4Planted) {
        this.c4Timer -= dt;

        const beepInterval = Math.max(0.12, this.c4Timer / 40.0);
        if (currentTime / 1000 - this.lastBeepTime > beepInterval) {
          this.lastBeepTime = currentTime / 1000;
          const urgency = 1.0 - (this.c4Timer / 40.0);
          window.csAudio.playC4Beep(urgency);

          if (this.c4LedMat) this.c4LedMat.color.set(0xffffff);
          if (this.c4Light) this.c4Light.intensity = 3.5;
          setTimeout(() => {
            if (this.c4LedMat) this.c4LedMat.color.set(0xff0000);
            if (this.c4Light) this.c4Light.intensity = 0;
          }, 70);
        }

        if (this.c4Timer <= 0) {
          this.c4Planted = false;
          this.c4Mesh.visible = false;
          window.csAudio.playExplosion();
          this.endRound('T', 'TARGET DESTROYED');
        }
      } else {
        if (now >= this.phaseEndTime) {
          this.endRound('CT', 'TIME RAN OUT');
        }
      }
    }

    // Periodic authoritative timer sync to all clients (prevents desync on alt-tab or menu pause)
    if (this.net && this.net.isHost && this.net.connections.length > 0) {
      if (!this.lastTimerSync || (currentTime - this.lastTimerSync > 1500)) {
        this.lastTimerSync = currentTime;
        this.net.broadcast({
          type: 'timer_sync',
          phase: this.phase,
          phaseEndTime: this.phaseEndTime,
          liveRoundStartTime: this.liveRoundStartTime,
          ctScore: this.ctScore,
          tScore: this.tScore,
          round: this.currentRound
        });
      }
    }

    // Check for team elimination (All enemies killed)
    this.checkRoundElimination();

    this.player.update(dt, currentTime, this);
    this.handleObjectives(dt);
    this.updateHUD();

    if (currentTime - this.lastRadarTime > 100) {
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
