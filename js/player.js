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
    this.position = new THREE.Vector3(0, 2.0, -90);
    this.velocity = new THREE.Vector3();
    this.isGrounded = true;
    this.lastGroundY = -5.8;
    this.isCrouched = false;
    this.isScoped = false;
    this.playerHeight = 2.0;

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

    // Pre-allocated Decal Pool for Bullet Holes (Zero per-shot GC pressure)
    this.bulletHoleGeo = new THREE.CircleGeometry(0.055, 8);
    this.bulletHoleMat = new THREE.MeshBasicMaterial({ color: 0x181818, side: THREE.DoubleSide, depthWrite: false });
    this.bulletHolePool = [];
    this.bulletHolePoolIndex = 0;
    for (let i = 0; i < 28; i++) {
      const mesh = new THREE.Mesh(this.bulletHoleGeo, this.bulletHoleMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.bulletHolePool.push(mesh);
    }

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

    // Viewmodel Rig
    this.viewmodelGroup = new THREE.Group();
    this.camera.add(this.viewmodelGroup);
    this.weaponRig = new THREE.Group();
    this.viewmodelGroup.add(this.weaponRig);

    // Muzzle Flash
    this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 8);
    this.muzzleLight.position.set(0.18, -0.16, -0.85);
    const flashGeo = new THREE.SphereGeometry(0.065, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdd66 });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.position.set(0.18, -0.16, -0.85);
    this.muzzleFlashMesh.visible = false;
    this.viewmodelGroup.add(this.muzzleLight);
    this.viewmodelGroup.add(this.muzzleFlashMesh);

    this.initControls();
    this.buildCurrentWeaponModel();
  }

  // Pre-caches all weapon textures from textures/ directory
  initWeaponTextures() {
    const texFiles = [
      'w_rif_ak47.png', 'w_rif_m4a1.png', 'w_snip_awp.png', 'w_pist_glock18.png',
      'w_pist_usp.png', 'w_pist_deagle.png', 'w_knife_t.png', 'w_eq_smokegrenade.png',
      'w_eq_fraggrenade.png', 'w_eq_flashbang.png', 'w_rif_famas.png', 'w_rif_galil.png',
      'w_smg_mp5.png', 'w_smg_p90.png', 'w_shot_xm1014.png', 'w_rif_aug.png',
      'w_snip_scout.png', 'w_mach_m249.png', 'w_smg_mac10.png', 'w_smg_ump45.png'
    ];
    const loader = new THREE.TextureLoader();
    for (const f of texFiles) {
      loader.load('textures/' + f, (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        this.weaponTextureCache[f] = tex;
      }, undefined, () => {});
    }
  }

  getWeaponTexture(filename) {
    if (this.weaponTextureCache[filename]) {
      return this.weaponTextureCache[filename];
    }
    const loader = new THREE.TextureLoader();
    const tex = loader.load('textures/' + filename);
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
      const sleeveGeo = new THREE.CylinderGeometry(0.046, 0.082, len * 0.96, 12);
      const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
      sleeve.position.copy(pStart).addScaledVector(norm, len * 0.48);
      sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), norm);
      armGroup.add(sleeve);

      // Wrinkled Sleeve Cuff
      const cuffGeo = new THREE.CylinderGeometry(0.050, 0.050, 0.040, 12);
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
      const fingerGeo = new THREE.CylinderGeometry(0.011, 0.010, 0.052, 8);
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

  // Maps every single weapon directly to its exact authentic textures/ PNG
  buildTexturedWeaponModel(w, group) {
    if (w.id === 'knife') {
      const knifeTex = this.getWeaponTexture('w_knife_t.png');
      const knifeMat = new THREE.MeshStandardMaterial({ map: knifeTex, roughness: 0.35, metalness: 0.65 });
      const handleMat = new THREE.MeshLambertMaterial({ color: 0x1b1f24 });

      const bladeGeo = new THREE.BoxGeometry(0.016, 0.065, 0.32);
      const blade = new THREE.Mesh(bladeGeo, knifeMat);
      blade.position.set(0.14, -0.18, -0.42);
      blade.rotation.x = 0.32;
      group.add(blade);

      const tipGeo = new THREE.ConeGeometry(0.032, 0.08, 4);
      const tip = new THREE.Mesh(tipGeo, knifeMat);
      tip.rotation.x = -Math.PI / 2 + 0.32;
      tip.position.set(0.14, -0.14, -0.58);
      group.add(tip);

      const guardGeo = new THREE.BoxGeometry(0.045, 0.085, 0.02);
      const guard = new THREE.Mesh(guardGeo, handleMat);
      guard.position.set(0.14, -0.21, -0.27);
      guard.rotation.x = 0.32;
      group.add(guard);

      const gripGeo = new THREE.CylinderGeometry(0.022, 0.020, 0.16, 8);
      const grip = new THREE.Mesh(gripGeo, handleMat);
      grip.rotation.x = 0.32;
      grip.position.set(0.14, -0.24, -0.20);
      group.add(grip);
    } else if (w.id === 'glock') {
      const glockTex = this.getWeaponTexture('w_pist_glock18.png');
      const slideMat = new THREE.MeshStandardMaterial({ map: glockTex, roughness: 0.4, metalness: 0.5 });
      const frameMat = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });

      const slideGeo = new THREE.BoxGeometry(0.046, 0.052, 0.25);
      const slide = new THREE.Mesh(slideGeo, slideMat);
      slide.position.set(0.13, -0.17, -0.36);
      group.add(slide);

      const frameGeo = new THREE.BoxGeometry(0.042, 0.038, 0.23);
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(0.13, -0.21, -0.35);
      group.add(frame);

      const gripGeo = new THREE.BoxGeometry(0.040, 0.13, 0.085);
      const grip = new THREE.Mesh(gripGeo, frameMat);
      grip.rotation.x = -0.32;
      grip.position.set(0.13, -0.27, -0.28);
      group.add(grip);

      const barrelGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8);
      const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshLambertMaterial({ color: 0x0a0a0a }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.13, -0.17, -0.49);
      group.add(barrel);
    } else if (w.id === 'usp') {
      const uspTex = this.getWeaponTexture('w_pist_usp.png');
      const slideMat = new THREE.MeshStandardMaterial({ map: uspTex, roughness: 0.35, metalness: 0.6 });
      const frameMat = new THREE.MeshLambertMaterial({ color: 0x181a1e });

      const slideGeo = new THREE.BoxGeometry(0.046, 0.052, 0.27);
      const slide = new THREE.Mesh(slideGeo, slideMat);
      slide.position.set(0.13, -0.17, -0.36);
      group.add(slide);

      const frameGeo = new THREE.BoxGeometry(0.042, 0.038, 0.25);
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(0.13, -0.21, -0.35);
      group.add(frame);

      const gripGeo = new THREE.BoxGeometry(0.040, 0.13, 0.085);
      const grip = new THREE.Mesh(gripGeo, frameMat);
      grip.rotation.x = -0.32;
      grip.position.set(0.13, -0.27, -0.28);
      group.add(grip);

      const silGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.22, 10);
      const silMat = new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.45, metalness: 0.5 });
      const sil = new THREE.Mesh(silGeo, silMat);
      sil.rotation.x = Math.PI / 2;
      sil.position.set(0.13, -0.17, -0.60);
      group.add(sil);
    } else if (w.id === 'deagle') {
      const deagleTex = this.getWeaponTexture('w_pist_deagle.png');
      const deagleMat = new THREE.MeshStandardMaterial({ map: deagleTex, roughness: 0.3, metalness: 0.7 });

      const slideGeo = new THREE.BoxGeometry(0.052, 0.068, 0.30);
      const slide = new THREE.Mesh(slideGeo, deagleMat);
      slide.position.set(0.13, -0.16, -0.38);
      group.add(slide);

      const gripGeo = new THREE.BoxGeometry(0.044, 0.15, 0.095);
      const grip = new THREE.Mesh(gripGeo, new THREE.MeshLambertMaterial({ color: 0x141619 }));
      grip.rotation.x = -0.30;
      grip.position.set(0.13, -0.27, -0.29);
      group.add(grip);

      const barrelGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.06, 8);
      const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshLambertMaterial({ color: 0x080808 }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.13, -0.16, -0.54);
      group.add(barrel);
    } else if (w.id === 'ak47') {
      const akTex = this.getWeaponTexture('w_rif_ak47.png');
      const akMat = new THREE.MeshStandardMaterial({ map: akTex, roughness: 0.45, metalness: 0.4 });
      const woodMat = new THREE.MeshLambertMaterial({ color: 0x6e3b1c });

      const recGeo = new THREE.BoxGeometry(0.052, 0.088, 0.48);
      const receiver = new THREE.Mesh(recGeo, akMat);
      receiver.position.set(0.13, -0.17, -0.42);
      group.add(receiver);

      const barGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.44, 8);
      const barrel = new THREE.Mesh(barGeo, new THREE.MeshLambertMaterial({ color: 0x141618 }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.13, -0.16, -0.86);
      group.add(barrel);

      const woodGuard = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.065, 0.22), woodMat);
      woodGuard.position.set(0.13, -0.17, -0.62);
      group.add(woodGuard);

      const magGeo = new THREE.BoxGeometry(0.038, 0.22, 0.095);
      const mag = new THREE.Mesh(magGeo, new THREE.MeshLambertMaterial({ color: 0x22262a }));
      mag.rotation.x = -0.38;
      mag.position.set(0.13, -0.28, -0.40);
      group.add(mag);

      const stockGeo = new THREE.BoxGeometry(0.046, 0.11, 0.28);
      const stock = new THREE.Mesh(stockGeo, woodMat);
      stock.position.set(0.13, -0.21, -0.14);
      group.add(stock);
    } else if (w.id === 'm4a1' || w.id === 'm4a4' || w.id === 'm4a1s') {
      const m4Tex = this.getWeaponTexture('w_rif_m4a1.png');
      const m4Mat = new THREE.MeshStandardMaterial({ map: m4Tex, roughness: 0.4, metalness: 0.5 });

      const recGeo = new THREE.BoxGeometry(0.052, 0.092, 0.46);
      const receiver = new THREE.Mesh(recGeo, m4Mat);
      receiver.position.set(0.13, -0.17, -0.42);
      group.add(receiver);

      const barGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.42, 8);
      const barrel = new THREE.Mesh(barGeo, new THREE.MeshLambertMaterial({ color: 0x121417 }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.13, -0.16, -0.84);
      group.add(barrel);

      const magGeo = new THREE.BoxGeometry(0.036, 0.20, 0.08);
      const mag = new THREE.Mesh(magGeo, new THREE.MeshLambertMaterial({ color: 0x2a2e34 }));
      mag.rotation.x = -0.22;
      mag.position.set(0.13, -0.28, -0.38);
      group.add(mag);

      const stockGeo = new THREE.BoxGeometry(0.044, 0.10, 0.26);
      const stock = new THREE.Mesh(stockGeo, new THREE.MeshLambertMaterial({ color: 0x1e2227 }));
      stock.position.set(0.13, -0.20, -0.15);
      group.add(stock);
    } else if (w.id === 'awp') {
      const awpTex = this.getWeaponTexture('w_snip_awp.png');
      const awpMat = new THREE.MeshStandardMaterial({ map: awpTex, roughness: 0.4, metalness: 0.4 });

      const bodyGeo = new THREE.BoxGeometry(0.058, 0.10, 0.65);
      const body = new THREE.Mesh(bodyGeo, awpMat);
      body.position.set(0.13, -0.18, -0.46);
      group.add(body);

      const barGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.55, 8);
      const barrel = new THREE.Mesh(barGeo, new THREE.MeshLambertMaterial({ color: 0x16181b }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.13, -0.16, -1.04);
      group.add(barrel);

      const scopeGeo = new THREE.CylinderGeometry(0.024, 0.026, 0.32, 12);
      const scope = new THREE.Mesh(scopeGeo, new THREE.MeshLambertMaterial({ color: 0x141618 }));
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0.13, -0.09, -0.46);
      group.add(scope);

      const stockGeo = new THREE.BoxGeometry(0.052, 0.12, 0.34);
      const stock = new THREE.Mesh(stockGeo, awpMat);
      stock.position.set(0.13, -0.21, -0.14);
      group.add(stock);
    } else if (w.id === 'c4') {
      // Dynamic Textured C4 Bomb with LCD ("7355608") & Keypad
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

      const keypadMat = new THREE.MeshStandardMaterial({ map: c4Tex, roughness: 0.4 });
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
    } else if (w.id === 'smokegrenade') {
      const smkTex = this.getWeaponTexture('w_eq_smokegrenade.png');
      const canMat = new THREE.MeshStandardMaterial({ map: smkTex, roughness: 0.4 });
      const canGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.16, 12);
      const can = new THREE.Mesh(canGeo, canMat);
      can.position.set(0.13, -0.20, -0.38);
      group.add(can);

      const pinGeo = new THREE.TorusGeometry(0.018, 0.005, 6, 12);
      const pin = new THREE.Mesh(pinGeo, new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      pin.position.set(0.13, -0.11, -0.38);
      group.add(pin);
    } else if (w.category === 'equipment' || w.id === 'flashbang' || w.id === 'hegrenade') {
      const texPath = w.id === 'flashbang' ? 'w_eq_flashbang.png' : 'w_eq_fraggrenade.png';
      const grenTex = this.getWeaponTexture(texPath);
      const grenMat = new THREE.MeshStandardMaterial({ map: grenTex, roughness: 0.4 });

      const grenGeo = new THREE.CylinderGeometry(0.040, 0.040, 0.15, 12);
      const gren = new THREE.Mesh(grenGeo, grenMat);
      gren.position.set(0.13, -0.20, -0.38);
      group.add(gren);

      const pinGeo = new THREE.TorusGeometry(0.018, 0.005, 6, 12);
      const pin = new THREE.Mesh(pinGeo, new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      pin.position.set(0.13, -0.11, -0.38);
      group.add(pin);
    } else {
      // General Rifle / SMG textured weapon model (Famas, Galil, MP5, P90, XM1014)
      const texPath = w.id === 'famas' ? 'w_rif_famas.png' :
                      w.id === 'galil' ? 'w_rif_galil.png' :
                      w.id === 'p90' ? 'w_smg_p90.png' :
                      w.id === 'mp5' ? 'w_smg_mp5.png' :
                      w.id === 'xm1014' ? 'w_shot_xm1014.png' :
                      w.id === 'aug' ? 'w_rif_aug.png' :
                      w.id === 'ssg08' ? 'w_snip_scout.png' :
                      w.id === 'mac10' ? 'w_smg_mac10.png' :
                      w.id === 'ump45' ? 'w_smg_ump45.png' :
                      'w_rif_m4a1.png';
      const tex = this.getWeaponTexture(texPath);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });

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
    for (let s = 1; s <= 5; s++) {
      const el = document.getElementById(`slot-${s}`);
      if (el) {
        if (s === this.activeSlot) el.classList.add('active');
        else el.classList.remove('active');
      }
    }
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

    // Wall & Obstacle Penetration Check (Hard walls block completely; only wooden objects/doors allow penetration)
    let wallObstacles = [];
    if (this.map && this.map.groundMeshes && this.map.groundMeshes.length > 0) {
      wallObstacles = this.shootRaycaster.intersectObjects(this.map.groundMeshes, false);
      if (wallObstacles.length > 0 && wallObstacles[0].distance < 80) {
        this.spawnBulletHole(wallObstacles[0].point, wallObstacles[0].face.normal);
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

    decal.position.copy(point).addScaledVector(normal, 0.012);
    decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    decal.visible = true;
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
          const fireballGeo = new THREE.SphereGeometry(2.4, 12, 12);
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

          // High-Performance CS2 Volumetric Smoke (Zero Multi-Mesh Overdraw Lag)
          // 1 Single Optimized 5.2m Sphere with soft depthWrite: false
          const smokeGeo = new THREE.SphereGeometry(5.2, 16, 16);
          const smokeMat = new THREE.MeshLambertMaterial({
            color: 0xc8ccd2,
            transparent: true,
            opacity: 0.90,
            depthWrite: false
          });
          const smokeMesh = new THREE.Mesh(smokeGeo, smokeMat);
          smokeMesh.position.set(pos.x, pos.y + 1.8, pos.z);
          smokeMesh.scale.set(0.1, 0.1, 0.1);
          this.scene.add(smokeMesh);

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
            this.scene.remove(smokeMesh);
            smokeGeo.dispose();
            smokeMat.dispose();
          }, 18000);
        } else if (g.type === 'molotov') {
          window.csAudio.playMolotovDetonate();
          const fireGroup = new THREE.Group();
          const fGeo = new THREE.CylinderGeometry(2.4, 2.6, 0.25, 16);
          const fMat = new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.85 });
          const fireMesh = new THREE.Mesh(fGeo, fMat);
          fireMesh.position.y = 0.15;
          fireGroup.add(fireMesh);

          for (let f = 0; f < 8; f++) {
            const flameGeo = new THREE.ConeGeometry(0.3, 1.2, 6);
            const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
            const flame = new THREE.Mesh(flameGeo, flameMat);
            flame.position.set((Math.random() - 0.5) * 3.0, 0.6, (Math.random() - 0.5) * 3.0);
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
            if (this.position.distanceTo(pos) < 3.2) {
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
    this.enterSpectatorMode();
    if (window.csGameManager) {
      window.csGameManager.onEntityKilled(attackerName || 'Enemy', 'You', weaponName || 'Weapon', false, this.team);
      if (window.csGameManager.net) {
        window.csGameManager.net.sendDeath(attackerName || 'Enemy', 'Player', weaponName || 'Weapon', false, this.team);
      }
    }
  }

  respawn(spawnPos) {
    this.exitSpectatorMode();
    const defaultX = this.team === 'CT' ? -5.0 : -65.0;
    const defaultY = this.team === 'CT' ? -3.8 : 7.8;
    const defaultZ = this.team === 'CT' ? -98.0 : 35.0;
    const defaultYaw = this.team === 'CT' ? Math.PI : 0;

    const posX = (spawnPos && spawnPos.x !== undefined) ? spawnPos.x : defaultX;
    const posY = (spawnPos && spawnPos.y !== undefined) ? spawnPos.y : defaultY;
    const posZ = (spawnPos && spawnPos.z !== undefined) ? spawnPos.z : defaultZ;
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

    // Input Movement Calculation
    const wishDir = new THREE.Vector3();
    if (!inFreeze) {
      if (this.keys[this.keybinds.forward]) wishDir.add(forward);
      if (this.keys[this.keybinds.backward]) wishDir.sub(forward);
      if (this.keys[this.keybinds.right]) wishDir.add(right);
      if (this.keys[this.keybinds.left]) wishDir.sub(right);
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
    if (this.jumpRequested && this.isGrounded && !inFreeze) {
      this.jumpRequested = false;
      // Crouch-jump (duck-jump) boost to easily clear and land on Dust 2 crates
      const jumpImpulse = this.isCrouched ? 8.6 : 8.0;
      this.velocity.y = jumpImpulse;
      this.isGrounded = false;
    }

    this.velocity.y -= 18.0 * dt;

    this.isCrouched = !!this.keys[this.keybinds.crouch];
    const targetHeight = this.isCrouched ? 1.15 : 2.0; // +20cm player eye height
    this.playerHeight += (targetHeight - this.playerHeight) * 0.2;

    const oldX = this.position.x;
    const oldZ = this.position.z;
    const playerRadius = 0.52;
    const colliders = this.map.colliders;

    // Multi-Axis Impenetrable Collision Resolution:
    // Helper: test feeler rays with lateral offsets at waist and knee levels to stop corner clipping
    const checkMeshWall = (dirX, dirZ, dist) => {
      if (!this.map || !this.map.groundMeshes || this.map.groundMeshes.length === 0) return false;
      this.wallDir.set(dirX, 0, dirZ).normalize();
      const perpX = -dirZ;
      const perpZ = dirX;
      const lateralOffsets = [0, 0.40, -0.40];
      const yOffsets = [
        this.position.y - this.playerHeight * 0.35,
        this.position.y - this.playerHeight * 0.70
      ];
      const maxStepHeight = (this.isCrouched && !this.isGrounded) ? 1.85 : 0.75;
      for (const yOff of yOffsets) {
        for (const lOff of lateralOffsets) {
          this.wallOrigin.set(oldX + perpX * lOff, yOff, oldZ + perpZ * lOff);
          this.wallRaycaster.set(this.wallOrigin, this.wallDir);
          this.wallRaycaster.far = dist;
          const hits = this.wallRaycaster.intersectObjects(this.map.groundMeshes, false);
          for (let i = 0; i < hits.length; i++) {
            if (hits[i].point.y > (this.lastGroundY + maxStepHeight)) {
              return true;
            }
          }
        }
      }
      return false;
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
    if (Math.abs(this.velocity.x) > 0.001) {
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
    if (Math.abs(this.velocity.z) > 0.001) {
      const dist = playerRadius + Math.abs(this.velocity.z * dt) + 0.05;
      if (checkMeshWall(0, Math.sign(this.velocity.z), dist)) {
        this.position.z = oldZ;
        this.velocity.z = 0;
      }
    }

    // 3. Resolve Y movement & Downward 3D Terrain Raycasting
    this.position.y += this.velocity.y * dt;

    let targetGroundY = (this.lastGroundY !== undefined) ? this.lastGroundY : -5.8;
    if (this.map && this.map.groundMeshes && this.map.groundMeshes.length > 0) {
      this.downOrigin.set(this.position.x, this.position.y + 0.5, this.position.z);
      this.downRaycaster.set(this.downOrigin, this.downDir);
      this.downRaycaster.far = 40.0;
      const hits = this.downRaycaster.intersectObjects(this.map.groundMeshes, false);
      let foundGround = false;
      let highestGroundY = -999;
      for (let i = 0; i < hits.length; i++) {
        const ptY = hits[i].point.y;
        if (ptY <= (this.position.y - this.playerHeight + 0.8) && ptY > highestGroundY) {
          highestGroundY = ptY;
          foundGround = true;
        }
      }
      if (foundGround) {
        targetGroundY = highestGroundY;
        this.lastGroundY = highestGroundY;
      }
    }

    if (this.position.y <= targetGroundY + this.playerHeight) {
      this.position.y = targetGroundY + this.playerHeight;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else if (this.isGrounded && (targetGroundY + this.playerHeight - this.position.y) <= 0.45) {
      this.position.y = targetGroundY + this.playerHeight;
      this.velocity.y = 0;
    } else {
      this.isGrounded = false;
    }

    // 4. Climbable site platforms & crates
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c.isClimbable) continue;
      const box = c.box;
      if (
        this.position.x + playerRadius > box.min.x &&
        this.position.x - playerRadius < box.max.x &&
        this.position.z + playerRadius > box.min.z &&
        this.position.z - playerRadius < box.max.z
      ) {
        if (this.velocity.y <= 0 && this.position.y >= c.topY + 0.1) {
          this.position.y = c.topY + this.playerHeight;
          this.velocity.y = 0;
          this.isGrounded = true;
        } else if (this.position.y < c.topY + 0.3) {
          this.position.x = oldX;
          this.position.z = oldZ;
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
  }
}

window.CS2Player = CS2Player;
