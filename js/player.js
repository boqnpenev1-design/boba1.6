// CS2 First-Person Player Controller:
// Tactical Viewmodel Arms/Hands, Reload Animations, Bullet Holes, Authentic Knife Run-Speed,
// Freezetime Movement/Shoot Lock, Fixed Site Platform Jumping, Grenades (4) & C4 (5)

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
    this.inventory = {
      1: null,
      2: CS2_WEAPONS.usp,
      3: CS2_WEAPONS.knife,
      4: CS2_WEAPONS.flashbang,
      5: null
    };
    this.grenades = [CS2_WEAPONS.flashbang, CS2_WEAPONS.hegrenade, CS2_WEAPONS.smokegrenade];
    this.activeSlot = 2;
    this.activeWeapon = CS2_WEAPONS.usp;

    // Ammo counts
    this.clipAmmo = window.__CS2_AC.createProtectedValue(12);
    this.reserveAmmo = window.__CS2_AC.createProtectedValue(24);

    // Camera & Movement state
    this.yaw = 0;
    this.pitch = 0;
    this.position = new THREE.Vector3(0, 1.8, -90);
    this.velocity = new THREE.Vector3();
    this.isGrounded = true;
    this.isCrouched = false;
    this.isScoped = false;
    this.playerHeight = 1.8;

    // Spectator Mode
    this.isSpectating = false;
    this.spectatorIndex = 0;
    this.spectatedTarget = null;

    // Active Bullet Decals
    this.bulletDecals = [];

    // Active Thrown Grenades
    this.activeGrenades = [];

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
    this.muzzleLight.position.set(0.25, -0.19, -0.95);
    const flashGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdd66 });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.position.set(0.25, -0.19, -0.95);
    this.muzzleFlashMesh.visible = false;
    this.viewmodelGroup.add(this.muzzleLight);
    this.viewmodelGroup.add(this.muzzleFlashMesh);

    this.gltfLoader = typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null;
    this.loadedModels = {};

    this.initControls();
    this.buildCurrentWeaponModel();
  }

  setTeam(team) {
    this.team = team;
    if (team === 'CT') {
      this.inventory[2] = CS2_WEAPONS.usp;
      this.inventory[4] = CS2_WEAPONS.flashbang;
      this.inventory[5] = null;
      this.hasDefuseKit = false;
    } else {
      this.inventory[2] = CS2_WEAPONS.glock;
      this.inventory[4] = CS2_WEAPONS.flashbang;
      this.inventory[5] = CS2_WEAPONS.c4;
      this.hasDefuseKit = false;
    }
    this.switchSlot(2);
  }

  // Builds 3D weapon models with realistic tactical arms, hands, GLB models and authentic CS textures
  buildCurrentWeaponModel() {
    while (this.weaponRig.children.length > 0) {
      this.weaponRig.remove(this.weaponRig.children[0]);
    }

    const w = this.activeWeapon;
    if (!w) return;

    const group = new THREE.Group();

    // 1. Tactical Operator Sleeves & Gloves
    const sleeveColor = this.team === 'CT' ? 0x22354c : 0x5a4836;
    const gloveColor = 0x16191f;
    const sleeveMat = new THREE.MeshLambertMaterial({ color: sleeveColor });
    const gloveMat = new THREE.MeshLambertMaterial({ color: gloveColor });

    const createTacticalArm = (p1, p2) => {
      const armGroup = new THREE.Group();
      const v = new THREE.Vector3().subVectors(p2, p1);
      const len = v.length();
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const norm = v.clone().normalize();

      // Forearm sleeve originating from offscreen edge
      const sleeveGeo = new THREE.CylinderGeometry(0.045, 0.052, len * 0.78, 12);
      const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
      sleeve.position.copy(p1).addScaledVector(norm, len * 0.39);
      sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), norm);
      armGroup.add(sleeve);

      // Wrist cuff
      const cuffGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.04, 12);
      const cuff = new THREE.Mesh(cuffGeo, gloveMat);
      cuff.position.copy(p1).addScaledVector(norm, len * 0.76);
      cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), norm);
      armGroup.add(cuff);

      // Tactical Glove Palm & Knuckle Guard
      const handGeo = new THREE.BoxGeometry(0.065, 0.05, 0.08);
      const hand = new THREE.Mesh(handGeo, gloveMat);
      hand.position.copy(p2);
      hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), norm);
      armGroup.add(hand);

      return armGroup;
    };

    // Right Arm & Glove (Grips weapon from bottom-right corner)
    const rStart = new THREE.Vector3(0.36, -0.48, -0.12);
    const rGrip = (w.id === 'knife') 
      ? new THREE.Vector3(0.20, -0.26, -0.30)
      : new THREE.Vector3(0.20, -0.22, -0.38);
    group.add(createTacticalArm(rStart, rGrip));

    // Left Arm & Glove (Support arm for rifles/two-handed)
    if (w.category === 'rifles' || w.id === 'awp' || w.id === 'p90' || w.id === 'xm1014') {
      const lStart = new THREE.Vector3(-0.32, -0.48, -0.16);
      const lGuard = new THREE.Vector3(0.12, -0.22, -0.56);
      group.add(createTacticalArm(lStart, lGuard));
    } else if (w.category === 'pistols') {
      // Support hand cup for tactical pistol stance
      const lStart = new THREE.Vector3(-0.24, -0.48, -0.16);
      const lCup = new THREE.Vector3(0.17, -0.26, -0.38);
      group.add(createTacticalArm(lStart, lCup));
    }

    // 2. Weapon 3D Model: Use official GLB models if available
    const glbMap = {
      ak47: 'source/AK47.glb',
      m4a1: 'source/M4A1.glb',
      m4a1s: 'source/M4A1.glb',
      m4a4: 'source/M4A4.glb',
      awp: 'source/AWP.glb',
      deagle: 'source/DEAGLE.glb',
      usp: 'source/USPS.glb',
      c4: 'source/C4.glb'
    };

    if (glbMap[w.id] && this.gltfLoader) {
      if (this.loadedModels[w.id]) {
        const weaponMesh = this.loadedModels[w.id].clone();
        this.positionWeaponModel(w.id, weaponMesh);
        group.add(weaponMesh);
      } else {
        this.gltfLoader.load(glbMap[w.id], (gltf) => {
          this.loadedModels[w.id] = gltf.scene;
          const weaponMesh = gltf.scene.clone();
          this.positionWeaponModel(w.id, weaponMesh);
          group.add(weaponMesh);
        }, undefined, () => {
          this.buildTexturedWeaponFallback(w, group);
        });
      }
    } else {
      this.buildTexturedWeaponFallback(w, group);
    }

    this.weaponRig.add(group);
  }

  positionWeaponModel(weaponId, mesh) {
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(0, Math.PI, 0);

    if (weaponId === 'ak47') {
      mesh.scale.set(0.85, 0.85, 0.85);
      mesh.position.set(0.18, -0.22, -0.44);
    } else if (weaponId === 'm4a1' || weaponId === 'm4a1s' || weaponId === 'm4a4') {
      mesh.scale.set(0.85, 0.85, 0.85);
      mesh.position.set(0.18, -0.22, -0.44);
    } else if (weaponId === 'awp') {
      mesh.scale.set(0.82, 0.82, 0.82);
      mesh.position.set(0.18, -0.24, -0.48);
    } else if (weaponId === 'deagle') {
      mesh.scale.set(0.9, 0.9, 0.9);
      mesh.position.set(0.18, -0.19, -0.38);
    } else if (weaponId === 'usp') {
      mesh.scale.set(0.9, 0.9, 0.9);
      mesh.position.set(0.18, -0.19, -0.38);
    } else if (weaponId === 'c4') {
      mesh.scale.set(0.85, 0.85, 0.85);
      mesh.position.set(0.16, -0.18, -0.38);
    }
  }

  buildTexturedWeaponFallback(w, group) {
    const texLoader = new THREE.TextureLoader();

    if (w.id === 'knife') {
      const knifeTex = texLoader.load('textures/w_knife_t.png');
      const knifeMat = new THREE.MeshStandardMaterial({ map: knifeTex, roughness: 0.35, metalness: 0.65 });
      const handleMat = new THREE.MeshLambertMaterial({ color: 0x1b1f24 });

      // Curved Combat Knife Blade
      const bladeGeo = new THREE.BoxGeometry(0.018, 0.065, 0.32);
      const blade = new THREE.Mesh(bladeGeo, knifeMat);
      blade.position.set(0.2, -0.22, -0.46);
      blade.rotation.x = 0.32;
      group.add(blade);

      // Knife Blade Tip Taper
      const tipGeo = new THREE.ConeGeometry(0.032, 0.08, 4);
      const tip = new THREE.Mesh(tipGeo, knifeMat);
      tip.rotation.x = -Math.PI / 2 + 0.32;
      tip.position.set(0.2, -0.18, -0.62);
      group.add(tip);

      // Crossguard
      const guardGeo = new THREE.BoxGeometry(0.045, 0.085, 0.02);
      const guard = new THREE.Mesh(guardGeo, handleMat);
      guard.position.set(0.2, -0.25, -0.31);
      guard.rotation.x = 0.32;
      group.add(guard);

      // Ergonomic Tactical Handle
      const gripGeo = new THREE.CylinderGeometry(0.024, 0.022, 0.16, 8);
      const grip = new THREE.Mesh(gripGeo, handleMat);
      grip.rotation.x = 0.32;
      grip.position.set(0.2, -0.28, -0.24);
      group.add(grip);
    } else if (w.id === 'glock') {
      const glockTex = texLoader.load('textures/w_pist_glock18.png');
      const slideMat = new THREE.MeshStandardMaterial({ map: glockTex, roughness: 0.4, metalness: 0.5 });
      const frameMat = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });

      // Steel Slide & Barrel Top
      const slideGeo = new THREE.BoxGeometry(0.048, 0.055, 0.26);
      const slide = new THREE.Mesh(slideGeo, slideMat);
      slide.position.set(0.2, -0.21, -0.42);
      group.add(slide);

      // Polymer Lower Frame & Trigger Guard
      const frameGeo = new THREE.BoxGeometry(0.044, 0.04, 0.24);
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(0.2, -0.25, -0.41);
      group.add(frame);

      // Textured Pistol Grip
      const gripGeo = new THREE.BoxGeometry(0.042, 0.14, 0.085);
      const grip = new THREE.Mesh(gripGeo, frameMat);
      grip.rotation.x = -0.32;
      grip.position.set(0.2, -0.31, -0.34);
      group.add(grip);

      // Barrel Tip
      const barrelGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.06, 8);
      const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshLambertMaterial({ color: 0x0a0a0a }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.2, -0.21, -0.56);
      group.add(barrel);
    } else if (w.id === 'molotov') {
      const bottleMat = new THREE.MeshLambertMaterial({ color: 0x7c4516 });
      const bottleGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.22, 10);
      const bottle = new THREE.Mesh(bottleGeo, bottleMat);
      bottle.position.set(0.2, -0.24, -0.44);
      group.add(bottle);

      const wickGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6);
      const wickMat = new THREE.MeshBasicMaterial({ color: 0xff4500 });
      const wick = new THREE.Mesh(wickGeo, wickMat);
      wick.position.set(0.2, -0.11, -0.44);
      group.add(wick);
    } else if (w.id === 'smokegrenade') {
      const canGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.17, 12);
      const canMat = new THREE.MeshLambertMaterial({ color: 0x5a636e });
      const can = new THREE.Mesh(canGeo, canMat);
      can.position.set(0.2, -0.24, -0.44);
      group.add(can);

      const bandGeo = new THREE.CylinderGeometry(0.046, 0.046, 0.04, 12);
      const bandMat = new THREE.MeshBasicMaterial({ color: 0x228833 });
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.set(0.2, -0.22, -0.44);
      group.add(band);
    } else if (w.category === 'equipment' || w.id === 'flashbang' || w.id === 'hegrenade') {
      const grenGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.15, 12);
      const grenMat = new THREE.MeshLambertMaterial({ color: w.id === 'flashbang' ? 0x7a8a9a : 0x364230 });
      const gren = new THREE.Mesh(grenGeo, grenMat);
      gren.position.set(0.2, -0.24, -0.44);
      group.add(gren);

      const pinGeo = new THREE.TorusGeometry(0.02, 0.005, 6, 12);
      const pin = new THREE.Mesh(pinGeo, new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      pin.position.set(0.2, -0.14, -0.44);
      group.add(pin);
    } else {
      const defMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
      const bodyGeo = new THREE.BoxGeometry(0.07, 0.12, 0.55);
      const body = new THREE.Mesh(bodyGeo, defMat);
      body.position.set(0.2, -0.22, -0.48);
      group.add(body);
    }
  }

  cycleGrenade() {
    if (!this.grenades || this.grenades.length <= 1) return;
    let idx = this.grenades.findIndex(g => g && g.id === (this.activeWeapon ? this.activeWeapon.id : ''));
    idx = (idx + 1) % this.grenades.length;
    this.inventory[4] = this.grenades[idx];
    this.switchSlot(4);
  }

  initControls() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

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
    });

    window.addEventListener('mousedown', (e) => {
      if (!document.pointerLockElement) return;
      if (e.button === 0) {
        this.isShooting = true;
      } else if (e.button === 2) {
        // Right click short throw for grenades or scope
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
  }

  exitSpectatorMode() {
    this.isSpectating = false;
    document.getElementById('spectator-hud').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.viewmodelGroup.visible = true;
  }

  cycleSpectator(dir) {
    if (!window.csGameManager) return;
    const rem = Object.values(window.csGameManager.net.remotePlayers);
    if (rem.length === 0) {
      document.getElementById('spectator-target-name').innerText = 'WAITING FOR PLAYERS...';
      return;
    }
    this.spectatorIndex = (this.spectatorIndex + dir + rem.length) % rem.length;
    this.spectatedTarget = rem[this.spectatorIndex];
    document.getElementById('spectator-target-name').innerText = `Player_${this.spectatorIndex + 1} (${this.spectatedTarget.team})`;
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
    this.activeSlot = slot;
    this.activeWeapon = this.inventory[slot];
    this.isReloading = false;
    this.isShooting = false; // Never carry firing state across weapon switches
    if (this.isScoped) this.toggleScope();

    if (this.activeWeapon.clip) {
      this.clipAmmo.set(this.activeWeapon.clip);
      this.reserveAmmo.set(this.activeWeapon.reserve);
    } else {
      this.clipAmmo.set(0);
      this.reserveAmmo.set(0);
    }

    this.buildCurrentWeaponModel();
    this.updateSlotHUD();
  }

  updateSlotHUD() {
    document.querySelectorAll('.slot-item').forEach(el => {
      el.classList.remove('active');
      if (Number(el.dataset.slot) === this.activeSlot) {
        el.classList.add('active');
      }
    });
  }

  startReload() {
    if (this.isReloading || !this.activeWeapon || !this.activeWeapon.clip) return;
    if (this.clipAmmo.get() >= this.activeWeapon.clip || this.reserveAmmo.get() <= 0) return;

    this.isReloading = true;
    this.reloadStartTime = performance.now();
    window.csAudio.playReload(this.activeWeapon.id);
  }

  finishReload() {
    this.isReloading = false;
    const needed = this.activeWeapon.clip - this.clipAmmo.get();
    const available = this.reserveAmmo.get();
    const added = Math.min(needed, available);
    this.clipAmmo.add(added);
    this.reserveAmmo.add(-added);
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

    // Grenade throwing
    if (this.activeSlot === 4 || this.activeWeapon.category === 'equipment') {
      if (currentTime - this.lastShotTime < 1.0) return;
      this.lastShotTime = currentTime;
      this.throwGrenade();
      this.isShooting = false;
      return;
    }

    // Knife melee attack with real damage
    if (this.activeWeapon.category === 'melee') {
      if (currentTime - this.lastShotTime < this.activeWeapon.fireRate) return;
      this.lastShotTime = currentTime;
      this.isShooting = false;
      window.csAudio.playKnifeSlash();
      this.weaponRig.position.z = -0.35;
      this.weaponRig.rotation.y = 0.4;
      setTimeout(() => {
        this.weaponRig.rotation.y = 0;
      }, 120);

      // Raycast for knife melee damage up to 3.2 meters
      if (gameManager && gameManager.net) {
        const knifeRay = new THREE.Raycaster();
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        knifeRay.set(this.camera.position, dir);
        Object.entries(gameManager.net.remotePlayers).forEach(([id, p]) => {
          if (p.team === this.team || !p.mesh || !p.mesh.visible) return;
          const hits = knifeRay.intersectObject(p.mesh, true);
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

    // Semi-automatic trigger (Pistols except CZ-75 require a distinct click per bullet)
    const isSemiAuto = (this.activeWeapon.category === 'pistols' && this.activeWeapon.id !== 'cz75') ||
                       (this.activeWeapon.category === 'snipers' && this.activeWeapon.id !== 'scar20' && this.activeWeapon.id !== 'g3sg1') ||
                       (this.activeWeapon.category === 'heavy' && this.activeWeapon.id !== 'negev' && this.activeWeapon.id !== 'm249');
    if (isSemiAuto) {
      this.isShooting = false;
    }

    this.clipAmmo.add(-1);
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

    this.recoilPitch += (this.activeWeapon.recoil || 0.02) * (0.8 + Math.random() * 0.4);
    this.recoilYaw += (Math.random() - 0.5) * (this.activeWeapon.recoil || 0.02);

    this.weaponRig.position.z = -0.42;

    // Raycast hit check & bullet hole creation
    const raycaster = new THREE.Raycaster();
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    raycaster.set(this.camera.position, camDir);

    // Hit players with authentic headshot/body multiplier & hit sound
    if (gameManager && gameManager.net) {
      Object.entries(gameManager.net.remotePlayers).forEach(([id, p]) => {
        if (p.team === this.team) return;
        if (!p.mesh || !p.mesh.visible) return;
        const intersects = raycaster.intersectObject(p.mesh, true);
        if (intersects.length > 0 && intersects[0].distance < 120) {
          const hitPoint = intersects[0].point;
          const relY = hitPoint.y - p.mesh.position.y;
          const isHeadshot = relY >= 1.45;
          const dmgMult = isHeadshot ? 2.5 : 1.0;
          const finalDamage = Math.round(this.activeWeapon.damage * dmgMult);

          if (isHeadshot) {
            window.csAudio.playHeadshotDink();
          } else {
            window.csAudio.playSound('damage1');
          }

          gameManager.net.sendDamage(id, finalDamage, this.activeWeapon.name, isHeadshot);
        }
      });
    }

    // Bullet hole impact on map obstacles
    if (this.map && this.map.mapGroup) {
      const wallHits = raycaster.intersectObjects(this.map.mapGroup.children, true);
      if (wallHits.length > 0 && wallHits[0].distance < 80) {
        this.spawnBulletHole(wallHits[0].point, wallHits[0].face.normal);
      }
    }
  }

  // Realistic bullet holes on walls and obstacles
  spawnBulletHole(point, normal) {
    const geo = new THREE.CircleGeometry(0.06, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide });
    const decal = new THREE.Mesh(geo, mat);

    // Position slightly offset from surface to prevent z-fighting
    decal.position.copy(point).addScaledVector(normal, 0.02);
    decal.lookAt(point.clone().add(normal));
    this.scene.add(decal);

    this.bulletDecals.push(decal);
    if (this.bulletDecals.length > 40) {
      const old = this.bulletDecals.shift();
      this.scene.remove(old);
      if (old.geometry) old.geometry.dispose();
      if (old.material) old.material.dispose();
    }
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

    // Speed: Left Click (long throw, 18 m/s) vs Right Click (short underhand lob, 7.5 m/s)
    const speed = isUnderhand ? 7.5 : 18.0;
    const upBoost = isUnderhand ? 2.2 : 4.5;
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

      if (g.mesh.position.y <= 0.1) {
        g.mesh.position.y = 0.1;
        g.velocity.y = -g.velocity.y * 0.35;
        g.velocity.x *= 0.65;
        g.velocity.z *= 0.65;
        if (g.type === 'molotov') g.lifetime = 0; // Detonates on impact
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
          // Radial explosive blast damage to player & enemies
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
          // Volumetric 3D smoke cloud
          const smokeGroup = new THREE.Group();
          for (let s = 0; s < 12; s++) {
            const sGeo = new THREE.SphereGeometry(1.6 + Math.random() * 0.8, 8, 8);
            const sMat = new THREE.MeshLambertMaterial({
              color: 0xc4c7cc,
              transparent: true,
              opacity: 0.82
            });
            const sMesh = new THREE.Mesh(sGeo, sMat);
            sMesh.position.set(
              (Math.random() - 0.5) * 3.8,
              0.8 + Math.random() * 1.6,
              (Math.random() - 0.5) * 3.8
            );
            smokeGroup.add(sMesh);
          }
          smokeGroup.position.copy(pos);
          this.scene.add(smokeGroup);

          setTimeout(() => {
            window.csAudio.playSmokeClear();
            this.scene.remove(smokeGroup);
          }, 18000);
        } else if (g.type === 'molotov') {
          window.csAudio.playMolotovDetonate();
          // Burning ground fire pool
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
    dmgVignette.style.opacity = '0.8';
    setTimeout(() => { dmgVignette.style.opacity = '0'; }, 180);

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
    const spawnY = (spawnPos && spawnPos.y !== undefined) ? spawnPos.y : this.playerHeight;
    this.position.set(spawnPos.x, spawnY, spawnPos.z);
    if (spawnPos && spawnPos.yaw !== undefined) {
      this.yaw = spawnPos.yaw;
    }
    this.velocity.set(0, 0, 0);
    this.isGrounded = true;
    this.health.set(100);
    this.armor.set(100);
    this.isReloading = false;
    this.isPlanting = false;
    this.isDefusing = false;
    if (this.isScoped) this.toggleScope();

    if (this.activeWeapon && this.activeWeapon.clip) {
      this.clipAmmo.set(this.activeWeapon.clip);
      this.reserveAmmo.set(this.activeWeapon.reserve);
    }
  }

  update(dt, currentTime, gameManager) {
    this.updateGrenades(dt);

    // Spectator POV Camera following
    if (this.isSpectating) {
      if (this.spectatedTarget && this.spectatedTarget.mesh) {
        this.camera.position.set(
          this.spectatedTarget.mesh.position.x,
          this.spectatedTarget.mesh.position.y + 1.7,
          this.spectatedTarget.mesh.position.z
        );
        this.camera.rotation.set(0, this.spectatedTarget.mesh.rotation.y, 0);
      }
      return;
    }

    // Realistic Reload Animation
    if (this.isReloading) {
      const elapsed = currentTime - this.reloadStartTime;
      const t = Math.min(1.0, elapsed / 2200);

      // Gun tilts down and to the side while mag is inserted
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
    }

    if (this.isShooting && !this.isReloading && !inFreeze) {
      this.shoot(currentTime / 1000, gameManager);
    }

    // Authentic CS2 Movement Speeds (Knife provides run-boost)
    let baseSpeed = 7.2;
    if (this.activeWeapon) {
      if (this.activeWeapon.id === 'knife') baseSpeed = 9.2; // CS2 250 units/s Knife Boost
      else if (this.activeWeapon.category === 'pistols') baseSpeed = 8.2; // 240 units/s
      else if (this.activeWeapon.id === 'awp') baseSpeed = 6.2; // 200 units/s
      else baseSpeed = 7.2; // 215 units/s Rifles
    }

    const moveSpeed = (this.isCrouched ? 2.5 : this.keys[this.keybinds.walk] ? 3.5 : baseSpeed) * (this.isScoped ? 0.6 : 1.0);
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const moveDir = new THREE.Vector3();
    if (!inFreeze) {
      if (this.keys[this.keybinds.forward]) moveDir.add(forward);
      if (this.keys[this.keybinds.backward]) moveDir.sub(forward);
      if (this.keys[this.keybinds.right]) moveDir.add(right);
      if (this.keys[this.keybinds.left]) moveDir.sub(right);
    }

    if (moveDir.length() > 0) {
      moveDir.normalize();
      this.velocity.x = moveDir.x * moveSpeed;
      this.velocity.z = moveDir.z * moveSpeed;

      if (this.isGrounded && Math.random() < 0.05) {
        window.csAudio.playFootstep();
      }
    } else {
      this.velocity.x *= 0.7;
      this.velocity.z *= 0.7;
    }

    // Jumping
    if (this.keys[this.keybinds.jump] && this.isGrounded && !inFreeze) {
      this.velocity.y = 6.2;
      this.isGrounded = false;
    }
    this.velocity.y -= 18.0 * dt;

    this.isCrouched = !!this.keys[this.keybinds.crouch];
    const targetHeight = this.isCrouched ? 1.0 : 1.8;
    this.playerHeight += (targetHeight - this.playerHeight) * 0.2;

    const oldX = this.position.x;
    const oldZ = this.position.z;
    const playerRadius = 0.52;
    const colliders = this.map.colliders;

    // Multi-Axis Impenetrable Collision Resolution:
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

    // 3. Resolve Y movement & Downward 3D Terrain Raycasting
    this.position.y += this.velocity.y * dt;

    let targetGroundY = 0;
    if (this.map && this.map.groundMeshes && this.map.groundMeshes.length > 0) {
      if (!this.downRaycaster) {
        this.downRaycaster = new THREE.Raycaster();
        this.downOrigin = new THREE.Vector3();
        this.downDir = new THREE.Vector3(0, -1, 0);
      }
      this.downOrigin.set(this.position.x, this.position.y + 0.2, this.position.z);
      this.downRaycaster.set(this.downOrigin, this.downDir);
      this.downRaycaster.far = 40.0;
      const hits = this.downRaycaster.intersectObjects(this.map.groundMeshes, false);
      for (let i = 0; i < hits.length; i++) {
        if (hits[i].point.y <= this.position.y - this.playerHeight + 0.6) {
          targetGroundY = hits[i].point.y;
          break;
        }
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
    this.weaponRig.position.z += (-0.5 - this.weaponRig.position.z) * 0.15;
    const speed2D = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    const bob = Math.sin(currentTime * 0.008) * (speed2D * 0.004);
    if (!this.isReloading) {
      this.weaponRig.position.y = bob;
    }
  }
}

window.CS2Player = CS2Player;
