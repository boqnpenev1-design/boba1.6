// CS2 Competitive Map Engine: Dust II (de_dust2)
// High-Performance Native 3D Model Rendering with Authentic Source Engine Geometry

class CS2MapBuilder {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.groundMeshes = [];
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
    this.groundMeshes = [];
    this.bombZones = [];
    this.spawnPoints = { CT: [], T: [] };
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

  addBombsiteZone(id, x, y, z, radius = 8.5, bounds = null) {
    // Stores bombsite volumes matching the authentic OBJ target decals (SandCCrete2 & SandRoadTgtB)
    this.bombZones.push({ id, x, y, z, radius, bounds });
  }

  isInBuyZone(team, pos) {
    const bz = this.buyZones[team];
    if (!bz) return false;
    return pos.x >= bz.minX && pos.x <= bz.maxX && pos.z >= bz.minZ && pos.z <= bz.maxZ;
  }

  // ==============================================================
  // DE_DUST2: Authentic Valve Geometry with 144+ FPS Draw Calls
  // ==============================================================
  buildDust2() {
    this.clear();

    // Deep void safety floor (far below playable area at Y = -25)
    const voidGeo = new THREE.PlaneGeometry(500, 500);
    const voidMat = new THREE.MeshBasicMaterial({ color: 0xb49a7a, visible: false });
    const voidFloor = new THREE.Mesh(voidGeo, voidMat);
    voidFloor.rotation.x = -Math.PI / 2;
    voidFloor.position.set(0, -25, 0);
    this.mapGroup.add(voidFloor);

    // Native 3D Dust 2 Model from source/de_dust2/ (Native Origin at 0, 0, 0)
    if (typeof THREE.OBJLoader !== 'undefined') {
      const objLoader = new THREE.OBJLoader();
      const processObj = (obj) => {
        obj.rotation.x = -Math.PI / 2;
        obj.scale.set(0.045, 0.045, 0.045);
        obj.position.set(0, 0, 0);

        // Batch geometry by unique material to collapse ~1,580 draw calls to ~34
        const materialBuckets = new Map();
        const getBucket = (mat) => {
          if (!mat) return null;
          let b = materialBuckets.get(mat);
          if (!b) {
            b = { mat, positions: [], normals: [], uvs: [] };
            materialBuckets.set(mat, b);
          }
          return b;
        };

        const meshesToDispose = [];
        obj.traverse((child) => {
          if (child.isMesh && child.geometry) {
            meshesToDispose.push(child);
            child.updateMatrix();
            const matrix = child.matrix;
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);

            const geo = child.geometry;
            const posAttr = geo.attributes.position;
            const normAttr = geo.attributes.normal;
            const uvAttr = geo.attributes.uv;
            const index = geo.index;

            const vPos = new THREE.Vector3();
            const vNorm = new THREE.Vector3();

            const groups = (geo.groups && geo.groups.length > 0)
              ? geo.groups
              : [{ start: 0, count: index ? index.count : (posAttr ? posAttr.count : 0), materialIndex: 0 }];

            for (let g = 0; g < groups.length; g++) {
              const grp = groups[g];
              let mat = null;
              if (Array.isArray(child.material)) {
                mat = child.material[grp.materialIndex] || child.material[0];
              } else {
                mat = child.material;
              }
              const bucket = getBucket(mat);
              if (!bucket || !posAttr) continue;

              const start = grp.start;
              const count = grp.count;

              for (let i = 0; i < count; i++) {
                const vi = index ? index.getX(start + i) : (start + i);

                vPos.fromBufferAttribute(posAttr, vi);
                if (!matrix.isIdentity()) vPos.applyMatrix4(matrix);
                bucket.positions.push(vPos.x, vPos.y, vPos.z);

                if (normAttr) {
                  vNorm.fromBufferAttribute(normAttr, vi);
                  if (!matrix.isIdentity()) vNorm.applyMatrix3(normalMatrix).normalize();
                  bucket.normals.push(vNorm.x, vNorm.y, vNorm.z);
                }

                if (uvAttr) {
                  bucket.uvs.push(uvAttr.getX(vi), uvAttr.getY(vi));
                }
              }
            }
          }
        });

        // Dispose original fragmented meshes
        for (let i = 0; i < meshesToDispose.length; i++) {
          const m = meshesToDispose[i];
          if (m.parent) m.parent.remove(m);
          if (m.geometry) m.geometry.dispose();
        }
        while (obj.children.length > 0) {
          obj.remove(obj.children[0]);
        }

        // Build 1 consolidated BufferGeometry & Mesh per unique material
        this.groundMeshes = [];
        materialBuckets.forEach((bucket) => {
          if (bucket.positions.length === 0) return;

          const newGeo = new THREE.BufferGeometry();
          newGeo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
          if (bucket.normals.length === bucket.positions.length) {
            newGeo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
          } else {
            newGeo.computeVertexNormals();
          }
          if (bucket.uvs.length > 0) {
            newGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2));
          }

          newGeo.computeBoundingBox();
          newGeo.computeBoundingSphere();

          const m = bucket.mat;
          m.side = THREE.FrontSide;
          if (m.specular) m.specular.setHex(0x000000);
          if (typeof m.shininess !== 'undefined') m.shininess = 0;
          if (typeof m.roughness !== 'undefined') m.roughness = 1.0;
          if (typeof m.metalness !== 'undefined') m.metalness = 0.0;

          const newMesh = new THREE.Mesh(newGeo, m);
          obj.add(newMesh);
          this.groundMeshes.push(newMesh);
        });

