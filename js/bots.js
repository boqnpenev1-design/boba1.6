// CS2 Tactical AI Bot System with SAS 3D Player Models and Combat Logic

class CS2Bot {
  constructor(name, team, scene, mapBuilder) {
    this.name = name;
    this.team = team;
    this.scene = scene;
    this.map = mapBuilder;

    this.isAlive = true;
    this.health = 100;
    this.kills = 0;
    this.assists = 0;
    this.deaths = 0;
    this.score = 0;
    this.cash = 800;

    this.position = new THREE.Vector3();
    this.targetPos = new THREE.Vector3();
    this.speed = 4.8;
    this.lastShotTime = 0;
    this.fireRate = 0.25;

    this.mesh = this.createBotMesh();
    this.scene.add(this.mesh);

    // Attach genuine 3D character model (CT = SAS agent, T = Phoenix agent)
    this.attachCharacterModel();
  }

  attachCharacterModel() {
    const gltfLoader = typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null;
    if (!gltfLoader) return;

    if (this.team === 'CT') {
      if (CS2Bot.ctModel) {
        this.applyModel(CS2Bot.ctModel, 1.0);
      } else {
        gltfLoader.load('ctm_sas__cs2_agent_model.glb', (gltf) => {
          CS2Bot.ctModel = gltf.scene;
          this.applyModel(CS2Bot.ctModel, 1.0);
        });
      }
    } else {
      if (CS2Bot.tModel) {
        this.applyModel(CS2Bot.tModel, 0.025);
      } else {
        gltfLoader.load('tm_phoenix_v2-_csgo_terrorist_characters.glb', (gltf) => {
          CS2Bot.tModel = gltf.scene;
          this.applyModel(CS2Bot.tModel, 0.025);
        });
      }
    }
  }

  applyModel(srcModel) {
    if (!srcModel || !this.mesh) return;
    const clone = (typeof THREE.SkeletonUtils !== 'undefined' && THREE.SkeletonUtils.clone)
      ? THREE.SkeletonUtils.clone(srcModel)
      : srcModel.clone(true);

    const bbox = new THREE.Box3().setFromObject(srcModel);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const targetHeight = 1.85;
    const normScale = size.y > 0 ? (targetHeight / size.y) : 1.0;

    clone.scale.set(normScale, normScale, normScale);
    clone.position.set(0, -bbox.min.y * normScale, 0);

    // Keep hitbox child
    const hitbox = this.mesh.getObjectByName('hitbox');
    while (this.mesh.children.length > 0) {
      this.mesh.remove(this.mesh.children[0]);
    }
    if (hitbox) this.mesh.add(hitbox);
    this.mesh.add(clone);
  }

  createBotMesh() {
    const group = new THREE.Group();
    // Hitbox cylinder for raycasting hit detection
    const hitboxGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.85, 10);
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
    hitbox.position.y = 0.925;
    hitbox.name = 'hitbox';
    group.add(hitbox);
    return group;
  }

  spawn(spawnPos) {
    this.isAlive = true;
    this.health = 100;
    this.position.set(spawnPos.x, 0, spawnPos.z);
    this.mesh.position.copy(this.position);
    this.mesh.visible = true;
    this.chooseNextObjective();
  }

  chooseNextObjective(c4Planted = false, c4Position = null) {
    if (c4Planted && c4Position) {
      if (this.team === 'CT') {
        this.targetPos.copy(c4Position);
        return;
      } else {
        const offset = (Math.random() - 0.5) * 8;
        this.targetPos.set(c4Position.x + offset, 0, c4Position.z + offset);
        return;
      }
    }

    const sites = this.map.bombZones;
    if (sites.length > 0) {
      const site = sites[Math.floor(Math.random() * sites.length)];
      const offsetX = (Math.random() - 0.5) * 12;
      const offsetZ = (Math.random() - 0.5) * 12;
      this.targetPos.set(site.x + offsetX, 0, site.z + offsetZ);
    }
  }

  takeDamage(amount, attackerName, weaponName, isHeadshot, gameManager) {
    if (!this.isAlive) return;

    this.health -= amount;
    if (this.health <= 0) {
      this.isAlive = false;
      this.deaths++;
      this.mesh.visible = false;

      if (gameManager) {
        gameManager.onEntityKilled(attackerName, this.name, weaponName, isHeadshot, this.team);
      }
    }
  }

  update(dt, currentTime, player, otherBots, gameManager) {
    if (!this.isAlive) return;

    let enemyTarget = null;
    let minDistance = 45;

    // Target player if enemy and alive
    if (player.team !== this.team && !player.isSpectating && player.health.get() > 0) {
      const dist = this.position.distanceTo(player.position);
      if (dist < minDistance) {
        minDistance = dist;
        enemyTarget = player.position;
      }
    }

    // Target opposing bots
    for (const other of otherBots) {
      if (other.isAlive && other.team !== this.team) {
        const dist = this.position.distanceTo(other.position);
        if (dist < minDistance) {
          minDistance = dist;
          enemyTarget = other.position;
        }
      }
    }

    if (enemyTarget) {
      const angle = Math.atan2(enemyTarget.x - this.position.x, enemyTarget.z - this.position.z);
      this.mesh.rotation.y = angle;

      if (currentTime / 1000 - this.lastShotTime > this.fireRate) {
        this.lastShotTime = currentTime / 1000;
        window.csAudio.playGunshot('rifle', this.team === 'CT' ? 'm4a1' : 'ak47', false);

        const hitChance = Math.max(0.2, 0.65 - (minDistance / 60));
        if (Math.random() < hitChance) {
          if (enemyTarget === player.position && !player.isSpectating) {
            player.takeDamage(18 + Math.floor(Math.random() * 12), this.name, this.team === 'CT' ? 'M4A4' : 'AK-47');
          }
        }
      }
    } else {
      const dir = new THREE.Vector3().subVectors(this.targetPos, this.position);
      dir.y = 0;
      const distToObjective = dir.length();

      if (distToObjective > 1.5) {
        dir.normalize();
        this.position.addScaledVector(dir, this.speed * dt);
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      } else {
        this.chooseNextObjective(gameManager ? gameManager.c4Planted : false, gameManager ? gameManager.c4Pos : null);
      }
    }
  }
}

window.CS2Bot = CS2Bot;
