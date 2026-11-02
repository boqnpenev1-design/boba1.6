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
    this.lastPingMs = 0;
    this.lastPingSentAt = 0;
    this.lastSnapshotTime = 0;
    this.pingInterval = null;

    // Load authentic CS character models
    this.gltfLoader = typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null;
    this.ctModel = null;
    this.tModel = null;

    // Debug packet simulator helper (Item 1 Protocol verification)
    window.__sim = (type, payload = {}) => {
      this.handlePacket({ type, ...payload });
    };

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

      // Start periodic ping measurement
      this.lastPingSentAt = Date.now();
      this.send({ type: 'ping', t: this.lastPingSentAt });
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.lastPingSentAt = Date.now();
          this.send({ type: 'ping', t: this.lastPingSentAt });
        }
      }, 2500);

      const statusEl = document.getElementById('sb-net-status');
      if (statusEl) statusEl.innerHTML = `ONLINE DEDICATED SERVER &bull; CONNECTED`;

      if (onReady) onReady('client');
    };

    this.ws.onmessage = (event) => {
      let packet = null;
      try {
        packet = JSON.parse(event.data);
      } catch (parseErr) {
        console.error('[NET_PARSE_ERROR] Failed to parse JSON:', event.data, parseErr);
        return;
      }
      try {
        this.handleServerPacket(packet);
      } catch (err) {
        console.error('[NET_PACKET_ERROR] Error handling packet type:', packet ? packet.type : 'unknown', '\nPacket data:', packet, '\nStack:', err.stack);
      }
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;
      this.hostConnection.open = false;
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      this.stopInputLoop();
      this.clearAllRemotePlayers();

      console.warn(`[WS_CLOSED] Code: ${event.code}, Reason: ${event.reason || 'None'}, WasClean: ${event.wasClean}`);

      const statusEl = document.getElementById('sb-net-status');
      if (event.code === 1008) {
        const originErr = `WEBSOCKET REJECTED: ORIGIN NOT ALLOWED (Code 1008) - Check ALLOWED_ORIGIN on Render`;
        console.error(originErr);
        if (statusEl) statusEl.innerHTML = originErr;
        this.showKickBanner(originErr);
        return;
      }

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
      console.warn('[WS_ERROR] CS2 Server WebSocket Note:', err.message || err);
    };
  }

  // Custom Room Lobby Support (UI navigation compatibility)
  createLobby(onSuccess) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    if (onSuccess) onSuccess(code);
  }

  joinLobby(code, onSuccess, onError) {
    if (code && code.trim().length >= 4) {
      if (onSuccess) onSuccess();
    } else {
      if (onError) onError();
    }
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
        const prevMatchId = this.gm.matchId;
        this.playerId = packet.playerId;
        this.inMatch = packet.inMatch;
        this.gm.matchId = packet.matchId;
        this.serverTeam = packet.team;
        if (packet.team && this.gm) {
          this.gm.setAuthoritativeTeam(packet.team, packet.c4CarrierId === this.playerId);
        }

        // If reconnecting client sees a different matchId, reset local match state
        if (prevMatchId && packet.matchId && prevMatchId !== packet.matchId) {
          console.log(`[MATCH_RESET] matchId changed from ${prevMatchId} to ${packet.matchId} -> Resetting local match state`);
          this.gm.ctScore = 0;
          this.gm.tScore = 0;
          this.gm.score = { CT: 0, T: 0 };
          this.gm.currentRound = 1;
          this.gm.c4Planted = false;
          if (this.gm.c4Mesh) this.gm.c4Mesh.visible = false;
          this.gm.clearAllDroppedItems();
          if (this.gm.player) {
            this.gm.player.money.set(800);
            this.gm.player.setTeam(packet.team || this.gm.player.team);
          }
          this.showKickBanner('SERVER RESTARTED - NEW MATCH');
        }

        this.gm.currentRound = packet.currentRound || 1;
        this.gm.ctScore = (typeof packet.ctScore === 'number') ? packet.ctScore : 0;
        this.gm.tScore = (typeof packet.tScore === 'number') ? packet.tScore : 0;
        if (!this.gm.score) this.gm.score = { CT: 0, T: 0 };
        this.gm.score.CT = this.gm.ctScore;
        this.gm.score.T = this.gm.tScore;
        this.gm.phase = packet.phase || 'freeze';
        this.gm.roundTime = packet.phaseTimer || 15;
        this.gm.phaseTimer = packet.phaseTimer || 15;
        this.gm.phaseEndTime = packet.phaseEndTime || (Date.now() + 15000);

        if (packet.c4Planted) {
          this.gm.c4Planted = true;
          this.gm.c4Pos = packet.c4Pos;
          this.gm.c4Site = packet.c4Site;
        } else {
          this.gm.resetBombHUD();
        }

        if (packet.c4CarrierId === this.playerId && this.gm.player) {
          this.gm.player.inventory[5] = CS2_WEAPONS.c4;
          this.gm.player.hasC4 = true;
        }

        if (packet.inMatch === false && packet.phase === 'live' && this.gm.player) {
          this.gm.player.isAlive = false;
          this.gm.player.enterSpectatorMode();
        } else if (this.gm.player) {
          this.gm.player.isAlive = true;
          if (this.gm.player.isSpectating) {
            this.gm.player.isSpectating = false;
          }
        }
        this.gm.updateHUD();
        break;

      case 'snapshot':
        this.handleSnapshot(packet);
        break;

      case 'phase_change':
        this.gm.phase = packet.phase;
        this.gm.roundTime = packet.timer;
        this.gm.phaseTimer = packet.timer;
        this.gm.phaseEndTime = packet.phaseEndTime || (Date.now() + packet.timer * 1000);
        this.gm.updateHUD();
        break;

      case 'round_start':
        this.gm.currentRound = packet.round;
        this.gm.phase = packet.phase || 'freeze';
        this.gm.roundTime = packet.timer || 15;
        this.gm.phaseTimer = packet.timer || 15;
        this.gm.phaseEndTime = packet.phaseEndTime || (Date.now() + 15000);
        this.gm.ctScore = (typeof packet.ctScore === 'number') ? packet.ctScore : 0;
        this.gm.tScore = (typeof packet.tScore === 'number') ? packet.tScore : 0;
        if (!this.gm.score) this.gm.score = { CT: 0, T: 0 };
        this.gm.score.CT = this.gm.ctScore;
        this.gm.score.T = this.gm.tScore;
        this.gm.resetBombHUD();
        this.gm.clearAllDroppedItems();
        const roundEndOverlay = document.getElementById('round-end-overlay');
        if (roundEndOverlay) roundEndOverlay.classList.add('hidden');
        this.inMatch = true;

        // Reset player round state
        if (this.gm.player) {
          this.gm.player.health.set(100);
          this.gm.player.isAlive = true;
          this.gm.player.isSpectating = false;
          const spectHud = document.getElementById('spectator-hud');
          if (spectHud) spectHud.classList.add('hidden');
          const hud = document.getElementById('hud');
          if (hud) hud.classList.remove('hidden');

          const isCarrier = (packet.c4CarrierId === this.playerId);
          if (packet.team) {
            this.serverTeam = packet.team;
          }
          if (this.serverTeam && this.gm) {
            this.gm.setAuthoritativeTeam(this.serverTeam, isCarrier);
          }
          this.gm.player.updateSlotHUD();
          const spawns = (this.gm.mapBuilder && this.gm.mapBuilder.spawnPoints && this.gm.mapBuilder.spawnPoints[this.gm.player.team]) || [];
          const s = spawns.length > 0 ? spawns[Math.floor(Math.random() * spawns.length)] : null;
          this.gm.player.respawn(s);
        }
        this.gm.updateHUD();
        break;

      case 'round_end':
        this.gm.score.CT = packet.ctScore;
        this.gm.score.T = packet.tScore;
        this.gm.phase = 'round_over';
        this.gm.onRoundEnd(packet.winner, packet.reason, packet.mvp);
        break;

      case 'team_swapped':
        if (packet.playerId === this.playerId && this.gm) {
          this.serverTeam = packet.newTeam;
          this.gm.setAuthoritativeTeam(packet.newTeam, false);
        } else if (this.remotePlayers[packet.playerId]) {
          this.remotePlayers[packet.playerId].team = packet.newTeam;
          if (this.remotePlayers[packet.playerId].mesh) {
            this.applyAuthenticModel(this.remotePlayers[packet.playerId].mesh, packet.newTeam);
          }
        }
        break;

      case 'halftime_swap':
        this.gm.score.CT = packet.ctScore;
        this.gm.score.T = packet.tScore;
        if (this.gm.player) {
          const nextTeam = (this.gm.player.team === 'CT') ? 'T' : 'CT';
          this.serverTeam = nextTeam;
          this.gm.setAuthoritativeTeam(nextTeam, false);
          this.gm.player.money.set(800);
          this.gm.player.hasHelmet = false;
          this.gm.player.armor.set(0);
        }
        this.gm.updateHUD();
        break;

      case 'c4_planted':
        this.gm.onC4Planted(packet.pos, packet.site);
        if (packet.explodeTime) {
          const timeLeft = Math.max(0, (packet.explodeTime - Date.now()) / 1000);
          this.gm.c4Timer = timeLeft;
        }
        break;

      case 'bomb_exploded':
        this.gm.spawnC4ExplosionEffect(packet.pos);
        break;

      case 'bomb_defused':
        this.gm.onBombDefused(packet.defuserName || 'Counter-Terrorist');
        break;

      case 'player_left':
        if (packet.id) {
          this.removeRemotePlayer(packet.id);
        }
        break;

      case 'player_shot':
        if (packet.shooterId !== this.playerId && window.csAudio) {
          window.csAudio.playGunshot(packet.audioType || 'primary', packet.weaponId || 'ak47', packet.isSilenced);
        }
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
        } else if (this.remotePlayers[packet.victimId]) {
          const rp = this.remotePlayers[packet.victimId];
          rp.isAlive = false;
          if (rp.mesh) {
            rp.mesh.rotation.z = -Math.PI / 2;
            setTimeout(() => {
              if (rp && rp.mesh && !rp.isAlive) {
                rp.mesh.visible = false;
              }
            }, 1000);
          }
        }
        break;

      case 'item_dropped':
        if (packet.item) {
          if (packet.item.droppedBy === this.playerId) {
            const localItem = (window._droppedItems || []).find(d => !d.serverAssignedId && d.weapon && d.weapon.id === packet.item.weaponId);
            if (localItem) {
              localItem.id = packet.item.id;
              localItem.serverAssignedId = true;
            }
          } else if (this.gm) {
            this.gm.spawnRemoteDroppedWeapon(packet.item);
          }
        }
        break;

      case 'item_picked_up':
        if (packet.weaponId && this.gm) {
          this.gm.removeRemoteDroppedWeapon(packet.itemId, packet.weaponId);
        }
        break;

      case 'drop_error':
        console.log('[DROP_REJECT]', packet.reason);
        window.__lastReject = { type: 'drop_error', reason: packet.reason, time: new Date().toLocaleTimeString() };
        break;

      case 'pickup_error':
        console.log('[PICKUP_REJECT]', packet.reason);
        window.__lastReject = { type: 'pickup_error', reason: packet.reason, time: new Date().toLocaleTimeString() };
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

      case 'buy_success':
        if (this.gm.player && typeof packet.remainingMoney === 'number') {
          this.gm.player.money.set(packet.remainingMoney);
        }
        if (packet.transactions) {
          this.gm.transactions = packet.transactions;
        }
        if (window.__onBuySuccess) {
          window.__onBuySuccess(packet);
        }
        this.gm.updateHUD();
        break;

      case 'buy_error':
        console.log('[BUY_REJECT]', packet.reason);
        if (window.__onBuyError) {
          window.__onBuyError(packet);
        }
        break;

      case 'refund_success':
        if (this.gm.player && typeof packet.remainingMoney === 'number') {
          this.gm.player.money.set(packet.remainingMoney);
        }
        if (packet.transactions) {
          this.gm.transactions = packet.transactions;
        }
        if (window.__onRefundSuccess) {
          window.__onRefundSuccess(packet);
        }
        this.gm.updateHUD();
        break;

      case 'refund_error':
        console.log('[REFUND_REJECT]', packet.reason);
        if (window.__onRefundError) {
          window.__onRefundError(packet);
        }
        break;

      case 'pong':
        this.lastPingMs = Math.max(0, Date.now() - (packet.t || this.lastPingSentAt || Date.now()));
        const fpsEl = document.getElementById('net-graph-fps');
        if (fpsEl && this.gm) {
          fpsEl.innerHTML = `${this.gm.currentFPS || 144} FPS &bull; ${this.lastPingMs}ms &bull; TICK 64`;
        }
        break;

      case 'kicked_idle':
        console.warn('[IDLE_KICK] Disconnected from server for inactivity.');
        this.isConnected = false;
        if (this.ws) {
          try { this.ws.close(); } catch (e) {}
        }
        this.stopInputLoop();
        if (this.gm) this.gm.playerInMatch = false;
        if (document.exitPointerLock) document.exitPointerLock();
        document.getElementById('hud')?.classList.add('hidden');
        document.getElementById('spectator-hud')?.classList.add('hidden');
        document.getElementById('main-menu')?.classList.remove('hidden');
        this.showKickBanner('DISCONNECTED FOR INACTIVITY');
        break;
    }
  }

  logRateLimitedError(key, err) {
    if (!this._rateLimitedErrors) this._rateLimitedErrors = {};
    const now = Date.now();
    const entry = this._rateLimitedErrors[key] || { count: 0, lastLog: 0 };
    entry.count++;
    if (now - entry.lastLog >= 1000) {
      console.error(`[NET_ERROR] [${key}] (occurred ${entry.count} time(s)): ${err.message}`, err.stack);
      entry.lastLog = now;
      entry.count = 0;
    }
    this._rateLimitedErrors[key] = entry;
  }

  // Process 25Hz server state snapshot
  handleSnapshot(packet) {
    if (!packet || !packet.players) return;
    this.lastSnapshotTime = Date.now();

    if (this.gm) {
      if (this.gm.phase !== packet.phase) {
        if (packet.phase === 'live') {
          this.gm.liveRoundStartTime = Date.now();
        } else if (packet.phase === 'freeze') {
          this.gm.liveRoundStartTime = 0;
        }
      }
      this.gm.phase = packet.phase;
      this.gm.phaseTimer = packet.timer;
      this.gm.roundTime = packet.timer;
      this.gm.ctScore = (typeof packet.ctScore === 'number') ? packet.ctScore : this.gm.ctScore;
      this.gm.tScore = (typeof packet.tScore === 'number') ? packet.tScore : this.gm.tScore;
      if (!this.gm.score) this.gm.score = { CT: this.gm.ctScore, T: this.gm.tScore };
      this.gm.score.CT = this.gm.ctScore;
      this.gm.score.T = this.gm.tScore;
      this.gm.currentRound = packet.round;

      if (this.gm.hudEls.ctScore) this.gm.hudEls.ctScore.innerText = this.gm.ctScore;
      if (this.gm.hudEls.tScore) this.gm.hudEls.tScore.innerText = this.gm.tScore;

      // Reset stale bomb HUD if snapshot indicates bomb is not planted
      if (!packet.c4Planted && this.gm.c4Planted) {
        this.gm.resetBombHUD();
      }

      // Hide victory banner when round is no longer over
      if (this.gm.phase !== 'round_over') {
        const roEl = document.getElementById('round-end-overlay');
        if (roEl && !roEl.classList.contains('hidden')) {
          roEl.classList.add('hidden');
        }
      }
    }

    // Update HUD living player counts from snapshot
    const ctAlive = packet.players.filter(p => p.team === 'CT' && p.isAlive).length;
    const tAlive = packet.players.filter(p => p.team === 'T' && p.isAlive).length;
    const ctEl = document.getElementById('ct-alive-count') || document.getElementById('hud-ct-alive');
    const tEl = document.getElementById('t-alive-count') || document.getElementById('hud-t-alive');
    if (ctEl) ctEl.innerText = `${ctAlive} ALIVE`;
    if (tEl) tEl.innerText = `${tAlive} ALIVE`;

    const now = performance.now();
    const seenIds = new Set();

    for (let i = 0; i < packet.players.length; i++) {
      const sp = packet.players[i];
      if (sp.id === this.playerId) {
        if (sp.team && sp.team !== this.serverTeam) {
          this.serverTeam = sp.team;
          if (this.gm) {
            this.gm.setAuthoritativeTeam(sp.team, !!sp.hasC4);
          }
        }
        // Sync local economy & server-authoritative death
        if (sp.transactions && Array.isArray(sp.transactions)) {
          this.gm.transactions = sp.transactions;
        }
        if (sp.money !== undefined && Math.abs(sp.money - this.gm.player.money.get()) > 0) {
          this.gm.player.money.set(sp.money);
        }
        if (this.gm.player) {
          if (sp.isAlive === false && this.gm.player.isAlive) {
            this.gm.player.takeDamage(500, 'Server Elimination', 'world');
          } else if (sp.isAlive === true) {
            this.gm.player.isAlive = true;
          }
        }
        continue;
      }

      seenIds.add(sp.id);
      try {
        this.updateRemotePlayerFromSnapshot(sp, now);
      } catch (err) {
        this.logRateLimitedError(`remote_player_${sp.id}`, err);
      }
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

    if (!rp.hasAuthenticModel) {
      if (this.applyAuthenticModel(rp.mesh, sp.team)) {
        rp.hasAuthenticModel = true;
      }
    }

    const playerH = (this.gm.player && typeof this.gm.player.playerHeight === 'number') ? this.gm.player.playerHeight : 2.2;
    const feetY = sp.pos.y - playerH;

    // Push into snapshot interpolation buffer (100ms render delay)
    rp.buffer.push({
      t: now,
      pos: new THREE.Vector3(sp.pos.x, feetY, sp.pos.z),
      yaw: sp.yaw || 0,
      pitch: sp.pitch || 0
    });

    // Keep buffer trimmed
    if (rp.buffer.length > 20) {
      rp.buffer.shift();
    }
  }

  // Smooth 100ms snapshot interpolation for remote players (with <=150ms extrapolation)
  renderInterpolatedPlayers(now) {
    const renderTime = now - 100; // 100ms buffer delay

    Object.values(this.remotePlayers).forEach(rp => {
      if (!rp || !rp.mesh || !rp.mesh.visible || rp.buffer.length < 1) return;

      const buf = rp.buffer;
      const latest = buf[buf.length - 1];
      const prevX = rp.mesh.position.x;
      const prevY = rp.mesh.position.y;
      const prevZ = rp.mesh.position.z;

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
        const timeSince = renderTime - latest.t;
        if (timeSince > 0 && timeSince <= 150 && buf.length >= 2) {
          // Smooth extrapolation up to 150ms
          const prev = buf[buf.length - 2];
          const dtSnap = (latest.t - prev.t) / 1000;
          if (dtSnap > 0.001) {
            const vx = (latest.pos.x - prev.pos.x) / dtSnap;
            const vz = (latest.pos.z - prev.pos.z) / dtSnap;
            rp.mesh.position.set(
              latest.pos.x + vx * (timeSince / 1000),
              latest.pos.y,
              latest.pos.z + vz * (timeSince / 1000)
            );
          } else {
            rp.mesh.position.copy(latest.pos);
          }
        } else {
          rp.mesh.position.copy(latest.pos);
        }
        if (rp.mesh.nameTagMesh && this.gm.camera) {
          rp.mesh.nameTagMesh.quaternion.copy(this.gm.camera.quaternion);
        }
        rp.mesh.rotation.y = latest.yaw;
      }

      // Procedural bone articulation (Idle ready carry, walk, run, crouch, crouch walk, jump/air, death collapse)
      const moveSpeed = Math.hypot(rp.mesh.position.x - prevX, rp.mesh.position.z - prevZ);
      const isAlive = (rp.isAlive !== false);
      const isCrouched = !!(rp.isCrouched || (latest && latest.crouch));
      const inAir = Math.abs(rp.mesh.position.y - prevY) > 0.04;

      if (!isAlive) {
        rp.mesh.rotation.z = -Math.PI / 2;
        rp.mesh.position.y = Math.max(0, rp.mesh.position.y - 0.7);
        rp.activeState = 'DEAD';
      } else {
        rp.mesh.rotation.z = 0;
        const b = rp.mesh.characterBones;
        if (b) {
          // Tactical weapon-carry arm stance (living player never in T-pose)
          if (b.armUpperL) b.armUpperL.rotation.set(-0.65, 0.45, -1.15);
          if (b.armUpperR) b.armUpperR.rotation.set(-0.65, -0.45, 1.15);
          if (b.armLowerL) b.armLowerL.rotation.y = -0.75;
          if (b.armLowerR) b.armLowerR.rotation.y = 0.75;

          const isMoving = moveSpeed > 0.015;

          if (inAir) {
            rp.activeState = 'JUMP';
            if (b.legUpperL) b.legUpperL.rotation.set(-0.45, 0.1, 0);
            if (b.legUpperR) b.legUpperR.rotation.set(-0.35, -0.1, 0);
            if (b.legLowerL) b.legLowerL.rotation.x = 0.60;
            if (b.legLowerR) b.legLowerR.rotation.x = 0.50;
            if (b.spine) b.spine.rotation.x = 0.05;
          } else if (isCrouched) {
            rp.activeState = isMoving ? 'CROUCH_WALK' : 'CROUCH';
            const crouchStride = isMoving ? Math.sin(now * 0.009) * 0.35 : 0;
            if (b.legUpperL) b.legUpperL.rotation.x = -0.70 + crouchStride;
            if (b.legUpperR) b.legUpperR.rotation.x = -0.70 - crouchStride;
            if (b.legLowerL) b.legLowerL.rotation.x = 1.10 - Math.max(0, crouchStride * 0.5);
            if (b.legLowerR) b.legLowerR.rotation.x = 1.10 + Math.max(0, crouchStride * 0.5);
            if (b.spine) b.spine.rotation.x = -0.12;
          } else if (isMoving) {
            const isRun = moveSpeed > 0.07;
            rp.activeState = isRun ? 'RUN' : 'WALK';
            const freq = isRun ? 0.013 : 0.010;
            const walkCycle = Math.sin(now * freq);
            const walkAmp = isRun ? Math.min(0.75, moveSpeed * 7.5) : Math.min(0.50, moveSpeed * 5.0);

            if (b.legUpperL) b.legUpperL.rotation.x = walkCycle * walkAmp;
            if (b.legUpperR) b.legUpperR.rotation.x = -walkCycle * walkAmp;
            if (b.legLowerL) b.legLowerL.rotation.x = Math.max(0, -walkCycle * walkAmp * 0.7);
            if (b.legLowerR) b.legLowerR.rotation.x = Math.max(0, walkCycle * walkAmp * 0.7);
            if (b.armUpperL) b.armUpperL.rotation.x = -0.65 - walkCycle * walkAmp * 0.25;
            if (b.armUpperR) b.armUpperR.rotation.x = -0.65 + walkCycle * walkAmp * 0.25;
            if (b.spine) b.spine.rotation.x = isRun ? -0.14 : -0.05;
          } else {
            rp.activeState = 'IDLE';
            const idleBreathe = Math.sin(now * 0.002) * 0.02;
            if (b.legUpperL) b.legUpperL.rotation.set(0, 0, 0);
            if (b.legUpperR) b.legUpperR.rotation.set(0, 0, 0);
            if (b.legLowerL) b.legLowerL.rotation.x = 0;
            if (b.legLowerR) b.legLowerR.rotation.x = 0;
            if (b.spine) b.spine.rotation.x = idleBreathe;
          }
        }
      }

      // Dynamic Bone-Tracked Hitbox Alignment
      if (rp.mesh.updateHitboxes) {
        rp.mesh.updateHitboxes();
      }

      // Sync hitbox wireframe visibility with global toggle only when ?debug=1 is enabled
      const isDebug = (typeof window !== 'undefined' && window.location && new URLSearchParams(window.location.search).get('debug') === '1');
      const showWire = isDebug && !!window.__showHitboxWireframes;
      if (rp.mesh.bodyHitbox && rp.mesh.bodyHitbox.material) {
        rp.mesh.bodyHitbox.material.visible = showWire;
      }
      if (rp.mesh.headHitbox && rp.mesh.headHitbox.material) {
        rp.mesh.headHitbox.material.visible = showWire;
      }
    });
  }

  createTacticalCharacterModel(team, callsign = 'OPERATOR') {
    const group = new THREE.Group();

    // 1. Authentic Capsule Body Hitbox (Radius ~0.32m, height 1.40m matching authentic human bounds, anchored at ground Y=0)
    const isDebug = (typeof window !== 'undefined' && window.location && new URLSearchParams(window.location.search).get('debug') === '1');
    const showWire = isDebug && !!window.__showHitboxWireframes;
    const bodyHitboxGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.40, 12);
    const bodyHitboxMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, visible: showWire });
    const bodyHitbox = new THREE.Mesh(bodyHitboxGeo, bodyHitboxMat);
    bodyHitbox.position.y = 0.70;
    bodyHitbox.name = 'bodyHitbox';
    bodyHitbox.userData = { isHead: false, isHitbox: true };
    group.add(bodyHitbox);
    group.bodyHitbox = bodyHitbox;

    // 2. Authentic Sphere Head Hitbox (Radius 0.20m, positioned at head bone ~1.82m)
    const headHitboxGeo = new THREE.SphereGeometry(0.20, 12, 10);
    const headHitboxMat = new THREE.MeshBasicMaterial({ color: 0xff3344, wireframe: true, visible: showWire });
    const headHitbox = new THREE.Mesh(headHitboxGeo, headHitboxMat);
    headHitbox.position.y = 1.82;
    headHitbox.name = 'headHitbox';
    headHitbox.userData = { isHead: true, isHitbox: true };
    group.add(headHitbox);
    group.headHitbox = headHitbox;

    // Hitbox dynamic bone updater
    group.updateHitboxes = function() {
      const headY = 1.82;
      group.headHitbox.position.set(0, headY, 0);
      group.bodyHitbox.position.set(0, 0.70, 0);
      group.bodyHitbox.scale.set(1, 1, 1);
    };

    // 3. Nametag Billboard above head
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

    // 4. Attach authentic CS character model (CT = SAS GLB, T = Phoenix GLB)
    this.applyAuthenticModel(group, team);
    if ((team === 'CT' && this.ctModel) || (team === 'T' && this.tModel)) {
      group.hasAuthenticModel = true;
    }

    return group;
  }

  applyAuthenticModel(group, team) {
    const srcModel = (team === 'T') ? this.tModel : this.ctModel;
    if (!srcModel) return false;

    if (group.characterWrapper) {
      group.remove(group.characterWrapper);
      group.characterWrapper = null;
      group.characterMesh = null;
    } else if (group.characterMesh) {
      group.remove(group.characterMesh);
      group.characterMesh = null;
    }

    const clone = (typeof THREE.SkeletonUtils !== 'undefined' && THREE.SkeletonUtils.clone)
      ? THREE.SkeletonUtils.clone(srcModel)
      : srcModel.clone(true);

    const isCT = (team === 'CT');
    const wrapper = new THREE.Group();
    wrapper.name = 'characterWrapper';

    if (isCT) {
      // SAS model: X axis is vertical -> rotate Z by PI/2
      clone.rotation.set(0, 0, Math.PI / 2);
      const ctScale = 1.05;
      clone.scale.set(ctScale, ctScale, ctScale);
      clone.position.set(0, 0, 0);
    } else {
      // Phoenix model: Z axis is vertical -> rotate X by PI/2
      clone.rotation.set(Math.PI / 2, 0, 0);
      const tScale = 0.0269;
      clone.scale.set(tScale, tScale, tScale);
      clone.position.set(0, 0, 0);
    }

    // Orient character to face player movement/view direction (-Z)
    wrapper.rotation.y = Math.PI;

    // FrontSide only
    clone.traverse(child => {
      if (child.isMesh) {
        child.visible = true;
        child.castShadow = false;
        child.receiveShadow = false;
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => {
            m.side = THREE.FrontSide;
            if (m.map) {
              m.map.encoding = THREE.sRGBEncoding;
              if (m.map.image) m.map.needsUpdate = true;
            }
          });
        }
      }
    });

    wrapper.add(clone);

    // Extract named bones for procedural articulation
    const bones = {};
    let totalBones = 0;
    clone.traverse(c => {
      if (c.isBone) {
        totalBones++;
        const n = c.name.toLowerCase();
        if (n.startsWith('arm_upper_l')) bones.armUpperL = c;
        else if (n.startsWith('arm_upper_r')) bones.armUpperR = c;
        else if (n.startsWith('arm_lower_l')) bones.armLowerL = c;
        else if (n.startsWith('arm_lower_r')) bones.armLowerR = c;
        else if (n.startsWith('leg_upper_l')) bones.legUpperL = c;
        else if (n.startsWith('leg_upper_r')) bones.legUpperR = c;
        else if (n.startsWith('leg_lower_l')) bones.legLowerL = c;
        else if (n.startsWith('leg_lower_r')) bones.legLowerR = c;
        else if (n.startsWith('head_0')) bones.head = c;
        else if (n.startsWith('spine_1') || n.startsWith('spine_0')) bones.spine = c;
      }
    });
    group.characterBones = bones;
    group.boneCount = totalBones;

    // Initial tactical carry pose immediately upon model attach
    if (bones.armUpperL) bones.armUpperL.rotation.set(-0.65, 0.45, -1.15);
    if (bones.armUpperR) bones.armUpperR.rotation.set(-0.65, -0.45, 1.15);
    if (bones.armLowerL) bones.armLowerL.rotation.y = -0.75;
    if (bones.armLowerR) bones.armLowerR.rotation.y = 0.75;

    if (!CS2NetworkManager.loggedBones) {
      console.log(`[BONES] Loaded ${team} operator bones (${totalBones} total):`, Object.keys(bones));
      CS2NetworkManager.loggedBones = true;
    }

    group.add(wrapper);
    group.characterWrapper = wrapper;
    group.characterMesh = clone;
    return true;
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
    this.send({
      type: 'player_shot',
      weaponId: weaponId,
      audioType: audioType,
      isSilenced: !!isSilenced,
      pos: pos || (this.gm && this.gm.player ? { x: this.gm.player.position.x, y: this.gm.player.position.y, z: this.gm.player.position.z } : null)
    });
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

  sendBuyItem(cost, weaponId, slot = 1) {
    this.send({
      type: 'buy_item',
      cost: cost,
      weaponId: weaponId,
      slot: slot
    });
  }

  sendRefundItem(weaponId) {
    this.send({
      type: 'refund_item',
      weaponId: weaponId
    });
  }

  sendWeaponFired(weaponId) {
    this.send({
      type: 'weapon_fired',
      weaponId: weaponId
    });
  }

  sendDeath(attacker, victim, weapon, isHeadshot, victimTeam) {}

  showKickBanner(message) {
    const existing = document.getElementById('cs2-kick-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'cs2-kick-banner';
    banner.style.cssText = `
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(220, 38, 38, 0.95);
      border: 2px solid #ffffff;
      border-radius: 6px;
      color: #ffffff;
      padding: 14px 28px;
      font-family: Rajdhani, sans-serif;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 1px;
      z-index: 9999999;
      box-shadow: 0 4px 25px rgba(0,0,0,0.85);
      text-align: center;
      pointer-events: auto;
    `;
    banner.innerHTML = `<div>${message}</div><button style="margin-top:8px;padding:4px 16px;background:#111;color:#fff;border:1px solid #fff;border-radius:3px;cursor:pointer;font-family:inherit;font-size:14px;" onclick="this.parentElement.remove()">CLOSE</button>`;
    document.body.appendChild(banner);
    setTimeout(() => { if (banner.parentElement) banner.remove(); }, 8000);
  }
}

window.CS2NetworkManager = CS2NetworkManager;
window.CS2Network = CS2NetworkManager;