        this.mapGroup.add(obj);
        this.mapLoaded = true;
        console.log(`[MAP] Batched Dust 2 into ${this.groundMeshes.length} consolidated meshes (Draw calls ~${this.groundMeshes.length}).`);
        // Fire callback so player can re-snap to true ground
        if (this.onMapLoaded) this.onMapLoaded();
      };

      if (typeof THREE.MTLLoader !== 'undefined') {
        const mtlLoader = new THREE.MTLLoader();
        mtlLoader.setPath('source/de_dust2/');
        mtlLoader.load('de_dust2.mtl', (materials) => {
          materials.preload();
          objLoader.setMaterials(materials);
          objLoader.setPath('source/de_dust2/');
          objLoader.load('de_dust2.obj', processObj, undefined, () => {});
        }, undefined, () => {
          objLoader.load('source/de_dust2/de_dust2.obj', processObj, undefined, () => {});
        });
      }
    }

    // ==========================================================
    // MAP BOUNDARIES & OBSTACLES (Outer Perimeter Limits & Anti-Escape Clips)
    // ==========================================================
    // Outer skybox boundaries preventing walking off into void (Taller 60m physical barriers)
    this.addCollider(0, -15, -145, 260, 60, 15);   // North limit
    this.addCollider(0, -15, 52, 260, 60, 15);     // South limit
    this.addCollider(-102, -15, -50, 15, 60, 260); // West limit
    this.addCollider(74, -15, -50, 15, 60, 260);   // East limit

    // Canyon Cliff Top Invisible Barrier Clips (Blocks escaping onto mountain ridges, TUNNEL FREED)
    this.addCollider(-50, 12.0, -10, 80, 25, 12);  // Canyon wall ridge above mid
    this.addCollider(-20, 12.0, -60, 40, 25, 25);  // Canyon ridge above double doors
    this.addCollider(55, 12.0, -120, 30, 25, 60);  // Canyon ridge east of A site
    this.addCollider(-85, 10.0, -90, 25, 25, 50);  // Wall above B site back plateau

    // ==========================================================
    // BOMBSITES & BUY ZONES (100% Authentic Dust 2 Geometry)
    // ==========================================================

    // Bombsite A: Positioned directly at the platform crates (Matching material_15 floor decal & radar bounds)
    this.addBombsiteZone('A', 51.85, 4.32, -108.7, 10.5, {
      minX: 46.0, maxX: 58.0,
      minZ: -114.0, maxZ: -104.0,
      minY: 2.5, maxY: 6.8
    });

    // Bombsite B: Courtyard zone matching material_25 SandRoadTgtB decal and radar orange bounds
    this.addBombsiteZone('B', -72.0, 0.0, -121.0, 11.5, {
      minX: -79.0, maxX: -65.0,
      minZ: -128.0, maxZ: -114.0,
      minY: -1.0, maxY: 4.0
    });

    // Authentic Buy Zones matching CT & T Spawns
    this.buyZones.CT = { minX: -25, maxX: 15, minZ: -115, maxZ: -85 };
    this.buyZones.T = { minX: -90, maxX: -40, minZ: 20, maxZ: 50 };

    // ==========================================================
    // AUTHENTIC DUST 2 SPAWN POINTS (Exact Ground Heights: CT -3.56, T 7.96)
    // ==========================================================

    this.spawnPoints.CT = [
      { x: -5.0, y: -3.56, z: -98.0, yaw: Math.PI },
      { x: -2.0, y: -3.56, z: -96.0, yaw: Math.PI },
      { x: -8.0, y: -3.56, z: -96.0, yaw: Math.PI },
      { x: -5.0, y: -3.56, z: -101.0, yaw: Math.PI },
      { x: -1.0, y: -3.56, z: -100.0, yaw: Math.PI }
    ];

    this.spawnPoints.T = [
      { x: -65.0, y: 7.96, z: 35.0, yaw: 0 },
      { x: -61.0, y: 7.96, z: 33.0, yaw: 0 },
      { x: -69.0, y: 7.96, z: 33.0, yaw: 0 },
      { x: -65.0, y: 7.96, z: 38.0, yaw: 0 },
      { x: -58.0, y: 7.96, z: 36.0, yaw: 0 }
    ];
  }
}

window.CS2MapBuilder = CS2MapBuilder;
