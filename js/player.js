// CS2 First-Person Player Controller:
// Real Weapon Textures, Articulated Tactical Viewmodel Arms/Hands, Recoil Spray Patterns,
// Discrete Space Jump (No Auto-Bhop), Crate Duck-Jumping, Counter-Strafing,
// Optimized AABB Feeler Raycasts, Volumetric Smoke, HE Grenade Shockwave, and Smooth Spectator Chase Cam

class CS2Player {
  constructor(camera, scene, mapBuilder) {
    this.camera = camera;
    this.scene = scene;
    this.map = mapBuilder;

    // Protected Stats via AntiCheat memory canaries
    this.health = window.__CS2_AC.createProtectedValue(100);
    this.armor = window.__CS2_AC.createProtectedValue(100);
    this.hasHelmet = true;
    this.hasDefuseKit = false;
    this.money = window.__CS2_AC.createProtectedValue(800);
    this.team = 'CT';

    // Inventory Loadout: 1=Primary, 2=Secondary, 3=Knife, 4=Grenade, 5=C4
    // First round pistol-only loadout: gun and ammo only, zero free grenades
    this.inventory = {
      1: null,
      2: CS2_WEAPONS.usp,
      3: CS2_WEAPONS.knife,
      4: null,
      5: null
    };
    this.grenades = [];
    this.grenadeIndex = 0;
    this.activeSlot = 2;
    this.activeWeapon = CS2_WEAPONS.usp;

    // Ammo counts
    this.clipAmmo = window.__CS2_AC.createProtectedValue(12);
    this.reserveAmmo = window.__CS2_AC.createProtectedValue(24);

    // Persistent Ammo Storage per Weapon (Prevents free reload exploit on weapon switch)
    this.weaponAmmo = {};
    this.weaponAmmo[CS2_WEAPONS.usp.id] = {
      clip: CS2_WEAPONS.usp.clip,
      reserve: CS2_WEAPONS.usp.reserve
    };

    // Camera & Movement state (+20cm height: eye level at 2.0m)
    this.yaw = 0;
    this.pitch = 0;
    this.position = new THREE.Vector3(0, 2.2, -90);
    this.velocity = new THREE.Vector3();
    this.isGrounded = true;
    this.lastGroundY = -5.8;
    this.isCrouched = false;
    this.isScoped = false;
    this.playerHeight = 2.2;

    // Jump Input State (Strictly single-press: prevents auto bunny-hop)
    this.jumpRequested = false;
    this.spaceHeld = false;

    // Spectator Mode
    this.isSpectating = false;
    this.spectatorIndex = 0;
    this.spectatedTarget = null;

    // Active Thrown Grenades
    this.activeGrenades = [];

    // Weapon Texture Cache (Pre-loaded to eliminate hitching and runtime allocations)
    this.weaponTextureCache = {};
    this.initWeaponTextures();

    // Reusable Shooting & Raycasting Resources (144+ FPS optimization)
    this.shootRaycaster = new THREE.Raycaster();
    this.shootCamDir = new THREE.Vector3();
    this.knifeRay = new THREE.Raycaster();
    this.knifeDir = new THREE.Vector3();
    this.wallRaycaster = new THREE.Raycaster();
    this.wallOrigin = new THREE.Vector3();
    this.wallDir = new THREE.Vector3();
    this.downRaycaster = new THREE.Raycaster();
    this.downOrigin = new THREE.Vector3();
    this.downDir = new THREE.Vector3(0, -1, 0);

    // Pre-allocated Decal Pool for Bullet Holes (PolygonOffset prevents Z-fighting & clipping)
    this.bulletHoleGeo = new THREE.CircleGeometry(0.095, 8);
    this.bulletHoleMat = new THREE.MeshBasicMaterial({
      color: 0x141619,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });
    this.bulletHolePool = [];
    this.bulletHolePoolIndex = 0;
    for (let i = 0; i < 48; i++) {
      const mesh = new THREE.Mesh(this.bulletHoleGeo, this.bulletHoleMat);
      mesh.renderOrder = 99;
      mesh.visible = false;
      this.scene.add(mesh);
      this.bulletHolePool.push(mesh);
    }

    // Pre-allocated Shared Smoke Resources (eliminates shader hitch on grenade pop)
    this.sharedSmokeGeo = new THREE.SphereGeometry(5.4, 12, 12);
    this.sharedSmokeMat = new THREE.MeshLambertMaterial({
      color: 0xc8ccd2,
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    // Input States
    this.keys = {};
    this.keybinds = {
      forward: 'KeyW',
      backward: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      jump: 'Space',
      crouch: 'ControlLeft',
      walk: 'ShiftLeft',
      reload: 'KeyR',
      use: 'KeyE',
      drop: 'KeyG',
      buy: 'KeyB',
      slot1: 'Digit1',
      slot2: 'Digit2',
      slot3: 'Digit3',
      slot4: 'Digit4',
      slot5: 'Digit5',
      scoreboard: 'Tab',
      menu: 'Escape'
    };

    this.lastShotTime = 0;
    this.isShooting = false;
    this.sprayCount = 0;
    this.isReloading = false;
    this.reloadStartTime = 0;
    this.isPlanting = false;
    this.plantProgress = 0;
    this.isDefusing = false;
    this.defuseProgress = 0;
    this.sensitivity = 1.8;
    this.invertY = false;

    // Recoil Punch
    this.recoilPitch = 0;
    this.recoilYaw = 0;

    // Viewmodel Rig (weapons lit naturally by scene hemisphere & sun lights)
    this.viewmodelGroup = new THREE.Group();
    this.camera.add(this.viewmodelGroup);
    this.weaponRig = new THREE.Group();
    this.viewmodelGroup.add(this.weaponRig);

    // Muzzle Flash (Subtle realistic muzzle spark, zero screen-blocking circle)
    this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 8);
    this.muzzleLight.position.set(0.16, -0.12, -0.65);
    const flashGeo = new THREE.SphereGeometry(0.010, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.position.set(0.16, -0.12, -0.65);
    this.muzzleFlashMesh.visible = false;
    this.viewmodelGroup.add(this.muzzleLight);
    this.viewmodelGroup.add(this.muzzleFlashMesh);

    this.initControls();
    this.buildCurrentWeaponModel();
  }

  // Pre-caches all weapon textures from models/ directory (converted from TGA)
  initWeaponTextures() {
    const texFiles = [
      'w_rif_ak47.png', 'w_rif_m4a1.png', 'w_snip_awp.png', 'w_pist_glock18.png',
      'w_pist_usp.png', 'w_pist_deagle.png', 'w_knife_t.png', 'w_eq_smokegrenade.png',
      'w_eq_fraggrenade.png', 'w_eq_flashbang.png', 'w_rif_famas.png', 'w_rif_galil.png',
      'w_smg_mp5.png', 'w_smg_p90.png', 'w_shot_xm1014.png', 'w_rif_aug.png',
      'w_snip_scout.png', 'w_mach_m249.png', 'w_smg_mac10.png', 'w_smg_ump45.png',
      'w_pist_elite.png', 'w_pist_fiveseven.png', 'w_pist_p228.png', 'w_rif_sg552.png',
      'w_shot_m3super90.png', 'w_smg_tmp.png', 'w_snip_g3sg1.png', 'w_snip_sg550.png',
      'w_eq_defuser.png'
    ];
    const loader = new THREE.TextureLoader();
    for (const f of texFiles) {
      // Load from models/ (TGA→PNG conversions) first, fallback to textures/
      loader.load('models/' + f, (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.encoding = THREE.sRGBEncoding;
        this.weaponTextureCache[f] = tex;
      }, undefined, () => {
        // Fallback to textures/ directory
        loader.load('textures/' + f, (tex) => {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          this.weaponTextureCache[f] = tex;
        }, undefined, () => {});
      });
    }
    // Load FBX weapon models
    this.loadWeaponModels();
  }

  // Weapon ID → FBX mesh name mapping
  static WEAPON_MESH_MAP = {
    'glock': 'w_pist_elite_single',   // 9mm semi-auto pistol in the pack
    'usp': 'w_pist_usp',
    'p250': 'w_pist_p228',             // 228_lol
    'deagle': 'w_pist_deagle',
    'dualberettas': 'w_pist_elite',
    'fiveseven': 'w_pist_fiveseven',
    'tec9': 'w_pist_elite_single',
    'cz75': 'w_pist_fiveseven',
    'mac10': 'w_smg_mac10',
    'mp9': 'w_smg_tmp',
    'mp7': 'w_smg_mp5',
    'mp5sd': 'w_smg_mp5',
    'ump45': 'w_smg_ump45',
    'p90': 'w_smg_p90',
    'bizon': 'w_smg_p90',
    'nova': 'w_shot_m3super90',
    'xm1014': 'w_shot_xm1014',
    'mag7': 'w_shot_m3super90',
    'sawedoff': 'w_shot_xm1014',
    'negev': 'w_mach_m249',
    'm249': 'w_mach_m249',
    'ak47': 'w_rif_ak47',
    'm4a4': 'w_rif_m4a1',
    'm4a1s': 'w_rif_m4a1_silencer',
    'galil': 'w_rif_galil',
    'famas': 'w_rif_famas',
    'ssg08': 'w_snip_scout',
    'awp': 'w_snip_awp',
    'aug': 'w_rif_aug',
    'sg553': 'w_rif_sg552',
    'scar20': 'w_snip_sg550',
    'g3sg1': 'w_snip_g3sg1',
    'knife': 'w_knife_t',
    'hegrenade': 'w_eq_fraggrenade',
    'flashbang': 'w_eq_flashbang',
    'smokegrenade': 'w_eq_smokegrenade',
    'molotov': 'w_eq_fraggrenade',
    'defuser': 'w_eq_defuser'
  };

  // Weapon ID → texture filename mapping
  static WEAPON_TEX_MAP = {
    'glock': 'w_pist_glock18.png',
    'usp': 'w_pist_usp.png',
    'p250': 'w_pist_p228.png',
    'deagle': 'w_pist_deagle.png',
    'dualberettas': 'w_pist_elite.png',
    'fiveseven': 'w_pist_fiveseven.png',
    'tec9': 'w_pist_glock18.png',
    'cz75': 'w_pist_fiveseven.png',
    'mac10': 'w_smg_mac10.png',
    'mp9': 'w_smg_tmp.png',
    'mp7': 'w_smg_mp5.png',
    'mp5sd': 'w_smg_mp5.png',
    'ump45': 'w_smg_ump45.png',
    'p90': 'w_smg_p90.png',
    'bizon': 'w_smg_p90.png',
    'nova': 'w_shot_m3super90.png',
    'xm1014': 'w_shot_xm1014.png',
    'mag7': 'w_shot_m3super90.png',
    'sawedoff': 'w_shot_xm1014.png',
    'negev': 'w_mach_m249.png',
    'm249': 'w_mach_m249.png',
    'ak47': 'w_rif_ak47.png',
    'm4a4': 'w_rif_m4a1.png',
    'm4a1s': 'w_rif_m4a1.png',
    'galil': 'w_rif_galil.png',
    'famas': 'w_rif_famas.png',
    'ssg08': 'w_snip_scout.png',
    'awp': 'w_snip_awp.png',
    'aug': 'w_rif_aug.png',
    'sg553': 'w_rif_sg552.png',
    'scar20': 'w_snip_sg550.png',
    'g3sg1': 'w_snip_g3sg1.png',
    'knife': 'w_knife_t.png',
    'hegrenade': 'w_eq_fraggrenade.png',
    'flashbang': 'w_eq_flashbang.png',
    'smokegrenade': 'w_eq_smokegrenade.png',
    'molotov': 'w_eq_fraggrenade.png',
    'defuser': 'w_eq_defuser.png'
  };

  // Viewmodel positioning per weapon category: authentic forward orientation into crosshair
  static WEAPON_VIEWMODEL = {
    'pistols':    { pos: [0.14, -0.15, -0.28], scale: 0.018, rot: [Math.PI / 2, 0, 0] },
    'smgs':       { pos: [0.15, -0.16, -0.30], scale: 0.017, rot: [Math.PI / 2, 0, 0] },
    'rifles':     { pos: [0.15, -0.15, -0.28], scale: 0.016, rot: [Math.PI / 2, 0, 0] },
    'shotguns':   { pos: [0.15, -0.16, -0.30], scale: 0.016, rot: [Math.PI / 2, 0, 0] },
    'machineguns':{ pos: [0.14, -0.16, -0.30], scale: 0.016, rot: [Math.PI / 2, 0, 0] },
    'snipers':    { pos: [0.14, -0.15, -0.28], scale: 0.016, rot: [Math.PI / 2, 0, 0] },
    'equipment':  { pos: [0.14, -0.15, -0.28], scale: 0.018, rot: [Math.PI / 2, 0, 0] },
    'knife':      { pos: [0.15, -0.15, -0.26], scale: 0.016, rot: [Math.PI / 2, 0, 0] }
  };

  // Loads the FBX file containing all CSS weapon meshes
  loadWeaponModels() {
    this.weaponMeshCache = {};
    this.weaponModelsLoaded = false;

    if (typeof THREE.FBXLoader === 'undefined') {
      console.warn('FBXLoader not available — using procedural weapon models');
      return;
    }

    const fbxLoader = new THREE.FBXLoader();
    fbxLoader.load('models/css_weapons.fbx', (fbxScene) => {
      console.log('FBX weapon pack loaded, extracting meshes...');

      // Clean name mapping: e.g. "w_rif_ak47mdlw_rif_ak47" -> "w_rif_ak47"
      const cleanMeshName = (rawName) => {
        if (!rawName) return '';
        if (rawName === '228_lol') return 'w_pist_p228';
        let base = rawName.split('mdl')[0].toLowerCase();
        if (base === 'w_defuser') return 'w_eq_defuser';
        if (base === 'w_mach_m249para') return 'w_mach_m249';
        return base;
      };

      fbxScene.traverse((child) => {
        if (child.isMesh && child.name) {
          const raw = child.name;
          this.weaponMeshCache[raw] = child;
          const clean = cleanMeshName(raw);
          if (clean) {
            this.weaponMeshCache[clean] = child;
          }
        }
      });

      fbxScene.children.forEach((child) => {
        if (child.name) {
          const raw = child.name;
          const clean = cleanMeshName(raw);
          if (clean && !this.weaponMeshCache[clean]) {
            this.weaponMeshCache[clean] = child;
          }
        }
      });

      this.weaponModelsLoaded = true;
      console.log('Weapon meshes cached successfully:', Object.keys(this.weaponMeshCache).filter(k => !k.includes('mdl')).join(', '));

      // Rebuild current weapon immediately with authentic 3D mesh
      this.buildCurrentWeaponModel();
    }, undefined, (err) => {
      console.warn('Failed to load FBX weapons:', err);
    });
  }

  // Finds a weapon mesh in cache by exact clean name or fallback substring
  findWeaponMesh(meshName) {
    if (!this.weaponMeshCache) return null;
    if (this.weaponMeshCache[meshName]) return this.weaponMeshCache[meshName];
    const target = meshName.toLowerCase();
    const keys = Object.keys(this.weaponMeshCache);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === target || keys[i].toLowerCase().startsWith(target)) {
        return this.weaponMeshCache[keys[i]];
      }
    }
    return null;
  }

