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
    this.score = { CT: 0, T: 0 };
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
    this.radarImg = new Image();
    this.radarImg.src = 'textures/radar_dust2.png';
    this.radarImgLoaded = false;
    this.radarImg.onload = () => { this.radarImgLoaded = true; };

    this.net = new CS2NetworkManager(this);

    window.csGameManager = this;
    this.createC4Prop();
  }

  clearAllDroppedItems() {
    if (window._droppedItems && Array.isArray(window._droppedItems)) {
      window._droppedItems.forEach(item => {
        if (item && item.mesh && this.scene) {
          this.scene.remove(item.mesh);
        }
      });
      window._droppedItems = [];
    }
  }

  spawnRemoteDroppedWeapon(item) {
    if (!item || !item.weaponId || !this.player) return;
    const w = CS2_WEAPONS[item.weaponId];
    if (!w) return;
    const mesh = this.player.createWorldWeaponMesh(item.weaponId);
    if (!mesh) return;

    let targetGroundY = (typeof item.pos.y === 'number') ? item.pos.y : 0.0;
    if (this.mapBuilder && this.mapBuilder.groundMeshes && this.mapBuilder.groundMeshes.length > 0) {
      const gRay = new THREE.Raycaster(
        new THREE.Vector3(item.pos.x, item.pos.y + 4.0, item.pos.z),
        new THREE.Vector3(0, -1, 0),
        0.1,
        20.0
      );
      const hits = gRay.intersectObjects(this.mapBuilder.groundMeshes, false);
      if (hits.length > 0) {
        targetGroundY = hits[0].point.y;
      }
    }

    mesh.position.set(item.pos.x, targetGroundY + 0.05, item.pos.z);
    mesh.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI * 2);
    this.scene.add(mesh);

    if (!window._droppedItems) window._droppedItems = [];
    window._droppedItems.push({
      id: item.id,
      mesh: mesh,
      weapon: w,
      slot: item.slot || 1,
      pos: mesh.position,
      groundY: targetGroundY,
      isResting: true,
      droppedAt: performance.now()
    });
  }

  removeRemoteDroppedWeapon(itemId, weaponId) {
    if (!window._droppedItems) return;
    const idx = window._droppedItems.findIndex(d => (itemId && d.id === itemId) || (d.weapon && d.weapon.id === weaponId));
    if (idx !== -1) {
      const it = window._droppedItems.splice(idx, 1)[0];
      if (it && it.mesh && this.scene) this.scene.remove(it.mesh);
    }
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

    // Highly Visible Blinking LED Indicator (Emissive basic material, zero PointLight overhead)
    const ledGeo = new THREE.SphereGeometry(0.045, 8, 8);
    this.c4LedMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const led = new THREE.Mesh(ledGeo, this.c4LedMat);
    led.position.set(0.10, 0.26, -0.06);
    group.add(led);

    this.c4Mesh = group;
    this.c4Mesh.visible = false;
    this.scene.add(this.c4Mesh);
  }

  connectToServer(mapName = 'dust2') {
    this.selectedMap = 'dust2';

    this.mapBuilder.buildDust2();
    // When OBJ finishes loading, re-snap player to true ground
    this.mapBuilder.onMapLoaded = () => {
      if (this.player && this.player.position) {
        this.player.snapToGround();
      }
    };
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
    } catch (e) { }

    // Open team selection split-screen
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('team-select-screen').classList.remove('hidden');
  }

  setAuthoritativeTeam(team, isCarrier = false) {
    if (!team) return;
    this.selectedTeam = team;
    if (this.net) this.net.serverTeam = team;
    if (this.player) {
      this.player.team = team;
      this.player.rebuildLoadout(team, isCarrier);
    }
    this.updateHUD();
  }

  chooseTeam(team) {
    this.selectedTeam = team;
    this.playerInMatch = true;
    if (this.net) {
      this.net.serverTeam = team;
      this.net.sendSelectTeam(team);
    }
    if (this.player) {
      this.player.setTeam(team);
    }

    document.getElementById('team-select-screen').classList.add('hidden');
    // Auto-fullscreen & Keyboard Lock to prevent Ctrl+W/Ctrl+N browser shortcuts during gameplay (only if user gesture is active)
    const hasUserGesture = !!(navigator.userActivation && navigator.userActivation.isActive);
    if (hasUserGesture) {
      try {
        const el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen().catch(() => { });
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } catch (e) { }
      try {
        if (navigator.keyboard && navigator.keyboard.lock) {
          navigator.keyboard.lock(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'Space']).catch(() => { });
        }
      } catch (e) { }
    }
    document.getElementById('hud').classList.remove('hidden');
    if (hasUserGesture) {
      try {
        const lockPromise = document.getElementById('game-canvas-container').requestPointerLock();
        if (lockPromise && typeof lockPromise.catch === 'function') {
          lockPromise.catch(() => { });
        }
      } catch (e) { }
    }

    // In online mode, spectate only if server says inMatch is false
    if (this.net && this.net.isConnected && this.phase === 'live' && this.net.inMatch === false) {
      this.player.enterSpectatorMode();
    } else {
      this.startRound();
    }
  }

  resetBombHUD() {
    this.c4Planted = false;
    this.c4Timer = 40.0;
    this.c4PlantPos = null;
    this.c4Site = null;
    this._hasExploded = false;

    const timerEl = document.getElementById('round-timer');
    const phaseEl = document.getElementById('round-phase-label');
    const c4Clock = document.getElementById('c4-planted-clock');
    const c4Alert = document.getElementById('c4-planted-alert');
    if (timerEl) timerEl.classList.remove('hidden');
    if (phaseEl) phaseEl.classList.remove('hidden');
    if (c4Clock) c4Clock.classList.add('hidden');
    if (c4Alert) c4Alert.classList.add('hidden');

    if (this.c4Mesh) {
      this.c4Mesh.visible = false;
    }

    const actionPrompt = document.getElementById('action-prompt');
    const actionText = document.getElementById('action-prompt-text');
    if (actionPrompt && actionText) {
      const txt = actionText.textContent || '';
      if (txt.includes('PLANT') || txt.includes('DEFUSE')) {
        actionPrompt.classList.add('hidden');
      }
    }
    const interactionBar = document.getElementById('interaction-bar-container');
    if (interactionBar) interactionBar.classList.add('hidden');

    if (this.player) {
      this.player.isPlanting = false;
      this.player.isDefusing = false;
      this.player.plantProgress = 0;
      this.player.defuseProgress = 0;
    }
  }

  startRound() {
    this.phase = 'freeze';
    this.phaseEndTime = Date.now() + this.freezeTime * 1000;
    this.phaseTimer = this.freezeTime;
    this.liveRoundStartTime = 0;
    this.resetBombHUD();
    this.purchaseHistory = [];

    // Clean up dropped weapons from previous round
    this.clearAllDroppedItems();

    // Clean up bullet decals from previous round
    if (this.player && this.player.clearBulletHoles) {
      this.player.clearBulletHoles();
    }

    // Reset HUD & Victory/MVP Overlay
    const roundEndOverlay = document.getElementById('round-end-overlay');
    if (roundEndOverlay) roundEndOverlay.classList.add('hidden');

    document.getElementById('spectator-hud').classList.add('hidden');

    window.csAudio.playRoundStart();

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

    // Ensure Terrorist team has a C4 bomb allocated every round
    if (this.player.team === 'T') {
      let remoteTHasC4 = false;
      if (this.net && this.net.remotePlayers) {
        Object.values(this.net.remotePlayers).forEach(rp => {
          if (rp && rp.team === 'T' && rp.hasC4) remoteTHasC4 = true;
        });
      }
      if (!remoteTHasC4) {
        this.player.inventory[5] = CS2_WEAPONS.c4;
      }
    } else {
      this.player.inventory[5] = null;
    }

    // Spawn player immediately at authentic CS spawn point
    const spawns = (this.mapBuilder && this.mapBuilder.spawnPoints && this.mapBuilder.spawnPoints[this.player.team]) || [];
    const s = spawns.length > 0 ? spawns[Math.floor(Math.random() * spawns.length)] : null;
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

  // Authentic CS2 Buy Zone & Buy Time Rules (Strict 15s Window in Buy Zone)
  canBuy() {
    if (!this.player || !this.player.position) return false;
    const inZone = this.mapBuilder.isInBuyZone(this.player.team, this.player.position);
    if (!inZone) return false;

    // 1. Freezetime: allowed within Buy Zone
    if (this.phase === 'freeze') return true;

    // 2. Live Round: strictly allowed only within the first 15.0 seconds
    if (this.phase === 'live') {
      const now = Date.now();
      const serverOffset = (this.net && typeof this.net.serverClockOffset === 'number') ? this.net.serverClockOffset : 0;
      const effectiveNow = now + serverOffset;
      if (this.liveRoundStartTime > 0 && (effectiveNow - this.liveRoundStartTime) > 15500) return false;
      if (typeof this.phaseTimer === 'number' && this.phaseTimer < 99.0) return false;
      return true;
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

    // Hide normal clock timer and display pulsating red bomb icon right in match-clock-box
    const timerEl = document.getElementById('round-timer');
    const phaseEl = document.getElementById('round-phase-label');
    const c4Clock = document.getElementById('c4-planted-clock');
    if (timerEl) timerEl.classList.add('hidden');
    if (phaseEl) phaseEl.classList.add('hidden');
    if (c4Clock) c4Clock.classList.remove('hidden');

    document.getElementById('c4-planted-alert').classList.add('hidden');
    window.csAudio.playRadioTone('alert');
  }

  onC4Defused() {
    this.c4Planted = false;
    this.c4Mesh.visible = false;
    const timerEl = document.getElementById('round-timer');
    const phaseEl = document.getElementById('round-phase-label');
    const c4Clock = document.getElementById('c4-planted-clock');
    if (timerEl) timerEl.classList.remove('hidden');
    if (phaseEl) phaseEl.classList.remove('hidden');
    if (c4Clock) c4Clock.classList.add('hidden');

    this.endRound('CT', 'BOMB DEFUSED');
  }

  onEntityKilled(attacker, victim, weapon, isHeadshot, victimTeam) {
    this.addToKillfeed(attacker, victim, weapon, isHeadshot, victimTeam);

    // Only apply client-side payout in offline singleplayer. In online matches, the server owns all economy payouts.
    if ((!this.net || !this.net.isConnected) && attacker === 'Player') {
      const reward = (this.player.activeWeapon && this.player.activeWeapon.killReward) || 300;
      this.player.money.add(reward);
    }
  }

  addKillFeed(attacker, victim, weapon, isHeadshot, victimTeam = null) {
    this.addToKillfeed(attacker, victim, weapon, isHeadshot, victimTeam);
  }

  addToKillfeed(attacker, victim, weapon, isHeadshot, victimTeam = null) {
    const feed = document.getElementById('killfeed');
    if (!feed) return;

    if (!victimTeam) {
      if (victim === this.player.callsign || victim === 'You') {
        victimTeam = this.player.team || 'CT';
      } else if (this.net && this.net.remotePlayers) {
        const rp = Object.values(this.net.remotePlayers).find(p => p.name === victim);
        if (rp && rp.team) victimTeam = rp.team;
      }
      if (!victimTeam) victimTeam = (this.player.team === 'CT') ? 'T' : 'CT';
    }

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

  onRoundEnd(winner, reason, mvp = null) {
    this.endRound(winner, reason, mvp);
  }

  onBombDefused(defuserName = 'Counter-Terrorist') {
    this.onC4Defused();
  }

  onHalftime() {
    if (this.player) {
      this.player.team = (this.player.team === 'CT') ? 'T' : 'CT';
      this.player.money.set(800);
      this.player.hasHelmet = false;
      this.player.armor.set(0);
      this.player.setTeam(this.player.team);
    }
    this.updateHUD();
  }

  endRound(winner, reason, mvp = null) {
    this.phase = 'round_over';
    this.phaseTimer = 5;

    // Reset bomb HUD on round end
    this.resetBombHUD();

    if (!this.net || !this.net.isConnected) {
      if (winner === 'CT') {
        this.ctScore++;
        this.consecutiveLosses.CT = 0;
        this.consecutiveLosses.T++;
      } else {
        this.tScore++;
        this.consecutiveLosses.T = 0;
        this.consecutiveLosses.CT++;
      }
    }

    // Play triumphant brass fanfare for round victory
    window.csAudio.playRoundEnd(winner);

    // Format human-readable round end reason
    let cleanReason = (reason || 'ROUND OVER').toUpperCase();
    if (cleanReason.includes('DESTROYED') || cleanReason.includes('EXPLODE')) cleanReason = 'BOMB EXPLODED';
    else if (cleanReason.includes('DEFUSE')) cleanReason = 'BOMB DEFUSED';
    else if (cleanReason.includes('ELIMINAT') || cleanReason.includes('KILLED')) cleanReason = 'ALL ENEMIES ELIMINATED';
    else if (cleanReason.includes('PRESERVE') || cleanReason.includes('TIME') || cleanReason.includes('EXPIRE')) cleanReason = 'TIME RAN OUT';

    // Calculate match & round MVP
    let mvpName = 'You';
    let mvpReason = 'for round performance';
    if (mvp) {
      if (typeof mvp === 'object') {
        mvpName = mvp.name || mvp.callsign || 'Operator';
        if (mvp.reason) mvpReason = mvp.reason;
      } else {
        mvpName = mvp;
      }
    } else if (this.net && this.net.remotePlayers) {
      let maxKills = this.player.kills || 0;
      Object.values(this.net.remotePlayers).forEach(p => {
        if (p && p.name && (p.kills > maxKills)) {
          maxKills = p.kills;
          mvpName = p.name;
          mvpReason = `for eliminating ${maxKills} opponents`;
        }
      });
    }

    // Display authentic CS2 Round End Overlay
    const overlay = document.getElementById('round-end-overlay');
    const winTitle = document.getElementById('round-winner-title');
    const winReason = document.getElementById('round-winner-reason');
    const winScore = document.getElementById('round-winner-score');
    const mvpBox = document.getElementById('round-mvp-box');
    const mvpNameEl = document.getElementById('round-mvp-name');
    const mvpReasonEl = document.getElementById('round-mvp-reason');
    if (overlay && winTitle && winReason) {
      winTitle.textContent = (winner === 'CT') ? 'COUNTER-TERRORISTS WIN' : 'TERRORISTS WIN';
      winTitle.className = `round-end-title ${winner === 'CT' ? 'ct-win' : 't-win'}`;
      winReason.textContent = cleanReason;
      if (winScore) {
        winScore.textContent = `SCORE: CT ${this.ctScore} — ${this.tScore} T`;
      }
      if (mvpBox && mvpNameEl) {
        mvpNameEl.textContent = mvpName;
        if (mvpReasonEl) mvpReasonEl.textContent = mvpReason;
        mvpBox.classList.remove('hidden');
      }
      overlay.classList.remove('hidden');
    }

    this.updateHUD();

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
    } else if (!this.net || !this.net.isConnected) {
      // Offline mode only: when connected, server is authoritative and broadcasts round_start
      setTimeout(() => {
        this.currentRound++;
        this.startRound();
      }, 5000);
    }
  }

  // 3D Visual C4 Explosion Effect with screen shake & radial shockwave
  spawnC4ExplosionEffect(pos) {
    if (!pos) return;
    if (this._hasExploded) return;
    this._hasExploded = true;

    const expGroup = new THREE.Group();
    expGroup.position.copy(pos);

    // Blast fireball
    const ballGeo = new THREE.SphereGeometry(7.0, 14, 14);
    const ballMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.95 });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    expGroup.add(ball);

    // Horizontal shockwave ring
    const ringGeo = new THREE.RingGeometry(0.5, 5.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    expGroup.add(ring);

    this.scene.add(expGroup);

    // Audio with distance falloff (Item 3)
    const dist = this.player.position.distanceTo(pos);
    const maxAudioDist = 80.0;
    const vol = Math.max(0.25, Math.min(2.5, 2.2 * (1.0 - (dist / maxAudioDist) * 0.75)));
    window.csAudio.playSound('c4_explode', 'c4', vol);

    // Full-screen white flash & blast shake
    const flashEl = document.getElementById('flash-overlay');
    if (flashEl) {
      const flashAlpha = Math.max(0.15, Math.min(1.0, 1.2 - (dist / 45.0)));
      flashEl.style.backgroundColor = `rgba(255, 230, 200, ${flashAlpha})`;
      setTimeout(() => { flashEl.style.backgroundColor = 'rgba(255, 255, 255, 0)'; }, 380);
    }

    const shakeIntensity = Math.max(0, 0.65 * (1 - dist / 55));
    this.player.pitch += (Math.random() - 0.5) * shakeIntensity;
    this.player.yaw += (Math.random() - 0.5) * shakeIntensity;

    // Damage by distance to everyone in radius (lethal inside 25m, max radius 50m)
    if (dist < 50) {
      const factor = Math.pow(Math.max(0, 1 - dist / 50), 1.5);
      const blastDamage = Math.round(500 * factor);
      this.player.takeDamage(blastDamage, 'C4 Explosive', 'c4');
    }

    const t0 = performance.now();
    const anim = setInterval(() => {
      const el = (performance.now() - t0) / 1000;
      if (el > 1.2) {
        clearInterval(anim);
        this.scene.remove(expGroup);
        ballGeo.dispose();
        ballMat.dispose();
        ringGeo.dispose();
        ringMat.dispose();
      } else {
        const s = 1.0 + el * 5.0;
        ball.scale.set(s, s * 0.8, s);
        ballMat.opacity = Math.max(0, 0.95 - el * 0.85);
        const ringS = 1.0 + el * 10.0;
        ring.scale.set(ringS, ringS, ringS);
        ringMat.opacity = Math.max(0, 0.9 - el * 0.9);
      }
    }, 16);
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
    // In online matches, round termination is 100% server-authoritative
    if (this.net && this.net.isConnected) return;
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
    if (this.phase !== 'live' || this.player.isSpectating) {
      this.player.isPlanting = false;
      this.player.isDefusing = false;
      return;
    }

    const actionPrompt = document.getElementById('action-prompt');
    const promptText = document.getElementById('action-prompt-text');
    const progressTrack = document.getElementById('interaction-bar-container');
    const progressFill = document.getElementById('interaction-progress-fill');
    const progressTitle = document.getElementById('interaction-title');

    // Default to not planting/defusing each frame unless holding [E] inside active objective
    this.player.isPlanting = false;
    this.player.isDefusing = false;

    // T planting C4: strictly living Terrorist C4 carrier only
    const plantTeam = (this.net && this.net.serverTeam) || this.player.team;
    if (plantTeam === 'T' && this.player.team === 'T' && !this.c4Planted && this.player.inventory[5] && this.player.hasC4) {
      let inSite = null;
      let siteY = 0.1;
      const playerFeetY = this.player.position.y - this.player.playerHeight;
      for (let i = 0; i < this.mapBuilder.bombZones.length; i++) {
        const site = this.mapBuilder.bombZones[i];
        let inside = false;
        if (site.bounds) {
          const b = site.bounds;
          if (this.player.position.x >= b.minX && this.player.position.x <= b.maxX &&
            this.player.position.z >= b.minZ && this.player.position.z <= b.maxZ &&
            playerFeetY >= b.minY && playerFeetY <= b.maxY) {
            inside = true;
          }
        } else if (site.radius) {
          const dist = Math.hypot(this.player.position.x - site.x, this.player.position.z - site.z);
          const dy = Math.abs(playerFeetY - (site.y || 4.32));
          if (dist <= site.radius && dy < 4.5) {
            inside = true;
          }
        }
        if (inside) {
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
          progressFill.style.width = `${Math.min(100, Math.round(this.player.plantProgress * 100))}%`;

          const nowMs = performance.now();
          if (nowMs - (this.lastPlantBeepTime || 0) > 340) {
            this.lastPlantBeepTime = nowMs;
            window.csAudio.playC4CodeBeep();
          }

          if (this.player.plantProgress >= 1.0) {
            this.player.isPlanting = false;
            this.player.plantProgress = 0;
            this.player.inventory[5] = null;
            delete this.player.inventory[5];
            this.player.hasC4 = false;
            this.player.updateSlotHUD();

            // Auto-switch to previous weapon or primary -> secondary -> knife (Item 3)
            const prevSlot = this.player.previousSlot;
            const targetSlot = (prevSlot && this.player.inventory[prevSlot])
              ? prevSlot
              : (this.player.inventory[1] ? 1 : (this.player.inventory[2] ? 2 : 3));
            this.player.switchSlot(targetSlot);

            progressTrack.classList.add('hidden');
            actionPrompt.classList.add('hidden');
            // Determine exact contact ground/box surface Y via downward raycast
            let plantY = (siteY !== undefined) ? siteY : (this.player.position.y - this.player.playerHeight);
            if (this.mapBuilder && this.mapBuilder.colliders) {
              for (let i = 0; i < this.mapBuilder.colliders.length; i++) {
                const c = this.mapBuilder.colliders[i];
                if (c.box && this.player.position.x >= c.box.min.x && this.player.position.x <= c.box.max.x &&
                  this.player.position.z >= c.box.min.z && this.player.position.z <= c.box.max.z) {
                  if (c.topY !== undefined && Math.abs((this.player.position.y - this.player.playerHeight) - c.topY) < 0.6) {
                    plantY = c.topY;
                    break;
                  }
                }
              }
            }
            if (this.mapBuilder && this.mapBuilder.groundMeshes && this.mapBuilder.groundMeshes.length > 0) {
              const downOrigin = new THREE.Vector3(this.player.position.x, this.player.position.y + 0.5, this.player.position.z);
              const downDir = new THREE.Vector3(0, -1, 0);
              const rc = new THREE.Raycaster(downOrigin, downDir, 0.05, 6.0);
              const gHits = rc.intersectObjects(this.mapBuilder.groundMeshes, false);
              if (gHits.length > 0 && Math.abs(gHits[0].point.y - (this.player.position.y - this.player.playerHeight)) < 0.6) {
                plantY = gHits[0].point.y;
              }
            }

            const plantPos = { x: this.player.position.x, y: plantY + 0.02, z: this.player.position.z };
            this.onC4Planted(plantPos, `BOMBSITE ${inSite}`);

            // Broadcast to network
            if (this.net) {
              this.net.sendPlantC4(inSite, plantPos);
            }
          }
          return;
        } else {
          this.player.isPlanting = false;
          this.player.plantProgress = 0;
          progressTrack.classList.add('hidden');
        }
      } else {
        this.player.isPlanting = false;
        this.player.plantProgress = 0;
        if (promptText && promptText.innerText.includes('PLANT')) {
          actionPrompt.classList.add('hidden');
          progressTrack.classList.add('hidden');
        }
      }
    } else if (this.c4Planted) {
      if (promptText && promptText.innerText.includes('PLANT')) {
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
          progressFill.style.width = `${Math.min(100, Math.round(this.player.defuseProgress * 100))}%`;

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
            if (this.net && this.net.isConnected) {
              this.net.send({ type: 'defuse_progress', progress: 1.0 });
            }
          }
          return;
        } else {
          this.player.isDefusing = false;
          this.player.defuseProgress = 0;
          progressTrack.classList.add('hidden');
        }
      } else {
        this.player.isDefusing = false;
        this.player.defuseProgress = 0;
        if (promptText && promptText.innerText.includes('DEFUSE')) {
          actionPrompt.classList.add('hidden');
          progressTrack.classList.add('hidden');
        }
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
    const zoomScale = 0.52; // Authentic CS2 radar zoom level

    ctx.clearRect(0, 0, w, h);

    // Radar Background & Outer Circular Clipping
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);

    // Official CS2 Dust 2 Radar Map Projection
    if (this.radarImgLoaded && this.radarImg) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.player.yaw);

      // CS:GO / CS2 overview transform: pos_x = -2476, pos_y = 3239, scale = 4.4
      const pu = (this.player.position.x / 0.045 + 2476) / 4.4;
      const pv = (3239 + this.player.position.z / 0.045) / 4.4;

      ctx.drawImage(
        this.radarImg,
        -pu * zoomScale,
        -pv * zoomScale,
        1024 * zoomScale,
        1024 * zoomScale
      );
      ctx.restore();
    }

    // World to Radar Transform: Straight ahead in direction of view is always UP (-Y)
    const cScale = (1 / (0.045 * 4.4)) * zoomScale; // Canvas pixels per world meter
    const toRadar = (wx, wz) => {
      const dx = wx - this.player.position.x;
      const dz = wz - this.player.position.z;
      const cos = Math.cos(this.player.yaw);
      const sin = Math.sin(this.player.yaw);
      const rx = (dx * cos - dz * sin) * cScale;
      const ry = (dx * sin + dz * cos) * cScale;
      return { x: cx + rx, y: cy + ry };
    };

    // Bombsites A & B (Compact clean tactical badges on radar)
    const bZones = this.mapBuilder.bombZones;
    for (let i = 0; i < bZones.length; i++) {
      const site = bZones[i];
      const pt = toRadar(site.x, site.z);

      ctx.fillStyle = 'rgba(235, 65, 45, 0.90)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Chakra Petch, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(site.id, pt.x, pt.y);
    }

    // C4 Planted Indicator on Radar (Only visible to Terrorist team)
    if (this.c4Planted && this.c4Pos && this.player.team === 'T') {
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
      if (p.team !== this.player.team) continue;

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

  updateFPSCounter(currentTime, frameDurationMs = 0) {
    this.frameCount++;
    this.frameMsSum = (this.frameMsSum || 0) + frameDurationMs;
    if (currentTime - this.fpsLastTime >= 500) {
      this.currentFPS = Math.round((this.frameCount * 1000) / (currentTime - this.fpsLastTime));
      this.avgFrameMs = this.frameMsSum / Math.max(1, this.frameCount);
      this.frameCount = 0;
      this.frameMsSum = 0;
      this.fpsLastTime = currentTime;

      if (this.hudEls.netGraphFPS) {
        this.hudEls.netGraphFPS.innerText = `${this.currentFPS} FPS | ${(this.avgFrameMs || 0).toFixed(1)}ms | TICK 64`;
      }
    }
  }

  update(dt, currentTime) {
    const tFrameStart = performance.now();
    const now = Date.now();

    // Round Timer & Phase Logic: In online mode, strictly owned by server snapshot
    if (this.net && this.net.isConnected) {
      const totalSecs = Math.max(0, Math.floor(this.phaseTimer));
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      const timerStr = (this.phase === 'freeze')
        ? `0:${secs.toString().padStart(2, '0')}`
        : `${mins}:${secs.toString().padStart(2, '0')}`;
      if (this.lastTimerText !== timerStr) {
        this.lastTimerText = timerStr;
        if (this.hudEls.roundTimer) this.hudEls.roundTimer.innerText = timerStr;
      }
      const phaseLabel = (this.phase === 'freeze') ? 'FREEZETIME' : (this.phase === 'round_over' ? 'ROUND OVER' : (this.c4Planted ? 'BOMB PLANTED' : 'ROUND LIVE'));
      if (this.lastPhaseText !== phaseLabel) {
        this.lastPhaseText = phaseLabel;
        if (this.hudEls.roundPhaseLabel) this.hudEls.roundPhaseLabel.innerText = phaseLabel;
      }
    } else if (this.phase === 'freeze') {
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

      if (!this.c4Planted && now >= this.phaseEndTime) {
        this.endRound('CT', 'TIME RAN OUT');
      }
    }

    // C4 Bomb Detonation & Beep Processing (Runs in BOTH online & offline modes)
    if (this.c4Planted) {
      this.c4Timer -= dt;

      const beepInterval = Math.max(0.10, this.c4Timer / 40.0);
      if (currentTime / 1000 - this.lastBeepTime > beepInterval) {
        this.lastBeepTime = currentTime / 1000;
        const urgency = Math.max(0, Math.min(1.0, 1.0 - (this.c4Timer / 40.0)));
        window.csAudio.playC4Beep(urgency);

        if (this.c4LedMat) this.c4LedMat.color.set(0xffffff);
        setTimeout(() => {
          if (this.c4LedMat) this.c4LedMat.color.set(0xff0000);
        }, 60);
      }

      if (this.c4Timer <= 0) {
        const boomPos = this.c4Pos
          ? new THREE.Vector3(this.c4Pos.x, (this.c4Pos.y !== undefined ? this.c4Pos.y : 0.1), this.c4Pos.z)
          : this.c4Mesh.position.clone();
        this.c4Planted = false;
        this.c4Mesh.visible = false;
        window.csAudio.playExplosion();

        // Spawn authentic fireball animation & shockwave
        this.spawnC4ExplosionEffect(boomPos);

        // Distance-based blast damage: closer to bomb = greater damage (lethal up to 55m)
        const dist = this.player.position.distanceTo(boomPos);
        if (dist < 55) {
          const factor = Math.pow(Math.max(0, 1 - dist / 55), 1.6);
          const blastDamage = Math.round(500 * factor);
          this.player.takeDamage(blastDamage, 'C4 Explosive', 'c4');
        }

        // Damage remote players
        if (this.net && this.net.remotePlayers) {
          Object.entries(this.net.remotePlayers).forEach(([id, rp]) => {
            if (rp && rp.mesh) {
              const rDist = rp.mesh.position.distanceTo(boomPos);
              if (rDist < 55) {
                const factor = Math.pow(Math.max(0, 1 - rDist / 55), 1.6);
                const dmg = Math.round(500 * factor);
                this.net.sendDamage(id, dmg, 'C4 Explosive', false);
              }
            }
          });
        }

        if (!this.net || !this.net.isConnected) {
          this.endRound('T', 'TARGET DESTROYED');
        }
      }
    }



    // Check for team elimination (All enemies killed)
    this.checkRoundElimination();

    // Void Boundary Safeguard (Terrain edge fall prevention)
    if (this.player && this.player.position && this.player.position.y < -20.0) {
      this.player.takeDamage(500, 'Void Boundary', 'world');
    }

    this.player.update(dt, currentTime, this);
    this.handleObjectives(dt);

    // Step dropped items physics trajectory (gravity, velocity, spin, bounce & settle flat)
    if (window._droppedItems && window._droppedItems.length > 0) {
      for (let i = 0; i < window._droppedItems.length; i++) {
        const item = window._droppedItems[i];
        if (!item || item.isResting || !item.velocity) continue;
        item.velocity.y -= 9.8 * dt;
        item.mesh.position.addScaledVector(item.velocity, dt);
        if (item.angularVelocity) {
          item.mesh.rotation.x += item.angularVelocity.x * dt;
          item.mesh.rotation.y += item.angularVelocity.y * dt;
        }
        if (item.mesh.position.y <= item.groundY + 0.06) {
          item.mesh.position.y = item.groundY + 0.06;
          item.velocity.set(0, 0, 0);
          if (item.angularVelocity) item.angularVelocity.set(0, 0, 0);
          item.mesh.rotation.x = Math.PI / 2; // Lie flat on ground
          item.isResting = true;
        }
      }
    }

    this.updateHUD();

    if (currentTime - this.lastRadarTime > 100) {
      this.lastRadarTime = currentTime;
      this.renderRadar();
    }

    if (currentTime - this.lastNetTime > 50) {
      this.lastNetTime = currentTime;
      this.net.sendPlayerState(this.player);
    }

    const tFrameDuration = performance.now() - tFrameStart;
    this.updateFPSCounter(currentTime, tFrameDuration);
  }

  updateHUD() {
    const p = this.player;
    const h = this.hudEls;
    const c = this.cachedHUD;

    // Synchronize alive counts
    let curCtAlive = 0;
    let curTAlive = 0;
    if (p.health.get() > 0 && !p.isSpectating) {
      if (p.team === 'CT') curCtAlive++;
      else curTAlive++;
    }
    if (this.net && this.net.remotePlayers) {
      Object.values(this.net.remotePlayers).forEach(rp => {
        if (rp.isAlive) {
          if (rp.team === 'CT') curCtAlive++;
          else curTAlive++;
        }
      });
    }
    const ctAliveEl = document.getElementById('ct-alive-count') || document.getElementById('hud-ct-alive');
    const tAliveEl = document.getElementById('t-alive-count') || document.getElementById('hud-t-alive');
    if (ctAliveEl) ctAliveEl.innerText = `${curCtAlive} ALIVE`;
    if (tAliveEl) tAliveEl.innerText = `${curTAlive} ALIVE`;

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

    // Buyzone active state & 15s window enforcement
    const inBuy = this.canBuy();
    if (c.buyzoneActive !== inBuy) {
      c.buyzoneActive = inBuy;
      if (h.buyzoneBox) {
        if (inBuy) h.buyzoneBox.classList.remove('inactive');
        else h.buyzoneBox.classList.add('inactive');
      }
      if (!inBuy) {
        const buyMenu = document.getElementById('buy-menu');
        if (buyMenu && !buyMenu.classList.contains('hidden')) {
          buyMenu.classList.add('hidden');
          const container = document.getElementById('game-canvas-container');
          if (container && document.getElementById('main-menu').classList.contains('hidden')) {
            try { container.requestPointerLock(); } catch(e){}
          }
        }
      }
    }

    if (p.activeWeapon) {
      if (c.weaponName !== p.activeWeapon.name) {
        c.weaponName = p.activeWeapon.name;
        h.weaponName.innerText = p.activeWeapon.name;
        c.clip = -1;
        c.reserve = -1;
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
        if (c.clip !== -1 || c.reserve !== -1) {
          c.clip = -1;
          c.reserve = -1;
          h.ammoClip.innerText = '-';
          h.ammoReserve.innerText = '-';
        }
      }
    }
  }
}

window.CS2GameManager = CS2GameManager;
