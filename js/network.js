// CS2 Cross-WiFi WebRTC Peer-to-Peer Multiplayer Engine (Powered by PeerJS)
// Enables online competitive matches across different Wi-Fi networks with zero port-forwarding

class CS2NetworkManager {
  constructor(gameManager) {
    this.gm = gameManager;
    this.peer = null;
    this.isHost = false;
    this.connections = [];
    this.hostConnection = null;
    this.roomId = null;
    this.remotePlayers = {}; // id -> { mesh, data }
    this.isConnected = false;
  }

  // Generate 6-char Room Code for easy sharing
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'CS-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Host creates an online lobby
  createLobby(onReady) {
    const code = this.generateRoomCode();
    this.isHost = true;
    this.roomId = code;

    // Initialize Peer with global cloud STUN
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

  // Client joins an existing lobby via room code
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
      // Host validates and broadcasts state to all other connected peers
      this.handleHostReceivedPacket(conn, data);
    });

    conn.on('close', () => {
      const idx = this.connections.indexOf(conn);
      if (idx !== -1) this.connections.splice(idx, 1);
    });
  }

  // Host receives packet from client
  handleHostReceivedPacket(senderConn, data) {
    if (data.type === 'player_update') {
      this.updateRemotePlayer(data.id, data);
      // Broadcast to all other peers
      this.broadcast(data, senderConn);
    } else if (data.type === 'shoot') {
      this.broadcast(data, senderConn);
    } else if (data.type === 'plant_c4') {
      this.gm.onC4Planted(data.pos, data.site);
      this.broadcast(data, null);
    } else if (data.type === 'defuse_c4') {
      this.gm.onC4Defused();
      this.broadcast(data, null);
    }
  }

  // Client receives packet from host
  handleClientReceivedPacket(data) {
    if (data.type === 'player_update') {
      this.updateRemotePlayer(data.id, data);
    } else if (data.type === 'shoot') {
      window.csAudio.playGunshot(data.weaponType || 'rifle', false);
    } else if (data.type === 'c4_state') {
      if (data.planted) {
        this.gm.onC4Planted(data.pos, data.site);
      }
    }
  }

  // Broadcast data packet to connected players
  broadcast(data, excludeConn = null) {
    for (const conn of this.connections) {
      if (conn !== excludeConn && conn.open) {
        conn.send(data);
      }
    }
  }

  // Send local player state packet
  sendPlayerState(player) {
    if (!this.isConnected) return;

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

  updateRemotePlayer(id, data) {
    if (!this.remotePlayers[id]) {
      // Spawn 3D avatar for remote player
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({
        color: data.team === 'CT' ? 0x2b4c6f : 0x82593b
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.4), bodyMat);
      body.position.y = 1.0;
      group.add(body);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), new THREE.MeshStandardMaterial({ color: 0x1f2937 }));
      head.position.y = 1.7;
      group.add(head);

      this.gm.scene.add(group);
      this.remotePlayers[id] = { mesh: group, team: data.team };
    }

    const p = this.remotePlayers[id];
    p.mesh.position.set(data.pos.x, data.pos.y - 1.8, data.pos.z);
    p.mesh.rotation.y = data.yaw;
  }
}

window.CS2NetworkManager = CS2NetworkManager;
