// CS2 Authentic Map Engine: Dust II (de_dust2) & Mirage (de_mirage)
// Native 3D Model Rendering: de_dust2.obj & untitled.glb with Solid Competitive Bounds

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

  addObstacle(x, y, z, w, h, d, mat = null, isClimbable = false, isVisual = true) {
    let mesh = null;
    if (isVisual && mat) {
      const geo = new THREE.BoxGeometry(w, h, d);
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + h / 2, z);
      this.mapGroup.add(mesh);
    }

    const halfW = w / 2;
    const halfD = d / 2;
    const box = {
      min: { x: x - halfW, y: y, z: z - halfD },
      max: { x: x + halfW, y: y + h, z: z + halfD }
    };
    this.colliders.push({ box, mesh, isClimbable, topY: y + h });
    return mesh;
  }

  addCollider(x, y, z, w, h, d, isClimbable = false) {
    return this.addObstacle(x, y, z, w, h, d, null, isClimbable, false);
  }

  addBombsiteZone(id, x, y, z, radius = 6.5) {
    this.bombZones.push({ id, x, y, z, radius });

    const ringGeo = new THREE.RingGeometry(radius - 0.5, radius, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3322,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(x, y + 0.05, z);
    this.mapGroup.add(ringMesh);

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
    textMesh.position.set(x, y + 0.07, z);
    this.mapGroup.add(textMesh);
  }

  isInBuyZone(team, pos) {
    const bz = this.buyZones[team];
    if (!bz) return false;
    return pos.x >= bz.minX && pos.x <= bz.maxX && pos.z >= bz.minZ && pos.z <= bz.maxZ;
  }

  // ==============================================================
  // MAP 1: DE_DUST2 (Native 3D OBJ Model & Solid Geometry)
  // ==============================================================
  buildDust2() {
    this.clear();

    const groundTex = this.loadOrGenTexture('textures/de_dust2_material_5.png', 'sand_ground');
    groundTex.repeat.set(24, 24);
    const crateTex = this.loadOrGenTexture('textures/de_dust2_material_2.png', 'wood_crate');
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
    const crateMat = new THREE.MeshLambertMaterial({ map: crateTex });

    // Main Ground (Fixed: Exactly at Y = 0)
    const floorGeo = new THREE.PlaneGeometry(300, 300);
    const floor = new THREE.Mesh(floorGeo, groundMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    this.mapGroup.add(floor);

    // Native 3D Dust 2 Model from source/de_dust2/ (Floor aligned to Y = 0)
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
            // Exactly align model walkable ground to Y = 0
            obj.position.set(14.4, 0, 50.4);
            this.mapGroup.add(obj);
          }, undefined, () => {});
        }, undefined, () => {
          objLoader.load('source/de_dust2/de_dust2.obj', (obj) => {
            obj.rotation.x = -Math.PI / 2;
            obj.scale.set(0.045, 0.045, 0.045);
            obj.position.set(14.4, 0, 50.4);
            this.mapGroup.add(obj);
          }, undefined, () => {});
        });
      }
    }

    // ==========================================================
    // SOLID IMPENETRABLE WALL COLLIDERS (Matching de_dust2.obj)
    // ==========================================================

    // 1. Outer Map Boundaries (Never fall off the map)
    this.addCollider(0, 0, -125, 270, 25, 10);
    this.addCollider(0, 0, 125, 270, 25, 10);
    this.addCollider(-115, 0, 0, 10, 25, 270);
    this.addCollider(115, 0, 0, 10, 25, 270);

    // 2. Mid Section
    this.addCollider(-15, 0, 20, 8, 20, 65); // Mid West Wall
    this.addCollider(17, 0, 22, 8, 20, 68);  // Mid East Wall
    this.addCollider(-8, 0, -16, 7, 18, 5);  // Mid Double Door West
    this.addCollider(8, 0, -16, 7, 18, 5);   // Mid Double Door East
    this.addObstacle(0, 0, 14, 4.4, 3.4, 4.4, crateMat, true, false); // Xbox Crate (Climbable)

    // 3. Catwalk & Short A
    this.addCollider(26, 0, -35, 10, 3.6, 50, true); // Short walkway
    this.addCollider(20, 3.6, -35, 4, 15, 50);       // Short railing wall
    this.addCollider(32, 0, -58, 14, 3.2, 12, true); // Short stairs to A

    // 4. Long A Corridor & Doors
    this.addCollider(86, 0, 10, 8, 20, 60);  // Long A East Wall
    this.addCollider(63, 0, 26, 8, 20, 72);  // Long A West Wall
    this.addCollider(74, 0, 64, 24, 20, 6);  // Long Double Doors Frame

    // 5. Bombsite A (Platform and Back Walls)
    this.addCollider(60, 0, -62, 34, 20, 6); // A Back Wall (Goose)
    this.addCollider(82, 0, -40, 6, 20, 44); // A Long Corner Wall
    this.addCollider(36, 0, -53, 6, 20, 20); // A CT Ramp Side Wall
    this.addObstacle(50, 0, -54, 4.0, 3.6, 4.0, crateMat, true, false); // A Default Crates
    this.addObstacle(62, 0, -46, 4.0, 3.6, 4.0, crateMat, true, false); // A Ninja Crates

    // 6. Upper B Tunnels
    this.addCollider(-78, 0, 42, 8, 20, 45); // Tunnels West Wall
    this.addCollider(-57, 0, 40, 8, 20, 48); // Tunnels East Wall
    this.addCollider(-68, 0, -34, 14, 20, 6); // Tunnels Exit to B Wall

    // 7. Bombsite B (Courtyard and Perimeter Walls)
    this.addCollider(-63, 0, -72, 46, 20, 6); // B Back Wall
    this.addCollider(-84, 0, -54, 6, 20, 36); // B Outer West Wall
    this.addCollider(-42, 0, -63, 6, 20, 18); // B Window Platform Wall
    this.addCollider(-46, 0, -34, 14, 20, 6); // B Doors Wall
    this.addObstacle(-60, 0, -48, 4.2, 3.6, 4.2, crateMat, true, false); // B Site Crates

    // 8. CT Spawn & T Spawn Walls
    this.addCollider(-14, 0, -108, 44, 20, 6); // CT Spawn Back Wall
    this.addCollider(-35, 0, -90, 6, 20, 38);  // CT Spawn West Wall
    this.addCollider(10, 0, -90, 6, 20, 38);   // CT Spawn East Wall
    this.addCollider(0, 0, 108, 70, 20, 6);    // T Spawn Back Wall
    this.addCollider(-32, 0, 90, 6, 20, 38);   // T Spawn West Wall
    this.addCollider(32, 0, 90, 6, 20, 38);    // T Spawn East Wall

    // Clear Open Bombsite Plant Rings (Never inside walls)
    this.addBombsiteZone('A', 56.0, 0.05, -50.0, 6.5);
    this.addBombsiteZone('B', -63.0, 0.05, -52.0, 6.5);

    // Buy Zones
    this.buyZones.T = { minX: -30, maxX: 30, minZ: 70, maxZ: 110 };
    this.buyZones.CT = { minX: -35, maxX: 10, minZ: -110, maxZ: -70 };

    // Authentic Floor Spawns (Firmly on ground at Y = 1.8)
    this.spawnPoints.T = [
      { x: 5, y: 1.8, z: 84 },
      { x: -2, y: 1.8, z: 86 },
      { x: 12, y: 1.8, z: 86 },
      { x: 2, y: 1.8, z: 78 },
      { x: 8, y: 1.8, z: 78 }
    ];

    this.spawnPoints.CT = [
      { x: -14, y: 1.8, z: -86 },
      { x: -8, y: 1.8, z: -86 },
      { x: -20, y: 1.8, z: -86 },
      { x: -11, y: 1.8, z: -80 },
      { x: -17, y: 1.8, z: -80 }
    ];
  }

  // ==============================================================
  // MAP 2: DE_MIRAGE (Native 3D GLB Model & Moroccan Town)
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

    // Main Ground (Fixed: Exactly at Y = 0)
    const floorGeo = new THREE.PlaneGeometry(300, 300);
    const floor = new THREE.Mesh(floorGeo, cobbleMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    this.mapGroup.add(floor);

    // Native 3D Mirage Model from source/untitled.glb (Aligned to Y = 0)
    if (typeof THREE.GLTFLoader !== 'undefined') {
      const gltfLoader = new THREE.GLTFLoader();
      gltfLoader.load('source/untitled.glb', (gltf) => {
        const mapObj = gltf.scene;
        mapObj.rotation.x = -Math.PI / 2;
        mapObj.scale.set(0.045, 0.045, 0.045);
        // Correct Y offset (7.56) brings raw -168 Z floor to Y = 0
        mapObj.position.set(23.2, 7.56, -37.2);
        this.mapGroup.add(mapObj);
      }, undefined, () => {});
    }

    // Outer Map Boundaries
    this.addCollider(0, 0, -130, 270, 25, 10);
    this.addCollider(0, 0, 130, 270, 25, 10);
    this.addCollider(-130, 0, 0, 10, 25, 270);
    this.addCollider(130, 0, 0, 10, 25, 270);

    // T Spawn Boundaries
    this.addCollider(0, 0, 105, 50, 20, 6);
    this.addCollider(-28, 0, 105, 6, 20, 30);
    this.addCollider(28, 0, 105, 6, 20, 30);

    // Mid & Sniper Window
    this.addCollider(0, 0, -32, 24, 18, 6);
    this.addCollider(18, 0, -18, 6, 18, 36);
    this.addCollider(-24, 0, -15, 6, 18, 40);
    this.addObstacle(0, 0, 26, 4.2, 3.6, 4.2, crateMat, true, false); // Mid Boxes

    // Bombsite A
    this.addCollider(58, 0, 20, 6, 20, 50);
    this.addCollider(68, 0, -15, 24, 4.4, 18, true); // A Palace Ramp
    this.addCollider(78, 4.4, -15, 4, 15, 18);
    this.addObstacle(46, 0, -48, 4.0, 3.6, 4.0, crateMat, true, false); // Triple Box
    this.addCollider(28, 0, -64, 10, 18, 10);

    // Bombsite B
    this.addCollider(-68, 0, 5, 22, 4.6, 54, true); // B Apartments
    this.addCollider(-78, 4.6, 5, 4, 15, 54);
    this.addCollider(-28, 0, -62, 30, 18, 6);
    this.addCollider(-64, 0, -58, 6, 18, 6);
    this.addObstacle(-46, 0, -38, 5, 3.4, 8, crateMat, true, false);

    // Clear Open Bombsite Plant Rings
    this.addBombsiteZone('A', 48.0, 0.05, -45.0, 7.0);
    this.addBombsiteZone('B', -50.0, 0.05, -46.0, 7.0);

    // Buy Zones
    this.buyZones.T = { minX: -30, maxX: 30, minZ: 85, maxZ: 125 };
    this.buyZones.CT = { minX: 10, maxX: 50, minZ: -110, maxZ: -70 };

    // Mirage Spawns (Firmly on ground at Y = 1.8)
    this.spawnPoints.T = [
      { x: 0, y: 1.8, z: 98 },
      { x: -6, y: 1.8, z: 98 },
      { x: 6, y: 1.8, z: 98 },
      { x: -12, y: 1.8, z: 98 },
      { x: 12, y: 1.8, z: 98 }
    ];

    this.spawnPoints.CT = [
      { x: 30, y: 1.8, z: -88 },
      { x: 38, y: 1.8, z: -88 },
      { x: 22, y: 1.8, z: -88 },
      { x: 30, y: 1.8, z: -82 },
      { x: 38, y: 1.8, z: -82 }
    ];
  }
}

window.CS2MapBuilder = CS2MapBuilder;
