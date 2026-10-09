// CS2 First-Person Player Controller, Weapon Viewmodels, and Ballistics

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
    this.team = 'CT'; // 'CT' or 'T'

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

    // Ammo counts per slot (using AntiCheat canaries)
    this.clipAmmo = window.__CS2_AC.createProtectedValue(12);
    this.reserveAmmo = window.__CS2_AC.createProtectedValue(24);

    // Camera & Movement state
    this.yaw = 0;
    this.pitch = 0;
    this.position = new THREE.Vector3(0, 1.8, -80);
    this.velocity = new THREE.Vector3();
    this.isGrounded = true;
    this.isCrouched = false;
    this.isScoped = false;
    this.playerHeight = 1.8;

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

    // Firing & Weapon State
    this.lastShotTime = 0;
    this.isReloading = false;
    this.reloadStartTime = 0;
    this.isPlanting = false;
    this.plantProgress = 0;
    this.isDefusing = false;
    this.defuseProgress = 0;
    this.sensitivity = 1.8;
    this.invertY = false;

    // Recoil Punch State
    this.recoilPitch = 0;
    this.recoilYaw = 0;

    // Viewmodel 3D Rig
    this.viewmodelGroup = new THREE.Group();
    this.camera.add(this.viewmodelGroup);
    this.createViewmodelMeshes();

    // Setup Event Listeners
    this.initControls();
  }

  setTeam(team) {
    this.team = team;
    if (team === 'CT') {
      this.inventory[2] = CS2_WEAPONS.usp;
      this.hasDefuseKit = false;
    } else {
      this.inventory[2] = CS2_WEAPONS.glock;
      this.inventory[5] = CS2_WEAPONS.c4;
      this.hasDefuseKit = false;
    }
    this.switchSlot(2);
  }

  createViewmodelMeshes() {
    // Gun Body Mesh (3D procedural representation)
    const gunBodyGeo = new THREE.BoxGeometry(0.08, 0.12, 0.55);
    const gunBodyMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.4, metalness: 0.8 });
    this.vmGunBody = new THREE.Mesh(gunBodyGeo, gunBodyMat);
    this.vmGunBody.position.set(0.25, -0.22, -0.5);

    // Gun Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 12);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.3, metalness: 0.9 });
    this.vmBarrel = new THREE.Mesh(barrelGeo, barrelMat);
    this.vmBarrel.rotation.x = Math.PI / 2;
    this.vmBarrel.position.set(0.25, -0.19, -0.75);

    // Muzzle Flash Light & Mesh
    this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 8);
    this.muzzleLight.position.set(0.25, -0.19, -0.95);

    const flashGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdd66 });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.position.set(0.25, -0.19, -0.95);
    this.muzzleFlashMesh.visible = false;

    this.viewmodelGroup.add(this.vmGunBody);
    this.viewmodelGroup.add(this.vmBarrel);
    this.viewmodelGroup.add(this.muzzleLight);
    this.viewmodelGroup.add(this.muzzleFlashMesh);
  }

  updateViewmodelSkin() {
    if (!this.activeWeapon) return;
    const color = this.activeWeapon.color || '#333333';
    this.vmGunBody.material.color.set(color);
  }

  initControls() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      // Slot switching
      if (e.code === this.keybinds.slot1) this.switchSlot(1);
      if (e.code === this.keybinds.slot2) this.switchSlot(2);
      if (e.code === this.keybinds.slot3) this.switchSlot(3);
      if (e.code === this.keybinds.slot4) this.switchSlot(4);
      if (e.code === this.keybinds.slot5) this.switchSlot(5);

      // Reload
      if (e.code === this.keybinds.reload) this.startReload();

      // Scope / ADS on right click or alternate
      if (e.code === 'KeyQ') {
        // Quickswitch weapon
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

    // Mouse Look
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== document.getElementById('game-canvas-container')) return;

      const sens = (this.sensitivity * 0.002) * (this.isScoped ? 0.35 : 1.0);
      this.yaw -= e.movementX * sens;
      const yDelta = e.movementY * sens * (this.invertY ? -1 : 1);
      this.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch - yDelta));
    });

    // Mouse Clicks (Fire & Scope)
    window.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== document.getElementById('game-canvas-container')) return;

      if (e.button === 0) { // Left click
        this.isShooting = true;
      } else if (e.button === 2) { // Right click
        this.toggleScope();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isShooting = false;
      }
    });
  }

  toggleScope() {
    if (!this.activeWeapon || !this.activeWeapon.canScope) return;
    this.isScoped = !this.isScoped;
    const scopeEl = document.getElementById('scope-overlay');
    if (this.isScoped) {
      this.camera.fov = 25;
      scopeEl.classList.remove('hidden');
      this.viewmodelGroup.visible = false;
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

    // Update ammo canaries for active weapon
    if (this.activeWeapon.clip) {
      this.clipAmmo.set(this.activeWeapon.clip);
      this.reserveAmmo.set(this.activeWeapon.reserve);
    }

    this.updateViewmodelSkin();
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

  // Shoot weapon with spread, recoil punch, and hit detection
  shoot(currentTime, bots = [], gameManager = null) {
    if (!this.activeWeapon) return;

    // Knife attack
    if (this.activeWeapon.category === 'melee') {
      if (currentTime - this.lastShotTime < this.activeWeapon.fireRate) return;
      this.lastShotTime = currentTime;
      window.csAudio.playKnifeSlash();
      this.performMeleeAttack(bots, gameManager);
      return;
    }

    // Gunfire
    if (this.clipAmmo.get() <= 0) {
      this.startReload();
      return;
    }

    if (currentTime - this.lastShotTime < this.activeWeapon.fireRate) return;
    this.lastShotTime = currentTime;

    // Deduct ammo through AntiCheat canary
    this.clipAmmo.add(-1);

    // Play synthesized gunfire sound
    window.csAudio.playGunshot(this.activeWeapon.audioType, this.activeWeapon.isSilenced);

    // Muzzle flash visual
    this.muzzleLight.intensity = 2.5;
    this.muzzleFlashMesh.visible = true;
    setTimeout(() => {
      this.muzzleLight.intensity = 0;
      this.muzzleFlashMesh.visible = false;
    }, 45);

    // Recoil Punch
    this.recoilPitch += (this.activeWeapon.recoil || 0.02) * (0.8 + Math.random() * 0.4);
    this.recoilYaw += (Math.random() - 0.5) * (this.activeWeapon.recoil || 0.02);

    // Viewmodel kick animation
    this.vmGunBody.position.z = -0.42;

    // Raycast hit detection for bullets
    const pellets = this.activeWeapon.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      this.fireBulletRaycast(bots, gameManager);
    }
  }

  fireBulletRaycast(bots, gameManager) {
    const spread = this.activeWeapon.spread * (this.velocity.length() > 0.5 ? 2.5 : 1.0);
    const spreadX = (Math.random() - 0.5) * spread;
    const spreadY = (Math.random() - 0.5) * spread;

    const raycaster = new THREE.Raycaster();
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    camDir.x += spreadX;
    camDir.y += spreadY;
    camDir.normalize();

    raycaster.set(this.camera.position, camDir);

    // Check hit against bots
    let closestBot = null;
    let closestDist = Infinity;
    let isHeadshot = false;

    bots.forEach(bot => {
      if (!bot.isAlive || bot.team === this.team) return;
      const intersects = raycaster.intersectObject(bot.mesh, true);
      if (intersects.length > 0 && intersects[0].distance < closestDist) {
        closestDist = intersects[0].distance;
        closestBot = bot;
        // Headshot detection: hit point near top of bot mesh
        const hitY = intersects[0].point.y - bot.mesh.position.y;
        if (hitY > 1.45) isHeadshot = true;
      }
    });

    if (closestBot) {
      let dmg = this.activeWeapon.damage;
      if (isHeadshot) {
        dmg *= 3.8;
        window.csAudio.playHeadshotDink();
      }
      closestBot.takeDamage(dmg, 'Player', this.activeWeapon.name, isHeadshot, gameManager);
    }
  }

  performMeleeAttack(bots, gameManager) {
    const raycaster = new THREE.Raycaster();
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    raycaster.set(this.camera.position, camDir);

    bots.forEach(bot => {
      if (!bot.isAlive || bot.team === this.team) return;
      const intersects = raycaster.intersectObject(bot.mesh, true);
      if (intersects.length > 0 && intersects[0].distance < 2.5) {
        window.csAudio.playKnifeHit();
        bot.takeDamage(65, 'Player', 'Knife', false, gameManager);
      }
    });
  }

  // Damage handling for local player
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

    // Red screen flash
    const dmgVignette = document.getElementById('damage-vignette');
    dmgVignette.style.opacity = '0.8';
    setTimeout(() => { dmgVignette.style.opacity = '0'; }, 180);

    if (newHealth <= 0) {
      this.onDeath(attackerName, weaponName);
    }
  }

  onDeath(attackerName, weaponName) {
    if (this.isScoped) this.toggleScope();
    document.getElementById('action-prompt').classList.add('hidden');
    document.getElementById('interaction-bar-container').classList.add('hidden');
  }

  respawn(spawnPos) {
    this.position.set(spawnPos.x, this.playerHeight, spawnPos.z);
    this.velocity.set(0, 0, 0);
    this.health.set(100);
    this.isReloading = false;
    this.isPlanting = false;
    this.isDefusing = false;
    if (this.isScoped) this.toggleScope();

    // Refill clip ammo on round start
    if (this.activeWeapon && this.activeWeapon.clip) {
      this.clipAmmo.set(this.activeWeapon.clip);
      this.reserveAmmo.set(this.activeWeapon.reserve);
    }
  }

  // Update physics, collision, and viewmodel bobbing per tick
  update(dt, currentTime, bots, gameManager) {
    // 1. Reloading logic
    if (this.isReloading && currentTime - this.reloadStartTime > 2200) {
      this.finishReload();
    }

    // 2. Firing logic (auto-fire on held left click)
    if (this.isShooting && !this.isReloading) {
      this.shoot(currentTime / 1000, bots, gameManager);
    }

    // 3. Movement Physics (WASD + Jump + Crouch)
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

      // Footstep audio cadence
      if (this.isGrounded && Math.random() < 0.05) {
        window.csAudio.playFootstep();
      }
    } else {
      this.velocity.x *= 0.7;
      this.velocity.z *= 0.7;
    }

    // Jump & Gravity
    if (this.keys[this.keybinds.jump] && this.isGrounded) {
      this.velocity.y = 6.2;
      this.isGrounded = false;
    }
    this.velocity.y -= 18.0 * dt; // Gravity

    // Crouch height
    this.isCrouched = !!this.keys[this.keybinds.crouch];
    const targetHeight = this.isCrouched ? 1.0 : 1.8;
    this.playerHeight += (targetHeight - this.playerHeight) * 0.2;

    // Proposed new position
    const oldPos = { x: this.position.x, y: this.position.y, z: this.position.z };
    const newPos = {
      x: this.position.x + this.velocity.x * dt,
      y: this.position.y + this.velocity.y * dt,
      z: this.position.z + this.velocity.z * dt
    };

    // Apply AntiCheat speedhack validation
    const validatedPos = window.__CS2_AC.validateMovementDelta(oldPos, newPos, dt);
    this.position.x = validatedPos.x;
    this.position.y = validatedPos.y;
    this.position.z = validatedPos.z;

    // Ground collision
    if (this.position.y <= this.playerHeight) {
      this.position.y = this.playerHeight;
      this.velocity.y = 0;
      this.isGrounded = true;
    }

    // Obstacle Box Collisions
    const playerRadius = 0.6;
    for (const collider of this.map.colliders) {
      const box = collider.box;
      if (
        this.position.x + playerRadius > box.min.x &&
        this.position.x - playerRadius < box.max.x &&
        this.position.z + playerRadius > box.min.z &&
        this.position.z - playerRadius < box.max.z
      ) {
        // Can climb on top if jumping
        if (collider.isClimbable && this.position.y >= collider.topY + 0.2) {
          this.position.y = collider.topY + this.playerHeight;
          this.velocity.y = 0;
          this.isGrounded = true;
        } else {
          // Push player back
          this.position.x = oldPos.x;
          this.position.z = oldPos.z;
        }
      }
    }

    // 4. Decay Recoil Punch
    this.recoilPitch *= 0.88;
    this.recoilYaw *= 0.88;

    // 5. Update Camera
    this.camera.position.copy(this.position);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + this.recoilYaw;
    this.camera.rotation.x = this.pitch + this.recoilPitch;

    // 6. Viewmodel Bobbing & Recovery
    this.vmGunBody.position.z += (-0.5 - this.vmGunBody.position.z) * 0.15;
    const speed2D = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    const bob = Math.sin(currentTime * 0.008) * (speed2D * 0.004);
    this.vmGunBody.position.y = -0.22 + bob;
    this.vmBarrel.position.y = -0.19 + bob;
  }
}

window.CS2Player = CS2Player;
