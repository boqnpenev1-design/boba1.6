// CS2 Map Engine: 3D Model Loading & Textured Geometry for Dust II and Mirage
// Handles OBJ/MTL for Dust II and GLTF with Procedural Texturing for Mirage

class CS2MapBuilder {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.bombZones = [];
    this.spawnPoints = { CT: [], T: [] };
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);

    this.objLoader = typeof THREE.OBJLoader !== 'undefined' ? new THREE.OBJLoader() : null;
    this.mtlLoader = typeof THREE.MTLLoader !== 'undefined' ? new THREE.MTLLoader() : null;
    this.gltfLoader = typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null;
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

  createProceduralTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    if (type === 'mirage_stucco') {
      ctx.fillStyle = '#d2b48c';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 8000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#c5a378' : '#e0c69e';
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }
    } else if (type === 'mirage_cobblestone') {
      ctx.fillStyle = '#8a7968';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#5a4d3f';
      ctx.lineWidth = 4;
      for (let x = 0; x < 512; x += 32) {
        for (let y = 0; y < 512; y += 32) {
          ctx.fillStyle = (x + y) % 64 === 0 ? '#988573' : '#7f6f5e';
          ctx.fillRect(x + 2, y + 2, 28, 28);
          ctx.strokeRect(x, y, 32, 32);
        }
      }
    } else if (type === 'mirage_terracotta') {
      ctx.fillStyle = '#b35434';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#85371c';
      ctx.lineWidth = 3;
      for (let y = 0; y < 512; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }
    } else if (type === 'wood_crate') {
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#4e331c';
      ctx.lineWidth = 14;
      ctx.strokeRect(8, 8, 496, 496);
      ctx.beginPath();
      ctx.moveTo(12, 12);
      ctx.lineTo(500, 500);
      ctx.moveTo(500, 12);
      ctx.lineTo(12, 500);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
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

  addBombsiteZone(id, x, z, radius = 7.5) {
    this.bombZones.push({ id, x, z, radius });

    const ringGeo = new THREE.RingGeometry(radius - 0.5, radius, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(x, 0.08, z);
    this.mapGroup.add(ringMesh);

    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.3, 4, 16);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0xff9500,
      emissive: 0xff3b30,
      emissiveIntensity: 0.6
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

    const groundTex = this.createProceduralTexture('mirage_stucco');
    groundTex.repeat.set(16, 16);
    const wallTex = this.createProceduralTexture('mirage_stucco');
    wallTex.repeat.set(4, 2);
    const crateTex = this.createProceduralTexture('wood_crate');

    const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.7 });

    // Main Floor
    const floorGeo = new THREE.PlaneGeometry(240, 240);
    const floor = new THREE.Mesh(floorGeo, groundMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.mapGroup.add(floor);

    // Perimeter Walls
    this.addObstacle(0, 0, -110, 220, 12, 6, wallMat);
    this.addObstacle(0, 0, 110, 220, 12, 6, wallMat);
    this.addObstacle(-110, 0, 0, 6, 12, 220, wallMat);
    this.addObstacle(110, 0, 0, 6, 12, 220, wallMat);

    // Mid & Doors
    this.addObstacle(-7, 0, 10, 6, 8, 2, wallMat);
    this.addObstacle(7, 0, 10, 6, 8, 2, wallMat);
    this.addObstacle(0, 0, -10, 4, 3.5, 4, crateMat, true);
    this.addObstacle(-18, 0, 20, 4, 10, 60, wallMat);
    this.addObstacle(18, 0, 20, 4, 10, 60, wallMat);

    // Bombsite A
    this.addObstacle(50, 0, -60, 26, 2.5, 26, wallMat, true);
    this.addObstacle(44, 2.5, -55, 3.5, 3.5, 3.5, crateMat, true);
    this.addObstacle(56, 2.5, -65, 3.5, 3.5, 3.5, crateMat, true);
    this.addObstacle(50, 2.5, -73, 26, 6, 2, wallMat);
    this.addObstacle(75, 0, 15, 25, 10, 4, wallMat);
    this.addObstacle(75, 0, -25, 4, 10, 50, wallMat);
    this.addObstacle(25, 0, -45, 4, 8, 40, wallMat);

    // Bombsite B
    this.addObstacle(-60, 0, -50, 28, 2, 28, wallMat, true);
    this.addObstacle(-55, 2, -45, 3.5, 3.5, 3.5, crateMat, true);
    this.addObstacle(-65, 2, -55, 3.5, 3.5, 3.5, crateMat, true);
    this.addObstacle(-40, 0, -40, 14, 10, 3, wallMat);
    this.addObstacle(-75, 0, -35, 3, 10, 20, wallMat);
    this.addObstacle(-55, 0, 15, 3, 9, 50, wallMat);
    this.addObstacle(-75, 0, 15, 3, 9, 50, wallMat);

    // Bombsite Zones
    this.addBombsiteZone('A', 50, -60, 7.5);
    this.addBombsiteZone('B', -60, -50, 7.5);

    // Spawns
    this.spawnPoints.CT = [
      { x: 0, z: -85 }, { x: -8, z: -85 }, { x: 8, z: -85 }, { x: -16, z: -85 }, { x: 16, z: -85 }
    ];
    this.spawnPoints.T = [
      { x: 0, z: 85 }, { x: -8, z: 85 }, { x: 8, z: 85 }, { x: -16, z: 85 }, { x: 16, z: 85 }
    ];

    // Attempt loading Dust 2 3D OBJ & MTL Model asynchronously
    if (this.mtlLoader && this.objLoader) {
      this.mtlLoader.load('source/de_dust2/de_dust2.mtl', (materials) => {
        materials.preload();
        this.objLoader.setMaterials(materials);
        this.objLoader.load('source/de_dust2/de_dust2.obj', (obj) => {
          obj.rotation.x = -Math.PI / 2;
          obj.scale.set(0.026, 0.026, 0.026);
          obj.position.set(0, 0, 0);
          this.mapGroup.add(obj);
        }, undefined, () => {});
      }, undefined, () => {});
    }
  }

  // ==============================================================
  // MAP 2: DE_MIRAGE
  // ==============================================================
  buildMirage() {
    this.clear();

    const stuccoTex = this.createProceduralTexture('mirage_stucco');
    stuccoTex.repeat.set(4, 3);
    const cobbleTex = this.createProceduralTexture('mirage_cobblestone');
    cobbleTex.repeat.set(18, 18);
    const roofTex = this.createProceduralTexture('mirage_terracotta');
    const crateTex = this.createProceduralTexture('wood_crate');

    const cobbleMat = new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.85 });
    const stuccoMat = new THREE.MeshStandardMaterial({ map: stuccoTex, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.7 });
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.75 });

    // Main Floor
    const floorGeo = new THREE.PlaneGeometry(240, 240);
    const floor = new THREE.Mesh(floorGeo, cobbleMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.mapGroup.add(floor);

    // Outer Boundary Walls
    this.addObstacle(0, 0, -115, 230, 14, 6, stuccoMat);
    this.addObstacle(0, 0, 115, 230, 14, 6, stuccoMat);
    this.addObstacle(-115, 0, 0, 6, 14, 230, stuccoMat);
    this.addObstacle(115, 0, 0, 6, 14, 230, stuccoMat);

    // Mid & Sniper Window
    this.addObstacle(0, 0, -35, 18, 7, 4, stuccoMat);
    this.addObstacle(16, 0, -20, 4, 8, 30, stuccoMat);
    this.addObstacle(-22, 0, -15, 4, 8, 35, stuccoMat);
    this.addObstacle(0, 0, 25, 4, 3.5, 4, crateMat, true);

    // Bombsite A
    this.addObstacle(40, 0, -25, 3.5, 3.5, 3.5, crateMat, true);
    this.addObstacle(44, 0, -25, 3.5, 3.5, 3.5, crateMat, true);
    this.addObstacle(50, 0, -45, 3.5, 3.5, 3.5, crateMat, true);
    this.addObstacle(25, 0, -60, 6, 5, 8, stuccoMat);
    this.addObstacle(65, 0, -15, 18, 4.5, 12, roofMat, true);
    this.addObstacle(75, 4.5, -15, 2, 6, 12, stuccoMat);
    this.addObstacle(55, 0, 10, 4, 9, 35, stuccoMat);

    // Bombsite B
    this.addObstacle(-65, 0, 0, 16, 5, 45, stuccoMat, true);
    this.addObstacle(-74, 5, 0, 2, 6, 45, stuccoMat);
    this.addObstacle(-42, 0, -38, 5, 3, 9, crateMat, true);
    this.addObstacle(-25, 0, -60, 25, 9, 4, stuccoMat);
    this.addObstacle(-60, 0, -55, 4, 8, 4, stuccoMat);

    // Bombsite Zones
    this.addBombsiteZone('A', 48, -42, 7.5);
    this.addBombsiteZone('B', -48, -45, 7.5);

    // Spawns
    this.spawnPoints.CT = [
      { x: 0, z: -90 }, { x: -10, z: -90 }, { x: 10, z: -90 }, { x: -20, z: -90 }, { x: 20, z: -90 }
    ];
    this.spawnPoints.T = [
      { x: 0, z: 90 }, { x: -10, z: 90 }, { x: 10, z: 90 }, { x: -20, z: 90 }, { x: 20, z: 90 }
    ];

    // Load Mirage 3D Mesh (source/untitled.glb) and texture untextured surfaces with Moroccan materials
    if (this.gltfLoader) {
      this.gltfLoader.load('source/untitled.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.set(0.03, 0.03, 0.03);
        model.position.set(0, 0, 0);

        // Apply realistic Moroccan textures to untextured Mirage surfaces
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (!child.material || !child.material.map) {
              const y = child.position.y;
              if (y < 2) {
                child.material = cobbleMat;
              } else if (y > 8) {
                child.material = roofMat;
              } else {
                child.material = stuccoMat;
              }
            }
          }
        });

        this.mapGroup.add(model);
      }, undefined, () => {});
    }
  }
}

window.CS2MapBuilder = CS2MapBuilder;