  getWeaponTexture(filename) {
    if (this.weaponTextureCache[filename]) {
      return this.weaponTextureCache[filename];
    }
    const loader = new THREE.TextureLoader();
    // Try models/ first (higher quality TGA→PNG), then textures/
    const tex = loader.load('models/' + filename, undefined, undefined, () => {
      loader.load('textures/' + filename);
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.weaponTextureCache[filename] = tex;
    return tex;
  }

  setTeam(team) {
    this.team = team;
    if (team === 'CT') {
      this.inventory[2] = CS2_WEAPONS.usp;
      this.inventory[4] = null;
      this.inventory[5] = null;
      this.hasDefuseKit = false;
    } else {
      this.inventory[2] = CS2_WEAPONS.glock;
      this.inventory[4] = null;
      this.inventory[5] = CS2_WEAPONS.c4;
      this.hasDefuseKit = false;
    }
    this.grenades = [];
    this.weaponAmmo = {};
    if (this.inventory[2]) {
      this.weaponAmmo[this.inventory[2].id] = {
        clip: this.inventory[2].clip,
        reserve: this.inventory[2].reserve
      };
    }
    this.switchSlot(2);
  }

  // Builds realistic tactical viewmodel arms, hands and 100% textured 3D weapon models
  buildCurrentWeaponModel() {
    while (this.weaponRig.children.length > 0) {
      this.weaponRig.remove(this.weaponRig.children[0]);
    }

    const w = this.activeWeapon;
    if (!w) return;

    const group = new THREE.Group();

    // 1. Tactical Operator Sleeves & Gloves (Proportioned to eliminate gap to body)
    const isCT = (this.team === 'CT');
    const sleeveColor = isCT ? 0x243548 : 0x584836; // CT SAS Navy vs T Phoenix Desert Khaki
    const gloveColor = 0x16181c;
    const knuckleColor = 0x2a2e36;

    const sleeveMat = new THREE.MeshStandardMaterial({ color: sleeveColor, roughness: 0.85, metalness: 0.05 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: gloveColor, roughness: 0.5, metalness: 0.2 });
    const knuckleMat = new THREE.MeshStandardMaterial({ color: knuckleColor, roughness: 0.35, metalness: 0.4 });

    // Creates an articulated tactical arm: forearm, sleeve cuff, glove palm, and knuckle guard
    // Originates completely off-screen below the viewport bezel, eliminating floating gaps
    const createTacticalArm = (pStart, pGrip, isLeft = false) => {
      const armGroup = new THREE.Group();
      const v = new THREE.Vector3().subVectors(pGrip, pStart);
      const len = v.length();
      const norm = v.clone().normalize();

      // Full Forearm Sleeve flaring toward shoulder, originating below screen bezel
      const sleeveGeo = new THREE.CylinderGeometry(0.046, 0.082, len * 0.96, 8);
      const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
      sleeve.position.copy(pStart).addScaledVector(norm, len * 0.48);
      sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), norm);
      armGroup.add(sleeve);

      // Wrinkled Sleeve Cuff
      const cuffGeo = new THREE.CylinderGeometry(0.050, 0.050, 0.040, 8);
      const cuff = new THREE.Mesh(cuffGeo, gloveMat);
      cuff.position.copy(pStart).addScaledVector(norm, len * 0.90);
      cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), norm);
      armGroup.add(cuff);

