// CS 1.6 Authentic Models & Viewmodels Manager
// Loads real GoldSrc CS 1.6 models and textures extracted from cstrike/models/

class CS16ModelManager {
  constructor() {
    this.modelCache = new Map();
    this.textureCache = new Map();
    this.textureLoader = new THREE.TextureLoader();
    this.loadingPromises = new Map();

    // Map weapon IDs to converted CS 1.6 model files
    this.weaponModelMap = {
      'knife': 'knife',
      'ak47': 'ak47',
      'm4a4': 'm4a1',
      'm4a1s': 'm4a1',
      'm4a1': 'm4a1',
      'awp': 'awp',
      'ssg08': 'scout',
      'scout': 'scout',
      'deagle': 'deagle',
      'usp': 'usp',
      'glock': 'glock',
      'glock18': 'glock',
      'p250': 'p228',
      'p228': 'p228',
      'fiveseven': 'fiveseven',
      'dualberettas': 'elite',
      'elite': 'elite',
      'tec9': 'p228',
      'cz75': 'p228',
      'mac10': 'mac10',
      'mp9': 'mac10',
      'mp7': 'mp5',
      'mp5': 'mp5',
      'mp5sd': 'mp5',
      'ump45': 'ump45',
      'p90': 'p90',
      'bizon': 'p90',
      'galil': 'galil',
      'famas': 'famas',
      'aug': 'aug',
      'sg553': 'sg552',
      'sg552': 'sg552',
      'g3sg1': 'g3sg1',
      'scar20': 'g3sg1',
      'nova': 'm3',
      'm3': 'm3',
      'sawedoff': 'm3',
      'mag7': 'm3',
      'xm1014': 'xm1014',
      'm249': 'm249',
      'negev': 'm249',
      'c4': 'c4',
      'flashbang': 'flashbang',
      'hegrenade': 'hegrenade',
      'smokegrenade': 'smokegrenade',
      'molotov': 'hegrenade'
    };
  }

  getTexture(texPath) {
    if (!this.textureCache.has(texPath)) {
      const tex = this.textureLoader.load(texPath);
      tex.minFilter = THREE.LinearMipMapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.flipY = false;
      this.textureCache.set(texPath, tex);
    }
    return this.textureCache.get(texPath);
  }

  async loadModelData(modelId) {
    if (this.modelCache.has(modelId)) {
      return this.modelCache.get(modelId);
    }
    if (this.loadingPromises.has(modelId)) {
      return this.loadingPromises.get(modelId);
    }

    const p = fetch(`models/cs16/${modelId}.json?v=b11m0a1`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading ${modelId}`);
        return res.json();
      })
      .then(data => {
        this.modelCache.set(modelId, data);
        this.loadingPromises.delete(modelId);
        return data;
      })
      .catch(err => {
        console.warn(`[CS16ModelManager] Failed loading models/cs16/${modelId}.json:`, err);
        this.loadingPromises.delete(modelId);
        return null;
      });

    this.loadingPromises.set(modelId, p);
    return p;
  }

  buildMeshFromData(data, isViewmodel = true) {
    if (!data || !data.meshes) return null;

    const group = new THREE.Group();
    group.name = `cs16_${data.id}`;

    for (const sub of data.meshes) {
      if (!sub.positions || sub.positions.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(sub.positions, 3));
      if (sub.normals && sub.normals.length > 0) {
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(sub.normals, 3));
      }
      if (sub.uvs && sub.uvs.length > 0) {
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(sub.uvs, 2));
      }

      const tex = this.getTexture(sub.texture);
      const mat = new THREE.MeshLambertMaterial({
        map: tex,
        side: THREE.DoubleSide,
        depthWrite: true,
        depthTest: true
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !isViewmodel;
      mesh.receiveShadow = !isViewmodel;
      group.add(mesh);
    }

    if (data.barrelTip) {
      group.userData.barrelTip = new THREE.Vector3(
        data.barrelTip[0],
        data.barrelTip[1],
        data.barrelTip[2]
      );
    } else {
      group.userData.barrelTip = new THREE.Vector3(0.08, -0.05, -0.85);
    }

    return group;
  }

  // Preloads essential models for 0ms hitch-free switching
  preloadCommon() {
    const common = ['knife', 'ak47', 'm4a1', 'deagle', 'usp', 'glock', 'awp', 'terror', 'sas'];
    common.forEach(id => this.loadModelData(id));
  }
}

window.cs16Models = new CS16ModelManager();
window.cs16Models.preloadCommon();
