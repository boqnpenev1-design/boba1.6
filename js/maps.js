// CS2 Authentic Map Engine: Dust II (de_dust2) & Mirage (de_mirage)
// Ultra-optimized for 144-240+ FPS: Fast Lambertian Shading, Texture Caching, O(1) Bounding Boxes

class CS2MapBuilder {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.bombZones = [];
    this.spawnPoints = { CT: [], T: [] };
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
    this.texLoader = new THREE.TextureLoader();

    if (!CS2MapBuilder.cachedTextures) {
      CS2MapBuilder.cachedTextures = {};
    }
  }

  clear() {
    while (this.mapGroup.children.length > 0) {
      const obj = this.mapGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      this.mapGroup.remove(obj);
    }
    this.colliders = [];
    this.bombZones = [];
    this.spawnPoints = { CT: [], T: [] };
  }

  loadOrGenTexture(path, type = 'sand') {
    if (CS2MapBuilder.cachedTextures[type]) {
      return CS2MapBuilder.cachedTextures[type];
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    if (type === 'sand_ground') {
      ctx.fillStyle = '#caa673';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#b89461' : '#dcba87';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
    } else if (type === 'sand_wall') {
      ctx.fillStyle = '#c7ab88';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#a88c68';
      ctx.lineWidth = 3;
      for (let y = 0; y < 256; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
      }
    } else if (type === 'wood_crate') {
      ctx.fillStyle = '#83542b';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#4a2f18';
      ctx.lineWidth = 10;
      ctx.strokeRect(4, 4, 248, 248);
      ctx.beginPath();
      ctx.moveTo(6, 6);
      ctx.lineTo(250, 250);
      ctx.moveTo(250, 6);
      ctx.lineTo(6, 250);
      ctx.stroke();
    } else if (type === 'metal_door') {
      ctx.fillStyle = '#424a54';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#2f353d';
      ctx.fillRect(8, 8, 240, 115);
      ctx.fillRect(8, 133, 240, 115);
      ctx.strokeStyle = '#606c7a';
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, 240, 115);
      ctx.strokeRect(8, 133, 240, 115);
    } else if (type === 'mirage_cobble') {
      ctx.fillStyle = '#786858';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#514539';
      ctx.lineWidth = 3;
      for (let x = 0; x < 256; x += 24) {
        for (let y = 0; y < 256; y += 24) {
          ctx.fillStyle = (x + y) % 48 === 0 ? '#8a7765' : '#6b5c4d';
          ctx.fillRect(x + 2, y + 2, 20, 20);
          ctx.strokeRect(x, y, 24, 24);
        }
      }
    } else if (type === 'mirage_stucco') {
      ctx.fillStyle = '#dfc39e';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#ceae87';
      for (let i = 0; i < 1500; i++) {
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;

    if (path) {
      this.texLoader.load(path, (loadedTex) => {
        tex.image = loadedTex.image;
        tex.needsUpdate = true;
      }, undefined, () => {});
    }

    CS2MapBuilder.cachedTextures[type] = tex;
    return tex;
  }

  addObstacle(x, y, z, w, h, d, mat, isClimbable = false) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + h / 2, z);
    this.mapGroup.add(mesh);

    // O(1) Fast AABB calculation without geometry scanning
    const halfW = w / 2;
    const halfD = d / 2;
    const box = {
      min: { x: x - halfW, y: y, z: z - halfD },
      max: { x: x + halfW, y: y + h, z: z + halfD }
    };
    this.colliders.push({ box, mesh, isClimbable, topY: y + h });
    return mesh;
  }

  addBombsiteZone(id, x, z, radius = 8.5) {
    this.bombZones.push({ id, x, z, radius });

    // Holographic glowing plant circle
    const ringGeo = new THREE.RingGeometry(radius - 0.6, radius, 32);
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

    // High performance Lambert materials (Gouraud shading - zero fragment PBR overhead)
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const crateMat = new THREE.MeshLambertMaterial({ map: crateTex });
    const doorMat = new THREE.MeshLambertMaterial({ map: doorTex });

    // Main Ground
    const floorGeo = new THREE.PlaneGeometry(280, 280);
    const floor = new THREE.Mesh(floorGeo, groundMat);
    floor.rotation.x = -Math.PI / 2;
    this.mapGroup.add(floor);

    // Outer Boundary Enclosures
    this.addObstacle(0, 0, -120, 260, 16, 6, wallMat);  // North (CT back)
    this.addObstacle(0, 0, 120, 260, 16, 6, wallMat);   // South (T back)
    this.addObstacle(-120, 0, 0, 6, 16, 260, wallMat);  // West (B outer)
    this.addObstacle(120, 0, 0, 6, 16, 260, wallMat);   // East (Long A outer)

    // ============ T SPAWN (South: Z ~ +90 to +110) ============
    this.addObstacle(0, 0, 102, 50, 1.5, 24, wallMat, true);
    this.addObstacle(-28, 0, 100, 4, 10, 30, wallMat);
    this.addObstacle(28, 0, 100, 4, 10, 30, wallMat);

    // ============ MIDDLE LANE (Center: Z ~ -40 to +60) ============
    this.addObstacle(-16, 0, 30, 4, 10, 70, wallMat);
    this.addObstacle(16, 0, 30, 4, 10, 70, wallMat);
    this.addObstacle(-7, 0, -15, 6, 9, 2.5, doorMat);
    this.addObstacle(7, 0, -15, 6, 9, 2.5, doorMat);
    this.addObstacle(0, 0, 12, 4.2, 3.6, 4.2, crateMat, true);

    // ============ CATWALK / SHORT A (Z ~ -20 to -60) ============
    this.addObstacle(22, 0, -35, 6, 3.5, 45, wallMat, true);
    this.addObstacle(18, 3.5, -35, 2, 5, 45, wallMat);
    this.addObstacle(28, 0, -58, 12, 3.0, 10, wallMat, true);

    // ============ BOMBSITE A (East / North-East: X ~ +50, Z ~ -60) ============
    this.addObstacle(52, 0, -60, 32, 2.5, 32, wallMat, true);
    this.addObstacle(52, 2.5, -77, 34, 7, 3, wallMat);
    this.addObstacle(44, 2.5, -55, 3.8, 3.8, 3.8, crateMat, true);
    this.addObstacle(58, 2.5, -66, 3.8, 3.8, 3.8, crateMat, true);
    this.addObstacle(72, 0, -25, 4, 10, 50, wallMat);
    this.addObstacle(72, 0, 25, 4, 10, 50, wallMat);
    this.addObstacle(72, 0, 60, 20, 10, 4, doorMat);
    this.addObstacle(55, 0, 75, 4, 10, 25, wallMat);

    // ============ TUNNELS & BOMBSITE B (West / North-West) ============
    this.addObstacle(-55, 0, 40, 4, 10, 60, wallMat);
    this.addObstacle(-75, 0, 40, 4, 10, 60, wallMat);
    this.addObstacle(-62, 0, -50, 34, 2.0, 34, wallMat, true);
    this.addObstacle(-62, 2.0, -68, 36, 8, 3, wallMat);
    this.addObstacle(-42, 0, -42, 14, 10, 3, doorMat);
    this.addObstacle(-78, 0, -35, 3, 10, 25, wallMat);
    this.addObstacle(-58, 2.0, -44, 4.0, 4.0, 4.0, crateMat, true);
    this.addObstacle(-68, 2.0, -56, 4.0, 4.0, 4.0, crateMat, true);

    // ============ CT SPAWN (North: Z ~ -85 to -100) ============
    this.addObstacle(-15, 0, -105, 35, 10, 4, wallMat);

    // Bombsite Plant Rings
    this.addBombsiteZone('A', 52, -60, 8.5);
    this.addBombsiteZone('B', -62, -50, 8.5);

    // Spawns
    this.spawnPoints.T = [
      { x: 0, z: 98 },
      { x: -6, z: 98 },
      { x: 6, z: 98 },
      { x: -12, z: 98 },
      { x: 12, z: 98 }
    ];

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

    // High performance Lambert materials
    const cobbleMat = new THREE.MeshLambertMaterial({ map: cobbleTex });
    const stuccoMat = new THREE.MeshLambertMaterial({ map: stuccoTex });
    const crateMat = new THREE.MeshLambertMaterial({ map: crateTex });

    // Main Ground
    const floorGeo = new THREE.PlaneGeometry(280, 280);
    const floor = new THREE.Mesh(floorGeo, cobbleMat);
    floor.rotation.x = -Math.PI / 2;
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
    this.addObstacle(0, 0, -32, 20, 7.5, 4, stuccoMat);
    this.addObstacle(0, 2.8, -32, 8, 1.2, 4, stuccoMat, true);
    this.addObstacle(16, 0, -18, 4, 9, 32, stuccoMat);
    this.addObstacle(-22, 0, -15, 4, 9, 36, stuccoMat);
    this.addObstacle(0, 0, 26, 4.0, 3.5, 4.0, crateMat, true);

    // ============ BOMBSITE A ============
    this.addObstacle(56, 0, 20, 4, 10, 45, stuccoMat);
    this.addObstacle(66, 0, -15, 20, 4.2, 14, stuccoMat, true);
    this.addObstacle(76, 4.2, -15, 2, 6, 14, stuccoMat);
    this.addObstacle(40, 0, -26, 3.6, 3.6, 3.6, crateMat, true);
    this.addObstacle(44, 0, -26, 3.6, 3.6, 3.6, crateMat, true);
    this.addObstacle(48, 0, -48, 3.8, 3.8, 3.8, crateMat, true);
    this.addObstacle(52, 0, -48, 3.8, 3.8, 3.8, crateMat, true);
    this.addObstacle(26, 0, -64, 7, 5.5, 8, stuccoMat);

    // ============ BOMBSITE B ============
    this.addObstacle(-65, 0, 5, 18, 4.5, 50, stuccoMat, true);
    this.addObstacle(-75, 4.5, 5, 2, 6, 50, stuccoMat);
    this.addObstacle(-44, 0, -38, 5, 3.2, 9, crateMat, true);
    this.addObstacle(-26, 0, -62, 26, 9, 4, stuccoMat);
    this.addObstacle(-62, 0, -58, 4, 8, 4, stuccoMat);

    // Bombsite Plant Rings
    this.addBombsiteZone('A', 46, -45, 8.5);
    this.addBombsiteZone('B', -50, -46, 8.5);

    // Mirage Spawns
    this.spawnPoints.T = [
      { x: 0, z: 98 },
      { x: -6, z: 98 },
      { x: 6, z: 98 },
      { x: -12, z: 98 },
      { x: 12, z: 98 }
    ];

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
