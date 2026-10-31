// CS2 Dedicated WebSocket Multiplayer Engine
// Connected directly to authoritative Node.js server (Render free-tier wss://cs2-server-1zcq.onrender.com)
// Features: 20Hz persistent input loop, 100ms snapshot interpolation,
// authentic SAS & Phoenix GLB 3D models, forward facing yaw, and Render server wake-up overlay

class CS2NetworkManager {
  constructor(gameManager) {
    this.gm = gameManager;
    this.ws = null;
    this.playerId = null;
    this.isConnected = false;
    this.isHost = false; // Dedicated server is the authoritative host
    this.connections = [];
    this.hostConnection = { open: false };
    this.remotePlayers = {}; // id -> { mesh, data, team, name, pos, buffer: [] }
    this.inputInterval = null;
    this.reconnectTimeout = null;
    this.wakeOverlay = null;
    this.wakeTimerInterval = null;
    this.connectStartTime = 0;

    // Load authentic CS character models
    this.gltfLoader = typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null;
    this.ctModel = null;
    this.tModel = null;

    if (this.gltfLoader) {
      // 1. Counter-Terrorist: Genuine CS2 SAS Operator Model
      this.gltfLoader.load('ctm_sas__cs2_agent_model.glb', (gltf) => {
        this.ctModel = gltf.scene;
        console.log('Authentic CS2 CT (SAS) agent loaded');
        Object.values(this.remotePlayers).forEach(p => {
          if (p && p.mesh && p.team === 'CT' && !p.hasAuthenticModel) {
            this.applyAuthenticModel(p.mesh, 'CT');
            p.hasAuthenticModel = true;
          }
        });
      }, undefined, (e) => console.warn('CT model note:', e));

      // 2. Terrorist: Genuine CS Phoenix Operator Model
      this.gltfLoader.load('tm_phoenix_v2-_csgo_terrorist_characters.glb', (gltf) => {
        this.tModel = gltf.scene;
        console.log('Authentic CS T (Phoenix) agent loaded');
        Object.values(this.remotePlayers).forEach(p => {
          if (p && p.mesh && p.team === 'T' && !p.hasAuthenticModel) {
            this.applyAuthenticModel(p.mesh, 'T');
            p.hasAuthenticModel = true;
          }
        });
      }, undefined, (e) => console.warn('T model note:', e));
    }
  }