      // Tactical Combat Glove Palm
      const palmGeo = new THREE.BoxGeometry(0.058, 0.045, 0.075);
      const palm = new THREE.Mesh(palmGeo, gloveMat);
      palm.position.copy(pGrip);
      palm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), norm);
      armGroup.add(palm);

      // Carbon Knuckle Guard
      const knuckGeo = new THREE.BoxGeometry(0.052, 0.014, 0.038);
      const knuck = new THREE.Mesh(knuckGeo, knuckleMat);
      knuck.position.set(0, 0.024, 0.005);
      palm.add(knuck);

      // Wrapped Fingers holding the grip
      const fingerGeo = new THREE.CylinderGeometry(0.011, 0.010, 0.052, 5);
      for (let f = 0; f < 3; f++) {
        const finger = new THREE.Mesh(fingerGeo, gloveMat);
        finger.rotation.z = Math.PI / 2;
        finger.position.set(isLeft ? 0.026 : -0.026, -0.012 + f * 0.014, -0.022);
        palm.add(finger);
      }

      return armGroup;
    };

    // Right Arm: originates from bottom-right screen edge (behind camera plane, zero visible gap)
    const rStart = (w.id === 'c4')
      ? new THREE.Vector3(0.24, -0.52, 0.06)
      : new THREE.Vector3(0.28, -0.52, 0.06);

    const rGrip = (w.id === 'knife') 
      ? new THREE.Vector3(0.14, -0.22, -0.26)
      : (w.id === 'c4')
      ? new THREE.Vector3(0.09, -0.21, -0.28)
      : new THREE.Vector3(0.13, -0.18, -0.32);
    group.add(createTacticalArm(rStart, rGrip, false));

    // Left Arm: originates from bottom-left screen edge (zero visible gap)
    if (w.category === 'rifles' || w.id === 'awp' || w.id === 'p90' || w.id === 'xm1014' || w.id === 'famas' || w.id === 'galil' || w.id === 'aug') {
      const lStart = new THREE.Vector3(-0.25, -0.52, 0.06);
      const lGuard = new THREE.Vector3(0.08, -0.18, -0.44);
      group.add(createTacticalArm(lStart, lGuard, true));
    } else if (w.category === 'pistols') {
      const lStart = new THREE.Vector3(-0.22, -0.52, 0.06);
      const lCup = new THREE.Vector3(0.10, -0.21, -0.32);
      group.add(createTacticalArm(lStart, lCup, true));
    } else if (w.id === 'c4') {
      const lStart = new THREE.Vector3(-0.22, -0.52, 0.06);
      const lGrip = new THREE.Vector3(-0.03, -0.21, -0.28);
      group.add(createTacticalArm(lStart, lGrip, true));
    }

    // 2. Build 100% Textured 3D Weapon Model using textures/ PNGs
    this.buildTexturedWeaponModel(w, group);

    this.weaponRig.add(group);
  }

  // Maps every single weapon to its FBX mesh from the loaded model pack
  buildTexturedWeaponModel(w, group) {
    // Dedicated Molotov Cocktail Model (glass bottle + cloth rag + flaming wick)
    if (w.id === 'molotov' || w.id === 'incgrenade') {
      this.buildMolotovCocktail(group);
      return;
    }

    // Fallback: C4 always uses procedural (no FBX mesh for it)
    if (w.id === 'c4') {
      this.buildProceduralC4(group);
      return;
    }

    // Try to use real FBX mesh first
    if (this.weaponModelsLoaded && this.weaponMeshCache) {
      const meshName = CS2Player.WEAPON_MESH_MAP[w.id];
      if (meshName) {
        const cachedMesh = this.findWeaponMesh(meshName);
        if (cachedMesh) {
          const weaponClone = cachedMesh.clone(true);

          // Apply authentic weapon texture with full vertex normal computation
          const texFile = CS2Player.WEAPON_TEX_MAP[w.id];
          if (texFile) {
            const tex = this.getWeaponTexture(texFile);
            weaponClone.traverse((child) => {
              if (child.isMesh) {
                if (child.geometry) child.geometry.computeVertexNormals();
                child.material = new THREE.MeshLambertMaterial({
                  map: tex,
                  color: 0xffffff,
                  side: THREE.DoubleSide
                });
                child.material.needsUpdate = true;
              }
            });
            if (weaponClone.isMesh) {
              if (weaponClone.geometry) weaponClone.geometry.computeVertexNormals();
              weaponClone.material = new THREE.MeshLambertMaterial({
                map: tex,
                color: 0xffffff,
                side: THREE.DoubleSide
              });
              weaponClone.material.needsUpdate = true;
            }
          }

          // Determine viewmodel positioning based on weapon category
          let cat = w.category || 'rifles';
          if (w.id === 'knife') cat = 'knife';
          else if (w.id === 'hegrenade' || w.id === 'flashbang' || w.id === 'smokegrenade' || w.id === 'molotov') cat = 'equipment';
          else if (w.category === 'snipers' || w.id === 'awp' || w.id === 'ssg08' || w.id === 'g3sg1' || w.id === 'scar20') cat = 'snipers';
          else if (w.category === 'heavy' && (w.id === 'm249' || w.id === 'negev')) cat = 'machineguns';
          else if (w.category === 'heavy') cat = 'shotguns';

          const vm = CS2Player.WEAPON_VIEWMODEL[cat] || CS2Player.WEAPON_VIEWMODEL['rifles'];

          weaponClone.position.set(vm.pos[0], vm.pos[1], vm.pos[2]);
          weaponClone.scale.set(vm.scale, vm.scale, vm.scale);
          weaponClone.rotation.set(vm.rot[0], vm.rot[1], vm.rot[2]);

          // Position muzzle flash precisely at the forward barrel tip
          const isPistol = (cat === 'pistols');
          const isSniper = (cat === 'snipers');
          const barrelTipZ = isSniper ? -0.92 : (isPistol ? -0.52 : -0.78);
          this.muzzleFlashMesh.position.set(vm.pos[0] + 0.01, vm.pos[1] + 0.03, barrelTipZ);
          this.muzzleLight.position.copy(this.muzzleFlashMesh.position);

          group.add(weaponClone);
          return; // Successfully used real model
        }
      }
    }

    // Fallback: procedural model when FBX not loaded yet
    this.buildProceduralWeapon(w, group);
  }

  // Authentic CS2 Molotov Cocktail model with amber bottle, rag wick, and flickering flame
  buildMolotovCocktail(group) {
    const molyGroup = new THREE.Group();

    // Amber/brown glass bottle body
    const bottleGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.17, 12);
    const bottleMat = new THREE.MeshLambertMaterial({
      color: 0x964b00,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide
    });
    const bottle = new THREE.Mesh(bottleGeo, bottleMat);
    bottle.position.set(0, -0.02, 0);
    molyGroup.add(bottle);

    // Tapered neck
    const neckGeo = new THREE.CylinderGeometry(0.016, 0.026, 0.09, 10);
    const neckMat = new THREE.MeshLambertMaterial({
      color: 0x8b4513,
      transparent: true,
      opacity: 0.90,
      side: THREE.DoubleSide
    });
    const neck = new THREE.Mesh(neckGeo, neckMat);
    neck.position.set(0, 0.11, 0);
    molyGroup.add(neck);

    // Cloth rag wick
    const wickGeo = new THREE.CylinderGeometry(0.010, 0.012, 0.08, 8);
    const wickMat = new THREE.MeshLambertMaterial({ color: 0xdedede });
    const wick = new THREE.Mesh(wickGeo, wickMat);
    wick.position.set(0, 0.17, 0);
    wick.rotation.z = 0.2;
    molyGroup.add(wick);

    // Burning flame at wick tip
    const flameGeo = new THREE.ConeGeometry(0.028, 0.065, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(0.012, 0.22, 0);
    molyGroup.add(flame);

    const flameLight = new THREE.PointLight(0xff5511, 1.2, 3);
    flameLight.position.set(0.012, 0.22, 0);
    molyGroup.add(flameLight);

    molyGroup.position.set(0.14, -0.18, -0.32);
    molyGroup.rotation.set(-0.25, 0.2, 0);
    group.add(molyGroup);
  }

  // Procedural C4 Bomb with LCD and Keypad
  buildProceduralC4(group) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1c1f24';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#0a0d0a';
    ctx.fillRect(8, 8, 112, 35);
    ctx.fillStyle = '#ff2222';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('7355608', 64, 25);
    ctx.fillStyle = '#2e333b';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(16 + c * 34, 48 + r * 18, 26, 14);
      }
    }
    const c4Tex = new THREE.CanvasTexture(canvas);
    const c4Mat = new THREE.MeshLambertMaterial({ color: 0x826c52 });
    const c4Brick = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.1), c4Mat);
    c4Brick.position.set(0.03, -0.22, -0.28);
    c4Brick.rotation.set(-0.25, 0, 0);
    group.add(c4Brick);

    const tapeMat = new THREE.MeshLambertMaterial({ color: 0x666b72 });
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 0.11), tapeMat);
    tape.position.set(0.03, -0.19, -0.28);
    tape.rotation.set(-0.25, 0, 0);
    group.add(tape);

    const keypadMat = new THREE.MeshLambertMaterial({ map: c4Tex, roughness: 0.4 });
    const keypad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), keypadMat);
    keypad.position.set(0.06, -0.21, -0.23);
    keypad.rotation.set(-0.25, 0, 0);
    group.add(keypad);

    const ledGeo = new THREE.SphereGeometry(0.016, 6, 6);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0.06, -0.14, -0.23);
    group.add(led);

    const wireMat = new THREE.MeshBasicMaterial({ color: 0xdd2222 });
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.15, 6), wireMat);
    wire.position.set(-0.04, -0.20, -0.23);
    wire.rotation.set(-0.25, 0, 0.4);
    group.add(wire);
  }

  // Fallback procedural weapon models (used before FBX loads)
  buildProceduralWeapon(w, group) {
    const texFile = CS2Player.WEAPON_TEX_MAP[w.id] || 'w_rif_m4a1.png';
    const tex = this.getWeaponTexture(texFile);
    const mat = new THREE.MeshLambertMaterial({ map: tex });

    if (w.id === 'knife') {
      const bladeGeo = new THREE.BoxGeometry(0.016, 0.065, 0.32);
      const blade = new THREE.Mesh(bladeGeo, mat);
      blade.position.set(0.14, -0.18, -0.42);
      blade.rotation.x = 0.32;
      group.add(blade);
      const gripGeo = new THREE.CylinderGeometry(0.022, 0.020, 0.16, 8);
      const grip = new THREE.Mesh(gripGeo, new THREE.MeshLambertMaterial({ color: 0x1b1f24 }));
      grip.rotation.x = 0.32;
      grip.position.set(0.14, -0.24, -0.20);
      group.add(grip);
    } else if (w.category === 'pistols') {
      const slideGeo = new THREE.BoxGeometry(0.046, 0.052, 0.25);
      const slide = new THREE.Mesh(slideGeo, mat);
      slide.position.set(0.13, -0.17, -0.36);
      group.add(slide);
      const gripGeo = new THREE.BoxGeometry(0.040, 0.13, 0.085);
      const grip = new THREE.Mesh(gripGeo, new THREE.MeshLambertMaterial({ color: 0x1c1e22 }));
      grip.rotation.x = -0.32;
      grip.position.set(0.13, -0.27, -0.28);
      group.add(grip);
    } else if (w.id === 'smokegrenade' || w.id === 'flashbang' || w.id === 'hegrenade' || w.id === 'molotov') {
      const grenGeo = new THREE.CylinderGeometry(0.040, 0.040, 0.15, 12);
      const gren = new THREE.Mesh(grenGeo, mat);
      gren.position.set(0.13, -0.20, -0.38);
      group.add(gren);
    } else {
      // Generic rifle/SMG/shotgun shape
      const bodyGeo = new THREE.BoxGeometry(0.052, 0.095, 0.48);
      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.set(0.13, -0.17, -0.42);
      group.add(body);
      const barGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8);
      const bar = new THREE.Mesh(barGeo, new THREE.MeshLambertMaterial({ color: 0x16181b }));
      bar.rotation.x = Math.PI / 2;
      bar.position.set(0.13, -0.16, -0.66);
      group.add(bar);
    }
  }

  // Cycles through grenades in inventory when pressing key 4
  cycleGrenade() {
    if (!this.grenades || this.grenades.length <= 1) return;
    this.grenadeIndex = (this.grenadeIndex + 1) % this.grenades.length;
    this.inventory[4] = this.grenades[this.grenadeIndex];
    this.switchSlot(4);
  }

  initControls() {
    window.addEventListener('keydown', (e) => {
      // Block browser shortcuts (Ctrl+W, Ctrl+N, Ctrl+T, etc.) during gameplay
      if (e.ctrlKey && (e.code === 'KeyW' || e.code === 'KeyN' || e.code === 'KeyT' || e.code === 'KeyR')) {
        e.preventDefault();
        e.stopPropagation();
      }

      this.keys[e.code] = true;

      // Discrete Space bar jump trigger: prevents continuous bunny-hop when holding space
      if (e.code === 'Space') {
        if (!this.spaceHeld) {
          this.jumpRequested = true;
        }
        this.spaceHeld = true;
      }

      // Spectator Cycle: A or D
      if (this.isSpectating) {
        if (e.code === 'KeyA') this.cycleSpectator(-1);
        if (e.code === 'KeyD') this.cycleSpectator(1);
        return;
      }

      if (e.code === this.keybinds.slot1) this.switchSlot(1);
      if (e.code === this.keybinds.slot2) this.switchSlot(2);
      if (e.code === this.keybinds.slot3) this.switchSlot(3);
      if (e.code === this.keybinds.slot4) {
        if (this.activeSlot === 4) this.cycleGrenade();
        else this.switchSlot(4);
      }
      if (e.code === this.keybinds.slot5) this.switchSlot(5);

      if (e.code === this.keybinds.reload) {
        this.startReload();
      }
      // Drop weapon (G key) - drops current weapon/utility as pickup on ground
      if (e.code === this.keybinds.drop) {
        this.dropCurrentWeapon();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Space') {
        this.spaceHeld = false;
        this.jumpRequested = false;
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (!document.pointerLockElement) return;

      if (this.isSpectating) {
        if (e.button === 0) this.cycleSpectator(1);
        else if (e.button === 2) this.cycleSpectator(-1);
        return;
      }

      if (e.button === 0) {
        this.isShooting = true;
      } else if (e.button === 2) {
        // Right click: short underhand throw for grenades, or toggle scope for snipers
        if (this.activeSlot === 4 || (this.activeWeapon && this.activeWeapon.category === 'equipment')) {
          this.throwGrenade(true);
        } else {
          this.toggleScope();
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isShooting = false;
        this.sprayCount = 0;
      }
    });

    window.addEventListener('wheel', (e) => {
      if (!document.pointerLockElement) return;
      if (this.isSpectating) return;
      const slots = [1, 2, 3, 4, 5];
      const available = slots.filter(s => this.inventory[s] !== null);
      if (available.length <= 1) return;
      let curIdx = available.indexOf(this.activeSlot);
      if (curIdx === -1) curIdx = 0;
      if (e.deltaY > 0) {
        const nextIdx = (curIdx + 1) % available.length;
        this.switchSlot(available[nextIdx]);
      } else if (e.deltaY < 0) {
        const prevIdx = (curIdx - 1 + available.length) % available.length;
        this.switchSlot(available[prevIdx]);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;

      const sens = (this.sensitivity * 0.0012) * (this.isScoped ? 0.4 : 1.0);

      // Clamp mouse delta to prevent sudden camera teleporting/aimbot snap glitches
      const maxDelta = 65;
      const dx = Math.max(-maxDelta, Math.min(maxDelta, e.movementX));
      const dy = Math.max(-maxDelta, Math.min(maxDelta, e.movementY));

      this.yaw -= dx * sens;

      const invertMult = this.invertY ? -1 : 1;
      this.pitch -= dy * sens * invertMult;
      this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
    });
  }

  dropCurrentWeapon() {
    this.dropWeaponBySlot(this.activeSlot);
  }

  dropWeaponBySlot(dropSlot) {
    // Cannot drop knife (Slot 3)
    if (dropSlot === 3) return;
    if (!this.inventory[dropSlot]) return;

    const droppedWeapon = this.inventory[dropSlot];

    // Create authentic 3D pickup mesh on the ground
    const dropGroup = new THREE.Group();
    let meshCreated = false;

    if (this.weaponModelsLoaded && this.weaponMeshCache) {
      const meshName = CS2Player.WEAPON_MESH_MAP[droppedWeapon.id];
      if (meshName) {
        const cached = this.findWeaponMesh(meshName);
        if (cached) {
          const clone = cached.clone(true);
          const texFile = CS2Player.WEAPON_TEX_MAP[droppedWeapon.id];
          if (texFile) {
            const tex = this.getWeaponTexture(texFile);
            clone.traverse((child) => {
              if (child.isMesh) {
                if (child.geometry) child.geometry.computeVertexNormals();
                child.material = new THREE.MeshLambertMaterial({
                  map: tex,
                  color: 0xffffff,
                  side: THREE.DoubleSide
                });
              }
            });
          }
          clone.scale.set(0.016, 0.016, 0.016);
          clone.rotation.set(Math.PI / 2, 0, Math.PI);
          dropGroup.add(clone);
          meshCreated = true;
        }
      }
    }

    if (!meshCreated) {
      const texFile = CS2Player.WEAPON_TEX_MAP[droppedWeapon.id] || 'w_rif_ak47.png';
      const tex = this.getWeaponTexture(texFile);
      const boxMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, side: THREE.DoubleSide });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.45), boxMat);
      dropGroup.add(box);
    }

    // Position weapon on the ground in front of the player
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const dropPos = this.position.clone().addScaledVector(fwd, 1.1);
    let finalGroundY = (this.lastGroundY !== undefined ? this.lastGroundY : 0.0);
    if (this.map && this.map.groundMeshes && this.map.groundMeshes.length > 0) {
      const gRay = new THREE.Raycaster(new THREE.Vector3(dropPos.x, this.position.y + 1.0, dropPos.z), new THREE.Vector3(0, -1, 0), 0.1, 15);
      const gHits = gRay.intersectObjects(this.map.groundMeshes, false);
      if (gHits.length > 0) {
        finalGroundY = gHits[0].point.y;
      }
    }
    dropPos.y = finalGroundY + 0.08;
    dropGroup.position.copy(dropPos);
    dropGroup.position.y += 0.35; // Dropping arc starting height
    dropGroup.rotation.y = this.yaw + 1.2;
    this.scene.add(dropGroup);

    // Dropping physics animation: animate drop to final ground position
    const startY = dropGroup.position.y;
    const targetY = finalGroundY + 0.08;
    const dropStartTime = performance.now();
    const animDrop = () => {
      const elapsed = performance.now() - dropStartTime;
      const progress = Math.min(1.0, elapsed / 220);
      dropGroup.position.y = startY + (targetY - startY) * (progress * progress);
      if (progress < 1.0) requestAnimationFrame(animDrop);
    };
    requestAnimationFrame(animDrop);

    // Register in world dropped items pool with timestamp
    if (!window._droppedItems) window._droppedItems = [];
    window._droppedItems.push({
      mesh: dropGroup,
      weapon: droppedWeapon,
      slot: dropSlot,
      pos: dropPos,
      droppedAt: performance.now()
    });

    // Remove from player inventory
    this.inventory[dropSlot] = null;
    if (dropSlot === 4) {
      const idx = this.grenades.findIndex(g => g && g.id === droppedWeapon.id);
      if (idx !== -1) this.grenades.splice(idx, 1);
      if (this.grenades.length > 0) {
        this.inventory[4] = this.grenades[0];
      }
    }

    // If we dropped the active weapon, switch to next available slot
    if (this.activeSlot === dropSlot) {
      const priorities = [1, 2, 3, 4, 5];
      let switched = false;
      for (const s of priorities) {
        if (s !== dropSlot && this.inventory[s]) {
          this.switchSlot(s);
          switched = true;
          break;
        }
      }
      if (!switched) this.switchSlot(3);
    }

    window.csAudio.playWeaponEquip('knife');
  }

  // Pick up dropped weapon (strict proximity < 1.6m or pressing [E])
  checkPickupItems() {
    const actionPrompt = document.getElementById('action-prompt');
    const actionText = document.getElementById('action-prompt-text');

    if (!window._droppedItems || window._droppedItems.length === 0) {
      if (actionPrompt && actionText && actionText.textContent.includes('PICK UP') && !this.isPlanting && !this.isDefusing) {
        actionPrompt.classList.add('hidden');
      }
      return;
    }

    const feetY = this.position.y - this.playerHeight;
    let nearbyPrompt = null;

    for (let i = window._droppedItems.length - 1; i >= 0; i--) {
      const item = window._droppedItems[i];
      const dx = this.position.x - item.pos.x;
      const dz = this.position.z - item.pos.z;
      const horizDist = Math.hypot(dx, dz);
      const vertDist = Math.abs(feetY - item.pos.y);

      // Strict proximity check: Must be close to the dropped weapon (< 1.6m)
      if (horizDist < 1.6 && vertDist < 1.4) {
        nearbyPrompt = `PRESS [E] TO PICK UP ${item.weapon.name}`;

        const timeSinceDrop = performance.now() - (item.droppedAt || 0);
        const slotEmpty = !this.inventory[item.slot];
        const wantPickup = (this.keys[this.keybinds.use] && timeSinceDrop > 250) || (horizDist < 1.1 && slotEmpty && timeSinceDrop > 1000);

        if (wantPickup) {
          const targetSlot = item.slot;

          // If slot already has a weapon and player presses E to swap, drop existing weapon first
          if (this.inventory[targetSlot] && targetSlot !== 4) {
            this.dropWeaponBySlot(targetSlot);
          }

          if (targetSlot === 4) {
            this.grenades.push(item.weapon);
            this.inventory[4] = item.weapon;
          } else {
            this.inventory[targetSlot] = item.weapon;
          }

          this.switchSlot(targetSlot);
          this.scene.remove(item.mesh);
          window._droppedItems.splice(i, 1);
          window.csAudio.playWeaponEquip(item.weapon.id);

          if (actionPrompt) actionPrompt.classList.add('hidden');
          break;
        }
      }
    }

    if (nearbyPrompt && actionPrompt && actionText && !this.isPlanting && !this.isDefusing) {
      actionText.textContent = nearbyPrompt;
      actionPrompt.classList.remove('hidden');
    } else if (actionPrompt && actionText && actionText.textContent.includes('PICK UP') && !this.isPlanting && !this.isDefusing) {
      actionPrompt.classList.add('hidden');
    }
  }

  enterSpectatorMode() {
    this.isSpectating = true;
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('spectator-hud').classList.remove('hidden');
    this.viewmodelGroup.visible = false;
    this.cycleSpectator(0);
  }

  exitSpectatorMode() {
    this.isSpectating = false;
    document.getElementById('spectator-hud').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.viewmodelGroup.visible = true;
  }

  cycleSpectator(dir) {
    if (!window.csGameManager || !window.csGameManager.net) return;
    const rem = Object.values(window.csGameManager.net.remotePlayers).filter(p => p && p.mesh && p.mesh.visible);
    if (rem.length === 0) {
      this.spectatedTarget = null;
      const tName = document.getElementById('spectator-target-name');
      if (tName) tName.innerText = 'OVERVIEW CAMERA (DE_DUST2)';
      return;
    }
    this.spectatorIndex = (this.spectatorIndex + dir + rem.length) % rem.length;
    this.spectatedTarget = rem[this.spectatorIndex];
    const tName = document.getElementById('spectator-target-name');
    if (tName) tName.innerText = `Player_${this.spectatorIndex + 1} (${this.spectatedTarget.team})`;
  }

  toggleScope() {
    if (!this.activeWeapon || !this.activeWeapon.canScope) return;
    this.isScoped = !this.isScoped;
    const scopeEl = document.getElementById('scope-overlay');
    if (this.isScoped) {
      this.camera.fov = 25;
      scopeEl.classList.remove('hidden');
      this.viewmodelGroup.visible = false;
      window.csAudio.playZoom();
    } else {
      this.camera.fov = Number(document.getElementById('setting-fov').value) || 85;
      scopeEl.classList.add('hidden');
      this.viewmodelGroup.visible = true;
    }
    this.camera.updateProjectionMatrix();
  }

  switchSlot(slot) {
    if (!this.inventory[slot]) return;

    // Save previous weapon persistent ammo before switching
    if (this.activeWeapon && this.activeWeapon.clip) {
      this.weaponAmmo[this.activeWeapon.id] = {
        clip: this.clipAmmo.get(),
        reserve: this.reserveAmmo.get()
      };
    }

    this.activeSlot = slot;
    this.activeWeapon = this.inventory[slot];
    this.isReloading = false;
    this.isShooting = false;
    this.sprayCount = 0;
    if (this.isScoped) this.toggleScope();

    // Restore persistent ammo
    if (this.activeWeapon.clip) {
      if (!this.weaponAmmo[this.activeWeapon.id]) {
        this.weaponAmmo[this.activeWeapon.id] = {
          clip: this.activeWeapon.clip,
          reserve: this.activeWeapon.reserve
        };
      }
      const saved = this.weaponAmmo[this.activeWeapon.id];
      this.clipAmmo.set(saved.clip);
      this.reserveAmmo.set(saved.reserve);
    }

    window.csAudio.playWeaponEquip(this.activeWeapon.id);
    this.buildCurrentWeaponModel();
    this.updateSlotHUD();
  }

  updateSlotHUD() {
    const slotElements = document.querySelectorAll('.slot-item');
    slotElements.forEach(el => {
      const s = parseInt(el.dataset.slot, 10);
      el.classList.toggle('active', s === this.activeSlot);
    });
  }

  startReload() {
    if (!this.activeWeapon || !this.activeWeapon.clip) return;
    if (this.isReloading) return;
    if (this.clipAmmo.get() >= this.activeWeapon.clip) return;
    if (this.reserveAmmo.get() <= 0) return;

    this.isReloading = true;
    this.reloadStartTime = performance.now();
    window.csAudio.playWeaponReload(this.activeWeapon.id);
  }

  finishReload() {
    this.isReloading = false;
    const needed = this.activeWeapon.clip - this.clipAmmo.get();
    const available = this.reserveAmmo.get();
    const added = Math.min(needed, available);
    this.clipAmmo.add(added);
    this.reserveAmmo.add(-added);
    if (this.weaponAmmo[this.activeWeapon.id]) {
      this.weaponAmmo[this.activeWeapon.id].clip = this.clipAmmo.get();
      this.weaponAmmo[this.activeWeapon.id].reserve = this.reserveAmmo.get();
    }
  }

  shoot(currentTime, gameManager = null) {
    if (!this.activeWeapon) return;

    // Freezetime shoot lock
    if (gameManager && gameManager.phase === 'freeze') {
      return;
    }

    // C4 Bomb or Objective items cannot shoot bullets
    if (this.activeSlot === 5 || this.activeWeapon.id === 'c4' || this.activeWeapon.category === 'objective') {
      this.isShooting = false;
      return;
    }

    // Grenade throwing (Slot 4)
    if (this.activeSlot === 4 || this.activeWeapon.category === 'equipment') {
      if (currentTime - this.lastShotTime < 0.8) return;
      this.lastShotTime = currentTime;
      this.throwGrenade(false);
      this.isShooting = false;
      return;
    }

    // Knife melee attack with real damage
    if (this.activeWeapon.category === 'melee') {
      if (currentTime - this.lastShotTime < this.activeWeapon.fireRate) return;
      this.lastShotTime = currentTime;
      this.isShooting = false;
      window.csAudio.playKnifeSlash();
      this.weaponRig.position.z = -0.32;
      this.weaponRig.rotation.y = 0.35;
      setTimeout(() => {
        this.weaponRig.rotation.y = 0;
      }, 120);

      // Raycast for knife melee damage up to 3.2 meters
      if (gameManager && gameManager.net) {
        this.camera.getWorldDirection(this.knifeDir);
        this.knifeRay.set(this.camera.position, this.knifeDir);
        Object.entries(gameManager.net.remotePlayers).forEach(([id, p]) => {
          if (p.team === this.team || !p.mesh || !p.mesh.visible) return;
          const hits = this.knifeRay.intersectObject(p.mesh, true);
          if (hits.length > 0 && hits[0].distance < 3.2) {
            window.csAudio.playSound('knife_hit');
            gameManager.net.sendDamage(id, 45, 'Knife', false);
          }
        });
      }
      return;
    }

    if (this.clipAmmo.get() <= 0) {
      this.startReload();
      this.isShooting = false;
      return;
    }

    if (currentTime - this.lastShotTime < this.activeWeapon.fireRate) return;
    this.lastShotTime = currentTime;

    // Semi-automatic trigger (Pistols require a distinct click per bullet)
    const isSemiAuto = (this.activeWeapon.category === 'pistols' && this.activeWeapon.id !== 'cz75') ||
                       (this.activeWeapon.category === 'snipers' && this.activeWeapon.id !== 'scar20' && this.activeWeapon.id !== 'g3sg1') ||
                       (this.activeWeapon.category === 'heavy' && this.activeWeapon.id !== 'negev' && this.activeWeapon.id !== 'm249');
    if (isSemiAuto) {
      this.isShooting = false;
    }

    this.clipAmmo.add(-1);
    if (this.weaponAmmo[this.activeWeapon.id]) {
      this.weaponAmmo[this.activeWeapon.id].clip = this.clipAmmo.get();
    }
    window.csAudio.playGunshot(this.activeWeapon.audioType, this.activeWeapon.id, this.activeWeapon.isSilenced);
    if (gameManager && gameManager.net) {
      gameManager.net.sendShoot(this.activeWeapon.audioType, this.activeWeapon.id, this.activeWeapon.isSilenced, this.position);
    }

    this.muzzleLight.intensity = 2.5;
    this.muzzleFlashMesh.visible = true;
    setTimeout(() => {
      this.muzzleLight.intensity = 0;
      this.muzzleFlashMesh.visible = false;
    }, 45);

    // Authentic CS Recoil Spray Pattern
    this.sprayCount = (this.sprayCount || 0) + 1;
    const baseRecoil = this.activeWeapon.recoil || 0.024;
    let pitchKick = baseRecoil;
    let yawKick = 0;

    if (this.sprayCount <= 3) {
      // First 3 bullets: Direct upward climb
      pitchKick = baseRecoil * 1.35;
      yawKick = (Math.random() - 0.5) * baseRecoil * 0.15;
    } else if (this.sprayCount <= 8) {
      // Bullets 4 to 8: Recoil pulls to the left
      pitchKick = baseRecoil * 0.85;
      yawKick = -baseRecoil * 0.65;
    } else if (this.sprayCount <= 15) {
      // Bullets 9 to 15: Recoil swings across to the right
      pitchKick = baseRecoil * 0.35;
      yawKick = baseRecoil * 0.85;
    } else {
      // High spray: Horizontal sway
      pitchKick = baseRecoil * 0.20;
      yawKick = (Math.sin(this.sprayCount * 1.2) > 0 ? 1 : -1) * baseRecoil * 0.65;
    }

    this.recoilPitch += pitchKick;
    this.recoilYaw += yawKick;

    this.weaponRig.position.z = -0.42;

    // Raycast hit check & bullet penetration calculation
    this.camera.getWorldDirection(this.shootCamDir);
    this.shootRaycaster.set(this.camera.position, this.shootCamDir);

    // Wall & Obstacle Penetration Check (Hits map geometry and crates)
    let wallObstacles = [];
    if (this.map && this.map.groundMeshes && this.map.groundMeshes.length > 0) {
      wallObstacles = this.shootRaycaster.intersectObjects(this.map.groundMeshes, false);
      if (wallObstacles.length > 0 && wallObstacles[0].distance < 80) {
        const hit = wallObstacles[0];
        if (hit.face && hit.face.normal) {
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
          const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
          this.spawnBulletHole(hit.point, worldNormal);
        }
      }
    }

    // Hit players with authentic headshot/body multiplier, hit sound, and strict penetration rules
    if (gameManager && gameManager.net) {
      Object.entries(gameManager.net.remotePlayers).forEach(([id, p]) => {
        if (p.team === this.team) return;
        if (!p.mesh || !p.mesh.visible) return;
        const playerHits = this.shootRaycaster.intersectObject(p.mesh, true);
        if (playerHits.length > 0 && playerHits[0].distance < 120) {
          const playerDist = playerHits[0].distance;
          let canHit = true;
          let penetrationPenalty = 1.0;

          // Check for intervening walls between shooter and player
          if (wallObstacles.length > 0) {
            const intervening = wallObstacles.filter(w => w.distance < playerDist);
            if (intervening.length > 0) {
              const firstDist = intervening[0].distance;
              const lastDist = intervening[intervening.length - 1].distance;
              const wallThickness = lastDist - firstDist;

              // CS2 Authentic Wallbang:
              // Only thin wooden obstacles (crates, doors where thickness <= 1.35m) can be penetrated
              // Hard concrete/stone walls or thick structures completely absorb bullets
              const hasPen = (this.activeWeapon.armorPen && this.activeWeapon.armorPen >= 0.65) ||
                             (this.activeWeapon.category === 'rifles' || this.activeWeapon.id === 'awp' || this.activeWeapon.id === 'deagle');

              if (hasPen && wallThickness <= 1.35 && intervening.length <= 2) {
                // Wooden penetration: allowed with 50% damage reduction
                penetrationPenalty = 0.50;
              } else {
                // Hard stone/concrete wall or excessive thickness: bullet is completely blocked
                canHit = false;
              }
            }
          }

          if (canHit) {
            const hitPoint = playerHits[0].point;
            const relY = hitPoint.y - p.mesh.position.y;
            const isHeadshot = relY >= 1.60;
            const dmgMult = (isHeadshot ? 2.5 : 1.0) * penetrationPenalty;
            const finalDamage = Math.max(1, Math.round(this.activeWeapon.damage * dmgMult));

            if (isHeadshot) {
              window.csAudio.playHeadshotDink();
            } else {
              window.csAudio.playSound('damage1');
            }

            gameManager.net.sendDamage(id, finalDamage, this.activeWeapon.name, isHeadshot);
          }
        }
      });
    }
  }

  // High-performance bullet holes from pre-allocated object pool
  spawnBulletHole(point, normal) {
    if (!this.bulletHolePool || this.bulletHolePool.length === 0) return;
    const decal = this.bulletHolePool[this.bulletHolePoolIndex];
    this.bulletHolePoolIndex = (this.bulletHolePoolIndex + 1) % this.bulletHolePool.length;

    decal.position.copy(point).addScaledVector(normal, 0.022);
    decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    decal.visible = true;
    window.csAudio.playSound('bullet_impact', 'sfx', 0.5);
  }

  // Authentic CS2 tracer line from forward barrel tip to impact point
  spawnTracer(start, end) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffe680,
      transparent: true,
      opacity: 0.95
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    setTimeout(() => {
      this.scene.remove(line);
      geo.dispose();
      mat.dispose();
    }, 45);
  }

  // Physical thrown utility with authentic trajectory & velocity
  throwGrenade(isUnderhand = false) {
    if (!this.activeWeapon || this.activeSlot !== 4) return;
    window.csAudio.playGrenadeThrow();

    const spawnPos = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    const type = this.activeWeapon.id;

    // Visual grenade body
    let grenMesh;
    if (type === 'molotov') {
      const bGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.22, 8);
      const bMat = new THREE.MeshLambertMaterial({ color: 0x7c4516 });
      grenMesh = new THREE.Mesh(bGeo, bMat);
    } else if (type === 'smokegrenade') {
      const cGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8);
      const cMat = new THREE.MeshLambertMaterial({ color: 0x5a636e });
      grenMesh = new THREE.Mesh(cGeo, cMat);
    } else {
      const sGeo = new THREE.SphereGeometry(0.065, 8, 8);
      const sMat = new THREE.MeshLambertMaterial({ color: type === 'flashbang' ? 0x8898a8 : 0x3d4a36 });
      grenMesh = new THREE.Mesh(sGeo, sMat);
    }
    grenMesh.position.copy(spawnPos).addScaledVector(dir, 0.8);
    this.scene.add(grenMesh);

    // Speed: Left Click (long throw, 22 m/s) vs Right Click (short underhand lob, 9.5 m/s)
    const speed = isUnderhand ? 9.5 : 22.0;
    const upBoost = isUnderhand ? 2.5 : 5.0;
    const velocity = dir.clone().multiplyScalar(speed);
    velocity.y += upBoost;

    const gren = {
      mesh: grenMesh,
      velocity,
      lifetime: type === 'molotov' ? 2.2 : 1.7,
      type: type
    };
    this.activeGrenades.push(gren);

    // Consume from grenade inventory
    if (this.grenades && this.grenades.length > 0) {
      const idx = this.grenades.findIndex(g => g && g.id === type);
      if (idx !== -1) this.grenades.splice(idx, 1);
    }

    if (this.grenades && this.grenades.length > 0) {
      this.grenadeIndex = 0;
      this.inventory[4] = this.grenades[0];
      this.switchSlot(4);
    } else {
      this.inventory[4] = null;
      this.switchSlot(2);
    }
  }

  updateGrenades(dt) {
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.velocity.y -= 18.0 * dt;
      g.mesh.position.addScaledVector(g.velocity, dt);
      g.lifetime -= dt;

      // Real 3D Terrain Collision: raycast downward from grenade to find true ground height
      let groundY = (this.lastGroundY !== undefined) ? this.lastGroundY : -5.8;
      if (this.map && this.map.groundMeshes && this.map.groundMeshes.length > 0) {
        this.downOrigin.set(g.mesh.position.x, g.mesh.position.y + 0.6, g.mesh.position.z);
        this.downRaycaster.set(this.downOrigin, this.downDir);
        this.downRaycaster.far = 25.0;
        const gHits = this.downRaycaster.intersectObjects(this.map.groundMeshes, false);
        if (gHits.length > 0) {
          groundY = gHits[0].point.y;
        }
      }

      // Bounce on actual terrain floor
      if (g.mesh.position.y <= groundY + 0.12) {
        g.mesh.position.y = groundY + 0.12;
        g.velocity.y = -g.velocity.y * 0.35;
        g.velocity.x *= 0.65;
        g.velocity.z *= 0.65;
        if (g.type === 'molotov') g.lifetime = 0; // Molotov bursts immediately upon touching ground
      }

      if (g.lifetime <= 0) {
        const pos = g.mesh.position.clone();
        this.scene.remove(g.mesh);
        this.activeGrenades.splice(i, 1);

        if (g.type === 'flashbang') {
          window.csAudio.playFlashbangExplode();
          const flashEl = document.getElementById('flash-overlay');
          if (flashEl) {
            flashEl.style.opacity = '1';
            let op = 1.0;
            const fadeInterval = setInterval(() => {
              op -= 0.05;
              if (op <= 0) {
                flashEl.style.opacity = '0';
                clearInterval(fadeInterval);
              } else {
                flashEl.style.opacity = String(op);
              }
            }, 90);
          }
        } else if (g.type === 'hegrenade') {
          window.csAudio.playHEDetonate();

          // Authentic HE Grenade Fireball & Shockwave Animation
          const heGroup = new THREE.Group();
          heGroup.position.copy(pos);
          const fireballGeo = new THREE.SphereGeometry(2.4, 8, 8);
          const fireballMat = new THREE.MeshBasicMaterial({ color: 0xff6611, transparent: true, opacity: 0.95 });
          const fireball = new THREE.Mesh(fireballGeo, fireballMat);
          heGroup.add(fireball);

          const blastLight = new THREE.PointLight(0xff8822, 10, 16);
          blastLight.position.set(0, 0.5, 0);
          heGroup.add(blastLight);
          this.scene.add(heGroup);

          const expStart = performance.now();
          const expInterval = setInterval(() => {
            const expElapsed = (performance.now() - expStart) / 1000;
            if (expElapsed > 0.35) {
              clearInterval(expInterval);
              this.scene.remove(heGroup);
            } else {
              const sc = 1.0 + expElapsed * 5.0;
              fireball.scale.set(sc, sc, sc);
              fireballMat.opacity = Math.max(0, 0.95 - expElapsed * 2.8);
              blastLight.intensity = Math.max(0, 10 * (1 - expElapsed / 0.35));
            }
          }, 16);

          // Radial explosive blast damage to local player & remote enemies
          const pDist = this.position.distanceTo(pos);
          if (pDist <= 8.5) {
            const dmg = Math.round(85 * (1 - pDist / 8.5));
            this.takeDamage(dmg, 'HE Grenade', 'hegrenade');
          }
          if (window.csGameManager && window.csGameManager.net) {
            Object.entries(window.csGameManager.net.remotePlayers).forEach(([id, rp]) => {
              if (rp.mesh) {
                const dist = rp.mesh.position.distanceTo(pos);
                if (dist <= 8.5) {
                  const dmg = Math.round(85 * (1 - dist / 8.5));
                  window.csGameManager.net.sendDamage(id, dmg, 'HE Grenade', false);
                }
              }
            });
          }
        } else if (g.type === 'smokegrenade') {
          window.csAudio.playSmokeEmit();

          // Fully impenetrable CS2 Volumetric Smoke (Pre-allocated, Zero Shader Hitch)
          const smokeMesh = new THREE.Mesh(this.sharedSmokeGeo, this.sharedSmokeMat);
          smokeMesh.position.set(pos.x, pos.y + 1.8, pos.z);
          smokeMesh.scale.set(0.1, 0.1, 0.1);
          this.scene.add(smokeMesh);

          if (!window._activeSmokes) window._activeSmokes = [];
          const smokeRecord = { mesh: smokeMesh, pos: smokeMesh.position, radius: 5.4 };
          window._activeSmokes.push(smokeRecord);

          // Fast smooth expansion
          const expandStart = performance.now();
          const expandTimer = setInterval(() => {
            const elapsed = (performance.now() - expandStart) / 450;
            if (elapsed >= 1.0) {
              smokeMesh.scale.set(1.0, 1.0, 1.0);
              clearInterval(expandTimer);
            } else {
              const s = 0.1 + 0.9 * Math.sin(elapsed * Math.PI * 0.5);
              smokeMesh.scale.set(s, s, s);
            }
          }, 32);

          setTimeout(() => {
            window.csAudio.playSmokeClear();
            const idx = window._activeSmokes ? window._activeSmokes.indexOf(smokeRecord) : -1;
            if (idx !== -1) window._activeSmokes.splice(idx, 1);
            this.scene.remove(smokeMesh);
          }, 18000);
        } else if (g.type === 'molotov') {
          window.csAudio.playMolotovDetonate();
          const fireGroup = new THREE.Group();
          const fGeo = new THREE.CylinderGeometry(3.5, 3.8, 0.30, 10);
          const fMat = new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.85 });
          const fireMesh = new THREE.Mesh(fGeo, fMat);
          fireMesh.position.y = 0.15;
          fireGroup.add(fireMesh);

          for (let f = 0; f < 8; f++) {
            const flameGeo = new THREE.ConeGeometry(0.3, 1.2, 4);
            const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
            const flame = new THREE.Mesh(flameGeo, flameMat);
            flame.position.set((Math.random() - 0.5) * 5.0, 0.8, (Math.random() - 0.5) * 5.0);
            fireGroup.add(flame);
          }
          fireGroup.position.copy(pos);
          this.scene.add(fireGroup);

          const fireEndTime = Date.now() + 7500;
          const burnInterval = setInterval(() => {
            if (Date.now() > fireEndTime) {
              clearInterval(burnInterval);
              this.scene.remove(fireGroup);
              return;
            }
            if (this.position.distanceTo(pos) < 4.5) {
              this.takeDamage(12, 'Fire', 'molotov');
            }
          }, 500);
        }
      }
    }
  }

  takeDamage(amount, attackerName, weaponName) {
    const currentHealth = this.health.get();
    if (currentHealth <= 0) return;

    let dmg = amount;
    const currentArmor = this.armor.get();
    if (currentArmor > 0) {
      const absorbed = dmg * 0.45;
      dmg -= absorbed;
      this.armor.set(Math.max(0, currentArmor - Math.round(absorbed * 0.5)));
    }

    const newHealth = Math.max(0, currentHealth - Math.round(dmg));
    this.health.set(newHealth);
    window.csAudio.playDamage();

    const dmgVignette = document.getElementById('damage-vignette');
    if (dmgVignette) {
      dmgVignette.style.opacity = '0.8';
      setTimeout(() => { dmgVignette.style.opacity = '0'; }, 180);
    }

    if (newHealth <= 0) {
      this.onDeath(attackerName, weaponName);
    }
  }

  onDeath(attackerName, weaponName) {
    window.csAudio.playSound('death');
    if (this.isScoped) this.toggleScope();
    document.getElementById('action-prompt').classList.add('hidden');
    document.getElementById('interaction-bar-container').classList.add('hidden');

    // Drop weapons on death where player died
    if (this.inventory[1]) this.dropWeaponBySlot(1);
    if (this.inventory[2]) this.dropWeaponBySlot(2);
    if (this.inventory[4]) this.dropWeaponBySlot(4);

    this.enterSpectatorMode();
    if (window.csGameManager) {
      window.csGameManager.onEntityKilled(attackerName || 'Enemy', 'You', weaponName || 'Weapon', false, this.team);
      if (window.csGameManager.net) {
        window.csGameManager.net.sendDeath(attackerName || 'Enemy', 'Player', weaponName || 'Weapon', false, this.team);
      }
    }
  }

  // Clear bullet holes on round reset
  clearBulletHoles() {
    if (!this.bulletHolePool) return;
    for (let i = 0; i < this.bulletHolePool.length; i++) {
      this.bulletHolePool[i].visible = false;
    }
    this.bulletHolePoolIndex = 0;
  }

  // Raycast down from current position to snap to true ground (called after map OBJ loads)
  snapToGround() {
    if (!this.map || !this.map.groundMeshes || this.map.groundMeshes.length === 0) return;
    const rayOrigin = new THREE.Vector3(this.position.x, this.position.y + 5, this.position.z);
    const rayDir = new THREE.Vector3(0, -1, 0);
    const raycaster = new THREE.Raycaster(rayOrigin, rayDir, 0, 80);
    const hits = raycaster.intersectObjects(this.map.groundMeshes, false);
    if (hits.length > 0) {
      let bestY = -999;
      for (let i = 0; i < hits.length; i++) {
        if (hits[i].point.y > bestY) bestY = hits[i].point.y;
      }
      if (bestY > -900) {
        this.position.y = bestY + this.playerHeight;
        this.lastGroundY = bestY;
        this.isGrounded = true;
        this.velocity.y = 0;
      }
    }
  }

  respawn(spawnPos) {
    this.exitSpectatorMode();
    const defaultX = this.team === 'CT' ? -5.0 : -65.0;
    const defaultY = this.team === 'CT' ? -3.56 : 7.96; // Exact floor height (-5.76 / 5.76) + playerHeight
    const defaultZ = this.team === 'CT' ? -98.0 : 35.0;
    const defaultYaw = this.team === 'CT' ? Math.PI : 0;

    const posX = (spawnPos && spawnPos.x !== undefined) ? spawnPos.x : defaultX;
    let posY = (spawnPos && spawnPos.y !== undefined) ? spawnPos.y : defaultY;
    const posZ = (spawnPos && spawnPos.z !== undefined) ? spawnPos.z : defaultZ;

    // Raycast straight down from spawn to find real ground surface if map is loaded
    if (this.map && this.map.groundMeshes && this.map.groundMeshes.length > 0) {
      const rayOrigin = new THREE.Vector3(posX, posY + 4, posZ);
      const rayDir = new THREE.Vector3(0, -1, 0);
      const raycaster = new THREE.Raycaster(rayOrigin, rayDir, 0, 40);
      const hits = raycaster.intersectObjects(this.map.groundMeshes, false);
      if (hits.length > 0) {
        let bestY = -999;
        for (let i = 0; i < hits.length; i++) {
          const hitY = hits[i].point.y;
          if (hitY > bestY && hitY <= (posY + 1.0)) bestY = hitY;
        }
        if (bestY > -900) {
          posY = bestY + this.playerHeight;
        }
      }
    }

    this.position.set(posX, posY, posZ);
    this.yaw = (spawnPos && spawnPos.yaw !== undefined) ? spawnPos.yaw : defaultYaw;
    this.velocity.set(0, 0, 0);
    this.isGrounded = true;
    this.lastGroundY = posY - this.playerHeight;
    this.health.set(100);
    this.armor.set(100);
    this.isReloading = false;
    this.isShooting = false;
    this.sprayCount = 0;
    this.isPlanting = false;
    this.isDefusing = false;
    this.jumpRequested = false;
    this.spaceHeld = false;
    if (this.isScoped) this.toggleScope();

    // Reset fresh ammo for all loadout weapons on round respawn
    this.weaponAmmo = {};
    for (const slot of [1, 2]) {
      const w = this.inventory[slot];
      if (w && w.clip) {
        this.weaponAmmo[w.id] = { clip: w.clip, reserve: w.reserve };
      }
    }
    if (this.activeWeapon && this.activeWeapon.clip) {
      this.clipAmmo.set(this.activeWeapon.clip);
      this.reserveAmmo.set(this.activeWeapon.reserve);
    }
  }

  update(dt, currentTime, gameManager) {
    this.updateGrenades(dt);
    this.checkPickupItems();

    // Smooth Third-Person Spectator Chase Camera
    if (this.isSpectating) {
      if (this.spectatedTarget && this.spectatedTarget.mesh && this.spectatedTarget.mesh.visible) {
        const tPos = this.spectatedTarget.mesh.position;
        const tYaw = this.spectatedTarget.mesh.rotation.y;
        // Position camera 2.4m behind and 0.55m above the player's head
        const camX = tPos.x + Math.sin(tYaw) * 2.4;
        const camY = tPos.y + 2.15;
        const camZ = tPos.z + Math.cos(tYaw) * 2.4;
        this.camera.position.set(camX, camY, camZ);
        this.camera.lookAt(tPos.x, tPos.y + 1.45, tPos.z);
      } else {
        // Fallback: smooth orbit overview of A Site
        const t = performance.now() * 0.0004;
        this.camera.position.set(28 + Math.cos(t) * 18, 12, -118 + Math.sin(t) * 18);
        this.camera.lookAt(28, 0, -118);
      }
      return;
    }

    // Realistic Reload Animation
    if (this.isReloading) {
      const elapsed = currentTime - this.reloadStartTime;
      const t = Math.min(1.0, elapsed / 2200);

      this.weaponRig.position.y = -Math.sin(t * Math.PI) * 0.14;
      this.weaponRig.rotation.z = Math.sin(t * Math.PI) * 0.35;
      this.weaponRig.rotation.x = Math.sin(t * Math.PI) * 0.22;

      if (elapsed > 2200) {
        this.weaponRig.position.y = 0;
        this.weaponRig.rotation.z = 0;
        this.weaponRig.rotation.x = 0;
        this.finishReload();
      }
    }

    // Freezetime Lock (Movement & Shooting prohibited in real CS2)
    const inFreeze = gameManager && gameManager.phase === 'freeze';
    if (inFreeze) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      this.isShooting = false;
      this.sprayCount = 0;
    }

    if (this.isShooting && !this.isReloading && !inFreeze) {
      this.shoot(currentTime / 1000, gameManager);
    } else if (!this.isShooting && (currentTime / 1000 - this.lastShotTime > 0.35)) {
      this.sprayCount = 0;
    }

    // Authentic CS2 Movement Speeds (Knife provides run-boost)
    let baseSpeed = 7.0;
    if (this.activeWeapon) {
      if (this.activeWeapon.id === 'knife') baseSpeed = 8.2; // CS2 250 units/s Knife Boost
      else if (this.activeWeapon.category === 'pistols') baseSpeed = 7.5; // 240 units/s
      else if (this.activeWeapon.id === 'awp') baseSpeed = 5.8; // 200 units/s
      else baseSpeed = 6.8; // 215 units/s Rifles
    }

    // Mid-air speed dampening prevents sprint-jumping from going unrealistically fast
    const airMult = !this.isGrounded ? 0.82 : 1.0;
    const moveSpeed = (this.isCrouched ? 2.4 : this.keys[this.keybinds.walk] ? 3.4 : baseSpeed) * (this.isScoped ? 0.6 : 1.0) * airMult;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const wasGrounded = this.isGrounded;

    // Input Movement Calculation: Cannot move while planting or defusing
    const wishDir = new THREE.Vector3();
    if (!inFreeze && !this.isPlanting && !this.isDefusing) {
      if (this.keys[this.keybinds.forward]) wishDir.add(forward);
      if (this.keys[this.keybinds.backward]) wishDir.sub(forward);
      if (this.keys[this.keybinds.right]) wishDir.add(right);
      if (this.keys[this.keybinds.left]) wishDir.sub(right);
    }

    if (this.isPlanting || this.isDefusing) {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    // Authentic CS Counter-Strafing & Instant Stops
    if (wishDir.length() > 0) {
      wishDir.normalize();

      // If opposing input is detected on an axis, immediately halt momentum (Counter-Strafe)
      const curDot = (wishDir.x * this.velocity.x) + (wishDir.z * this.velocity.z);
      if (curDot < -0.1) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }

      this.velocity.x = wishDir.x * moveSpeed;
      this.velocity.z = wishDir.z * moveSpeed;

      if (this.isGrounded && Math.random() < 0.05) {
        window.csAudio.playFootstep();
      }
    } else {
      // Instant crisp deceleration upon releasing movement keys
      this.velocity.x *= 0.15;
      this.velocity.z *= 0.15;
      if (Math.abs(this.velocity.x) < 0.05) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.05) this.velocity.z = 0;
    }

    // Discrete Jump (Single press required, no auto bunny-hop)
    if (this.jumpRequested && this.isGrounded && !inFreeze && !this.isPlanting && !this.isDefusing) {
      this.jumpRequested = false;
      // Crouch-jump (duck-jump) boost (11.2) to easily clear and land on 2.8m Dust 2 crates
      const jumpImpulse = this.isCrouched ? 11.2 : 10.0;
      this.velocity.y = jumpImpulse;
      this.isGrounded = false;
      window.csAudio.playJump();
    }

    this.velocity.y -= 18.0 * dt;

    this.isCrouched = !!(this.keys[this.keybinds.crouch] || this.keys['KeyC']);
    const targetHeight = this.isCrouched ? 1.35 : 2.2;
    this.playerHeight += (targetHeight - this.playerHeight) * 0.2;

    const oldX = this.position.x;
    const oldZ = this.position.z;
    const playerRadius = 0.52;
    const colliders = this.map.colliders;

    // High-performance spatial candidate mesh filter: only raycasts against nearby ground meshes
    const getNearbyMeshes = (px, pz) => {
      if (!this.map || !this.map.groundMeshes || this.map.groundMeshes.length === 0) return [];
      const cands = [];
      const meshes = this.map.groundMeshes;
      for (let m = 0; m < meshes.length; m++) {
        const mesh = meshes[m];
        if (mesh.geometry && mesh.geometry.boundingBox) {
          const bb = mesh.geometry.boundingBox;
          const minX = bb.min.x * 0.045 - 3.5;
          const maxX = bb.max.x * 0.045 + 3.5;
          const minZ = -bb.max.y * 0.045 - 3.5;
          const maxZ = -bb.min.y * 0.045 + 3.5;
          if (px >= minX && px <= maxX && pz >= minZ && pz <= maxZ) {
            cands.push(mesh);
          }
        } else {
          cands.push(mesh);
        }
      }
      return cands.length > 0 ? cands : meshes;
    };

    // Feeler obstacle check at waist height (solid crates block walkover)
    const checkMeshWall = (dirX, dirZ, dist) => {
      const candidates = getNearbyMeshes(oldX, oldZ);
      if (candidates.length === 0) return false;
      this.wallDir.set(dirX, 0, dirZ).normalize();
      const currentFeetY = this.position.y - this.playerHeight;
      this.wallOrigin.set(oldX, currentFeetY + 0.85, oldZ);
      this.wallRaycaster.set(this.wallOrigin, this.wallDir);
      this.wallRaycaster.far = dist;
      const hits = this.wallRaycaster.intersectObjects(candidates, false);
      return hits.length > 0 && hits[0].distance < dist;
    };

    // 1. Resolve X movement (enables sliding smoothly along walls)
    this.position.x += this.velocity.x * dt;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.isClimbable) continue;
      const box = c.box;
      if (
        this.position.y > box.min.y && (this.position.y - this.playerHeight) < box.max.y &&
        this.position.x + playerRadius > box.min.x &&
        this.position.x - playerRadius < box.max.x &&
        oldZ + playerRadius > box.min.z &&
        oldZ - playerRadius < box.max.z
      ) {
        this.position.x = oldX;
        this.velocity.x = 0;
        break;
      }
    }
    if (Math.abs(this.velocity.x) > 0.05) {
      const dist = playerRadius + Math.abs(this.velocity.x * dt) + 0.05;
      if (checkMeshWall(Math.sign(this.velocity.x), 0, dist)) {
        this.position.x = oldX;
        this.velocity.x = 0;
      }
    }

    // 2. Resolve Z movement
    this.position.z += this.velocity.z * dt;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.isClimbable) continue;
      const box = c.box;
      if (
        this.position.y > box.min.y && (this.position.y - this.playerHeight) < box.max.y &&
        this.position.x + playerRadius > box.min.x &&
        this.position.x - playerRadius < box.max.x &&
        this.position.z + playerRadius > box.min.z &&
        this.position.z - playerRadius < box.max.z
      ) {
        this.position.z = oldZ;
        this.velocity.z = 0;
        break;
      }
    }
    if (Math.abs(this.velocity.z) > 0.05) {
      const dist = playerRadius + Math.abs(this.velocity.z * dt) + 0.05;
      if (checkMeshWall(0, Math.sign(this.velocity.z), dist)) {
        this.position.z = oldZ;
        this.velocity.z = 0;
      }
    }

    // Perimeter boundary clamp strictly preventing walking out onto exterior cliffs
    this.position.x = Math.max(-94.0, Math.min(65.0, this.position.x));
    this.position.z = Math.max(-134.0, Math.min(45.0, this.position.z));

    // 3. Resolve Y movement & Downward 3D Terrain Raycasting
    this.position.y += this.velocity.y * dt;

    let targetGroundY = (this.lastGroundY !== undefined) ? this.lastGroundY : -5.8;
    const groundCandidates = getNearbyMeshes(this.position.x, this.position.z);
    if (groundCandidates.length > 0) {
      this.downOrigin.set(this.position.x, this.position.y + 0.5, this.position.z);
      this.downRaycaster.set(this.downOrigin, this.downDir);
      this.downRaycaster.far = 12.0;
      const hits = this.downRaycaster.intersectObjects(groundCandidates, false);
      let foundGround = false;
      let highestGroundY = -999;
      for (let i = 0; i < hits.length; i++) {
        const ptY = hits[i].point.y;
        if (ptY <= (this.position.y - this.playerHeight + 0.8) && ptY > highestGroundY && ptY <= 16.0) {
          highestGroundY = ptY;
          foundGround = true;
        }
      }
      if (foundGround) {
        targetGroundY = highestGroundY;
        this.lastGroundY = highestGroundY;
      }
    }

    const groundSurfaceY = targetGroundY + this.playerHeight;
    const heightDiff = groundSurfaceY - this.position.y;

    if (this.position.y <= groundSurfaceY) {
      this.position.y = groundSurfaceY;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else if (this.isGrounded && heightDiff >= -0.05 && heightDiff <= 0.45) {
      // Step up gentle elevation
      this.position.y = groundSurfaceY;
      this.velocity.y = 0;
    } else {
      // Natural free-fall off crates and ledges (zero teleportation)
      this.isGrounded = false;
    }

    // Landing audio effect
    if (!wasGrounded && this.isGrounded && this.velocity.y <= 0) {
      window.csAudio.playLand();
    }

    // 4. Climbable site platforms & crates (solid footing on top, blocks walking through sides)
    const currentFeetY = this.position.y - this.playerHeight;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c.isClimbable) continue;
      const box = c.box;
      if (
        this.position.x + playerRadius > box.min.x &&
        this.position.x - playerRadius < box.max.x &&
        oldZ + playerRadius > box.min.z &&
        oldZ - playerRadius < box.max.z
      ) {
        if (currentFeetY >= c.topY - 0.45 && this.velocity.y <= 0) {
          this.position.y = c.topY + this.playerHeight;
          this.velocity.y = 0;
          this.isGrounded = true;
          this.lastGroundY = c.topY;
        } else if (currentFeetY < c.topY - 0.45) {
          this.position.x = oldX;
          this.velocity.x = 0;
        }
      }
      if (
        oldX + playerRadius > box.min.x &&
        oldX - playerRadius < box.max.x &&
        this.position.z + playerRadius > box.min.z &&
        this.position.z - playerRadius < box.max.z
      ) {
        if (currentFeetY >= c.topY - 0.45 && this.velocity.y <= 0) {
          this.position.y = c.topY + this.playerHeight;
          this.velocity.y = 0;
          this.isGrounded = true;
          this.lastGroundY = c.topY;
        } else if (currentFeetY < c.topY - 0.45) {
          this.position.z = oldZ;
          this.velocity.z = 0;
        }
      }
    }

    this.recoilPitch *= 0.88;
    this.recoilYaw *= 0.88;

    this.camera.position.copy(this.position);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + this.recoilYaw;
    this.camera.rotation.x = this.pitch + this.recoilPitch;

    // Viewmodel Recoil Recovery & Weapon Bobbing
    this.weaponRig.position.z += (-0.45 - this.weaponRig.position.z) * 0.15;
    const speed2D = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    const bob = Math.sin(currentTime * 0.008) * (speed2D * 0.004);
    if (!this.isReloading) {
      this.weaponRig.position.y = bob;
    }

    // Check if player camera is inside active smoke cloud
    const smokeBlindOverlay = document.getElementById('smoke-blindness-overlay');
    if (smokeBlindOverlay) {
      let insideSmoke = false;
      if (window._activeSmokes && window._activeSmokes.length > 0) {
        for (let s of window._activeSmokes) {
          if (this.position.distanceTo(s.pos) < s.radius * 0.95) {
            insideSmoke = true;
            break;
          }
        }
      }
      smokeBlindOverlay.classList.toggle('active', insideSmoke);
    }
  }
}

window.CS2Player = CS2Player;
