// CS2 Map Geometry Engine: Dust II (de_dust2) & Mirage (de_mirage)
// Builds 3D maps using procedural materials, collision boundaries, and radar blueprints

class CS2MapBuilder {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.bombZones = [];
    this.spawnPoints = { CT: [], T: [] };
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
  }

  clear() {
    while (this.mapGroup.children.length > 0) {
      const obj = this.mapGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
      this.mapGroup.remove(obj);
    }
    this.colliders = [];
    this.bombZones = [];
    this.spawnPoints = { CT: [], T: [] };
  }

  // Generates procedural tile / sand / brick canvas textures
  createTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    if (type === 'dust_ground') {
      ctx.fillStyle = '#c2a373';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#b59463' : '#ceb284';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
    } else if (type === 'dust_wall') {
      ctx.fillStyle = '#bfa585';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#a68c6d';
      ctx.lineWidth = 3;
      for (let y = 0; y < 256; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
      }
    } else if (type === 'crate_wood') {
      ctx.fillStyle = '#8e613b';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#5a3b20';
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, 246, 246);
      ctx.beginPath();
      ctx.moveTo(10, 10);
      ctx.lineTo(246, 246);
      ctx.moveTo(246, 10);
      ctx.lineTo(10, 246);
      ctx.stroke();
    } else if (type === 'mirage_ground') {
      ctx.fillStyle = '#8c7664';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#6e5a4b';
      ctx.lineWidth = 2;
      for (let x = 0; x < 256; x += 32) {
        for (let y = 0; y < 256; y += 32) {
          ctx.strokeRect(x, y, 32, 32);
        }
      }
    } else if (type === 'mirage_wall') {
      ctx.fillStyle = '#cfb299';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#bca087';
      for (let i = 0; i < 50; i++) {
        ctx.fillRect(Math.random() * 240, Math.random() * 240, 16, 8);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  // Adds a solid wall / obstacle with physics bounding box
  addObstacle(x, y, z, w, h, d, mat, isClimbable = false) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mapGroup.add(mesh);

    const box = new THREE.Box3();
    box.setFromObject(mesh);
    this.colliders.push({ box, mesh, isClimbable, topY: y + h });
    return mesh;
  }

  // Adds holographic Bombsite A/B plant zone
  addBombsiteZone(id, x, z, radius = 7) {
    this.bombZones.push({ id, x, z, radius });

    // Glowing ground decal ring
    const ringGeo = new THREE.RingGeometry(radius - 0.5, radius, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(x, 0.05, z);
    this.mapGroup.add(ringMesh);

    // Pillar / Marker indicator
    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.3, 4, 16);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0xff9500,
      emissive: 0xff3b30,
      emissiveIntensity: 0.5
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(x, 2, z);
    this.mapGroup.add(pillar);
  }

  // ==============================================================
  // MAP 1: DE_DUST2
  // ==============================================================
  buildDust2() {
    this.clear();

    const groundTex = this.createTexture('dust_ground');
    groundTex.repeat.set(24, 24);
    const wallTex = this.createTexture('dust_wall');
    wallTex.repeat.set(4, 2);
    const crateTex = this.createTexture('crate_wood');

    const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.7 });

    // Main Floor
    const floorGeo = new THREE.PlaneGeometry(240, 240);
    const floor = new THREE.Mesh(floorGeo, groundMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.mapGroup.add(floor);

    // Perimeter Outer Walls
    this.addObstacle(0, 0, -110, 220, 12, 6, wallMat);  // North wall
    this.addObstacle(0, 0, 110, 220, 12, 6, wallMat);   // South wall
    this.addObstacle(-110, 0, 0, 6, 12, 220, wallMat);  // West wall
    this.addObstacle(110, 0, 0, 6, 12, 220, wallMat);   // East wall

    // ============ MID LANE ============
    // Mid Doors (Left & Right)
    this.addObstacle(-7, 0, 10, 6, 8, 2, wallMat);
    this.addObstacle(7, 0, 10, 6, 8, 2, wallMat);
    // Xbox crate at Mid / Catwalk intersection
    this.addObstacle(0, 0, -10, 4, 3.5, 4, crateMat, true);
    // Mid corridor walls
    this.addObstacle(-18, 0, 20, 4, 10, 60, wallMat);
    this.addObstacle(18, 0, 20, 4, 10, 60, wallMat);

    // ============ BOMBSITE A ============
    // Site A Platform
    this.addObstacle(50, 0, -60, 26, 2.5, 26, wallMat, true);
    // Crates on Site A
    this.addObstacle(44, 2.5, -55, 3.5, 3.5, 3.5, crateMat, true);
    this.addObstacle(56, 2.5, -65, 3.5, 3.5, 3.5, crateMat, true);
    // Goose wall
    this.addObstacle(50, 2.5, -73, 26, 6, 2, wallMat);
    // Long A Doors
    this.addObstacle(75, 0, 15, 25, 10, 4, wallMat);
    this.addObstacle(75, 0, -25, 4, 10, 50, wallMat);
    // Catwalk / Short A ramp wall
    this.addObstacle(25, 0, -45, 4, 8, 40, wallMat);

    // ============ BOMBSITE B ============
    // Site B Platform
    this.addObstacle(-60, 0, -50, 28, 2, 28, wallMat, true);
    // B Site Crates
    this.addObstacle(-55, 2, -45, 3.5, 3.5, 3.5, crateMat, true);
    this.addObstacle(-65, 2, -55, 3.5, 3.5, 3.5, crateMat, true);
    // B Doors & Window
    this.addObstacle(-40, 0, -40, 14, 10, 3, wallMat);
    this.addObstacle(-75, 0, -35, 3, 10, 20, wallMat);
    // Upper Tunnels to B
    this.addObstacle(-55, 0, 15, 3, 9, 50, wallMat);
    this.addObstacle(-75, 0, 15, 3, 9, 50, wallMat);

    // Bombsite Zones
    this.addBombsiteZone('A', 50, -60, 7.5);
    this.addBombsiteZone('B', -60, -50, 7.5);

    // Team Spawn Points
    this.spawnPoints.CT = [
      { x: 0, z: -85 },
      { x: -8, z: -85 },
      { x: 8, z: -85 },
      { x: -16, z: -85 },
      { x: 16, z: -85 }
    ];

    this.spawnPoints.T = [
      { x: 0, z: 85 },
      { x: -8, z: 85 },
      { x: 8, z: 85 },
      { x: -16, z: 85 },
      { x: 16, z: 85 }
    ];
  }

  // ==============================================================
  // MAP 2: DE_MIRAGE
  // ==============================================================
  buildMirage() {
    this.clear();

    const groundTex = this.createTexture('mirage_ground');
    groundTex.repeat.set(24, 24);
    const wallTex = this.createTexture('mirage_wall');
    wallTex.repeat.set(4, 2);
    const crateTex = this.createTexture('crate_wood');

    const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.7 });

    // Main Floor
    const floorGeo = new THREE.PlaneGeometry(240, 240);
    const floor = new THREE.Mesh(floorGeo, groundMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.mapGroup.add(floor);

    // Outer Walls
    this.addObstacle(0, 0, -115, 230, 14, 6, wallMat);
    this.addObstacle(0, 0, 115, 230, 14, 6, wallMat);
    this.addObstacle(-115, 0, 0, 6, 14, 230, wallMat);
    this.addObstacle(115, 0, 0, 6, 14, 230, wallMat);

    // ============ MID & SNIPER WINDOW ============
    // Mid Window / Sniper Nest
    this.addObstacle(0, 0, -35, 18, 7, 4, wallMat);
    // Connector from Mid to A
    this.addObstacle(16, 0, -20, 4, 8, 30, wallMat);
    // Catwalk from Mid to B
    this.addObstacle(-22, 0, -15, 4, 8, 35, wallMat);
    // Top Mid boxes
    this.addObstacle(0, 0, 25, 4, 3.5, 4, crateMat, true);

    // ============ BOMBSITE A ============
    // Tetris Crates
    this.addObstacle(40, 0, -25, 3.5, 3.5, 3.5, crateMat, true);
    this.addObstacle(44, 0, -25, 3.5, 3.5, 3.5, crateMat, true);
    // Triple Box
    this.addObstacle(50, 0, -45, 3.5, 3.5, 3.5, crateMat, true);
    // Ticket Booth (CT Stairs)
    this.addObstacle(25, 0, -60, 6, 5, 8, wallMat);
    // Palace Balcony
    this.addObstacle(65, 0, -15, 18, 4.5, 12, wallMat, true);
    this.addObstacle(75, 4.5, -15, 2, 6, 12, wallMat);
    // A Ramp walls
    this.addObstacle(55, 0, 10, 4, 9, 35, wallMat);

    // ============ BOMBSITE B ============
    // B Apartments / Apps
    this.addObstacle(-65, 0, 0, 16, 5, 45, wallMat, true);
    this.addObstacle(-74, 5, 0, 2, 6, 45, wallMat);
    // Van on B site
    this.addObstacle(-42, 0, -38, 5, 3, 9, crateMat, true);
    // Market / Kitchen Window and Doors
    this.addObstacle(-25, 0, -60, 25, 9, 4, wallMat);
    // Back site pillars
    this.addObstacle(-60, 0, -55, 4, 8, 4, wallMat);

    // Bombsite Zones
    this.addBombsiteZone('A', 48, -42, 7.5);
    this.addBombsiteZone('B', -48, -45, 7.5);

    // Team Spawn Points
    this.spawnPoints.CT = [
      { x: 0, z: -90 },
      { x: -10, z: -90 },
      { x: 10, z: -90 },
      { x: -20, z: -90 },
      { x: 20, z: -90 }
    ];

    this.spawnPoints.T = [
      { x: 0, z: 90 },
      { x: -10, z: 90 },
      { x: 10, z: 90 },
      { x: -20, z: 90 },
      { x: 20, z: 90 }
    ];
  }
}

window.CS2MapBuilder = CS2MapBuilder;
