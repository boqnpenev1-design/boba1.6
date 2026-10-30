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
      });
    });

    this.peer.on('error', (err) => {
      if (onError) onError(err);
    });
  }

  setupHostConnectionHandlers(conn) {
    conn.on('data', (data) => {
      this.handleHostReceivedPacket(conn, data);
    });

    conn.on('close', () => {
      const idx = this.connections.indexOf(conn);
      if (idx !== -1) this.connections.splice(idx, 1);
    });
  }

  handleHostReceivedPacket(senderConn, data) {
    if (data.type === 'player_update') {
      this.updateRemotePlayer(data.id, data);
      this.broadcast(data, senderConn);
    } else if (data.type === 'shoot') {
      // Play gunshot audio for host!
      window.csAudio.playGunshot(data.weaponType || 'rifle', data.weaponId || 'ak47', data.isSilenced || false);
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
    if (data.type === 'player_update') {
      this.updateRemotePlayer(data.id, data);
    } else if (data.type === 'shoot') {
      window.csAudio.playGunshot(data.weaponType || 'rifle', data.weaponId || 'ak47', data.isSilenced || false);
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
      // If round is currently LIVE, joining player spectates until next round
      if (data.phase === 'live') {
        this.gm.player.enterSpectatorMode();
      }
    } else if (data.type === 'round_start') {
      this.gm.currentRound = data.round;
      this.gm.startRound();
      if (data.phaseEndTime) {
        this.gm.phaseEndTime = data.phaseEndTime;
      }
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

    const packet = {
      type: 'player_update',
      id: this.peer.id,
      team: player.team,
      pos: { x: player.position.x, y: player.position.y, z: player.position.z },
      yaw: player.yaw,
      pitch: player.pitch,
      health: player.health.get(),
      weapon: player.activeWeapon ? player.activeWeapon.id : 'knife'
    };

    if (this.isHost) {
      this.broadcast(packet, null);
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(packet);
    }
  }

  createTacticalCharacterModel(team) {
    const group = new THREE.Group();

    // 1. Full-Body Hitbox Cylinder (Covers head to feet for 100% reliable bullet hits)
    const hitboxGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.85, 12);
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
    hitbox.position.y = 0.925;
    hitbox.name = 'hitbox';
    group.add(hitbox);

    const modelHolder = new THREE.Group();
    group.add(modelHolder);

    const applyModel = (sourceScene) => {
      const charModel = sourceScene.clone(true);
      charModel.scale.set(0.95, 0.95, 0.95);
      charModel.position.set(0, 0, 0);

      if (team === 'T') {
        // Authentic Phoenix Terrorist Uniform Palette
        charModel.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.color.setHex(0x7a6348); // Desert Tan / Olive
          }
        });
      }

      while (modelHolder.children.length > 0) {
        modelHolder.remove(modelHolder.children[0]);
      }
      modelHolder.add(charModel);
    };

    if (this.cachedSASModel) {
      applyModel(this.cachedSASModel);
    } else if (this.gltfLoader) {
      this.gltfLoader.load('source/sas_blue.glb', (gltf) => {
        this.cachedSASModel = gltf.scene;
        applyModel(gltf.scene);
      }, undefined, () => {
        // Fallback procedural tactical figure if GLB fails to load
        const fallback = this.createFallbackModel(team);
        modelHolder.add(fallback);
      });
    }

    return group;
  }

  createFallbackModel(team) {
    const fGroup = new THREE.Group();
    const pantsMat = new THREE.MeshLambertMaterial({ color: team === 'CT' ? 0x1a2634 : 0x3a4032 });
    const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.9, 8), pantsMat);
    leftLeg.position.set(-0.16, 0.45, 0);
    const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.9, 8), pantsMat);
    rightLeg.position.set(0.16, 0.45, 0);
    fGroup.add(leftLeg);
    fGroup.add(rightLeg);

    const torsoMat = new THREE.MeshLambertMaterial({ color: team === 'CT' ? 0x22364c : 0x7a6348 });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.75, 8), torsoMat);
    torso.position.y = 1.25;
    fGroup.add(torso);

    const headMat = new THREE.MeshLambertMaterial({ color: team === 'CT' ? 0x1c2530 : 0x232420 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), headMat);
    head.position.y = 1.78;
    fGroup.add(head);

    return fGroup;
  }

  updateRemotePlayer(id, data) {
    if (!this.remotePlayers[id]) {
      const model = this.createTacticalCharacterModel(data.team);
      this.gm.scene.add(model);
      this.remotePlayers[id] = {
        mesh: model,
        data: data,
        team: data.team,
        pos: data.pos,
        lastPos: null,
        lastStepTime: 0
      };
    }

    const p = this.remotePlayers[id];
    p.data = data;
    p.pos = data.pos;
    p.team = data.team;
    p.mesh.position.set(data.pos.x, data.pos.y - 1.8, data.pos.z);
    p.mesh.rotation.y = data.yaw;
    p.mesh.visible = (data.health > 0);

    // Real-time remote footsteps audio sync
    const now = performance.now();
    if (p.lastPos) {
      const distMoved = Math.hypot(data.pos.x - p.lastPos.x, data.pos.z - p.lastPos.z);
      if (distMoved > 0.12 && now - p.lastStepTime > 340) {
        p.lastStepTime = now;
        window.csAudio.playFootstep();
      }
    }
    p.lastPos = { x: data.pos.x, y: data.pos.y, z: data.pos.z };
  }
}

window.CS2NetworkManager = CS2NetworkManager;
