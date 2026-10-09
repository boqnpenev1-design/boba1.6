// CS2 WebRTC Multiplayer Engine with 3D Tactical Operator Models and Hit Sync

class CS2NetworkManager {
  constructor(gameManager) {
    this.gm = gameManager;
    this.peer = null;
    this.isHost = false;
    this.connections = [];
    this.hostConnection = null;
    this.roomId = null;
    this.remotePlayers = {}; // id -> { mesh, data, team, pos }
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

    this.peer.on('open', (id) => {
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
      this.broadcast(data, senderConn);
    } else if (data.type === 'damage') {
      if (data.targetId === 'host') {
        this.gm.player.takeDamage(data.amount, data.attacker, data.weapon);
      } else {
        this.broadcast(data, null);
      }
    } else if (data.type === 'plant_c4') {
      this.gm.onC4Planted(data.pos, data.site);
      this.broadcast(data, null);
    } else if (data.type === 'defuse_c4') {
      this.gm.onC4Defused();
      this.broadcast(data, null);
    }
  }

  handleClientReceivedPacket(data) {
    if (data.type === 'player_update') {
      this.updateRemotePlayer(data.id, data);
    } else if (data.type === 'shoot') {
      window.csAudio.playGunshot(data.weaponType || 'rifle', data.weaponId || 'ak47', false);
    } else if (data.type === 'damage' && data.targetId === this.peer.id) {
      this.gm.player.takeDamage(data.amount, data.attacker, data.weapon);
    } else if (data.type === 'c4_state' && data.planted) {
      this.gm.onC4Planted(data.pos, data.site);
    }
  }

  broadcast(data, excludeConn = null) {
    for (const conn of this.connections) {
      if (conn !== excludeConn && conn.open) {
        conn.send(data);
      }
    }
  }

  sendDamage(targetId, amount, weapon) {
    const packet = {
      type: 'damage',
      targetId: targetId,
      attacker: 'Player',
      amount: amount,
      weapon: weapon
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

  // Creates detailed 3D tactical player model for connected human players
  createTacticalCharacterModel(team) {
    const group = new THREE.Group();

    // Legs
    const legGeo = new THREE.BoxGeometry(0.24, 0.9, 0.24);
    const pantsMat = new THREE.MeshStandardMaterial({
      color: team === 'CT' ? 0x1f2937 : 0x4a3c2c,
      roughness: 0.8
    });
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.16, 0.45, 0);
    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.16, 0.45, 0);
    group.add(leftLeg);
    group.add(rightLeg);

    // Torso with Tactical Vest
    const torsoGeo = new THREE.BoxGeometry(0.55, 0.75, 0.32);
    const torsoMat = new THREE.MeshStandardMaterial({
      color: team === 'CT' ? 0x243242 : 0x7a5b3a,
      roughness: 0.7
    });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.25;
    torso.castShadow = true;
    group.add(torso);

    // Kevlar Chest Rig
    const vestGeo = new THREE.BoxGeometry(0.58, 0.5, 0.36);
    const vestMat = new THREE.MeshStandardMaterial({
      color: team === 'CT' ? 0x12171e : 0x2d3229,
      roughness: 0.9
    });
    const vest = new THREE.Mesh(vestGeo, vestMat);
    vest.position.y = 1.32;
    group.add(vest);

    // Head with Tactical Helmet / Balaclava
    const headGeo = new THREE.BoxGeometry(0.32, 0.35, 0.32);
    const headMat = new THREE.MeshStandardMaterial({
      color: team === 'CT' ? 0x1e2733 : 0x9e7b56,
      roughness: 0.6
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.78;
    head.castShadow = true;
    group.add(head);

    // Goggles / Visor
    const visorGeo = new THREE.BoxGeometry(0.26, 0.1, 0.08);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.8, -0.17);
    group.add(visor);

    // Weapon in hand
    const weaponGeo = new THREE.BoxGeometry(0.08, 0.12, 0.6);
    const weaponMat = new THREE.MeshStandardMaterial({
      color: team === 'CT' ? 0x22262c : 0x5a3219,
      metalness: 0.8
    });
    const gun = new THREE.Mesh(weaponGeo, weaponMat);
    gun.position.set(0.24, 1.2, -0.35);
    group.add(gun);

    return group;
  }

  updateRemotePlayer(id, data) {
    if (!this.remotePlayers[id]) {
      const model = this.createTacticalCharacterModel(data.team);
      this.gm.scene.add(model);
      this.remotePlayers[id] = {
        mesh: model,
        team: data.team,
        pos: data.pos
      };

      // If SAS model is available for CT, attempt asynchronous upgrade
      if (data.team === 'CT' && this.gltfLoader) {
        this.gltfLoader.load('source/sas_blue.glb', (gltf) => {
          const sas = gltf.scene;
          sas.scale.set(0.018, 0.018, 0.018);
          sas.position.set(0, 0, 0);
          while (model.children.length > 0) {
            model.remove(model.children[0]);
          }
          model.add(sas);
        }, undefined, () => {});
      }
    }

    const p = this.remotePlayers[id];
    p.pos = data.pos;
    p.team = data.team;
    p.mesh.position.set(data.pos.x, data.pos.y - 1.8, data.pos.z);
    p.mesh.rotation.y = data.yaw;
    p.mesh.visible = data.health > 0;
  }
}

window.CS2NetworkManager = CS2NetworkManager;
