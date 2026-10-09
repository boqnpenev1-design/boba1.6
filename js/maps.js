// CS2 Authentic Map Engine: Dust II (de_dust2) & Mirage (de_mirage)
// Fully enclosed competitive layouts, solid walls, authentic textures, OBJ model loading & solid colliders

class CS2MapBuilder {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.bombZones = [];
    this.spawnPoints = { CT: [], T: [] };
    this.buyZones = { CT: null, T: null };
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

    const halfW = w / 2;
    const halfD = d / 2;
    const box = {
      min: { x: x - halfW, y: y, z: z - halfD },
      max: { x: x + halfW, y: y + h, z: z + halfD }
    };
    this.colliders.push({ box, mesh, isClimbable, topY: y + h });
    return mesh;
  }

  addBombsiteZone(id, x, y, z, radius = 9.0) {
    this.bombZones.push({ id, x, y, z, radius });

    // Glowing plant circle
    const ringGeo = new THREE.RingGeometry(radius - 0.7, radius, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3322,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(x, y + 0.08, z);
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

    const planeGeo = new THREE.PlaneGeometry(4.0, 4.0);
    const planeMat = new THREE.MeshBasicMaterial({ map: textTex, transparent: true });
    const textMesh = new THREE.Mesh(planeGeo, planeMat);
    textMesh.rotation.x = -Math.PI / 2;
    textMesh.position.set(x, y + 0.1, z);
    this.mapGroup.add(textMesh);
  }

  // Check if position is inside team buy zone
  isInBuyZone(team, pos) {
    const bz = this.buyZones[team];
    if (!bz) return false;
    return pos.x >= bz.minX && pos.x <= bz.maxX && pos.z >= bz.minZ && pos.z <= bz.maxZ;
  }

  // ==============================================================
  // MAP 1: DE_DUST2 (Fully Enclosed Solid Competitive Layout)
  // ==============================================================
  buildDust2() {
    this.clear();

    const groundTex = this.loadOrGenTexture('textures/de_dust2_material_5.png', 'sand_ground');
    groundTex.repeat.set(24, 24);
    const wallTex = this.loadOrGenTexture('textures/de_dust2_material_1.png', 'sand_wall');
    wallTex.repeat.set(4, 2);
    const crateTex = this.loadOrGenTexture('textures/de_dust2_material_2.png', 'wood_crate');
    const doorTex = this.loadOrGenTexture('textures/de_dust2_material_15.png', 'metal_door');

    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const crateMat = new THREE.MeshLambertMaterial({ map: crateTex });
    const doorMat = new THREE.MeshLambertMaterial({ map: doorTex });

    // Main Ground
    const floorGeo = new THREE.PlaneGeometry(280, 280);
    const floor = new THREE.Mesh(floorGeo, groundMat);
    floor.rotation.x = -Math.PI / 2;
    this.mapGroup.add(floor);

    // If OBJLoader is available, load the 3D model exported by user
    if (typeof THREE.OBJLoader !== 'undefined') {
      const objLoader = new THREE.OBJLoader();
      if (typeof THREE.MTLLoader !== 'undefined') {
        const mtlLoader = new THREE.MTLLoader();
        mtlLoader.setPath('source/de_dust2/');
        mtlLoader.load('de_dust2.mtl', (materials) => {
          materials.preload();
          objLoader.setMaterials(materials);
          objLoader.setPath('source/de_dust2/');
          objLoader.load('de_dust2.obj', (obj) => {
            obj.rotation.x = -Math.PI / 2;
            obj.scale.set(0.045, 0.045, 0.045);
            obj.position.set(0, 0, 0);
            this.mapGroup.add(obj);
          }, undefined, () => {});
        }, undefined, () => {});
      }
    }

    // High Solid Boundary Walls (Enclosing the map completely)
    this.addObstacle(0, 0, -125, 270, 22, 10, wallMat);  // North CT Back Wall
    this.addObstacle(0, 0, 125, 270, 22, 10, wallMat);   // South T Back Wall
    this.addObstacle(-130, 0, 0, 10, 22, 270, wallMat);  // West B Outer Wall
    this.addObstacle(130, 0, 0, 10, 22, 270, wallMat);   // East Long A Outer Wall

    // ============ T SPAWN (South: Z ~ +85 to +115) ============
    this.addObstacle(0, 0, 102, 55, 1.2, 26, wallMat, true);
    this.addObstacle(-32, 0, 100, 6, 14, 34, wallMat);
    this.addObstacle(32, 0, 100, 6, 14, 34, wallMat);

    // ============ MIDDLE LANE (Center: Z ~ -40 to +60) ============
    this.addObstacle(-18, 0, 30, 5, 14, 75, wallMat);
    this.addObstacle(18, 0, 30, 5, 14, 75, wallMat);
    this.addObstacle(-7.5, 0, -15, 7, 12, 3, doorMat);
    this.addObstacle(7.5, 0, -15, 7, 12, 3, doorMat);
    // Xbox Crate (Climbable to Short Catwalk)
    this.addObstacle(0, 0, 14, 4.4, 3.5, 4.4, crateMat, true);

    // ============ SHORT A / CATWALK (Z ~ -20 to -60) ============
    this.addObstacle(24, 0, -35, 7, 3.5, 50, wallMat, true);
    this.addObstacle(20, 3.5, -35, 2.5, 5, 50, wallMat);
    this.addObstacle(30, 0, -58, 14, 3.0, 12, wallMat, true);

    // ============ BOMBSITE A (East / North-East) ============
    // A Site Raised Platform
    this.addObstacle(54, 0, -60, 36, 2.4, 36, wallMat, true);
    // Back of A (Goose Wall)
    this.addObstacle(54, 2.4, -79, 38, 10, 4, wallMat);
    // A Default Site Crates (Climbable)
    this.addObstacle(46, 2.4, -54, 4.0, 3.8, 4.0, crateMat, true);
    this.addObstacle(60, 2.4, -66, 4.0, 3.8, 4.0, crateMat, true);
    // Long A Walls & Long Doors
    this.addObstacle(76, 0, -25, 5, 14, 55, wallMat);
    this.addObstacle(76, 0, 25, 5, 14, 55, wallMat);
    this.addObstacle(76, 0, 60, 22, 14, 5, doorMat);
    this.addObstacle(58, 0, 75, 5, 14, 28, wallMat);

    // ============ B TUNNELS & BOMBSITE B (West / North-West) ============
    // Upper & Lower Tunnels
    this.addObstacle(-58, 0, 40, 5, 14, 65, wallMat);
    this.addObstacle(-80, 0, 40, 5, 14, 65, wallMat);
    // B Site Platform
    this.addObstacle(-64, 0, -50, 36, 2.0, 36, wallMat, true);
    // B Back Wall
    this.addObstacle(-64, 2.0, -70, 38, 10, 4, wallMat);
    // B Doors & Window
    this.addObstacle(-44, 0, -42, 16, 12, 4, doorMat);
    this.addObstacle(-82, 0, -35, 4, 14, 28, wallMat);
    // B Site Crates (Climbable)
    this.addObstacle(-60, 2.0, -44, 4.2, 3.8, 4.2, crateMat, true);
    this.addObstacle(-70, 2.0, -56, 4.2, 3.8, 4.2, crateMat, true);

    // ============ CT SPAWN (North: Z ~ -85 to -105) ============
    this.addObstacle(-16, 0, -108, 38, 14, 5, wallMat);

    // Bombsite Plant Rings (A site Y=2.4 on platform, B site Y=2.0 on platform)
    this.addBombsiteZone('A', 54, 2.4, -60, 9.0);
    this.addBombsiteZone('B', -64, 2.0, -50, 9.0);

    // Buy Zones
    this.buyZones.T = { minX: -35, maxX: 35, minZ: 75, maxZ: 120 };
    this.buyZones.CT = { minX: -40, maxX: 15, minZ: -120, maxZ: -75 };

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
  // MAP 2: DE_MIRAGE (Fully Enclosed Moroccan Town Layout)
  // ==============================================================
  buildMirage() {
    this.clear();

    const cobbleTex = this.loadOrGenTexture(null, 'mirage_cobble');
    cobbleTex.repeat.set(22, 22);
    const stuccoTex = this.loadOrGenTexture(null, 'mirage_stucco');
    stuccoTex.repeat.set(4, 3);
    const crateTex = this.loadOrGenTexture(null, 'wood_crate');

    const cobbleMat = new THREE.MeshLambertMaterial({ map: cobbleTex });
    const stuccoMat = new THREE.MeshLambertMaterial({ map: stuccoTex });
    const crateMat = new THREE.MeshLambertMaterial({ map: crateTex });

    // Main Ground
    const floorGeo = new THREE.PlaneGeometry(280, 280);
    const floor = new THREE.Mesh(floorGeo, cobbleMat);
    floor.rotation.x = -Math.PI / 2;
    this.mapGroup.add(floor);

    // Outer Walls (Enclosing Mirage completely)
    this.addObstacle(0, 0, -130, 270, 22, 10, stuccoMat);
    this.addObstacle(0, 0, 130, 270, 22, 10, stuccoMat);
    this.addObstacle(-130, 0, 0, 10, 22, 270, stuccoMat);
    this.addObstacle(130, 0, 0, 10, 22, 270, stuccoMat);

    // ============ T SPAWN (South) ============
    this.addObstacle(0, 0, 105, 45, 1.2, 24, stuccoMat, true);
    this.addObstacle(-28, 0, 105, 5, 14, 28, stuccoMat);
    this.addObstacle(28, 0, 105, 5, 14, 28, stuccoMat);

    // ============ MID & SNIPER WINDOW ============
    this.addObstacle(0, 0, -32, 22, 8.0, 5, stuccoMat);
    this.addObstacle(0, 2.8, -32, 9, 1.4, 5, stuccoMat, true);
    this.addObstacle(18, 0, -18, 5, 12, 34, stuccoMat);
    this.addObstacle(-24, 0, -15, 5, 12, 38, stuccoMat);
    this.addObstacle(0, 0, 26, 4.2, 3.6, 4.2, crateMat, true);

    // ============ BOMBSITE A ============
    this.addObstacle(58, 0, 20, 5, 14, 48, stuccoMat);
    this.addObstacle(68, 0, -15, 22, 4.4, 16, stuccoMat, true);
    this.addObstacle(78, 4.4, -15, 2.5, 7, 16, stuccoMat);
    this.addObstacle(40, 0, -26, 3.8, 3.8, 3.8, crateMat, true);
    this.addObstacle(44, 0, -26, 3.8, 3.8, 3.8, crateMat, true);
    this.addObstacle(48, 0, -48, 4.0, 4.0, 4.0, crateMat, true);
    this.addObstacle(52, 0, -48, 4.0, 4.0, 4.0, crateMat, true);
    this.addObstacle(28, 0, -64, 8, 6.5, 9, stuccoMat);

    // ============ BOMBSITE B ============
    this.addObstacle(-68, 0, 5, 20, 4.6, 52, stuccoMat, true);
    this.addObstacle(-78, 4.6, 5, 2.5, 7, 52, stuccoMat);
    this.addObstacle(-46, 0, -38, 6, 3.4, 10, crateMat, true);
    this.addObstacle(-28, 0, -62, 28, 12, 5, stuccoMat);
    this.addObstacle(-64, 0, -58, 5, 10, 5, stuccoMat);

    // Bombsite Plant Rings
    this.addBombsiteZone('A', 48, 0, -45, 9.0);
    this.addBombsiteZone('B', -50, 0, -46, 9.0);

    // Buy Zones
    this.buyZones.T = { minX: -30, maxX: 30, minZ: 85, maxZ: 125 };
    this.buyZones.CT = { minX: 10, maxX: 50, minZ: -110, maxZ: -70 };

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