  // Creates or updates the non-intrusive "WAKING SERVER..." overlay for Render cold starts
  showWakingOverlay(statusText = 'WAKING DEDICATED CS2 SERVER...') {
    if (!this.wakeOverlay) {
      this.wakeOverlay = document.createElement('div');
      this.wakeOverlay.id = 'cs2-server-wake-overlay';
      this.wakeOverlay.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(13, 18, 25, 0.95);
        border: 2px solid #ffae35;
        border-radius: 6px;
        padding: 12px 24px;
        color: #ffffff;
        font-family: 'Rajdhani', sans-serif;
        font-weight: 700;
        font-size: 14px;
        letter-spacing: 1px;
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 14px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.8);
      `;
      document.body.appendChild(this.wakeOverlay);
    }
    this.wakeOverlay.innerHTML = `
      <div style="width: 10px; height: 10px; border-radius: 50%; background: #ffae35; animation: pulse 1s infinite alternate;"></div>
      <div>
        <div style="color: #ffae35; font-size: 15px;">${statusText}</div>
        <div style="color: #8899aa; font-size: 12px; font-weight: 500;">Render free-tier cold start (~30-50s) &bull; Elapsed: <span id="cs2-wake-elapsed">0</span>s</div>
      </div>
    `;
    this.wakeOverlay.style.display = 'flex';

    if (!this.wakeTimerInterval) {
      const startMs = Date.now();
      this.wakeTimerInterval = setInterval(() => {
        const el = document.getElementById('cs2-wake-elapsed');
        if (el) el.innerText = Math.floor((Date.now() - startMs) / 1000);
      }, 1000);
    }
  }

  hideWakingOverlay() {
    if (this.wakeOverlay) {
      this.wakeOverlay.style.display = 'none';
    }
    if (this.wakeTimerInterval) {
      clearInterval(this.wakeTimerInterval);
      this.wakeTimerInterval = null;
    }
  }

  // Connects to dedicated authoritative WebSocket server
  autoJoinPublicServer(mapName = 'dust2', onReady = null) {
    const serverUrl = window.SERVER_URL || 'wss://cs2-server-1zcq.onrender.com';
    console.log(`Connecting to CS2 Dedicated Server: ${serverUrl}`);

    this.connectStartTime = Date.now();
    let wakeShown = false;
    const wakeTimer = setTimeout(() => {
      if (!this.isConnected) {
        wakeShown = true;
        this.showWakingOverlay();
      }
    }, 2200);

    try {
      this.ws = new WebSocket(serverUrl);
    } catch (e) {
      console.warn('WebSocket init exception:', e);
      clearTimeout(wakeTimer);
      return;
    }

    this.ws.onopen = () => {
      clearTimeout(wakeTimer);
      this.hideWakingOverlay();
      this.isConnected = true;
      this.hostConnection.open = true;

      const callsign = window.cs2PlayerCallsign || 'OPERATOR';
      const team = (this.gm.player && this.gm.player.team) ? this.gm.player.team : 'CT';

      // Send authoritative join packet
      this.send({
        type: 'join',
        callsign: callsign,
        team: team
      });

      // Start 20Hz persistent player input loop
      this.startInputLoop();

      const statusEl = document.getElementById('sb-net-status');
      if (statusEl) statusEl.innerHTML = `ONLINE DEDICATED SERVER &bull; CONNECTED`;

      if (onReady) onReady('client');
    };

    this.ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        this.handleServerPacket(packet);
      } catch (err) {
        console.warn('Packet parse error:', err);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.hostConnection.open = false;
      this.stopInputLoop();
      this.clearAllRemotePlayers();

      const statusEl = document.getElementById('sb-net-status');
      if (statusEl) statusEl.innerHTML = `RECONNECTING TO SERVER...`;

      // Automatic reconnection attempt after 3s
      if (!this.reconnectTimeout) {
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          if (this.gm.playerInMatch !== false) {
            this.autoJoinPublicServer(mapName, onReady);
          }
        }, 3000);
      }
    };

    this.ws.onerror = (err) => {
      console.warn('CS2 Server WebSocket Note:', err.message || err);
    };
  }

  startInputLoop() {
    this.stopInputLoop();
    // 20Hz = 50ms interval (persists in background tabs)
    this.inputInterval = setInterval(() => {
      if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const p = this.gm.player;
      if (!p) return;

      this.send({
        type: 'player_input',
        pos: { x: p.position.x, y: p.position.y, z: p.position.z },
        yaw: p.yaw,
        pitch: p.pitch,
        crouch: p.isCrouched,
        weapon: p.activeWeapon ? p.activeWeapon.id : 'knife'
      });
    }, 50);
  }

  stopInputLoop() {
    if (this.inputInterval) {
      clearInterval(this.inputInterval);
      this.inputInterval = null;
    }
  }

  send(packet) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(packet));
      } catch (e) {}
    }
  }

  broadcast(packet) {
    this.send(packet);
  }

  // Dispatch incoming server messages
  handleServerPacket(packet) {
    switch (packet.type) {
      case 'match_sync':
        this.playerId = packet.playerId;
        this.gm.matchId = packet.matchId;
        this.gm.currentRound = packet.currentRound || 1;
        this.gm.score.CT = packet.ctScore || 0;
        this.gm.score.T = packet.tScore || 0;
        this.gm.phase = packet.phase || 'freeze';
        this.gm.roundTime = packet.phaseTimer || 15;
        this.gm.phaseEndTime = packet.phaseEndTime || (performance.now() + 15000);

        if (packet.c4Planted) {
          this.gm.c4Planted = true;
          this.gm.c4Pos = packet.c4Pos;
          this.gm.c4Site = packet.c4Site;
        }

        if (packet.c4CarrierId === this.playerId && this.gm.player) {
          this.gm.player.inventory[5] = CS2_WEAPONS.c4;
        }

        if (packet.inMatch === false && packet.phase === 'live' && this.gm.player) {
          this.gm.player.enterSpectatorMode();
        }
        this.gm.updateHUD();
        break;

      case 'snapshot':
        this.handleSnapshot(packet);
        break;

      case 'phase_change':
        this.gm.phase = packet.phase;
        this.gm.roundTime = packet.timer;
        this.gm.phaseEndTime = packet.phaseEndTime || (performance.now() + packet.timer * 1000);
        this.gm.updateHUD();
        break;

      case 'round_start':
        this.gm.currentRound = packet.round;
        this.gm.phase = packet.phase || 'freeze';
        this.gm.roundTime = packet.timer || 15;
        this.gm.phaseEndTime = packet.phaseEndTime || (performance.now() + 15000);
        this.gm.score.CT = packet.ctScore || 0;
        this.gm.score.T = packet.tScore || 0;
        this.gm.c4Planted = false;

        // Reset player round state
        if (this.gm.player) {
          this.gm.player.health.set(100);
          this.gm.player.isAlive = true;
          this.gm.player.isSpectating = false;
          this.gm.player.inventory[5] = (packet.c4CarrierId === this.playerId) ? CS2_WEAPONS.c4 : null;
          this.gm.player.respawn();
        }
        this.gm.updateHUD();
        break;

      case 'round_end':
        this.gm.score.CT = packet.ctScore;
        this.gm.score.T = packet.tScore;
        this.gm.phase = 'round_over';
        this.gm.onRoundEnd(packet.winner, packet.reason, packet.mvp);
        break;

      case 'halftime_swap':
        this.gm.score.CT = packet.ctScore;
        this.gm.score.T = packet.tScore;
        if (this.gm.player) {
          this.gm.player.team = (this.gm.player.team === 'CT') ? 'T' : 'CT';
          this.gm.player.money.set(800);
          this.gm.player.hasHelmet = false;
          this.gm.player.armor.set(0);
        }
        this.gm.updateHUD();
        break;

      case 'c4_planted':
        this.gm.onC4Planted(packet.pos, packet.site);
        break;

      case 'bomb_exploded':
        this.gm.spawnC4ExplosionEffect(packet.pos);
        break;

      case 'bomb_defused':
        this.gm.onBombDefused(packet.defuserName || 'Counter-Terrorist');
        break;

      case 'player_damaged':
        if (packet.targetId === this.playerId && this.gm.player) {
          this.gm.player.takeDamage(packet.damage, packet.attackerId, 'bullet', false, this.gm);
        }
        break;

      case 'player_killed':
        this.gm.addKillFeed(packet.attackerName, packet.victimName, packet.weapon, packet.isHeadshot);
        if (packet.victimId === this.playerId && this.gm.player) {
          this.gm.player.takeDamage(500, packet.attackerName, packet.weapon, packet.isHeadshot, this.gm);
        }
        break;

      case 'c4_dropped':
        if (packet.pos && this.gm.player) {
          // Visual dropped C4 is handled by gameManager
        }
        break;

      case 'c4_picked_up':
        if (packet.carrierId === this.playerId && this.gm.player) {
          this.gm.player.inventory[5] = CS2_WEAPONS.c4;
          this.gm.player.updateSlotHUD();
          window.csAudio.playWeaponEquip('knife');
        }
        break;

      case 'kicked_idle':
        alert(packet.message || 'DISCONNECTED FOR INACTIVITY');
        window.location.reload();
        break;
    }
  }

  // Process 25Hz server state snapshot
  handleSnapshot(packet) {
    if (!packet || !packet.players) return;

    this.gm.roundTime = packet.timer;
    this.gm.score.CT = packet.ctScore;
    this.gm.score.T = packet.tScore;
    this.gm.currentRound = packet.round;
    this.gm.phase = packet.phase;

    // Update HUD living player counts from snapshot
    const ctAlive = packet.players.filter(p => p.team === 'CT' && p.isAlive).length;
    const tAlive = packet.players.filter(p => p.team === 'T' && p.isAlive).length;
    const ctEl = document.getElementById('hud-ct-alive');
    const tEl = document.getElementById('hud-t-alive');
    if (ctEl) ctEl.innerText = `${ctAlive} ALIVE`;
    if (tEl) tEl.innerText = `${tAlive} ALIVE`;

    const now = performance.now();
    const seenIds = new Set();

    for (let i = 0; i < packet.players.length; i++) {
      const sp = packet.players[i];
      if (sp.id === this.playerId) {
        // Sync local economy & server-authoritative death
        if (sp.money !== undefined && Math.abs(sp.money - this.gm.player.money.get()) > 50) {
          this.gm.player.money.set(sp.money);
        }
        continue;
      }

      seenIds.add(sp.id);
      this.updateRemotePlayerFromSnapshot(sp, now);
    }

    // Clean up disconnected players
    Object.keys(this.remotePlayers).forEach(id => {
      if (!seenIds.has(id)) {
        this.removeRemotePlayer(id);
      }
    });

    // Interpolate remote player positions
    this.renderInterpolatedPlayers(now);
  }

  updateRemotePlayerFromSnapshot(sp, now) {
    if (!this.remotePlayers[sp.id]) {
      const model = this.createTacticalCharacterModel(sp.team, sp.callsign);
      this.gm.scene.add(model);
      this.remotePlayers[sp.id] = {
        mesh: model,
        team: sp.team,
        name: sp.callsign || `Agent_${sp.id.substring(0, 5)}`,
        pos: new THREE.Vector3(sp.pos.x, sp.pos.y, sp.pos.z),
        yaw: sp.yaw || 0,
        pitch: sp.pitch || 0,
        isAlive: sp.isAlive,
        buffer: []
      };
    }

    const rp = this.remotePlayers[sp.id];
    rp.team = sp.team;
    rp.isAlive = sp.isAlive;
    rp.mesh.visible = (sp.inMatch !== false && sp.isAlive);

    // Push into snapshot interpolation buffer (100ms render delay)
    rp.buffer.push({
      t: now,
      pos: new THREE.Vector3(sp.pos.x, sp.pos.y - 1.75, sp.pos.z),
      yaw: sp.yaw || 0,
      pitch: sp.pitch || 0
    });

    // Keep buffer trimmed
    if (rp.buffer.length > 20) {
      rp.buffer.shift();
    }
  }

  // Smooth 100ms snapshot interpolation for remote players
  renderInterpolatedPlayers(now) {
    const renderTime = now - 100; // 100ms buffer delay

    Object.values(this.remotePlayers).forEach(rp => {
      if (!rp || !rp.mesh || !rp.mesh.visible || rp.buffer.length < 2) return;

      const buf = rp.buffer;
      // Drop older snapshots
      while (buf.length >= 2 && buf[1].t <= renderTime) {
        buf.shift();
      }

      if (buf.length >= 2 && buf[0].t <= renderTime && renderTime <= buf[1].t) {
        const s0 = buf[0];
        const s1 = buf[1];
        const span = s1.t - s0.t;
        const frac = span > 0 ? (renderTime - s0.t) / span : 0;

        rp.mesh.position.lerpVectors(s0.pos, s1.pos, frac);

        // Interpolate yaw angle smoothly
        let dy = s1.yaw - s0.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        rp.mesh.rotation.y = s0.yaw + dy * frac;
      } else if (buf.length > 0) {
        const latest = buf[buf.length - 1];
        rp.mesh.position.copy(latest.pos);
        rp.mesh.rotation.y = latest.yaw;
      }
    });
  }

  createTacticalCharacterModel(team, callsign = 'OPERATOR') {
    const group = new THREE.Group();

    // 1. Full-Body Hitbox Cylinder for hit detection
    const hitboxGeo = new THREE.CylinderGeometry(0.52, 0.52, 2.0, 10);
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
    hitbox.position.y = 1.0;
    hitbox.name = 'hitbox';
    group.add(hitbox);

    // 2. Nametag Billboard above head
    const nameCanvas = document.createElement('canvas');
    nameCanvas.width = 256;
    nameCanvas.height = 64;
    const ctx = nameCanvas.getContext('2d');
    ctx.fillStyle = (team === 'CT') ? '#44aaff' : '#ffaa33';
    ctx.font = 'bold 36px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(callsign, 128, 44);
    const nameTex = new THREE.CanvasTexture(nameCanvas);
    const namePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.35),
      new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, side: THREE.DoubleSide })
    );
    namePlane.position.set(0, 2.15, 0);
    group.add(namePlane);
    group.nameTagMesh = namePlane;
    group.nameCanvas = nameCanvas;

    // 3. Attach authentic CS character model (CT = SAS GLB, T = Phoenix GLB)
    this.applyAuthenticModel(group, team);
    if ((team === 'CT' && this.ctModel) || (team === 'T' && this.tModel)) {
      group.hasAuthenticModel = true;
    }

    return group;
  }

  applyAuthenticModel(group, team) {
    const srcModel = (team === 'T') ? this.tModel : this.ctModel;
    if (!srcModel) return;

    if (group.characterMesh) {
      group.remove(group.characterMesh);
      group.characterMesh = null;
    }

    const clone = (typeof THREE.SkeletonUtils !== 'undefined' && THREE.SkeletonUtils.clone)
      ? THREE.SkeletonUtils.clone(srcModel)
      : srcModel.clone(true);

    if (team === 'T') {
      // Phoenix model natural height 78 units -> 1.95m
      clone.scale.set(0.025, 0.025, 0.025);
    } else {
      // SAS model natural height 2.0m
      clone.scale.set(1.0, 1.0, 1.0);
    }
    clone.position.set(0, 0, 0);

    group.add(clone);
    group.characterMesh = clone;
  }

  removeRemotePlayer(id) {
    const p = this.remotePlayers[id];
    if (p && p.mesh) {
      this.gm.scene.remove(p.mesh);
      if (p.mesh.characterMesh) {
        p.mesh.remove(p.mesh.characterMesh);
      }
    }
    delete this.remotePlayers[id];
  }

  clearAllRemotePlayers() {
    Object.keys(this.remotePlayers).forEach(id => {
      this.removeRemotePlayer(id);
    });
    this.remotePlayers = {};
  }

  // Outgoing gameplay actions
  sendPlayerState(player) {
    // Handled by 20Hz inputInterval
  }

  sendShoot(audioType, weaponId, isSilenced, pos) {
    window.csAudio.playGunshot(audioType, weaponId, isSilenced);
  }

  sendDamage(targetId, amount, weapon = 'gun', isHeadshot = false) {
    this.send({
      type: 'damage_hit',
      targetId: targetId,
      damage: amount,
      weapon: weapon,
      isHeadshot: isHeadshot
    });
  }

  sendPlantC4(site, pos) {
    this.send({
      type: 'plant_c4',
      site: site,
      pos: pos
    });
  }

  sendDefuseProgress(progress) {
    this.send({
      type: 'defuse_progress',
      progress: progress
    });
  }

  sendPickupC4() {
    this.send({
      type: 'pickup_c4'
    });
  }

  sendSelectTeam(team) {
    this.send({
      type: 'select_team',
      team: team
    });
  }

  sendBuyItem(cost, weaponId) {
    this.send({
      type: 'buy_item',
      cost: cost,
      weaponId: weaponId
    });
  }

  sendDeath(attacker, victim, weapon, isHeadshot, victimTeam) {}
}

window.CS2NetworkManager = CS2NetworkManager;
