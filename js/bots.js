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

    // Load SAS 3D Model for CT bots if available
    this.gltfLoader = typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null;
    if (this.team === 'CT' && this.gltfLoader) {
      this.loadSASModel();
    }
  }

  loadSASModel() {
    this.gltfLoader.load('source/sas blue.glb', (gltf) => {
      const sas = gltf.scene;
      sas.scale.set(0.018, 0.018, 0.018);
      sas.position.set(0, 0, 0);

      // Hide simple box body and attach detailed SAS model
      while (this.mesh.children.length > 0) {
        this.mesh.remove(this.mesh.children[0]);
      }
      this.mesh.add(sas);
    }, undefined, () => {});
  }

  createBotMesh() {
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.7, 1.0, 0.4);
    const bodyColor = this.team === 'CT' ? 0x2b4c6f : 0x82593b;
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.0;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.35, 0.4, 0.35);
    const headColor = this.team === 'CT' ? 0x1f2937 : 0xd2b48c;
    const headMat = new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.6 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.7;
    head.castShadow = true;
    group.add(head);

    // Gun in hand
    const weaponGeo = new THREE.BoxGeometry(0.08, 0.1, 0.5);
    const weaponMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const weapon = new THREE.Mesh(weaponGeo, weaponMat);
    weapon.position.set(0.3, 1.1, -0.3);
    group.add(weapon);

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
