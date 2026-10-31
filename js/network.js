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

    const packet = {
      type: 'player_update',
      id: this.peer.id,
      team: player.team,
      pos: { x: player.position.x, y: player.position.y, z: player.position.z },
      yaw: player.yaw,
      pitch: player.pitch,
      health: player.health.get(),
      weapon: player.activeWeapon ? player.activeWeapon.id : 'knife',
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

    // 1. Full-Body Hitbox Cylinder (Scaled for +20cm taller authentic player model)
    const hitboxGeo = new THREE.CylinderGeometry(0.58, 0.58, 2.55, 12);
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
    hitbox.position.y = 1.275;
    hitbox.name = 'hitbox';
    group.add(hitbox);

    // Scale character visual mesh by 1.12 (+20cm height from 1.80m to 2.02m)
    group.scale.set(1.45, 1.45, 1.45);

    const texLoader = new THREE.TextureLoader();

    // Palette & Textures
    const isCT = (team === 'CT');
    const pantsColor = isCT ? 0x182432 : 0x4a4235; // CT Navy vs Phoenix Tan/Brown cargo
    const shirtColor = isCT ? 0x1d2e42 : 0x6e5239; // CT SAS Jacket vs Phoenix Flight Jacket
    const vestColor  = isCT ? 0x141a22 : 0x362e24; // Kevlar tactical vest
    const bootColor  = 0x111317;

    const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
    const vestMat  = new THREE.MeshLambertMaterial({ color: vestColor });
    const bootMat  = new THREE.MeshLambertMaterial({ color: bootColor });
    const gloveMat = new THREE.MeshLambertMaterial({ color: 0x16181c });

    if (isCT) {
      texLoader.load('textures/armor_diffuse_color_psd_25fc1cb_2.png', (tex) => {
        vestMat.map = tex;
        vestMat.needsUpdate = true;
      }, undefined, () => {});
    }

    // Left Leg Anchor & Mesh
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.16, 0.90, 0);
    const lLegUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.45, 6), pantsMat);
    lLegUpper.position.y = -0.225;
    leftLegGroup.add(lLegUpper);
    const lLegLower = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.45, 6), pantsMat);
    lLegLower.position.y = -0.65;
    leftLegGroup.add(lLegLower);
    const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.22), bootMat);
    lBoot.position.set(0, -0.84, 0.04);
    leftLegGroup.add(lBoot);
    group.add(leftLegGroup);

    // Right Leg Anchor & Mesh
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.16, 0.90, 0);
    const rLegUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.45, 6), pantsMat);
    rLegUpper.position.y = -0.225;
    rightLegGroup.add(rLegUpper);
    const rLegLower = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.45, 6), pantsMat);
    rLegLower.position.y = -0.65;
    rightLegGroup.add(rLegLower);
    const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.22), bootMat);
    rBoot.position.set(0, -0.84, 0.04);
    rightLegGroup.add(rBoot);
    group.add(rightLegGroup);

    // Torso Group (Hips anchor at Y=0.95, pivots for pitch aiming)
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.95, 0);

    // Combat Shirt / Jacket Torso
    const torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 0.62, 6), shirtMat);
    torsoMesh.position.y = 0.31;
    torsoGroup.add(torsoMesh);

    // Kevlar Tactical Assault Vest
    const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.48, 0.32), vestMat);
    vestMesh.position.y = 0.33;
    torsoGroup.add(vestMesh);

    // Molle / Ammo pouches on vest
    const pouchColor = isCT ? 0x1c242c : 0x7c6448;
    const pouchMat = new THREE.MeshLambertMaterial({ color: pouchColor });
    for (let pIdx = -1; pIdx <= 1; pIdx++) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.08), pouchMat);
      pouch.position.set(pIdx * 0.12, 0.22, 0.18);
      torsoGroup.add(pouch);
    }

    // Head & Helmet / Balaclava
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.68, 0);

    if (isCT) {
      // SAS CT: Tactical Balaclava & Ballistic Helmet with Visor
      const maskMat = new THREE.MeshLambertMaterial({ color: 0x161c24 });
      const mask = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), maskMat);
      headGroup.add(mask);

      const helmetMat = new THREE.MeshLambertMaterial({ color: 0x1f2936 });
      texLoader.load('textures/helmet_diffuse_color_psd_aaf82f80_5.png', (tex) => {
        helmetMat.map = tex;
        helmetMat.needsUpdate = true;
      }, undefined, () => {});
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), helmetMat);
      helmet.scale.set(1.05, 0.95, 1.1);
      helmet.position.set(0, 0.05, -0.02);
      headGroup.add(helmet);

      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.10), new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.1, metalness: 0.8 }));
      visor.position.set(0, 0.02, 0.13);
      headGroup.add(visor);
    } else {
      // Phoenix Connexion Terrorist: Desert Off-White Balaclava
      const maskMat = new THREE.MeshLambertMaterial({ color: 0xd6cbb8 });
      const mask = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), maskMat);
      headGroup.add(mask);

      const eyeSlit = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.06), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      eyeSlit.position.set(0, 0.03, 0.145);
      headGroup.add(eyeSlit);

      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.12, 8), new THREE.MeshLambertMaterial({ color: 0x483a2a }));
      collar.position.set(0, -0.10, 0);
      headGroup.add(collar);
    }
    torsoGroup.add(headGroup);

    // Left Arm Group
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.28, 0.50, 0);
    const lUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.32, 6), shirtMat);
    lUpperArm.position.set(0.06, -0.12, 0.08);
    lUpperArm.rotation.set(Math.PI / 4, 0, -0.2);
    leftArmGroup.add(lUpperArm);
    const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 6), shirtMat);
    lForearm.position.set(0.14, -0.20, 0.26);
    lForearm.rotation.set(Math.PI / 3, 0, -0.5);
    leftArmGroup.add(lForearm);
    const lGlove = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.08), gloveMat);
    lGlove.position.set(0.20, -0.24, 0.38);
    leftArmGroup.add(lGlove);
    torsoGroup.add(leftArmGroup);

    // Right Arm Group
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.28, 0.50, 0);
    const rUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.32, 6), shirtMat);
    rUpperArm.position.set(-0.06, -0.12, 0.08);
    rUpperArm.rotation.set(Math.PI / 4, 0, 0.2);
    rightArmGroup.add(rUpperArm);
    const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 6), shirtMat);
    rForearm.position.set(-0.08, -0.20, 0.26);
    rForearm.rotation.set(Math.PI / 3.5, 0, 0.35);
    rightArmGroup.add(rForearm);
    const rGlove = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.08), gloveMat);
    rGlove.position.set(-0.10, -0.24, 0.38);
    rightArmGroup.add(rGlove);
    torsoGroup.add(rightArmGroup);

    // Operator Weapon Model (Real FBX mesh if available, else textured box)
    const weaponGroup = new THREE.Group();
    weaponGroup.position.set(0.08, 0.28, 0.38);

    // Try to use real FBX mesh from player's weapon cache
    let usedRealModel = false;
    if (window.csGameManager && window.csGameManager.player &&
        window.csGameManager.player.weaponModelsLoaded &&
        window.csGameManager.player.weaponMeshCache) {
      const meshName = isCT ? 'w_rif_m4a1' : 'w_rif_ak47';
      const cached = window.csGameManager.player.weaponMeshCache[meshName];
      if (cached) {
        const clone = cached.clone(true);
        const texFile = isCT ? 'w_rif_m4a1.png' : 'w_rif_ak47.png';
        const tex = new THREE.TextureLoader().load('models/' + texFile);
        clone.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
          }
        });
        if (clone.isMesh) {
          clone.material = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
        }
        clone.scale.set(0.0018, 0.0018, 0.0018);
        clone.rotation.y = Math.PI;
        weaponGroup.add(clone);
        usedRealModel = true;
      }
    }

    if (!usedRealModel) {
      const weaponTex = isCT ? texLoader.load('models/w_rif_m4a1.png') : texLoader.load('models/w_rif_ak47.png');
      const gunMat = new THREE.MeshLambertMaterial({ map: weaponTex });

      const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.55), gunMat);
      weaponGroup.add(gunBody);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.35, 6), gunMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, 0.38);
      weaponGroup.add(barrel);

      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.26), gunMat);
      stock.position.set(0, -0.04, -0.32);
      weaponGroup.add(stock);

      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.20, 0.08), gunMat);
      mag.rotation.x = -0.3;
      mag.position.set(0, -0.12, 0.08);
      weaponGroup.add(mag);
    }

    // Muzzle Flash Mesh & Light
    const flashGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
    const muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    muzzleFlash.position.set(0, 0.02, 0.58);
    muzzleFlash.visible = false;
    weaponGroup.add(muzzleFlash);

    const muzzleLight = new THREE.PointLight(0xffaa22, 0, 8);
    muzzleLight.position.set(0, 0.02, 0.58);
    weaponGroup.add(muzzleLight);

    torsoGroup.add(weaponGroup);
    group.add(torsoGroup);

    group.rig = {
      leftLeg: leftLegGroup,
      rightLeg: rightLegGroup,
      torso: torsoGroup,
      head: headGroup,
      leftArm: leftArmGroup,
      rightArm: rightArmGroup,
      weapon: weaponGroup,
      muzzleFlash: muzzleFlash,
      muzzleLight: muzzleLight
    };

    return group;
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
        pos: data.pos,
        lastPos: null,
        walkCycle: 0,
        lastStepTime: 0
      };
    }

    const p = this.remotePlayers[id];
    p.data = data;
    p.pos = data.pos;
    p.team = data.team;
    p.mesh.position.set(data.pos.x, data.pos.y - 2.0, data.pos.z);
    p.mesh.rotation.y = data.yaw + Math.PI; // Correct 180deg alignment so operator faces where they are looking
    p.mesh.visible = (data.inMatch !== false && data.health > 0);
    p.lastSeen = performance.now();

    const now = performance.now();
    const dt = p.lastTime ? Math.max(0.001, Math.min(0.1, (now - p.lastTime) / 1000)) : 0.016;
    p.lastTime = now;

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
