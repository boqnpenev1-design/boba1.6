// CS2 WebRTC Multiplayer Engine: Real-Time Gunfire Audio Sync, Footsteps Sync,
// Mid-Round Spectator POV Join Sync, Round State Lockstep, and 3D Operator Models

class CS2NetworkManager {
  constructor(gameManager) {
    this.gm = gameManager;
    this.peer = null;
    this.isHost = false;
    this.connections = [];
    this.hostConnection = null;
    this.roomId = null;
    this.remotePlayers = {}; // id -> { mesh, data, team, pos, lastPos, lastStepTime }
    this.isConnected = false;
    this.gltfLoader = typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null;
    this.ctModel = null;
    this.tModel = null;

    if (this.gltfLoader) {
      // 1. Counter-Terrorist: Genuine CS2 SAS Operator Model
      this.gltfLoader.load('ctm_sas__cs2_agent_model.glb', (gltf) => {
        this.ctModel = gltf.scene;
        console.log('Authentic CS2 CT (SAS) agent loaded successfully');
        Object.values(this.remotePlayers).forEach(p => {
          if (p && p.mesh && p.team === 'CT' && !p.hasAuthenticModel) {
            this.applyAuthenticModel(p.mesh, 'CT');
            p.hasAuthenticModel = true;
          }
        });
      }, undefined, (e) => console.warn('CT model load note:', e));

      // 2. Terrorist: Genuine CS:GO/CS2 Phoenix Operator Model
      this.gltfLoader.load('tm_phoenix_v2-_csgo_terrorist_characters.glb', (gltf) => {
        this.tModel = gltf.scene;
        console.log('Authentic CS T (Phoenix) agent loaded successfully');
        Object.values(this.remotePlayers).forEach(p => {
          if (p && p.mesh && p.team === 'T' && !p.hasAuthenticModel) {
            this.applyAuthenticModel(p.mesh, 'T');
            p.hasAuthenticModel = true;
          }
        });
      }, undefined, (e) => console.warn('T model load note:', e));
    }
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'CS-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  autoJoinPublicServer(mapName, onReady) {
    const targetRoom = `cs2-pub-${mapName.toLowerCase()}`;
    this.roomId = targetRoom;

    const clientPeer = new Peer({
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    let connectedAsClient = false;
    const timeout = setTimeout(() => {
      if (!connectedAsClient) {
        clientPeer.destroy();
        this.hostPublicServer(targetRoom, onReady);
      }
    }, 1800);

    clientPeer.on('open', () => {
      const conn = clientPeer.connect(targetRoom, { reliable: true });
      this.hostConnection = conn;

      conn.on('open', () => {
        clearTimeout(timeout);
        connectedAsClient = true;
        this.peer = clientPeer;
        this.isHost = false;
        this.isConnected = true;
        const statusEl = document.getElementById('sb-net-status');
        if (statusEl) statusEl.innerText = `ONLINE PUBLIC SERVER &bull; CLIENT (${targetRoom.toUpperCase()})`;

        conn.on('data', (data) => {
          this.handleClientReceivedPacket(data);
        });

        conn.on('close', () => {
          this.isConnected = false;
          this.clearAllRemotePlayers();
        });

        if (onReady) onReady('client');
      });

      conn.on('error', () => {
        if (!connectedAsClient) {
          clearTimeout(timeout);
          clientPeer.destroy();
          this.hostPublicServer(targetRoom, onReady);
        }
      });
    });

    clientPeer.on('error', () => {
      if (!connectedAsClient) {
        clearTimeout(timeout);
        clientPeer.destroy();
        this.hostPublicServer(targetRoom, onReady);
      }
    });
  }

  hostPublicServer(roomName, onReady) {
    this.isHost = true;
    this.roomId = roomName;

    this.peer = new Peer(roomName, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', () => {
      this.isConnected = true;
      const statusEl = document.getElementById('sb-net-status');
      if (statusEl) statusEl.innerText = `ONLINE PUBLIC SERVER &bull; HOST (${roomName.toUpperCase()})`;
      if (onReady) onReady('host');
    });

    this.peer.on('connection', (conn) => {
      this.connections.push(conn);
      this.setupHostConnectionHandlers(conn);

      // CRITICAL: Send live match state to joining player
      conn.send({
        type: 'match_sync',
        phase: this.gm.phase,
        phaseTimer: this.gm.phaseTimer,
        phaseEndTime: this.gm.phaseEndTime,
        liveRoundStartTime: this.gm.liveRoundStartTime,
        ctScore: this.gm.ctScore,
        tScore: this.gm.tScore,
        round: this.gm.currentRound,
        c4Planted: this.gm.c4Planted,
        c4Pos: this.gm.c4Pos,
        c4Site: this.gm.c4Site
      });
    });

    this.peer.on('error', (err) => {
      console.warn("Public host peer warning:", err);
    });
  }

  createLobby(onReady) {
    const code = this.generateRoomCode();
    this.isHost = true;
    this.roomId = code;

    this.peer = new Peer(code.toLowerCase(), {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', () => {
      this.isConnected = true;
      if (onReady) onReady(code);
    });

    this.peer.on('connection', (conn) => {
      this.connections.push(conn);
      this.setupHostConnectionHandlers(conn);
    });

    this.peer.on('error', (err) => {
      console.warn("PeerJS connection error:", err);
    });
  }

  joinLobby(roomCode, onConnected, onError) {
    this.isHost = false;
    this.roomId = roomCode.toUpperCase();

    this.peer = new Peer({
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', () => {
      const conn = this.peer.connect(this.roomId.toLowerCase(), { reliable: true });
      this.hostConnection = conn;

      conn.on('open', () => {
        this.isConnected = true;
        if (onConnected) onConnected();
      });

      conn.on('data', (data) => {
        this.handleClientReceivedPacket(data);
      });

      conn.on('close', () => {
        this.isConnected = false;
        this.clearAllRemotePlayers();
      });
    });

    this.peer.on('error', (err) => {
      if (onError) onError(err);
    });
  }

  setupHostConnectionHandlers(conn) {
    const sendSync = () => {
      conn.send({
        type: 'match_sync',
        phase: this.gm.phase,
        phaseTimer: this.gm.phaseTimer,
        phaseEndTime: this.gm.phaseEndTime,
        liveRoundStartTime: this.gm.liveRoundStartTime,
        ctScore: this.gm.ctScore,
        tScore: this.gm.tScore,
        round: this.gm.currentRound,
        c4Planted: this.gm.c4Planted,
        c4Pos: this.gm.c4Pos,
        c4Site: this.gm.c4Site
      });
    };

    if (conn.open) {
      sendSync();
    } else {
      conn.on('open', sendSync);
    }

    conn.on('data', (data) => {
      this.handleHostReceivedPacket(conn, data);
    });

    conn.on('close', () => {
      const idx = this.connections.indexOf(conn);
      if (idx !== -1) this.connections.splice(idx, 1);
      if (conn.peer) {
        this.removeRemotePlayer(conn.peer);
        this.broadcast({ type: 'player_leave', peerId: conn.peer });
      }
    });
  }

  triggerRemoteShootVisuals(shooterId) {
    const p = this.remotePlayers[shooterId];
    if (p && p.rig) {
      if (p.rig.muzzleFlash) p.rig.muzzleFlash.visible = true;
      if (p.rig.muzzleLight) p.rig.muzzleLight.intensity = 2.5;
      if (p.rig.weapon) p.rig.weapon.position.z -= 0.12;
      setTimeout(() => {
        if (p.rig.muzzleFlash) p.rig.muzzleFlash.visible = false;
        if (p.rig.muzzleLight) p.rig.muzzleLight.intensity = 0;
      }, 65);
    }
  }

  handleHostReceivedPacket(senderConn, data) {
    if (data.type === 'player_update') {
      this.updateRemotePlayer(data.id, data);
      this.broadcast(data, senderConn);
    } else if (data.type === 'shoot') {
      // Play gunshot audio for host and trigger remote operator muzzle flash/recoil
      window.csAudio.playGunshot(data.weaponType || 'rifle', data.weaponId || 'ak47', data.isSilenced || false);
      this.triggerRemoteShootVisuals(data.shooterId);
      this.broadcast(data, senderConn);
    } else if (data.type === 'player_death') {
      this.gm.onEntityKilled(data.attacker, data.victim, data.weapon, data.isHeadshot, data.victimTeam);
      this.broadcast(data, senderConn);
    } else if (data.type === 'damage') {
      const isForHost = data.targetId === 'host' || 
                        (this.peer && data.targetId.toLowerCase() === this.peer.id.toLowerCase()) || 
                        (this.isHost && this.connections.length <= 1);
      if (isForHost) {
        this.gm.player.takeDamage(data.amount, data.attacker, data.weapon);
      } else {
        this.broadcast(data, null);
      }
    } else if (data.type === 'plant_c4') {
      this.gm.onC4Planted(data.pos, data.site);
      this.broadcast(data, senderConn);
    } else if (data.type === 'defuse_c4') {
      this.gm.onC4Defused();
      this.broadcast(data, senderConn);
    }
  }

  handleClientReceivedPacket(data) {
    if (data.type === 'player_leave') {
      this.removeRemotePlayer(data.peerId);
    } else if (data.type === 'player_update') {
      this.updateRemotePlayer(data.id, data);
    } else if (data.type === 'shoot') {
      window.csAudio.playGunshot(data.weaponType || 'rifle', data.weaponId || 'ak47', data.isSilenced || false);
      this.triggerRemoteShootVisuals(data.shooterId);
    } else if (data.type === 'player_death') {
      this.gm.onEntityKilled(data.attacker, data.victim, data.weapon, data.isHeadshot, data.victimTeam);
    } else if (data.type === 'damage') {
      const isForClient = !data.targetId || 
                          data.targetId === 'client' || 
                          (this.peer && data.targetId.toLowerCase() === this.peer.id.toLowerCase()) || 
                          (!this.isHost);
      if (isForClient) {
        this.gm.player.takeDamage(data.amount, data.attacker, data.weapon);
      }
    } else if (data.type === 'plant_c4') {
      this.gm.onC4Planted(data.pos, data.site);
    } else if (data.type === 'defuse_c4') {
      this.gm.onC4Defused();
    } else if (data.type === 'timer_sync') {
      this.gm.phase = data.phase;
      this.gm.phaseEndTime = data.phaseEndTime;
      this.gm.liveRoundStartTime = data.liveRoundStartTime;
      this.gm.ctScore = data.ctScore;
      this.gm.tScore = data.tScore;
      this.gm.currentRound = data.round;
      if (data.phase === 'live' && this.gm.player.health.get() <= 0 && !this.gm.player.isSpectating) {
        this.gm.player.enterSpectatorMode();
      }
    } else if (data.type === 'match_sync') {
      // Sync match state from host
      this.gm.phase = data.phase;
      this.gm.phaseTimer = data.phaseTimer;
      if (data.phaseEndTime) this.gm.phaseEndTime = data.phaseEndTime;
      if (data.liveRoundStartTime) this.gm.liveRoundStartTime = data.liveRoundStartTime;
      this.gm.ctScore = data.ctScore;
      this.gm.tScore = data.tScore;
      this.gm.currentRound = data.round;
      if (data.c4Planted && data.c4Pos) {
        this.gm.onC4Planted(data.c4Pos, data.c4Site);
      }
      // If round is currently LIVE, mid-round joining player MUST enter spectator mode until next round!
      if (data.phase === 'live') {
        this.gm.player.enterSpectatorMode();
      }
    } else if (data.type === 'round_start') {
      this.gm.currentRound = data.round;
      if (this.gm.player.isSpectating) {
        this.gm.player.exitSpectatorMode();
      }
      this.gm.startRound();
      if (data.phaseEndTime) {
        this.gm.phaseEndTime = data.phaseEndTime;
      }
    } else if (data.type === 'round_end') {
      this.gm.endRound(data.winner, data.reason);
    }
  }

  broadcast(data, excludeConn = null) {
    for (let i = 0; i < this.connections.length; i++) {
      const conn = this.connections[i];
      if (conn !== excludeConn && conn.open) {
        conn.send(data);
      }
    }
  }

  sendShoot(weaponType, weaponId, isSilenced, pos) {
    const packet = {
      type: 'shoot',
      shooterId: this.peer ? this.peer.id : 'local',
      weaponType: weaponType,
      weaponId: weaponId,
      isSilenced: isSilenced,
      pos: pos
    };
    if (this.isHost) {
      this.broadcast(packet, null);
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(packet);
    }
  }

  sendDeath(attacker, victim, weapon, isHeadshot, victimTeam) {
    const packet = {
      type: 'player_death',
      attacker: attacker,
      victim: victim,
      weapon: weapon,
      isHeadshot: isHeadshot,
      victimTeam: victimTeam
    };
    if (this.isHost) {
      this.broadcast(packet, null);
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(packet);
    }
  }

  sendDamage(targetId, amount, weapon, isHeadshot = false) {
    const packet = {
      type: 'damage',
      targetId: targetId,
      attacker: this.peer ? this.peer.id : 'Player',
      amount: amount,
      weapon: weapon,
      isHeadshot: isHeadshot
    };
    if (this.isHost) {
      this.broadcast(packet, null);
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(packet);
    }
  }

  sendPlayerState(player) {
    if (!this.isConnected || !this.peer) return;

    const inMatch = this.gm.playerInMatch !== false && this.gm.phase !== 'unselected';

    const callsign = player.name || window.cs2PlayerCallsign || (player.team === 'CT' ? 'SAS OPERATOR' : 'PHOENIX CELL');

    const packet = {
      type: 'player_update',
      id: this.peer.id,
      name: callsign,
      team: player.team,
      pos: { x: player.position.x, y: player.position.y, z: player.position.z },
      yaw: player.yaw,
      pitch: player.pitch,
      health: player.health.get(),
      weapon: player.activeWeapon ? player.activeWeapon.id : 'knife',
      hasC4: !!player.inventory[5],
      isCrouched: player.isCrouched,
      inMatch: inMatch
    };

    if (this.isHost) {
      this.broadcast(packet, null);
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(packet);
    }
  }

  createTacticalCharacterModel(team) {
    const group = new THREE.Group();

    // 1. Full-Body Hitbox Cylinder for authentic hit detection
    const hitboxGeo = new THREE.CylinderGeometry(0.52, 0.52, 2.0, 12);
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
    ctx.fillText('OPERATOR', 128, 44);
    const nameTex = new THREE.CanvasTexture(nameCanvas);
    const namePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.35),
      new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, side: THREE.DoubleSide })
    );
    namePlane.position.set(0, 2.15, 0);
    group.add(namePlane);
    group.nameTagMesh = namePlane;
    group.nameCanvas = nameCanvas;

    // 3. Attach authentic CS character mesh (CT = SAS agent, T = Phoenix agent)
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
    if (!id) return;
    const p = this.remotePlayers[id];
    if (p) {
      if (p.mesh && this.gm && this.gm.scene) {
        this.gm.scene.remove(p.mesh);
        p.mesh.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        });
      }
      delete this.remotePlayers[id];
    }
  }

  clearAllRemotePlayers() {
    Object.keys(this.remotePlayers).forEach(id => {
      this.removeRemotePlayer(id);
    });
    this.remotePlayers = {};
  }

  cleanupStalePlayers() {
    const now = performance.now();
    Object.keys(this.remotePlayers).forEach(id => {
      const p = this.remotePlayers[id];
      if (p && p.lastSeen && (now - p.lastSeen > 3500)) {
        this.removeRemotePlayer(id);
      }
    });
  }

  updateRemotePlayer(id, data) {
    this.cleanupStalePlayers();
    if (!this.remotePlayers[id]) {
      const model = this.createTacticalCharacterModel(data.team);
      this.gm.scene.add(model);
      this.remotePlayers[id] = {
        mesh: model,
        rig: model.rig,
        data: data,
        team: data.team,
        name: data.name || `Operator_${id.substring(0, 5)}`,
        pos: data.pos,
        lastPos: null,
        walkCycle: 0,
        lastStepTime: 0
      };
    }

    const p = this.remotePlayers[id];
    if (data.name && data.name !== p.name) {
      p.name = data.name;
      if (p.mesh && p.mesh.nameCanvas && p.mesh.nameTagMesh) {
        const ctx = p.mesh.nameCanvas.getContext('2d');
        ctx.clearRect(0, 0, 256, 64);
        ctx.fillStyle = (data.team === 'CT') ? '#44aaff' : '#ffaa33';
        ctx.font = 'bold 36px Rajdhani, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(data.name, 128, 44);
        if (p.mesh.nameTagMesh.material.map) p.mesh.nameTagMesh.material.map.needsUpdate = true;
      }
    }
    p.data = data;
    p.pos = data.pos;
    p.team = data.team;
    p.mesh.position.set(data.pos.x, data.pos.y - 1.75, data.pos.z);
    p.mesh.rotation.y = data.yaw; // Operator faces forward towards their look direction
    p.mesh.visible = (data.inMatch !== false && data.health > 0);
    p.lastSeen = performance.now();

    const now = performance.now();
    const dt = p.lastTime ? Math.max(0.001, Math.min(0.1, (now - p.lastTime) / 1000)) : 0.016;
    p.lastTime = now;

    // Movement & Footstep Audio Sync for remote operators
    if (p.lastPos) {
      const distMoved = Math.hypot(data.pos.x - p.lastPos.x, data.pos.z - p.lastPos.z);
      if (distMoved > 0.10 && now - p.lastStepTime > 340) {
        p.lastStepTime = now;
        window.csAudio.playFootstep();
      }
    }

    if (p.rig) {
      // Stance: Crouch vs Standing
      if (data.isCrouched) {
        p.rig.torso.position.y = 0.72;
        p.rig.leftLeg.position.y = 0.72;
        p.rig.rightLeg.position.y = 0.72;
      } else {
        p.rig.torso.position.y = 0.95;
        p.rig.leftLeg.position.y = 0.90;
        p.rig.rightLeg.position.y = 0.90;
      }

      // 1. Aim Pitch
      if (data.pitch !== undefined) {
        p.rig.torso.rotation.x = Math.max(-0.6, Math.min(0.6, -data.pitch));
      }

      // 2. Movement & Leg Animation
      if (p.lastPos) {
        const distMoved = Math.hypot(data.pos.x - p.lastPos.x, data.pos.z - p.lastPos.z);

        if (distMoved > 0.005) {
          p.walkCycle += distMoved * 4.2;
          p.rig.leftLeg.rotation.x = Math.sin(p.walkCycle) * 0.65;
          p.rig.rightLeg.rotation.x = -Math.sin(p.walkCycle) * 0.65;
          p.rig.torso.position.y = 0.95 + Math.abs(Math.sin(p.walkCycle * 2)) * 0.04;

          if (distMoved > 0.10 && now - p.lastStepTime > 340) {
            p.lastStepTime = now;
            window.csAudio.playFootstep();
          }
        } else {
          // Idle breathing pose
          p.rig.leftLeg.rotation.x *= 0.82;
          p.rig.rightLeg.rotation.x *= 0.82;
          p.rig.torso.position.y = 0.95 + Math.sin(now * 0.003) * 0.012;
        }

        // Airborne jumping pose
        if (Math.abs(data.pos.y - p.lastPos.y) > 0.08) {
          p.rig.leftLeg.rotation.x = -0.32;
          p.rig.rightLeg.rotation.x = -0.22;
        }
      }

      // 3. Gun recoil recovery
      if (p.rig.weapon.position.z < 0.38) {
        p.rig.weapon.position.z += (0.38 - p.rig.weapon.position.z) * 0.25;
      }
    }

    p.lastPos = { x: data.pos.x, y: data.pos.y, z: data.pos.z };
  }
}

window.CS2NetworkManager = CS2NetworkManager;
