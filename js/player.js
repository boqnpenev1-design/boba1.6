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

  // Builds 3D weapon models with realistic tactical arms and hands
  buildCurrentWeaponModel() {
    while (this.weaponRig.children.length > 0) {
      this.weaponRig.remove(this.weaponRig.children[0]);
    }

    const w = this.activeWeapon;
    if (!w) return;

    const group = new THREE.Group();

    // 1. Tactical Operator Sleeves & Gloves
    const sleeveColor = this.team === 'CT' ? 0x223244 : 0x4a3b2b;
    const gloveColor = 0x14181c;
    const sleeveMat = new THREE.MeshLambertMaterial({ color: sleeveColor });
    const gloveMat = new THREE.MeshLambertMaterial({ color: gloveColor });

    // Right Arm & Hand (Primary holding arm)
    const rForearmGeo = new THREE.CylinderGeometry(0.05, 0.055, 0.42, 8);
    const rForearm = new THREE.Mesh(rForearmGeo, sleeveMat);
    rForearm.rotation.set(-1.1, 0.3, -0.4);
    rForearm.position.set(0.28, -0.38, -0.32);
    group.add(rForearm);

    const rHandGeo = new THREE.BoxGeometry(0.065, 0.07, 0.1);
    const rHand = new THREE.Mesh(rHandGeo, gloveMat);
    rHand.rotation.set(-0.9, 0.3, -0.3);
    rHand.position.set(0.24, -0.27, -0.42);
    group.add(rHand);

    // Left Arm & Hand (Support arm for rifles/two-handed)
    if (w.category === 'rifles' || w.id === 'awp') {
      const lForearmGeo = new THREE.CylinderGeometry(0.05, 0.055, 0.45, 8);
      const lForearm = new THREE.Mesh(lForearmGeo, sleeveMat);
      lForearm.rotation.set(-1.0, -0.5, 0.6);
      lForearm.position.set(-0.06, -0.39, -0.42);
      group.add(lForearm);

      const lHandGeo = new THREE.BoxGeometry(0.065, 0.065, 0.09);
      const lHand = new THREE.Mesh(lHandGeo, gloveMat);
      lHand.rotation.set(-0.8, -0.4, 0.4);
      lHand.position.set(0.12, -0.25, -0.62);
      group.add(lHand);
    }

    // 2. Weapon 3D Geometry
    if (w.id === 'knife') {
      // Tactical Combat Knife
      const bladeGeo = new THREE.BoxGeometry(0.015, 0.07, 0.34);
      const bladeMat = new THREE.MeshLambertMaterial({ color: 0xdde2e6 });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0.22, -0.21, -0.48);
      blade.rotation.x = 0.35;
      group.add(blade);

      const gripGeo = new THREE.BoxGeometry(0.035, 0.05, 0.16);
      const gripMat = new THREE.MeshLambertMaterial({ color: 0x1f2421 });
      const grip = new THREE.Mesh(gripGeo, gripMat);
      grip.position.set(0.22, -0.25, -0.32);
      group.add(grip);
    } else if (w.id === 'c4') {
      // C4 Explosive Pack
      const packGeo = new THREE.BoxGeometry(0.2, 0.13, 0.3);
      const packMat = new THREE.MeshLambertMaterial({ color: 0x9a6c3a });
      const pack = new THREE.Mesh(packGeo, packMat);
      pack.position.set(0.19, -0.21, -0.48);
      group.add(pack);

      const padGeo = new THREE.BoxGeometry(0.1, 0.03, 0.14);
      const keypad = new THREE.Mesh(padGeo, new THREE.MeshLambertMaterial({ color: 0x111111 }));
      keypad.position.set(0.19, -0.14, -0.48);
      group.add(keypad);
    } else if (w.category === 'equipment' || w.id === 'flashbang' || w.id === 'hegrenade' || w.id === 'smoke') {
      // Grenade Canister in Hand
      const grenGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.16, 12);
      const grenMat = new THREE.MeshLambertMaterial({ color: w.id === 'flashbang' ? 0x6e8090 : 0x3d4a36 });
      const gren = new THREE.Mesh(grenGeo, grenMat);
      gren.position.set(0.2, -0.22, -0.46);
      group.add(gren);

      const pinGeo = new THREE.TorusGeometry(0.02, 0.005, 6, 12);
      const pin = new THREE.Mesh(pinGeo, new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      pin.position.set(0.2, -0.13, -0.46);
      group.add(pin);
    } else if (w.category === 'pistols') {
      // Pistols: Desert Eagle / Glock-18 / USP-S
      const slideGeo = new THREE.BoxGeometry(0.06, 0.09, 0.32);
      const slideMat = new THREE.MeshLambertMaterial({
        color: w.id === 'deagle' ? 0xd0d5dd : 0x242830
      });
      const slide = new THREE.Mesh(slideGeo, slideMat);
      slide.position.set(0.22, -0.22, -0.45);
      group.add(slide);

      const gripGeo = new THREE.BoxGeometry(0.05, 0.14, 0.1);
      const gripMat = new THREE.MeshLambertMaterial({ color: 0x1a1d24 });
      const grip = new THREE.Mesh(gripGeo, gripMat);
      grip.rotation.x = -0.3;
      grip.position.set(0.22, -0.29, -0.36);
      group.add(grip);

      if (w.isSilenced) {
        const silencerGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.28, 12);
        const silencer = new THREE.Mesh(silencerGeo, new THREE.MeshLambertMaterial({ color: 0x1b1e24 }));
        silencer.rotation.x = Math.PI / 2;
        silencer.position.set(0.22, -0.21, -0.7);
        group.add(silencer);
      }
    } else if (w.id === 'awp') {
      // AWP Sniper Rifle
      const bodyGeo = new THREE.BoxGeometry(0.09, 0.14, 0.65);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3d5a45 }); // Olive drab
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0.24, -0.22, -0.55);
      group.add(body);

      const barrelGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.55, 10);
      const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshLambertMaterial({ color: 0x14161a }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.24, -0.20, -0.95);
      group.add(barrel);

      const scopeGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.32, 12);
      const scope = new THREE.Mesh(scopeGeo, new THREE.MeshLambertMaterial({ color: 0x111111 }));
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0.24, -0.11, -0.55);
      group.add(scope);
    } else {
      // Assault Rifles (AK-47 / M4A4 / M4A1)
      const bodyGeo = new THREE.BoxGeometry(0.08, 0.13, 0.6);
      const bodyMat = new THREE.MeshLambertMaterial({
        color: w.id === 'ak47' ? 0x6e3c1b : 0x2c333d
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0.25, -0.22, -0.52);
      group.add(body);

      const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.45, 10);
      const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshLambertMaterial({ color: 0x15181e }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.25, -0.19, -0.85);
      group.add(barrel);

      const magGeo = new THREE.BoxGeometry(0.05, 0.22, 0.1);
      const mag = new THREE.Mesh(magGeo, new THREE.MeshLambertMaterial({ color: w.id === 'ak47' ? 0x222222 : 0x333b45 }));
      mag.rotation.x = 0.4;
      mag.position.set(0.25, -0.32, -0.48);
      group.add(mag);

      if (w.isSilenced) {
        const silencerGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.26, 12);
        const silencer = new THREE.Mesh(silencerGeo, new THREE.MeshLambertMaterial({ color: 0x181a20 }));
        silencer.rotation.x = Math.PI / 2;
        silencer.position.set(0.25, -0.19, -1.05);
        group.add(silencer);
      }
    }

    this.weaponRig.add(group);
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
      if (e.code === this.keybinds.slot4) this.switchSlot(4);
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
        this.toggleScope();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isShooting = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;

      const sens = (this.sensitivity * 0.0012) * (this.isScoped ? 0.4 : 1.0);
      this.yaw -= e.movementX * sens;

      const invertMult = this.invertY ? -1 : 1;
      this.pitch -= e.movementY * sens * invertMult;
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
    if (this.isScoped) this.toggleScope();

    if (this.activeWeapon.clip) {
      this.clipAmmo.set(this.activeWeapon.clip);
      this.reserveAmmo.set(this.activeWeapon.reserve);
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
    window.csAudio.playReload();
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

    // Grenade throwing
    if (this.activeSlot === 4 || this.activeWeapon.category === 'equipment') {
      if (currentTime - this.lastShotTime < 1.0) return;
      this.lastShotTime = currentTime;
      this.throwGrenade();
      return;
    }

    // Knife melee attack
    if (this.activeWeapon.category === 'melee') {
      if (currentTime - this.lastShotTime < this.activeWeapon.fireRate) return;
      this.lastShotTime = currentTime;
      window.csAudio.playKnifeSlash();
      this.weaponRig.position.z = -0.35;
      this.weaponRig.rotation.y = 0.4;
      setTimeout(() => {
        this.weaponRig.rotation.y = 0;
      }, 120);
      return;
    }

    if (this.clipAmmo.get() <= 0) {
      this.startReload();
      return;
    }

    if (currentTime - this.lastShotTime < this.activeWeapon.fireRate) return;
    this.lastShotTime = currentTime;

    this.clipAmmo.add(-1);
    window.csAudio.playGunshot(this.activeWeapon.audioType, this.activeWeapon.id, this.activeWeapon.isSilenced);

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

    // Hit players
    if (gameManager && gameManager.net) {
      Object.entries(gameManager.net.remotePlayers).forEach(([id, p]) => {
        if (p.team === this.team) return;
        const intersects = raycaster.intersectObject(p.mesh, true);
        if (intersects.length > 0 && intersects[0].distance < 80) {
          gameManager.net.sendDamage(id, this.activeWeapon.damage, this.activeWeapon.name);
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

  // Physical thrown grenade with arc & flash
  throwGrenade() {
    window.csAudio.playKnifeSlash();
    const spawnPos = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    const geo = new THREE.SphereGeometry(0.08, 8, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0x3d4a36 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(spawnPos).addScaledVector(dir, 0.8);
    this.scene.add(mesh);

    const velocity = dir.clone().multiplyScalar(16.0);
    velocity.y += 4.5;

    const gren = {
      mesh,
      velocity,
      lifetime: 1.8,
      type: this.activeWeapon ? this.activeWeapon.id : 'flashbang'
    };
    this.activeGrenades.push(gren);

    // Remove from slot 4
    this.inventory[4] = null;
    this.switchSlot(2);
  }

  updateGrenades(dt) {
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.velocity.y -= 18.0 * dt;
      g.mesh.position.addScaledVector(g.velocity, dt);
      g.lifetime -= dt;

      if (g.mesh.position.y <= 0.1) {
        g.mesh.position.y = 0.1;
        g.velocity.y = -g.velocity.y * 0.4;
        g.velocity.x *= 0.6;
        g.velocity.z *= 0.6;
      }

      if (g.lifetime <= 0) {
        // Explode / Flash
        this.scene.remove(g.mesh);
        this.activeGrenades.splice(i, 1);

        if (g.type === 'flashbang') {
          const flashEl = document.getElementById('flash-overlay');
          if (flashEl) {
            flashEl.style.opacity = '1';
            setTimeout(() => { flashEl.style.opacity = '0'; }, 1500);
          }
          window.csAudio.playExplosion();
        } else {
          window.csAudio.playExplosion();
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
  }

  respawn(spawnPos) {
    this.exitSpectatorMode();
    this.position.set(spawnPos.x, this.playerHeight, spawnPos.z);
    this.velocity.set(0, 0, 0);
    this.health.set(100);
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

    const oldPos = { x: this.position.x, y: this.position.y, z: this.position.z };
    const newPos = {
      x: this.position.x + this.velocity.x * dt,
      y: this.position.y + this.velocity.y * dt,
      z: this.position.z + this.velocity.z * dt
    };

    const validatedPos = window.__CS2_AC.validateMovementDelta(oldPos, newPos, dt);
    this.position.x = validatedPos.x;
    this.position.y = validatedPos.y;
    this.position.z = validatedPos.z;

    if (this.position.y <= this.playerHeight) {
      this.position.y = this.playerHeight;
      this.velocity.y = 0;
      this.isGrounded = true;
    }

    // Fast Collisions Check (Fixed: Allows jumping on A and B sites when velocity.y > 0)
    const px = this.position.x;
    const pz = this.position.z;
    const playerRadius = 0.6;
    const colliders = this.map.colliders;

    for (let i = 0; i < colliders.length; i++) {
      const collider = colliders[i];
      const box = collider.box;
      if (
        px + playerRadius > box.min.x &&
        px - playerRadius < box.max.x &&
        pz + playerRadius > box.min.z &&
        pz - playerRadius < box.max.z
      ) {
        // If standing on or falling onto a platform: only snap when NOT jumping upwards!
        if (collider.isClimbable && this.velocity.y <= 0 && this.position.y >= collider.topY + 0.1) {
          this.position.y = collider.topY + this.playerHeight;
          this.velocity.y = 0;
          this.isGrounded = true;
        } else if (this.position.y < collider.topY + 0.4) {
          this.position.x = oldPos.x;
          this.position.z = oldPos.z;
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
