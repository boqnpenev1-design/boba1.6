// CS2 First-Person Player Controller with High-Fidelity Weapon Viewmodels and Spectator POV

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
      4: null,
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
      this.inventory[5] = null;
      this.hasDefuseKit = false;
    } else {
      this.inventory[2] = CS2_WEAPONS.glock;
      this.inventory[5] = CS2_WEAPONS.c4;
      this.hasDefuseKit = false;
    }
    this.switchSlot(2);
  }

  // Builds instant high-fidelity 3D weapon models tailored to weapon type
  buildCurrentWeaponModel() {
    while (this.weaponRig.children.length > 0) {
      this.weaponRig.remove(this.weaponRig.children[0]);
    }

    const w = this.activeWeapon;
    if (!w) return;

    const group = new THREE.Group();

    if (w.id === 'knife') {
      // Knife blade & handle
      const bladeGeo = new THREE.BoxGeometry(0.02, 0.08, 0.35);
      const bladeMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0.2, -0.22, -0.45);
      blade.rotation.x = 0.3;
      group.add(blade);

      const gripGeo = new THREE.BoxGeometry(0.04, 0.06, 0.16);
      const gripMat = new THREE.MeshLambertMaterial({ color: 0x1f2421 });
      const grip = new THREE.Mesh(gripGeo, gripMat);
      grip.position.set(0.2, -0.26, -0.28);
      group.add(grip);
    } else if (w.id === 'c4') {
      // C4 Explosive Pack
      const packGeo = new THREE.BoxGeometry(0.18, 0.12, 0.28);
      const packMat = new THREE.MeshLambertMaterial({ color: 0x966838 });
      const pack = new THREE.Mesh(packGeo, packMat);
      pack.position.set(0.18, -0.22, -0.45);
      group.add(pack);

      const keypadGeo = new THREE.BoxGeometry(0.09, 0.03, 0.12);
      const keypad = new THREE.Mesh(keypadGeo, new THREE.MeshLambertMaterial({ color: 0x111111 }));
      keypad.position.set(0.18, -0.15, -0.45);
      group.add(keypad);
    } else if (w.category === 'pistols') {
      // Pistol Slide
      const slideGeo = new THREE.BoxGeometry(0.06, 0.09, 0.32);
      const slideMat = new THREE.MeshLambertMaterial({
        color: w.id === 'deagle' ? 0xd0d5dd : 0x242830
      });
      const slide = new THREE.Mesh(slideGeo, slideMat);
      slide.position.set(0.22, -0.22, -0.45);
      group.add(slide);

      // Grip
      const gripGeo = new THREE.BoxGeometry(0.05, 0.14, 0.1);
      const gripMat = new THREE.MeshLambertMaterial({ color: 0x1a1d24 });
      const grip = new THREE.Mesh(gripGeo, gripMat);
      grip.rotation.x = -0.3;
      grip.position.set(0.22, -0.29, -0.36);
      group.add(grip);

      // Silencer for USP-S
      if (w.isSilenced) {
        const silencerGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.28, 12);
        const silencer = new THREE.Mesh(silencerGeo, new THREE.MeshLambertMaterial({ color: 0x1b1e24 }));
        silencer.rotation.x = Math.PI / 2;
        silencer.position.set(0.22, -0.21, -0.7);
        group.add(silencer);
      }
    } else if (w.id === 'awp') {
      // AWP Sniper
      const bodyGeo = new THREE.BoxGeometry(0.09, 0.14, 0.65);
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3d5a45 }); // Olive drab
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0.24, -0.22, -0.55);
      group.add(body);

      // Heavy Long Barrel
      const barrelGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.55, 10);
      const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshLambertMaterial({ color: 0x14161a }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.24, -0.20, -0.95);
      group.add(barrel);

      // Telescopic Scope
      const scopeGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.32, 12);
      const scope = new THREE.Mesh(scopeGeo, new THREE.MeshLambertMaterial({ color: 0x111111 }));
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0.24, -0.11, -0.55);
      group.add(scope);
    } else {
      // Assault Rifles (AK-47 / M4A4 / M4A1)
      const bodyGeo = new THREE.BoxGeometry(0.08, 0.13, 0.6);
      const bodyMat = new THREE.MeshLambertMaterial({
        color: w.id === 'ak47' ? 0x6e3c1b : 0x2c333d // AK Wood vs M4 Charcoal
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0.25, -0.22, -0.52);
      group.add(body);

      // Barrel
      const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.45, 10);
      const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshLambertMaterial({ color: 0x15181e }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.25, -0.19, -0.85);
      group.add(barrel);

      // Banana Magazine for AK
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

      // Spectator Cycle: Press A or D to change spectated player
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

      if (e.code === this.keybinds.reload) this.startReload();

      if (e.code === 'KeyQ') {
        const alt = this.activeSlot === 1 ? 2 : 1;
        if (this.inventory[alt]) this.switchSlot(alt);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === this.keybinds.use) {
        this.isPlanting = false;
        this.plantProgress = 0;
        this.isDefusing = false;
        this.defuseProgress = 0;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== document.getElementById('game-canvas-container')) return;
      if (this.isSpectating) return;

      const sens = (this.sensitivity * 0.002) * (this.isScoped ? 0.35 : 1.0);
      this.yaw -= e.movementX * sens;
      const yDelta = e.movementY * sens * (this.invertY ? -1 : 1);
      this.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch - yDelta));
    });

    window.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== document.getElementById('game-canvas-container')) return;
      if (this.isSpectating) {
        if (e.button === 0) this.cycleSpectator(1);
        return;
      }

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
  }

  cycleSpectator(dir = 1) {
    if (!window.csGameManager) return;
    const remoteList = Object.values(window.csGameManager.net.remotePlayers);
    if (remoteList.length === 0) return;

    this.spectatorIndex = (this.spectatorIndex + dir + remoteList.length) % remoteList.length;
    this.spectatedTarget = remoteList[this.spectatorIndex];

    const banner = document.getElementById('spectator-hud');
    if (banner && this.spectatedTarget) {
      banner.classList.remove('hidden');
      document.getElementById('spectator-target-name').innerText = `Player (${this.spectatedTarget.team})`;
    }
  }

  enterSpectatorMode() {
    this.isSpectating = true;
    this.viewmodelGroup.visible = false;
    const specHud = document.getElementById('spectator-hud');
    if (specHud) specHud.classList.remove('hidden');
    this.cycleSpectator(0);
  }

  exitSpectatorMode() {
    this.isSpectating = false;
    this.spectatedTarget = null;
    this.viewmodelGroup.visible = true;
    const specHud = document.getElementById('spectator-hud');
    if (specHud) specHud.classList.add('hidden');
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

    if (this.activeWeapon.category === 'melee') {
      if (currentTime - this.lastShotTime < this.activeWeapon.fireRate) return;
      this.lastShotTime = currentTime;
      window.csAudio.playKnifeSlash();
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

    // Raycast hit check against remote players
    if (gameManager && gameManager.net) {
      const raycaster = new THREE.Raycaster();
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      raycaster.set(this.camera.position, camDir);

      Object.entries(gameManager.net.remotePlayers).forEach(([id, p]) => {
        if (p.team === this.team) return;
        const intersects = raycaster.intersectObject(p.mesh, true);
        if (intersects.length > 0 && intersects[0].distance < 80) {
          gameManager.net.sendDamage(id, this.activeWeapon.damage, this.activeWeapon.name);
        }
      });
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

    if (this.isReloading && currentTime - this.reloadStartTime > 2200) {
      this.finishReload();
    }

    if (this.isShooting && !this.isReloading) {
      this.shoot(currentTime / 1000, gameManager);
    }

    // Movement
    const moveSpeed = (this.isCrouched ? 2.5 : this.keys[this.keybinds.walk] ? 3.5 : 7.5) * (this.isScoped ? 0.6 : 1.0);
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const moveDir = new THREE.Vector3();
    if (this.keys[this.keybinds.forward]) moveDir.add(forward);
    if (this.keys[this.keybinds.backward]) moveDir.sub(forward);
    if (this.keys[this.keybinds.right]) moveDir.add(right);
    if (this.keys[this.keybinds.left]) moveDir.sub(right);

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

    if (this.keys[this.keybinds.jump] && this.isGrounded) {
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

    // Fast Collisions Check
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
        if (collider.isClimbable && this.position.y >= collider.topY + 0.2) {
          this.position.y = collider.topY + this.playerHeight;
          this.velocity.y = 0;
          this.isGrounded = true;
        } else {
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

    // Viewmodel Recoil Recovery & Bobbing
    this.weaponRig.position.z += (-0.5 - this.weaponRig.position.z) * 0.15;
    const speed2D = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    const bob = Math.sin(currentTime * 0.008) * (speed2D * 0.004);
    this.weaponRig.position.y = bob;
  }
}

window.CS2Player = CS2Player;
