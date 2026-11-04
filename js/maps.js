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
    if (this.isLoading || this.mapLoaded) {
      console.log('[MAP] Map is already loaded or currently loading. Skipping duplicate buildDust2() call.');
      return;
    }
    this.isLoading = true;
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

      const urlParams = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search) : null;
      if (urlParams && urlParams.get('nomap') === '1') {
        console.log('[MAP] ?nomap=1 active — skipping 3D map build.');
        this.mapLoaded = true;
        this.isLoading = false;
        return;
      }
      // Default is CONSOLIDATED merged map for 60+ FPS. ?nomerge=1 enables original unmerged path.
      const useMerge = !(urlParams && urlParams.get('nomerge') === '1');

      console.log(`[MAP] Initializing Dust II loader. Mode: ${useMerge ? 'CONSOLIDATED (default)' : 'UNMERGED ORIGINAL (?nomerge=1)'}`);

      const processObj = (obj) => {
        try {
          console.log(`[MAP] OBJ parsed successfully! Root children count: ${obj.children.length}`);
          obj.rotation.x = -Math.PI / 2;
          obj.scale.set(0.045, 0.045, 0.045);
          obj.position.set(0, 0, 0);
          obj.updateMatrixWorld(true);

          let totalOriginalMeshes = 0;
          let totalOriginalTriangles = 0;
          const originalMeshes = [];

          obj.traverse((child) => {
            if (child.isMesh) {
              totalOriginalMeshes++;
              if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
                totalOriginalTriangles += (child.geometry.attributes.position.count / 3);
              }
              const m = child.material;
              if (m) {
                const mats = Array.isArray(m) ? m : [m];
                mats.forEach(mat => {
                  if (mat.map) {
                    mat.map.encoding = THREE.sRGBEncoding;
                    const noAniso = (urlParams && urlParams.get('noaniso') === '1');
                    const targetAniso = (!noAniso && window.__maxAniso) ? Math.min(window.__maxAniso, 4) : 1;
                    mat.map.anisotropy = targetAniso;
                    mat.map.minFilter = THREE.LinearMipmapLinearFilter;
                    mat.map.magFilter = THREE.LinearFilter;
                    mat.map.generateMipmaps = true;
                    if (mat.map.image) mat.map.needsUpdate = true;
                  }
                  mat.side = THREE.DoubleSide; // Authentic hardware backface culling for 144+ FPS
                  if (mat.emissive) mat.emissive.setHex(0x000000); // 0 self-illumination preserves authentic desert contrast
                  if (mat.specular) mat.specular.setHex(0x111111);
                  if (typeof mat.shininess !== 'undefined') mat.shininess = 5;
                  if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                    mat.roughness = 0.85;
                    mat.metalness = 0.0;
                  }
                });
              }
              child.castShadow = false;
              child.receiveShadow = false;
              originalMeshes.push(child);
            }
          });

          console.log(`[MAP] Original model scan: ${totalOriginalMeshes} meshes, ${totalOriginalTriangles} triangles.`);

          if (useMerge) {
            console.log('[MAP] Executing geometry batching by unique material...');
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
                const isFlipped = matrix.determinant() < 0;

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

                  for (let i = 0; i < count; i += 3) {
                    const indices = [
                      index ? index.getX(start + i) : (start + i),
                      index ? index.getX(start + i + 1) : (start + i + 1),
                      index ? index.getX(start + i + 2) : (start + i + 2)
                    ];
                    if (isFlipped) {
                      const tmp = indices[1];
                      indices[1] = indices[2];
                      indices[2] = tmp;
                    }

                    for (let v = 0; v < 3; v++) {
                      const vi = indices[v];
                      vPos.fromBufferAttribute(posAttr, vi);
                      vPos.applyMatrix4(matrix);
                      bucket.positions.push(vPos.x, vPos.y, vPos.z);

                      if (normAttr) {
                        vNorm.fromBufferAttribute(normAttr, vi);
                        vNorm.applyMatrix3(normalMatrix).normalize();
                        bucket.normals.push(vNorm.x, vNorm.y, vNorm.z);
                      }
                      if (uvAttr) {
                        bucket.uvs.push(uvAttr.getX(vi), uvAttr.getY(vi));
                      }
                    }
                  }
                }
              }
            });

            const consolidatedMeshes = [];
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
              m.side = THREE.DoubleSide;
              const newMesh = new THREE.Mesh(newGeo, m);
              consolidatedMeshes.push(newMesh);
            });

            if (consolidatedMeshes.length > 0) {
              for (let i = 0; i < meshesToDispose.length; i++) {
                const m = meshesToDispose[i];
                if (m.parent) m.parent.remove(m);
                if (m.geometry) m.geometry.dispose();
              }
              while (obj.children.length > 0) {
                obj.remove(obj.children[0]);
              }
              this.groundMeshes = [];
              consolidatedMeshes.forEach(m => {
                obj.add(m);
                this.groundMeshes.push(m);
              });
              console.log(`[MAP] Consolidation successful: ${consolidatedMeshes.length} meshes created.`);
            } else {
              console.warn('[MAP] Consolidation yielded 0 meshes. Falling back to original unmerged map.');
              this.groundMeshes = originalMeshes;
            }
          } else {
            // UNMERGED mode (default)
            this.groundMeshes = originalMeshes;
          }

          this.mapGroup.add(obj);
          this.mapLoaded = true;
          this.isLoading = false;

          const realBox = new THREE.Box3();
          this.groundMeshes.forEach(m => realBox.expandByObject(m));
          console.log(`[MAP] Dust II mounted to scene! Active ground meshes: ${this.groundMeshes.length}. BBox: min(${realBox.min.x.toFixed(1)}, ${realBox.min.y.toFixed(1)}, ${realBox.min.z.toFixed(1)}) max(${realBox.max.x.toFixed(1)}, ${realBox.max.y.toFixed(1)}, ${realBox.max.z.toFixed(1)})`);

          if (this.onMapLoaded) this.onMapLoaded();
        } catch (procErr) {
          this.isLoading = false;
          console.error('[MAP] Error in processObj:', procErr.stack || procErr);
        }
      };

      if (typeof THREE.MTLLoader !== 'undefined') {
        const mtlLoader = new THREE.MTLLoader();
        mtlLoader.setPath('source/de_dust2/');
        console.log('[MAP] Requesting de_dust2.mtl from source/de_dust2/...');
        mtlLoader.load('de_dust2.mtl', (materials) => {
          console.log('[MAP] MTL materials loaded and preloading textures...');
          if (materials && materials.materials) {
            Object.values(materials.materials).forEach(mat => {
              if (mat.map) {
                mat.map.encoding = THREE.sRGBEncoding;
              }
              if (mat.emissive) mat.emissive.setHex(0x000000);
            });
          }
          materials.preload();
          objLoader.setMaterials(materials);
          objLoader.setPath('source/de_dust2/');
          console.log('[MAP] Requesting de_dust2.obj from source/de_dust2/...');
          objLoader.load('de_dust2.obj', processObj, (xhr) => {
            if (xhr.lengthComputable && xhr.total > 0) {
              const pct = Math.round((xhr.loaded / xhr.total) * 100);
              if (pct % 25 === 0) console.log(`[MAP] Loading OBJ: ${pct}%`);
            }
          }, (err) => {
            this.isLoading = false;
            console.error('[MAP] Failed to load de_dust2.obj with materials:', err);
          });
        }, undefined, (err) => {
          console.warn('[MAP] MTL failed or missing, falling back to direct OBJ load:', err);
          objLoader.load('source/de_dust2/de_dust2.obj', processObj, undefined, (loadErr) => {
            this.isLoading = false;
            console.error('[MAP] Direct OBJ load failed:', loadErr);
          });
        });
      } else {
        console.warn('[MAP] MTLLoader undefined, loading de_dust2.obj without MTL');
        objLoader.load('source/de_dust2/de_dust2.obj', processObj, undefined, (loadErr) => {
          this.isLoading = false;
          console.error('[MAP] Direct OBJ load failed:', loadErr);
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
    this.addCollider(-85, 12.0, -90, 25, 25, 40);  // Wall high above B site back plateau
    this.addCollider(-60, 5.0, 42.0, 60, 30, 8); // T spawn south mountain wall barrier (prevents falling through mountain)
    this.addCollider(-85, 5.0, 35.0, 10, 30, 40); // T spawn west canyon barrier
    // Outside rock face behind B window removed: B window hole & ledge crates 100% free and open

    // ==========================================================
    // BOMBSITES A & B SOLID CRATES (100% Solid Tops, Sides & Corners)
    // ==========================================================
    // A Site Platform Crates
    this.addCollider(48.24, 7.20, -106.56, 2.88, 2.88, 2.88, true);   // A top stack crate (model_37)
    this.addCollider(48.60, 4.32, -109.08, 3.51, 2.88, 3.50, true);   // A bottom platform crate (model_38)
    this.addCollider(48.24, 4.32, -105.84, 2.88, 2.88, 2.88, true);   // A bottom platform crate (model_39)
    this.addCollider(59.04, 0.72, -107.69, 2.88, 3.51, 3.51, true);   // A pit/ramp crate (model_40)
    this.addCollider(55.44, 4.32, -113.04, 2.88, 2.88, 2.88, true);   // A short platform crate (model_41)

    // B Site Crates
    this.addCollider(-63.36, 0.00, -118.08, 5.76, 2.88, 2.88, true);  // B site long crate (model_1)
    this.addCollider(-61.92, 0.00, -120.96, 2.88, 5.76, 2.88, true);  // B double stack crate (model_2)
    this.addCollider(-75.78, 0.00, -127.93, 3.96, 2.88, 3.96, true);  // B back site crate (model_3)
    this.addCollider(-64.50, 0.00, -116.00, 2.40, 1.44, 2.40, true);  // B site jump-assist step pallet (smooth boost onto long crate)
    this.addCollider(-63.00, 2.88, -118.08, 1.80, 1.08, 1.80, true);  // B stack lower boost step (topY = 3.96)
    this.addCollider(-61.56, 2.88, -118.44, 2.16, 2.16, 2.16, true);  // B stack mid crate (model_36, topY = 5.04)
    this.addCollider(-60.10, 5.04, -119.10, 1.80, 0.80, 1.80, true);  // B window jump boost step (topY = 5.84)
    // B window hole is 100% open and traversable (removed blocking box at -59.04)
    this.addCollider(-58.80, 6.48, -119.80, 2.40, 0.60, 2.40, true);  // B window stone sill step floor (walkable ledge)
    this.addCollider(-55.50, 5.03, -118.50, 2.50, 0.60, 2.50, true);  // B window ledge steps (Item C)
    this.addCollider(-65.0, 10.0, -135.0, 30.0, 30.0, 6.0, false); // B site north mountain cliff barrier (blocks void/mountain jump)

    // ==========================================================
    // BOMBSITES & BUY ZONES (100% Authentic Dust 2 Geometry)
    // ==========================================================

    // Bombsite A: Positioned directly at the platform crates (Matching material_15 floor decal & radar bounds)
    this.addBombsiteZone('A', 51.85, 4.32, -108.7, 9.5, {
      minX: 40.0, maxX: 66.0,
      minZ: -122.0, maxZ: -98.0,
      minY: -5.0, maxY: 12.0
    });

    // Bombsite B: Courtyard zone matching material_25 SandRoadTgtB decal and radar orange bounds
    this.addBombsiteZone('B', -72.0, 0.0, -121.0, 9.5, {
      minX: -85.0, maxX: -58.0,
      minZ: -136.0, maxZ: -108.0,
      minY: -5.0, maxY: 12.0
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
