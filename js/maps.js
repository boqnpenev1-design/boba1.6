// CS2 Authentic Map Engine: Dust II (de_dust2) & Mirage (de_mirage)
// Precise competitive CS layouts, accurate spawns, textures, and solid collision bounds

class CS2MapBuilder {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.bombZones = [];
    this.spawnPoints = { CT: [], T: [] };
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
    this.texLoader = new THREE.TextureLoader();
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

  loadOrGenTexture(path, type = 'sand') {
    // Canvas texture generator for instant 100% reliable offline/online rendering
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    if (type === 'sand_ground') {
      ctx.fillStyle = '#caa673';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 9000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#b89461' : '#dcba87';
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }
    } else if (type === 'sand_wall') {
      ctx.fillStyle = '#c7ab88';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#a88c68';
      ctx.lineWidth = 4;
      for (let y = 0; y < 512; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }
    } else if (type === 'wood_crate') {
      ctx.fillStyle = '#83542b';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#4a2f18';
      ctx.lineWidth = 14;
      ctx.strokeRect(8, 8, 496, 496);
      ctx.beginPath();
      ctx.moveTo(12, 12);
      ctx.lineTo(500, 500);
      ctx.moveTo(500, 12);
      ctx.lineTo(12, 500);
      ctx.stroke();
    } else if (type === 'metal_door') {
      ctx.fillStyle = '#424a54';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#2f353d';
      ctx.fillRect(16, 16, 480, 230);
      ctx.fillRect(16, 266, 480, 230);
      ctx.strokeStyle = '#606c7a';
      ctx.lineWidth = 6;
      ctx.strokeRect(16, 16, 480, 230);
      ctx.strokeRect(16, 266, 480, 230);
    } else if (type === 'mirage_cobble') {
      ctx.fillStyle = '#786858';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#514539';
      ctx.lineWidth = 4;
      for (let x = 0; x < 512; x += 32) {
        for (let y = 0; y < 512; y += 32) {
          ctx.fillStyle = (x + y) % 64 === 0 ? '#8a7765' : '#6b5c4d';
          ctx.fillRect(x + 2, y + 2, 28, 28);
          ctx.strokeRect(x, y, 32, 32);
        }
      }
    } else if (type === 'mirage_stucco') {
      ctx.fillStyle = '#dfc39e';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#ceae87';
      for (let i = 0; i < 4000; i++) {
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    // Try to load actual image if path exists
    if (path) {
      this.texLoader.load(path, (loadedTex) => {
        tex.image = loadedTex.image;
        tex.needsUpdate = true;
      }, undefined, () => {});
    }

    return tex;
  }

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

  addBombsiteZone(id, x, z, radius = 8.5) {
    this.bombZones.push({ id, x, z, radius });

    // Holographic glowing plant circle
    const ringGeo = new THREE.RingGeometry(radius - 0.6, radius, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3322,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(x, 0.08, z);
    this.mapGroup.add(ringMesh);

    // Site letter marker
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff2211';
    ctx.font = 'bold 96px Chakra Petch, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(id, 64, 64);
    const textTex = new THREE.CanvasTexture(canvas);

    const planeGeo = new THREE.PlaneGeometry(3.5, 3.5);
    const planeMat = new THREE.MeshBasicMaterial({ map: textTex, transparent: true });
    const textMesh = new THREE.Mesh(planeGeo, planeMat);
    textMesh.rotation.x = -Math.PI / 2;
    textMesh.position.set(x, 0.1, z);
    this.mapGroup.add(textMesh);
  }

  // ==============================================================
  // MAP 1: DE_DUST2 (Authentic CS2 Competitive Layout)
  // ==============================================================
  buildDust2() {
    this.clear();

    const groundTex = this.loadOrGenTexture('textures/de_dust2_material_5.png', 'sand_ground');
    groundTex.repeat.set(24, 24);
    const wallTex = this.loadOrGenTexture('textures/de_dust2_material_1.png', 'sand_wall');
    wallTex.repeat.set(4, 2);
    const crateTex = this.loadOrGenTexture('textures/de_dust2_material_2.png', 'wood_crate');
    const doorTex = this.loadOrGenTexture('textures/de_dust2_material_15.png', 'metal_door');

    const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.75 });
    const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.6 });

    // Main Ground
    const floorGeo = new THREE.PlaneGeometry(280, 280);
    const floor = new THREE.Mesh(floorGeo, groundMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.mapGroup.add(floor);

    // Outer Boundary Enclosures
    this.addObstacle(0, 0, -120, 260, 16, 6, wallMat);  // North (CT back)
    this.addObstacle(0, 0, 120, 260, 16, 6, wallMat);   // South (T back)
    this.addObstacle(-120, 0, 0, 6, 16, 260, wallMat);  // West (B outer)
    this.addObstacle(120, 0, 0, 6, 16, 260, wallMat);   // East (Long A outer)

    // ============ T SPAWN (South: Z ~ +90 to +110) ============
    // Elevated T spawn plateau
    this.addObstacle(0, 0, 102, 50, 1.5, 24, wallMat, true);
    // T spawn cover walls
    this.addObstacle(-28, 0, 100, 4, 10, 30, wallMat);
    this.addObstacle(28, 0, 100, 4, 10, 30, wallMat);

    // ============ MIDDLE LANE (Center: Z ~ -40 to +60) ============
    // Mid Corridor Walls (Left & Right)
    this.addObstacle(-16, 0, 30, 4, 10, 70, wallMat);
    this.addObstacle(16, 0, 30, 4, 10, 70, wallMat);
    // Mid Doors (Double metal doors with gap)
    this.addObstacle(-7, 0, -15, 6, 9, 2.5, doorMat);
    this.addObstacle(7, 0, -15, 6, 9, 2.5, doorMat);
    // Xbox Crate (Jump to Short Catwalk)
    this.addObstacle(0, 0, 12, 4.2, 3.6, 4.2, crateMat, true);

    // ============ CATWALK / SHORT A (Z ~ -20 to -60) ============
    // Short A walkway
    this.addObstacle(22, 0, -35, 6, 3.5, 45, wallMat, true);
    this.addObstacle(18, 3.5, -35, 2, 5, 45, wallMat);
    // Short A stairs to site
    this.addObstacle(28, 0, -58, 12, 3.0, 10, wallMat, true);

    // ============ BOMBSITE A (East / North-East: X ~ +50, Z ~ -60) ============
    // Raised A Platform
    this.addObstacle(52, 0, -60, 32, 2.5, 32, wallMat, true);
    // Goose Wall (Back of A)
    this.addObstacle(52, 2.5, -77, 34, 7, 3, wallMat);
    // A Site Crates (Default plant boxes & ninja)
    this.addObstacle(44, 2.5, -55, 3.8, 3.8, 3.8, crateMat, true);
    this.addObstacle(58, 2.5, -66, 3.8, 3.8, 3.8, crateMat, true);
    // Long A Cross wall & Ramp
    this.addObstacle(72, 0, -25, 4, 10, 50, wallMat);
    this.addObstacle(72, 0, 25, 4, 10, 50, wallMat);
    // Long Doors
    this.addObstacle(72, 0, 60, 20, 10, 4, doorMat);
    this.addObstacle(55, 0, 75, 4, 10, 25, wallMat);

    // ============ TUNNELS & BOMBSITE B (West / North-West) ============
    // Upper Tunnels (from T to B)
    this.addObstacle(-55, 0, 40, 4, 10, 60, wallMat);
    this.addObstacle(-75, 0, 40, 4, 10, 60, wallMat);
    // B Site Platform
    this.addObstacle(-62, 0, -50, 34, 2.0, 34, wallMat, true);
    // B Back Wall
    this.addObstacle(-62, 2.0, -68, 36, 8, 3, wallMat);
    // B Window & B Doors
    this.addObstacle(-42, 0, -42, 14, 10, 3, doorMat);
    this.addObstacle(-78, 0, -35, 3, 10, 25, wallMat);
    // B Site Crates (Double stack & big box)
    this.addObstacle(-58, 2.0, -44, 4.0, 4.0, 4.0, crateMat, true);
    this.addObstacle(-68, 2.0, -56, 4.0, 4.0, 4.0, crateMat, true);

    // ============ CT SPAWN (North: Z ~ -85 to -100) ============
    // Open CT spawn area below A ramp and between Mid/B
    this.addObstacle(-15, 0, -105, 35, 10, 4, wallMat);

    // Bombsite Plant Rings
    this.addBombsiteZone('A', 52, -60, 8.5);
    this.addBombsiteZone('B', -62, -50, 8.5);

    // Authentic CS Spawns:
    // T Spawn: South at Z ~ +98 facing North
    this.spawnPoints.T = [
      { x: 0, z: 98 },
      { x: -6, z: 98 },
      { x: 6, z: 98 },
      { x: -12, z: 98 },
      { x: 12, z: 98 }
    ];

    // CT Spawn: North at Z ~ -90 facing South
    this.spawnPoints.CT = [
      { x: -15, z: -90 },
      { x: -22, z: -90 },
      { x: -8, z: -90 },
      { x: -15, z: -84 },
      { x: -22, z: -84 }
    ];
  }

  // ==============================================================
  // MAP 2: DE_MIRAGE (Authentic Moroccan Layout)
  // ==============================================================
  buildMirage() {
    this.clear();

    const cobbleTex = this.loadOrGenTexture(null, 'mirage_cobble');
    cobbleTex.repeat.set(22, 22);
    const stuccoTex = this.loadOrGenTexture(null, 'mirage_stucco');
    stuccoTex.repeat.set(4, 3);
    const crateTex = this.loadOrGenTexture(null, 'wood_crate');

    const cobbleMat = new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.85 });
    const stuccoMat = new THREE.MeshStandardMaterial({ map: stuccoTex, roughness: 0.8 });
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.75 });

    // Main Ground
    const floorGeo = new THREE.PlaneGeometry(280, 280);
    const floor = new THREE.Mesh(floorGeo, cobbleMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.mapGroup.add(floor);

    // Outer Walls
    this.addObstacle(0, 0, -125, 260, 16, 6, stuccoMat);
    this.addObstacle(0, 0, 125, 260, 16, 6, stuccoMat);
    this.addObstacle(-125, 0, 0, 6, 16, 260, stuccoMat);
    this.addObstacle(125, 0, 0, 6, 16, 260, stuccoMat);

    // ============ T SPAWN (South: Z ~ +95 to +115) ============
    this.addObstacle(0, 0, 105, 40, 1.2, 20, stuccoMat, true);
    this.addObstacle(-24, 0, 105, 4, 10, 24, stuccoMat);
    this.addObstacle(24, 0, 105, 4, 10, 24, stuccoMat);

    // ============ MID & SNIPER WINDOW ============
    // Sniper Nest / Window Room (CT side of mid)
    this.addObstacle(0, 0, -32, 20, 7.5, 4, stuccoMat);
    // Window opening frame
    this.addObstacle(0, 2.8, -32, 8, 1.2, 4, stuccoMat, true);
    // Connector (Mid to A Site)
    this.addObstacle(16, 0, -18, 4, 9, 32, stuccoMat);
    // Catwalk (Mid to B Site)
    this.addObstacle(-22, 0, -15, 4, 9, 36, stuccoMat);
    // Top Mid Cover Boxes
    this.addObstacle(0, 0, 26, 4.0, 3.5, 4.0, crateMat, true);

    // ============ BOMBSITE A ============
    // A Ramp (from T side)
    this.addObstacle(56, 0, 20, 4, 10, 45, stuccoMat);
    // Palace Balcony (Interior high ground)
    this.addObstacle(66, 0, -15, 20, 4.2, 14, stuccoMat, true);
    this.addObstacle(76, 4.2, -15, 2, 6, 14, stuccoMat);
    // Tetris Crates
    this.addObstacle(40, 0, -26, 3.6, 3.6, 3.6, crateMat, true);
    this.addObstacle(44, 0, -26, 3.6, 3.6, 3.6, crateMat, true);
    // Triple Box on A Site
    this.addObstacle(48, 0, -48, 3.8, 3.8, 3.8, crateMat, true);
    this.addObstacle(52, 0, -48, 3.8, 3.8, 3.8, crateMat, true);
    // Ticket Booth & CT Stairs
    this.addObstacle(26, 0, -64, 7, 5.5, 8, stuccoMat);

    // ============ BOMBSITE B ============
    // B Apartments (Apps)
    this.addObstacle(-65, 0, 5, 18, 4.5, 50, stuccoMat, true);
    this.addObstacle(-75, 4.5, 5, 2, 6, 50, stuccoMat);
    // Van on B Site
    this.addObstacle(-44, 0, -38, 5, 3.2, 9, crateMat, true);
    // Kitchen / Market Window
    this.addObstacle(-26, 0, -62, 26, 9, 4, stuccoMat);
    // B Pillars & Back Site
    this.addObstacle(-62, 0, -58, 4, 8, 4, stuccoMat);

    // Bombsite Plant Rings
    this.addBombsiteZone('A', 46, -45, 8.5);
    this.addBombsiteZone('B', -50, -46, 8.5);

    // Authentic Mirage Spawns:
    // T Spawn: South at Z ~ +98
    this.spawnPoints.T = [
      { x: 0, z: 98 },
      { x: -6, z: 98 },
      { x: 6, z: 98 },
      { x: -12, z: 98 },
      { x: 12, z: 98 }
    ];

    // CT Spawn: North at Ticket booth Z ~ -90
    this.spawnPoints.CT = [
      { x: 30, z: -90 },
      { x: 38, z: -90 },
      { x: 22, z: -90 },
      { x: 30, z: -84 },
      { x: 38, z: -84 }
    ];
  }
}

window.CS2MapBuilder = CS2MapBuilder;
