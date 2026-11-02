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
    this.armor = window.__CS2_AC.createProtectedValue(0);
    this.hasHelmet = false;
    this.hasDefuseKit = false;
    this.isAlive = true;
    this.isSpectating = false;
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

    // Pre-allocated Tracer Pool (eliminates garbage collection and shader compile on firing)
    this.tracerMat = new THREE.LineBasicMaterial({
      color: 0xffe680,
      transparent: true,
      opacity: 0.95
    });
    this.tracerPool = [];
    this.tracerPoolIndex = 0;
    for (let i = 0; i < 16; i++) {
      const tGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(tGeo, this.tracerMat);
      line.visible = false;
      this.scene.add(line);
      this.tracerPool.push(line);
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
    this.lastValidPosition = new THREE.Vector3(0, 0, 0);
    this.currentRecoilPitchDeg = 0;

    // Recoil Punch
    this.recoilPitch = 0;
    this.recoilYaw = 0;

    // Viewmodel Rig & Dedicated Lighting (Layer 1 isolated from world map, zero world blowout)
    this.viewmodelGroup = new THREE.Group();
    this.camera.add(this.viewmodelGroup);
    this.weaponRig = new THREE.Group();
    this.viewmodelGroup.add(this.weaponRig);

    this.camera.layers.enable(1);

    const vmAmber = new THREE.DirectionalLight(0xfff0dd, 0.55);
    vmAmber.position.set(0.25, 0.45, 0.20);
    vmAmber.layers.set(1);
    this.viewmodelGroup.add(vmAmber);

    const vmFill = new THREE.AmbientLight(0x8899aa, 0.45);
    vmFill.layers.set(1);
    this.viewmodelGroup.add(vmFill);

    // Muzzle Flash (Subtle realistic muzzle spark, zero screen-blocking circle)
    const flashGeo = new THREE.SphereGeometry(0.010, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.position.set(0.16, -0.12, -0.65);
    this.muzzleFlashMesh.visible = false;
    this.viewmodelGroup.add(this.muzzleFlashMesh);

    this.initControls();
    try {
      const savedCalib = localStorage.getItem('cs2_vm_calibration');
      if (savedCalib) {
        const parsed = JSON.parse(savedCalib);
        if (parsed && typeof parsed === 'object') {
          Object.assign(CS2Player.WEAPON_VIEWMODEL, parsed);
        }
      }
    } catch (e) {}
    this.buildCurrentWeaponModel();
  }

  // Pre-caches all weapon textures from models/ directory (converted from TGA)
  initWeaponTextures() {
    const texFiles = [
      'w_rif_ak47.png', 'w_rif_m4a1.png', 'w_snip_awp.png', 'w_pist_glock18.png',
      'w_pist_usp.png', 'w_pist_deagle.png', 'w_knife_t.png', 'w_knife_ct.png', 'w_eq_smokegrenade.png',
      'w_eq_fraggrenade.png', 'w_eq_flashbang.png', 'w_rif_famas.png', 'w_rif_galil.png',
      'w_smg_mp5.png', 'w_smg_p90.png', 'w_shot_xm1014.png', 'w_rif_aug.png',
      'w_snip_scout.png', 'w_mach_m249.png', 'w_smg_mac10.png', 'w_smg_ump45.png',
      'w_pist_elite.png', 'w_pist_fiveseven.png', 'w_pist_p228.png', 'w_rif_sg552.png',
      'w_shot_m3super90.png', 'w_smg_tmp.png', 'w_snip_g3sg1.png', 'w_snip_sg550.png',
      'w_eq_defuser.png'
    ];
    const loader = new THREE.TextureLoader();
    for (const f of texFiles) {
      // Load from models/ (verified PNG conversions from CSS assets) first, fallback to textures/
      loader.load('models/' + f, (tex) => {
        tex.flipY = false;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.encoding = THREE.sRGBEncoding;
        this.weaponTextureCache[f] = tex;
        if (this.activeWeapon) {
          const expected = (this.activeWeapon.id === 'knife')
            ? (this.team === 'CT' ? 'w_knife_ct.png' : 'w_knife_t.png')
            : (CS2Player.WEAPON_TEX_MAP[this.activeWeapon.id]);
          if (expected === f) {
            if (this.preparedWeaponCache) delete this.preparedWeaponCache[this.activeWeapon.id];
            this.buildCurrentWeaponModel();
          }
        }
      }, undefined, () => {
        loader.load('textures/' + f, (tex) => {
          tex.flipY = false;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.encoding = THREE.sRGBEncoding;
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
    'usp': 'w_pist_usp_silencer',
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
    'glock': 'w_pist_elite.png',
    'usp': 'w_pist_usp.png',
    'p250': 'w_pist_p228.png',
    'deagle': 'w_pist_deagle.png',
    'dualberettas': 'w_pist_elite.png',
    'fiveseven': 'w_pist_fiveseven.png',
    'tec9': 'w_pist_elite.png',
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
    'pistols':    { pos: [0.160, -0.160, -0.320], scale: 0.018, rot: [-270 * Math.PI / 180, -180 * Math.PI / 180, 0] },
    'mid-tier':   { pos: [0.150, -0.160, -0.300], scale: 0.016, rot: [-270 * Math.PI / 180, -180 * Math.PI / 180, 0] },
    'smgs':       { pos: [0.150, -0.160, -0.300], scale: 0.016, rot: [-270 * Math.PI / 180, -180 * Math.PI / 180, 0] },
    'rifles':     { pos: [0.150, -0.160, -0.300], scale: 0.016, rot: [-270 * Math.PI / 180, -180 * Math.PI / 180, 0] },
    'shotguns':   { pos: [0.150, -0.160, -0.300], scale: 0.016, rot: [-270 * Math.PI / 180, -180 * Math.PI / 180, 0] },
    'machineguns':{ pos: [0.150, -0.160, -0.300], scale: 0.016, rot: [-270 * Math.PI / 180, -180 * Math.PI / 180, 0] },
    'snipers':    { pos: [0.150, -0.160, -0.300], scale: 0.016, rot: [-270 * Math.PI / 180, -180 * Math.PI / 180, 0] },
    'equipment':  { pos: [0.150, -0.160, -0.300], scale: 0.020, rot: [0, 0, 0] },
    'melee':      { pos: [0.180, -0.160, -0.320], scale: 0.016, rot: [-270 * Math.PI / 180, -200.1 * Math.PI / 180, 14.3 * Math.PI / 180] },
    'knife':      { pos: [0.180, -0.160, -0.320], scale: 0.016, rot: [-270 * Math.PI / 180, -200.1 * Math.PI / 180, 14.3 * Math.PI / 180] }
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
          const clean = cleanMeshName(raw);
          child.cleanName = clean;
          child.name = clean;
          this.weaponMeshCache[clean] = child;
          this.weaponMeshCache[raw] = child;
        }
      });

      fbxScene.children.forEach((child) => {
        if (child.name) {
          const raw = child.name;
          const clean = cleanMeshName(raw);
          child.cleanName = clean;
          child.name = clean;
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
    // Load authentic texture with flipY=false: models/ first (converted PNGs), fallback to textures/
    const tex = loader.load('models/' + filename, (loaded) => {
      loaded.flipY = false;
      if (loaded.image) loaded.needsUpdate = true;
      this.weaponTextureCache[filename] = loaded;
    }, undefined, () => {
      loader.load('textures/' + filename, (fallback) => {
        fallback.flipY = false;
        if (fallback.image) fallback.needsUpdate = true;
        this.weaponTextureCache[filename] = fallback;
        if (fallback.image) {
          tex.image = fallback.image;
          tex.needsUpdate = true;
        }
      }, undefined, () => {
        loader.load('allcssweaponsinonemodel/textures_png/' + filename, (pTex) => {
          pTex.flipY = false;
          if (pTex.image) pTex.needsUpdate = true;
          this.weaponTextureCache[filename] = pTex;
          if (pTex.image) {
            tex.image = pTex.image;
            tex.needsUpdate = true;
          }
        });
      });
    });
    tex.flipY = false;
    this.weaponTextureCache[filename] = tex;
    return tex;
  }

  setTeam(team) {
    this.rebuildLoadout(team, false);
  }

  rebuildLoadout(team, isCarrier = false) {
    this.team = team;
    for (let s = 1; s <= 5; s++) {
      this.inventory[s] = null;
      delete this.inventory[s];
    }
    this.grenades = [];
    this.hasC4 = false;
    this.hasDefuseKit = false;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.isPlanting = false;
    this.isDefusing = false;
    if (this.preparedWeaponCache) {
      this.preparedWeaponCache = {};
    }

    if (team === 'CT') {
      this.inventory[2] = CS2_WEAPONS.usp;
      this.inventory[3] = CS2_WEAPONS.knife;
    } else {
      this.team = 'T';
      this.inventory[2] = CS2_WEAPONS.glock;
      this.inventory[3] = CS2_WEAPONS.knife;
      if (isCarrier) {
        this.inventory[5] = CS2_WEAPONS.c4;
        this.hasC4 = true;
      }
    }

    this.weaponAmmo = {};
    if (this.inventory[2]) {
      this.weaponAmmo[this.inventory[2].id] = {
        clip: this.inventory[2].clip,
        reserve: this.inventory[2].reserve
      };
    }
    if (this.inventory[3]) {
      this.weaponAmmo[this.inventory[3].id] = { clip: 1, reserve: 0 };
    }
    if (this.inventory[5]) {
      this.weaponAmmo[this.inventory[5].id] = { clip: 1, reserve: 0 };
    }

    this.switchSlot(2);
    this.updateSlotHUD();
  }

  // Builds realistic tactical viewmodel arms, hands and 100% textured 3D weapon models
  buildCurrentWeaponModel() {
    while (this.weaponRig.children.length > 0) {
      this.weaponRig.remove(this.weaponRig.children[0]);
    }

    const w = this.activeWeapon;
    if (!w) return;

    const group = new THREE.Group();

    // 1. Build authentic 100% Textured 3D Weapon Model using models/ & textures/
    this.buildTexturedWeaponModel(w, group);

    // 2. Build tactical first-person arms & sleeves holding the weapon
    const arms = this.buildFirstPersonArms(this.team, w);
    if (arms) group.add(arms);

    // 3. Set Layer 1 on viewmodel so dedicated lights illuminate it without leaking to map or being bleached by sun
    group.traverse(c => {
      if (c.isMesh) {
        c.layers.set(1);
      }
    });

    this.weaponRig.add(group);
  }

  buildFirstPersonArms(team, weapon) {
    const armsGroup = new THREE.Group();
    armsGroup.name = 'viewmodelArms';

    // Sleeve color: CT = dark navy blue (0x182432) with ribbing (0x223344), T = dark tactical olive (0x383226) with ribbing (0x484032)
    const isCT = (team === 'CT');
    const sleeveColor = isCT ? 0x182432 : 0x383226;
    const ribColor = isCT ? 0x243242 : 0x484032;
    const sleeveMat = new THREE.MeshLambertMaterial({ color: sleeveColor });
    const ribMat = new THREE.MeshLambertMaterial({ color: ribColor });
    const gloveMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
    const knuckleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });

    const isKnife = (weapon && (weapon.id === 'knife' || weapon.category === 'melee'));
    const isPistol = (weapon && (weapon.slot === 2 || weapon.category === 'pistols'));

    // Right Arm Forearm & Sleeve: sleek tactical sleeve angling from bottom-right into grip
    const rForearmGeo = new THREE.CylinderGeometry(0.024, 0.032, 0.28, 12);
    const rForearm = new THREE.Mesh(rForearmGeo, sleeveMat);
    rForearm.position.set(0.24, -0.32, -0.18);
    rForearm.rotation.set(-0.85, 0.22, -0.30);
    armsGroup.add(rForearm);

    // Sleeve cuff ring
    const rCuffGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.025, 12);
    const rCuff = new THREE.Mesh(rCuffGeo, ribMat);
    rCuff.position.set(0.19, -0.22, -0.24);
    rCuff.rotation.set(-0.85, 0.22, -0.30);
    armsGroup.add(rCuff);

    // Right Hand: Tactical composite glove palm wrapping the weapon grip
    const rGlovePalmGeo = new THREE.BoxGeometry(0.044, 0.038, 0.055);
    const rGlovePalm = new THREE.Mesh(rGlovePalmGeo, gloveMat);
    rGlovePalm.position.set(0.162, -0.180, -0.285);
    rGlovePalm.rotation.set(-0.35, 0.15, -0.12);
    armsGroup.add(rGlovePalm);

    // Knuckle protector plate
    const rKnuckleGeo = new THREE.BoxGeometry(0.046, 0.014, 0.025);
    const rKnuckle = new THREE.Mesh(rKnuckleGeo, knuckleMat);
    rKnuckle.position.set(0.162, -0.165, -0.295);
    rKnuckle.rotation.set(-0.35, 0.15, -0.12);
    armsGroup.add(rKnuckle);

    // Articulated fingers wrapping the weapon grip
    // 1. Index finger along frame/trigger
    const rIndexGeo = new THREE.BoxGeometry(0.012, 0.012, 0.035);
    const rIndex = new THREE.Mesh(rIndexGeo, gloveMat);
    rIndex.position.set(0.150, -0.170, -0.315);
    rIndex.rotation.set(-0.25, 0.15, -0.10);
    armsGroup.add(rIndex);

    // 2. Middle, ring, pinky fingers curled tightly across handle grip
    for (let f = 0; f < 3; f++) {
      const fingerGeo = new THREE.BoxGeometry(0.034, 0.012, 0.014);
      const finger = new THREE.Mesh(fingerGeo, gloveMat);
      finger.position.set(0.158, -0.185 - f * 0.013, -0.295 + f * 0.005);
      finger.rotation.set(-0.25, 0.15, -0.12);
      armsGroup.add(finger);
    }

    // 3. Thumb wrapping left side of grip
    const rThumbGeo = new THREE.BoxGeometry(0.014, 0.014, 0.030);
    const rThumb = new THREE.Mesh(rThumbGeo, gloveMat);
    rThumb.position.set(0.174, -0.170, -0.290);
    rThumb.rotation.set(-0.20, 0.35, 0.10);
    armsGroup.add(rThumb);

    // Left Arm & Support Hand: strictly for 2-handed weapons (rifles, smgs, snipers, shotguns, machineguns)
    if (!isKnife && !isPistol) {
      const lForearmGeo = new THREE.CylinderGeometry(0.024, 0.032, 0.32, 12);
      const lForearm = new THREE.Mesh(lForearmGeo, sleeveMat);
      lForearm.position.set(-0.04, -0.28, -0.22);
      lForearm.rotation.set(-0.55, -0.38, 0.38);
      armsGroup.add(lForearm);

      const lCuffGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.025, 12);
      const lCuff = new THREE.Mesh(lCuffGeo, ribMat);
      lCuff.position.set(0.01, -0.22, -0.27);
      lCuff.rotation.set(-0.55, -0.38, 0.38);
      armsGroup.add(lCuff);

      const lGloveGeo = new THREE.BoxGeometry(0.044, 0.038, 0.058);
      const lGlove = new THREE.Mesh(lGloveGeo, gloveMat);
      lGlove.position.set(0.08, -0.170, -0.34);
      lGlove.rotation.set(-0.28, -0.25, 0.22);
      armsGroup.add(lGlove);

      // Support hand cupped fingers supporting the underside of handguard
      const lFingersGeo = new THREE.BoxGeometry(0.036, 0.014, 0.028);
      const lFingers = new THREE.Mesh(lFingersGeo, gloveMat);
      lFingers.position.set(0.08, -0.160, -0.35);
      lFingers.rotation.set(-0.22, -0.20, 0.18);
      armsGroup.add(lFingers);
    }

    armsGroup.traverse(c => {
      if (c.isMesh) {
        c.layers.set(1);
      }
    });

    return armsGroup;
  }

  // Prepares weapon model by centering pivot, applying authentic texture, and normalizing CS dimensions
  prepareWeaponModel(cachedMesh, weaponId) {
    if (!cachedMesh) return null;
    if (this.preparedWeaponCache && this.preparedWeaponCache[weaponId]) {
      return this.preparedWeaponCache[weaponId].clone(true);
    }
    const clone = cachedMesh.clone(true);

    const isKnife = (weaponId === 'knife');
    const texFile = isKnife
      ? (this.team === 'CT' ? 'w_knife_ct.png' : 'w_knife_t.png')
      : (CS2Player.WEAPON_TEX_MAP[weaponId] || 'w_rif_ak47.png');
    const tex = this.getWeaponTexture(texFile);

    let matType = 'unknown';
    let mapLoaded = false;
    let mapDimensions = 'none';

    clone.traverse((child) => {
      if (child.isMesh) {
        // High-fidelity textured Lambert material with authentic sRGB diffuse
        const mat = new THREE.MeshLambertMaterial({
          map: tex,
          color: 0xffffff,
          side: THREE.DoubleSide
        });
        if (tex) {
          tex.encoding = THREE.sRGBEncoding;
          if (tex.image) {
            mat.needsUpdate = true;
            mapLoaded = true;
            mapDimensions = `${tex.image.width}x${tex.image.height}`;
          }
        }
        child.material = mat;
        matType = mat.type;
        child.layers.set(1);
      }
    });

    window.__heldWeaponDiagnostics = {
      weaponId: weaponId,
      meshName: cachedMesh.cleanName || (cachedMesh.name ? cachedMesh.name.split('mdl')[0] : 'unknown'),
      matType: matType,
      mapLoaded: mapLoaded,
      mapDimensions: mapDimensions,
      textureFile: texFile,
      textureUrl: (tex && tex.image && tex.image.src) ? tex.image.src : `models/${texFile}`,
      vmLightCount: this.viewmodelGroup ? this.viewmodelGroup.children.filter(c => c.isLight).length : 0
    };

    const wrapper = new THREE.Group();
    const inner = new THREE.Group();

    // Reset transform & compute bounding box
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.set(1, 1, 1);
    clone.updateMatrixWorld(true);

    const bbox = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    // Center mesh pivot
    clone.position.sub(center);
    inner.add(clone);

    // Category target real CS dimensions (in meters)
    const TARGET_DIMS = {
      'knife': 0.28,
      'pistols': 0.22,
      'smgs': 0.45,
      'rifles': 0.75,
      'snipers': 1.15,
      'shotguns': 0.85,
      'machineguns': 0.95,
      'equipment': 0.18
    };

    let cat = 'rifles';
    if (isKnife) cat = 'knife';
    else if (this.activeWeapon && this.activeWeapon.category) cat = this.activeWeapon.category;

    const maxDim = Math.max(size.x, size.y, size.z) || 1.0;
    const targetLength = TARGET_DIMS[cat] || 0.75;
    const scaleFactor = targetLength / maxDim;

    inner.scale.set(scaleFactor, scaleFactor, scaleFactor);
    wrapper.add(inner);

    if (!this.preparedWeaponCache) this.preparedWeaponCache = {};
    this.preparedWeaponCache[weaponId] = wrapper.clone(true);

    return wrapper;
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

    // Use genuine FBX mesh
    if (this.weaponModelsLoaded && this.weaponMeshCache) {
      const isKnife = (w.id === 'knife');
      const meshName = isKnife
        ? (this.team === 'CT' ? 'w_knife_ct' : 'w_knife_t')
        : CS2Player.WEAPON_MESH_MAP[w.id];

      if (meshName) {
        const cachedMesh = this.findWeaponMesh(meshName);
        if (cachedMesh) {
          const prepGroup = this.prepareWeaponModel(cachedMesh, w.id);
          if (prepGroup) {
            let cat = w.category || 'rifles';
            if (isKnife || w.category === 'melee') cat = 'knife';
            else if (w.id === 'hegrenade' || w.id === 'flashbang' || w.id === 'smokegrenade' || w.id === 'molotov') cat = 'equipment';
            else if (w.category === 'snipers' || w.id === 'awp' || w.id === 'ssg08' || w.id === 'g3sg1' || w.id === 'scar20') cat = 'snipers';
            else if (w.category === 'mid-tier') cat = 'mid-tier';

            const vm = CS2Player.WEAPON_VIEWMODEL[cat] || CS2Player.WEAPON_VIEWMODEL['rifles'];

            prepGroup.position.set(vm.pos[0], vm.pos[1], vm.pos[2]);
            prepGroup.rotation.set(vm.rot[0], vm.rot[1], vm.rot[2]);

            // Position muzzle flash precisely at the forward barrel tip
            const isPistol = (cat === 'pistols');
            const isSniper = (cat === 'snipers');
            const barrelTipZ = isSniper ? -0.92 : (isPistol ? -0.52 : -0.78);
            this.muzzleFlashMesh.position.set(vm.pos[0] + 0.01, vm.pos[1] + 0.03, barrelTipZ);

            this.activeWeaponMeshGroup = prepGroup;
            group.add(prepGroup);
            return;
          }
        }
      }
    }
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

    // Burning flame at wick tip (Emissive basic cone, zero PointLight overhead)
    const flameGeo = new THREE.ConeGeometry(0.028, 0.065, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(0.012, 0.22, 0);
    molyGroup.add(flame);

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

    const keypadMat = new THREE.MeshLambertMaterial({ map: c4Tex });
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

      // Orientation calibration tool under ?debug=1 (I/K/J/L/U/O + Arrows + [])
      const isDebug = !!(window.__CS2_DEBUG || (typeof window !== 'undefined' && window.location && window.location.search.includes('debug=1')));
      if (isDebug && this.activeWeapon) {
        let cat = this.activeWeapon.category || 'rifles';
        if (this.activeWeapon.id === 'knife' || this.activeWeapon.category === 'melee') cat = 'knife';
        else if (this.activeWeapon.category === 'snipers' || this.activeWeapon.id === 'awp') cat = 'snipers';
        const vm = CS2Player.WEAPON_VIEWMODEL[cat] || CS2Player.WEAPON_VIEWMODEL['rifles'];
        if (vm) {
          const stepRad = e.shiftKey ? (5 * Math.PI / 180) : (Math.PI / 2);
          const posStep = e.shiftKey ? 0.05 : 0.01;
          let changed = false;
          if (e.code === 'KeyI') { vm.rot[0] += stepRad; changed = true; }
          if (e.code === 'KeyK') { vm.rot[0] -= stepRad; changed = true; }
          if (e.code === 'KeyJ') { vm.rot[1] += stepRad; changed = true; }
          if (e.code === 'KeyL') { vm.rot[1] -= stepRad; changed = true; }
          if (e.code === 'KeyU') { vm.rot[2] += stepRad; changed = true; }
          if (e.code === 'KeyO') { vm.rot[2] -= stepRad; changed = true; }
          if (e.code === 'ArrowUp') { vm.pos[1] += posStep; changed = true; }
          if (e.code === 'ArrowDown') { vm.pos[1] -= posStep; changed = true; }
          if (e.code === 'ArrowLeft') { vm.pos[0] -= posStep; changed = true; }
          if (e.code === 'ArrowRight') { vm.pos[0] += posStep; changed = true; }
          if (e.code === 'PageUp') { vm.pos[2] -= posStep; changed = true; }
          if (e.code === 'PageDown') { vm.pos[2] += posStep; changed = true; }
          if (e.code === 'BracketLeft') { vm.scale = Math.max(0.001, (vm.scale || 0.016) - 0.001); changed = true; }
          if (e.code === 'BracketRight') { vm.scale = (vm.scale || 0.016) + 0.001; changed = true; }
          if (changed) {
            if (this.activeWeaponMeshGroup) {
              this.activeWeaponMeshGroup.position.set(vm.pos[0], vm.pos[1], vm.pos[2]);
              this.activeWeaponMeshGroup.rotation.set(vm.rot[0], vm.rot[1], vm.rot[2]);
            }
            const deg = vm.rot.map(r => ((r * 180 / Math.PI) % 360).toFixed(1));
            const logStr = `cat=${cat} rot=[${deg.join(', ')}°] pos=[${vm.pos.map(p=>p.toFixed(3)).join(', ')}] scale=${(vm.scale || 0.016).toFixed(3)}`;
            console.log(`[CALIBRATION] ${logStr}`);
            window.__lastWeaponCalibration = logStr;
            try {
              localStorage.setItem('cs2_vm_calibration', JSON.stringify(CS2Player.WEAPON_VIEWMODEL));
            } catch (err) {}
          }
        }
      }

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

      // Position debug hotkey (P key)
      if (e.code === 'KeyP') {
        const feetY = (this.position.y - this.playerHeight).toFixed(2);
        const gY = (typeof this.lastGroundY === 'number') ? this.lastGroundY.toFixed(2) : 'n/a';
        console.log(`[POS DEBUG] X: ${this.position.x.toFixed(2)}, Y: ${this.position.y.toFixed(2)}, Z: ${this.position.z.toFixed(2)} | feetY: ${feetY}, groundY: ${gY}, yaw: ${this.yaw.toFixed(2)}, pitch: ${this.pitch.toFixed(2)}, isGrounded: ${this.isGrounded}`);
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

  createWorldWeaponMesh(weaponId) {
    const dropGroup = new THREE.Group();
    if (weaponId === 'c4') {
      const c4Pack = new THREE.Group();
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x5a523a });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.18), bodyMat);
      c4Pack.add(body);
      const tapeMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.05, 0.08), tapeMat);
      c4Pack.add(tape);
      const ledMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), ledMat);
      led.position.set(0.08, 0.07, 0);
      c4Pack.add(led);
      dropGroup.add(c4Pack);
      return dropGroup;
    }

    const meshName = CS2Player.WEAPON_MESH_MAP[weaponId];
    if (meshName && this.findWeaponMesh) {
      const cached = this.findWeaponMesh(meshName);
      if (cached) {
        const clone = cached.clone(true);
        const texFile = CS2Player.WEAPON_TEX_MAP[weaponId] || 'w_rif_ak47.png';
        const tex = this.getWeaponTexture(texFile);
        clone.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshBasicMaterial({
              map: tex,
              side: THREE.FrontSide
            });
          }
        });
        clone.scale.set(0.016, 0.016, 0.016);
        // Lie completely flat on ground
        clone.rotation.set(Math.PI / 2, 0, Math.PI);
        dropGroup.add(clone);
        return dropGroup;
      }
    }

    // Proportional fallback box so pistols never look like rifles
    const w = CS2_WEAPONS[weaponId];
    const isPistol = (w && (w.slot === 2 || w.category === 'pistols'));
    const texFile = CS2Player.WEAPON_TEX_MAP[weaponId] || 'w_rif_ak47.png';
    const tex = this.getWeaponTexture(texFile);
    const boxMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, side: THREE.DoubleSide });
    const length = isPistol ? 0.22 : 0.70;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, length), boxMat);
    box.rotation.set(0, 0, Math.PI / 2);
    dropGroup.add(box);
    return dropGroup;
  }

  playViewmodelToss(onComplete) {
    if (!this.weaponRig) {
      if (onComplete) onComplete();
      return;
    }
    const origY = this.weaponRig.position.y;
    const origZ = this.weaponRig.position.z;
    const origRotX = this.weaponRig.rotation.x;
    const startTime = performance.now();
    const duration = 200; // 200ms authentic forward toss arc

    const step = (t) => {
      const elapsed = t - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      // Fast forward toss arc down and away
      this.weaponRig.position.y = origY - 0.25 * Math.sin(progress * Math.PI * 0.7);
      this.weaponRig.position.z = origZ - 0.16 * progress;
      this.weaponRig.rotation.x = origRotX - 0.55 * progress;

      if (progress < 1.0) {
        requestAnimationFrame(step);
      } else {
        this.weaponRig.position.y = origY;
        this.weaponRig.position.z = origZ;
        this.weaponRig.rotation.x = origRotX;
        if (onComplete) onComplete();
      }
    };
    requestAnimationFrame(step);
  }

  dropWeaponBySlot(dropSlot) {
    // Cannot drop knife (Slot 3)
    if (dropSlot === 3) {
      window.__lastReject = { type: 'drop_weapon', reason: 'Cannot drop knife', time: new Date().toLocaleTimeString() };
      return;
    }
    if (!this.inventory[dropSlot]) return;

    const droppedWeapon = this.inventory[dropSlot];
    const isDroppingActive = (this.activeSlot === dropSlot);

    // Remove from player inventory
    this.inventory[dropSlot] = null;
    if (dropSlot === 4) {
      const idx = this.grenades.findIndex(g => g && g.id === droppedWeapon.id);
      if (idx !== -1) this.grenades.splice(idx, 1);
      if (this.grenades.length > 0) {
        this.inventory[4] = this.grenades[0];
      }
    }

    const dropGroup = this.createWorldWeaponMesh(droppedWeapon.id);

    // Position weapon in front of player with launch velocity and spin
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const dropPos = this.position.clone().addScaledVector(fwd, 0.60);
    dropPos.y = this.position.y - 0.35; // Chest/hands height
    dropGroup.position.copy(dropPos);
    dropGroup.rotation.y = this.yaw;
    this.scene.add(dropGroup);

    let finalGroundY = (this.lastGroundY !== undefined ? this.lastGroundY : 0.0);
    if (this.map && this.map.groundMeshes && this.map.groundMeshes.length > 0) {
      const gRay = new THREE.Raycaster(new THREE.Vector3(dropPos.x, this.position.y + 0.5, dropPos.z), new THREE.Vector3(0, -1, 0), 0.1, 15);
      const gHits = gRay.intersectObjects(this.map.groundMeshes, false);
      if (gHits.length > 0) {
        finalGroundY = gHits[0].point.y;
      }
    }

    const dropId = `drop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Register into active dropped items with authentic physics trajectory
    if (!window._droppedItems) window._droppedItems = [];
    window._droppedItems.push({
      id: dropId,
      mesh: dropGroup,
      weapon: droppedWeapon,
      slot: dropSlot,
      pos: dropGroup.position,
      velocity: new THREE.Vector3(fwd.x * 4.2, 2.0, fwd.z * 4.2),
      angularVelocity: new THREE.Vector3(4.5, 5.0, 2.0),
      groundY: finalGroundY,
      isResting: false,
      droppedAt: performance.now()
    });

    if (window.csGameManager && window.csGameManager.net) {
      window.csGameManager.net.send({
        type: 'drop_weapon',
        itemId: dropId,
        weaponId: droppedWeapon.id,
        slot: dropSlot,
        pos: { x: dropPos.x, y: dropPos.y, z: dropPos.z }
      });
    }

    const nextSwitch = () => {
      if (isDroppingActive) {
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
      this.updateSlotHUD();
    };

    if (isDroppingActive) {
      this.playViewmodelToss(nextSwitch);
    } else {
      nextSwitch();
    }
  }

  // Pick up dropped weapon (proximity < 2.5m or pressing [E])
  checkPickupItems() {
    if (!this.actionPrompt) {
      this.actionPrompt = document.getElementById('action-prompt');
      this.actionText = document.getElementById('action-prompt-text');
    }
    const actionPrompt = this.actionPrompt;
    const actionText = this.actionText;

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

      // Proximity check: Must be close to the dropped weapon (< 2.5m)
      if (horizDist < 2.5 && vertDist < 2.0) {
        // Counter-Terrorists cannot pick up C4 explosive
        if (item.slot === 5 && this.team !== 'T') continue;

        nearbyPrompt = `PRESS [E] TO PICK UP ${item.weapon.name}`;

        const timeSinceDrop = performance.now() - (item.droppedAt || 0);
        const slotEmpty = !this.inventory[item.slot];
        const wantPickup = (this.keys[this.keybinds.use] && timeSinceDrop > 250) || (horizDist < 1.3 && slotEmpty && timeSinceDrop > 1000);

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

          if (window.csGameManager && window.csGameManager.net) {
            window.csGameManager.net.send({
              type: 'pickup_weapon',
              itemId: item.id,
              weaponId: item.weapon.id,
              slot: targetSlot
            });
          }

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
    this.camera.up.set(0, 1, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.z = 0;
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
    // Weapon switch deploy animation (lowers slightly and tilts up)
    this.weaponRig.position.y = -0.14;
    this.weaponRig.rotation.x = 0.12;
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
    this.reloadDurationMs = ((this.activeWeapon && this.activeWeapon.reloadTime) || 2.4) * 1000;
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

    // Semi-automatic trigger (Single shot per click unless weapon is full-auto)
    if (!this.activeWeapon.isAuto) {
      this.isShooting = false;
    }

    this.clipAmmo.add(-1);
    if (this.weaponAmmo[this.activeWeapon.id]) {
      this.weaponAmmo[this.activeWeapon.id].clip = this.clipAmmo.get();
    }
    window.csAudio.playGunshot(this.activeWeapon.audioType, this.activeWeapon.id, this.activeWeapon.isSilenced);
    if (gameManager && gameManager.net) {
      gameManager.net.sendShoot(this.activeWeapon.audioType, this.activeWeapon.id, this.activeWeapon.isSilenced, this.position);
      if (gameManager.net.sendWeaponFired) {
        gameManager.net.sendWeaponFired(this.activeWeapon.id);
      }
    }

    this.muzzleFlashMesh.visible = true;
    setTimeout(() => {
      this.muzzleFlashMesh.visible = false;
    }, 40);

    // Authentic Deterministic CS Recoil Spray Pattern (Cumulative target scaling)
    this.sprayCount = (this.sprayCount || 0) + 1;
    const RECOIL_SCALE = 2.4; // AK-47 30-round spray climbs ~13.5 degrees (0.235 rad)

    if (this.activeWeapon.recoilPattern && this.activeWeapon.recoilPattern.length > 0) {
      const pIdx = Math.min(this.sprayCount - 1, this.activeWeapon.recoilPattern.length - 1);
      const pat = this.activeWeapon.recoilPattern[pIdx];
      this.targetRecoilPitch = (pat[0] || 0) * RECOIL_SCALE;
      this.targetRecoilYaw = (pat[1] || 0) * RECOIL_SCALE;
    } else {
      const kick = this.activeWeapon.recoil || 0.038;
      this.targetRecoilPitch = (this.targetRecoilPitch || 0) + kick;
      this.targetRecoilYaw = (this.targetRecoilYaw || 0) + (Math.random() - 0.5) * kick * 0.45;
    }

    // Viewmodel punch: kickback along Z and upward muzzle lift
    this.weaponRig.position.z = -0.41;
    this.weaponRig.rotation.x = 0.08;

    // Shotgun Multi-Pellet Spread vs Single Bullet Hit calculation
    this.camera.getWorldDirection(this.shootCamDir);
    const pelletCount = this.activeWeapon.pellets || 1;
    const pelletDmg = Math.max(1, Math.round(this.activeWeapon.damage / pelletCount));
    const baseSpread = this.activeWeapon.spread || 0.045;

    for (let pel = 0; pel < pelletCount; pel++) {
      const pDir = this.shootCamDir.clone();
      if (pelletCount > 1) {
        pDir.x += (Math.random() - 0.5) * baseSpread;
        pDir.y += (Math.random() - 0.5) * baseSpread;
        pDir.z += (Math.random() - 0.5) * baseSpread;
        pDir.normalize();
      }
      this.shootRaycaster.set(this.camera.position, pDir);

      // Wall & Obstacle Penetration Check (Hits map geometry and crates)
      let wallObstacles = [];
      if (this.map && this.map.groundMeshes && this.map.groundMeshes.length > 0) {
        wallObstacles = this.shootRaycaster.intersectObjects(this.map.groundMeshes, false);
        if (wallObstacles.length > 0 && wallObstacles[0].distance < 80) {
          const hit = wallObstacles[0];
          if (hit.face && hit.face.normal && (pel === 0 || Math.random() < 0.25)) {
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
          // Raycast authentic body & head hitboxes and character mesh
          const hitboxTargets = [];
          if (p.mesh.headHitbox) hitboxTargets.push(p.mesh.headHitbox);
          if (p.mesh.bodyHitbox) hitboxTargets.push(p.mesh.bodyHitbox);
          if (p.mesh.characterMesh) {
            p.mesh.characterMesh.traverse(c => {
              if (c.isMesh) hitboxTargets.push(c);
            });
          }
          if (hitboxTargets.length === 0) {
            const fallbackHb = p.mesh.getObjectByName('hitbox') || p.mesh;
            hitboxTargets.push(fallbackHb);
          }
          const playerHits = this.shootRaycaster.intersectObjects(hitboxTargets, false);
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

                const hasPen = (this.activeWeapon.armorPen && this.activeWeapon.armorPen >= 0.65) ||
                               (this.activeWeapon.category === 'rifles' || this.activeWeapon.id === 'awp' || this.activeWeapon.id === 'deagle');

                if (hasPen && wallThickness <= 1.35 && intervening.length <= 2) {
                  penetrationPenalty = 0.50;
                } else {
                  canHit = false;
                }
              }
            }

            if (canHit) {
              const hitObj = playerHits[0].object;
              const hitPoint = playerHits[0].point;
              // Headshot if hit head hitbox OR hit point Y is in the head region (top 25cm of model)
              let isHeadshot = (hitObj === p.mesh.headHitbox || (hitObj.userData && hitObj.userData.isHead === true));
              if (!isHeadshot && p.mesh) {
                const localHit = p.mesh.worldToLocal(hitPoint.clone());
                if (localHit.y >= 1.50) isHeadshot = true;
              }
              const dmgMult = (isHeadshot ? 4.0 : 1.0) * penetrationPenalty;
              const finalDamage = Math.max(1, Math.round(pelletDmg * dmgMult));

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

  // Authentic CS2 tracer line from forward barrel tip to impact point (zero allocation pooled)
  spawnTracer(start, end) {
    if (!this.tracerPool || this.tracerPool.length === 0) return;
    const line = this.tracerPool[this.tracerPoolIndex];
    this.tracerPoolIndex = (this.tracerPoolIndex + 1) % this.tracerPool.length;
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, start.x, start.y, start.z);
    pos.setXYZ(1, end.x, end.y, end.z);
    pos.needsUpdate = true;
    line.visible = true;
    setTimeout(() => {
      line.visible = false;
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

    // Drop primary weapon (or secondary pistol if no primary, plus C4 if carrying) on death
    if (this.inventory[1]) {
      this.dropWeaponBySlot(1);
    } else if (this.inventory[2]) {
      this.dropWeaponBySlot(2);
    }
    if (this.hasC4 && this.inventory[5]) this.dropWeaponBySlot(5);

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

    const hasValidSpawnPos = spawnPos && typeof spawnPos.x === 'number' && typeof spawnPos.z === 'number' && !(spawnPos.x === 0 && spawnPos.z === 0);
    const chosenSpawn = hasValidSpawnPos ? spawnPos : { x: defaultX, y: defaultY, z: defaultZ, yaw: defaultYaw, index: 0 };
    this.spawnIndex = (typeof chosenSpawn.index === 'number') ? chosenSpawn.index : (typeof spawnPos?.spawnIndex === 'number' ? spawnPos.spawnIndex : 0);

    const posX = chosenSpawn.x;
    let posY = (typeof chosenSpawn.y === 'number') ? chosenSpawn.y : defaultY;
    const posZ = chosenSpawn.z;
    const spawnYaw = (typeof chosenSpawn.yaw === 'number') ? chosenSpawn.yaw : defaultYaw;

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
    this.yaw = spawnYaw;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.camera.up.set(0, 1, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(0, this.yaw, 0);
    this.velocity.set(0, 0, 0);
    this.isGrounded = true;
    this.lastGroundY = posY - this.playerHeight;
    this.health.set(100);
    // In CS2, armor is only granted via buy menu or carried over if surviving. Never reset to 100 on respawn.
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

    // Realistic Reload Animation with weapon-specific duration
    if (this.isReloading) {
      const elapsed = currentTime - this.reloadStartTime;
      const reloadDur = this.reloadDurationMs || 2400;
      const t = Math.min(1.0, elapsed / reloadDur);

      this.weaponRig.position.y = -Math.sin(t * Math.PI) * 0.14;
      this.weaponRig.rotation.z = Math.sin(t * Math.PI) * 0.35;
      this.weaponRig.rotation.x = Math.sin(t * Math.PI) * 0.22;

      if (elapsed > reloadDur) {
        this.weaponRig.position.y = 0;
        this.weaponRig.rotation.z = 0;
        this.weaponRig.rotation.x = 0;
        this.finishReload();
      }
    }

    // Safety check: isPlanting/isDefusing must only be true if USE key is actively held down
    if (this.isPlanting && !this.keys[this.keybinds.use]) {
      this.isPlanting = false;
      this.plantProgress = 0;
    }
    if (this.isDefusing && !this.keys[this.keybinds.use]) {
      this.isDefusing = false;
      this.defuseProgress = 0;
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
    } else if (!this.isShooting && (currentTime / 1000 - this.lastShotTime > 0.45)) {
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

      if (this.isGrounded && (!this._lastStepTime || currentTime - this._lastStepTime > (this.isCrouched ? 460 : 320))) {
        this._lastStepTime = currentTime;
        window.csAudio.playFootstep();
      }
    } else {
      // Frame-rate independent crisp deceleration upon releasing movement keys
      const decel = Math.exp(-22.0 * dt);
      this.velocity.x *= decel;
      this.velocity.z *= decel;
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
    const hLerp = 1 - Math.exp(-14.0 * dt);
    const prevHeight = this.playerHeight;
    this.playerHeight += (targetHeight - this.playerHeight) * hLerp;
    if (this.isGrounded) {
      // Keep feetY strictly constant on ground surface during crouch transitions
      this.position.y += (this.playerHeight - prevHeight);
    }

    const oldX = this.position.x;
    const oldZ = this.position.z;
    const playerRadius = 0.52;
    const colliders = this.map.colliders;

    // Batched map meshes are collapsed to ~34 total (returning groundMeshes directly is O(1) & fast)
    const getNearbyMeshes = (px, pz) => {
      return (this.map && this.map.groundMeshes) ? this.map.groundMeshes : [];
    };

    const maxStepUp = 0.75; // Authentic CS2 step-up limit (up to 0.75m ledges cleared without freezing)
    let decisionStep = 0;
    let decisionNormalY = 1.0;
    let decisionResult = 'CLEAR';

    // Feeler obstacle check at chest height (solid crates/walls block walkover)
    const checkMeshWall = (dirX, dirZ, dist) => {
      const candidates = getNearbyMeshes(oldX, oldZ);
      if (candidates.length === 0) return false;
      this.wallDir.set(dirX, 0, dirZ).normalize();
      const currentFeetY = this.position.y - this.playerHeight;
      this.wallOrigin.set(oldX, currentFeetY + maxStepUp + 0.15, oldZ);
      this.wallRaycaster.set(this.wallOrigin, this.wallDir);
      this.wallRaycaster.far = dist;
      const hits = this.wallRaycaster.intersectObjects(candidates, false);
      if (hits.length > 0 && hits[0].distance < dist) {
        if (hits[0].face && hits[0].face.normal) decisionNormalY = hits[0].face.normal.y;
        return true;
      }
      return false;
    };

    // 1. Resolve X movement (enables sliding smoothly along walls & stepping up ledges)
    this.position.x += this.velocity.x * dt;
    const currentFeetY_X = this.position.y - this.playerHeight;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.isClimbable) continue;
      const box = c.box;
      if (
        this.position.y > box.min.y && currentFeetY_X < box.max.y &&
        this.position.x + playerRadius > box.min.x &&
        this.position.x - playerRadius < box.max.x &&
        oldZ + playerRadius > box.min.z &&
        oldZ - playerRadius < box.max.z
      ) {
        const stepDiff = box.max.y - currentFeetY_X;
        decisionStep = stepDiff;
        if (stepDiff > 0 && stepDiff <= maxStepUp) {
          // Smooth step-up onto ledge without freezing velocity
          this.position.y = box.max.y + this.playerHeight;
          this.velocity.y = 0;
          this.isGrounded = true;
          decisionResult = 'STEP_UP_X';
        } else {
          // Wall slide: cancel X velocity, keep Z velocity sliding along wall
          this.position.x = oldX;
          this.velocity.x = 0;
          decisionResult = 'SLIDE_WALL_X';
          this.lastCorrection = { reason: 'collider_x_slide', delta: (this.position.x - oldX).toFixed(3), t: Date.now() };
          break;
        }
      }
    }
    if (Math.abs(this.velocity.x) > 0.05) {
      const dist = playerRadius + Math.abs(this.velocity.x * dt) + 0.05;
      if (checkMeshWall(Math.sign(this.velocity.x), 0, dist)) {
        this.position.x = oldX;
        this.velocity.x = 0;
        decisionResult = 'SLIDE_MESH_X';
        this.lastCorrection = { reason: 'mesh_wall_x_slide', delta: (this.position.x - oldX).toFixed(3), t: Date.now() };
      }
    }

    // 2. Resolve Z movement (enables sliding smoothly along walls & stepping up ledges)
    this.position.z += this.velocity.z * dt;
    const currentFeetY_Z = this.position.y - this.playerHeight;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.isClimbable) continue;
      const box = c.box;
      if (
        this.position.y > box.min.y && currentFeetY_Z < box.max.y &&
        this.position.x + playerRadius > box.min.x &&
        this.position.x - playerRadius < box.max.x &&
        this.position.z + playerRadius > box.min.z &&
        this.position.z - playerRadius < box.max.z
      ) {
        const stepDiff = box.max.y - currentFeetY_Z;
        decisionStep = stepDiff;
        if (stepDiff > 0 && stepDiff <= maxStepUp) {
          // Smooth step-up onto ledge without freezing velocity
          this.position.y = box.max.y + this.playerHeight;
          this.velocity.y = 0;
          this.isGrounded = true;
          decisionResult = 'STEP_UP_Z';
        } else {
          // Wall slide: cancel Z velocity, keep X velocity sliding along wall
          this.position.z = oldZ;
          this.velocity.z = 0;
          decisionResult = 'SLIDE_WALL_Z';
          this.lastCorrection = { reason: 'collider_z_slide', delta: (this.position.z - oldZ).toFixed(3), t: Date.now() };
          break;
        }
      }
    }
    if (Math.abs(this.velocity.z) > 0.05) {
      const dist = playerRadius + Math.abs(this.velocity.z * dt) + 0.05;
      if (checkMeshWall(0, Math.sign(this.velocity.z), dist)) {
        this.position.z = oldZ;
        this.velocity.z = 0;
        decisionResult = 'SLIDE_MESH_Z';
        this.lastCorrection = { reason: 'mesh_wall_z_slide', delta: (this.position.z - oldZ).toFixed(3), t: Date.now() };
      }
    }

    this.collisionDecision = {
      stepTested: decisionStep.toFixed(2),
      normalY: decisionNormalY.toFixed(2),
      result: decisionResult
    };

    // Perimeter boundary clamp strictly preventing walking out onto exterior cliffs
    const preClampX = this.position.x;
    const preClampZ = this.position.z;
    this.position.x = Math.max(-94.0, Math.min(65.0, this.position.x));
    this.position.z = Math.max(-134.0, Math.min(45.0, this.position.z));
    if (this.position.x !== preClampX || this.position.z !== preClampZ) {
      this.lastCorrection = { reason: 'perimeter_clamp', delta: `dx:${(this.position.x - preClampX).toFixed(2)},dz:${(this.position.z - preClampZ).toFixed(2)}`, t: Date.now() };
    }

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
        const hit = hits[i];
        // Enforce walkable slope: hit surface normal must have world Y >= 0.70 (walkable angle <= 45 deg)
        // Rejects steep canyon cliff faces (e.g. B-window rock face) and prevents climbing unwalkable surfaces
        let worldNormalY = 1.0;
        if (hit.face && hit.face.normal) {
          if (hit.object && hit.object.matrixWorld) {
            const normMat = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
            worldNormalY = hit.face.normal.clone().applyMatrix3(normMat).normalize().y;
          } else {
            worldNormalY = hit.face.normal.y;
          }
        }
        if (worldNormalY < 0.70) {
          continue;
        }
        const ptY = hit.point.y;
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
    const preFallVelocityY = this.velocity.y;

    if (this.position.y <= groundSurfaceY) {
      this.position.y = groundSurfaceY;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else if (this.isGrounded && heightDiff >= -0.55 && heightDiff <= 0.45) {
      // Step up gentle elevation or smoothly snap down walkable slopes (keeps player continuously grounded)
      this.position.y = groundSurfaceY;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      // Natural free-fall off crates and ledges (zero teleportation)
      this.isGrounded = false;
    }

    // Landing audio effect: strictly after a genuine vertical drop (downward speed < -4.0 m/s, never on crouch or ramp)
    if (!wasGrounded && this.isGrounded && preFallVelocityY < -4.0) {
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

    // Frame-rate independent recoil easing and recovery
    const idleTime = (currentTime / 1000) - this.lastShotTime;
    const fireInterval = (this.activeWeapon && this.activeWeapon.fireRate) ? this.activeWeapon.fireRate : 0.1;

    if (this.isShooting && idleTime <= fireInterval * 1.5) {
      const easeSpeed = 1 - Math.exp(-32.0 * dt);
      this.recoilPitch += ((this.targetRecoilPitch || 0) - this.recoilPitch) * easeSpeed;
      this.recoilYaw += ((this.targetRecoilYaw || 0) - this.recoilYaw) * easeSpeed;
    } else {
      const recFactor = Math.exp(-9.0 * dt);
      this.recoilPitch *= recFactor;
      this.recoilYaw *= recFactor;
      if (idleTime > fireInterval * 2.0) {
        this.sprayCount = 0;
        this.targetRecoilPitch = 0;
        this.targetRecoilYaw = 0;
      }
    }
    this.currentRecoilPitchDeg = Math.abs(this.recoilPitch * 180 / Math.PI);

    this.camera.position.copy(this.position);
    this.camera.up.set(0, 1, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + this.recoilYaw;
    this.camera.rotation.x = this.pitch + this.recoilPitch;
    this.camera.rotation.z = 0; // CAMERA ROLL STRICTLY 0 AT ALL TIMES

    // Viewmodel Recoil Recovery & Weapon Bobbing
    this.weaponRig.position.z += (-0.45 - this.weaponRig.position.z) * (1 - Math.exp(-18.0 * dt));
    this.weaponRig.rotation.x *= Math.exp(-20.0 * dt);
    const speed2D = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    const bob = Math.sin(currentTime * 0.008) * (speed2D * 0.004);
    if (!this.isReloading) {
      this.weaponRig.position.y += (bob - this.weaponRig.position.y) * (1 - Math.exp(-14.0 * dt));
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
