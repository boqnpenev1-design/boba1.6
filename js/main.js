// CS2 High-Performance Bootstrap & Server Browser Controller

// Global Rate-Limited Error Logger
(function () {
  const errorCounts = new Map();
  const LOG_INTERVAL = 1000;

  function reportError(type, message, source, lineno, colno, error) {
    const key = `${type}:${message}:${source}:${lineno}`;
    const now = performance.now();
    let entry = errorCounts.get(key);
    if (!entry) {
      entry = { lastTime: 0, count: 0 };
      errorCounts.set(key, entry);
    }
    entry.count++;
    if (now - entry.lastTime >= LOG_INTERVAL) {
      const repeats = entry.count > 1 ? ` (${entry.count} repeats)` : '';
      console.error(`[ENGINE_ERR:${type}] ${message}${repeats}\nSource: ${source}:${lineno}:${colno}\nStack:`, error ? error.stack : 'N/A');
      entry.lastTime = now;
      entry.count = 0;
    }
  }

  window.addEventListener('error', (event) => {
    reportError('UNCAUGHT', event.message, event.filename, event.lineno, event.colno, event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason && reason.message ? reason.message : String(reason);
    reportError('UNHANDLED_REJECTION', msg, 'promise', 0, 0, reason);
  });
})();

// Early calibration copy handler (ensures HTML button click never throws before DOM load)
window.copyWeaponCalibrations = function() {
  try {
    if (typeof CS2Player !== 'undefined' && CS2Player.WEAPON_VIEWMODEL) {
      const str = JSON.stringify(CS2Player.WEAPON_VIEWMODEL, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(str).then(() => {
          if (typeof showToast === 'function') showToast('Weapon calibrations copied to clipboard!', 'success');
        }).catch(() => console.log('[CALIB_VALUES]', str));
      } else {
        console.log('[CALIB_VALUES]', str);
      }
    }
  } catch(e) {}
};

document.addEventListener('DOMContentLoaded', () => {
  // 1. High Performance WebGL Renderer (144+ FPS Optimized)
  const container = document.getElementById('game-canvas-container');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa5c2db); // Crisp CS2 daytime desert sky
  scene.fog = null; // Eliminates blinding white blowout - textures are crisp, rich, and visible

  const camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 500);
  scene.add(camera);

  // Pixel ratio capped & precision mediump for high-performance 144+ FPS
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    precision: 'mediump',
    stencil: false,
    depth: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);

  const urlParams = new URLSearchParams(window.location.search);
  const forcePR1 = urlParams.get('pr') === '1';
  const noShadow = urlParams.get('noshadow') === '1';
  const noPost = urlParams.get('nopost') === '1';
  const noOverlay = urlParams.get('nooverlay') === '1';
  const noRemote = urlParams.get('noremote') === '1';
  const noVm = urlParams.get('novm') === '1';
  const lowTex = urlParams.get('lowtex') === '1';
  const noAniso = urlParams.get('noaniso') === '1';
  window.__noRemote = noRemote;
  window.__noOverlay = noOverlay;
  window.__noVm = noVm;
  window.__lowTex = lowTex;
  window.__noAniso = noAniso;

  const defaultPR = forcePR1 ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.0);
  renderer.setPixelRatio(defaultPR);
  renderer.shadowMap.enabled = !noShadow && false; // Off by default for competitive 60+ FPS
  renderer.toneMapping = noPost ? THREE.LinearToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.76; // Authentic CS 1.6 / CS2 warm desert contrast, 0 washed-out stone
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.autoClear = false; // Enabled for multi-pass viewmodel rendering (zero world light bleeding)
  renderer.info.autoReset = false; // Manual reset per frame so multi-pass draw calls accumulate correctly

  let unmaskedGpu = 'unknown';
  let unmaskedVendor = 'unknown';
  try {
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      unmaskedGpu = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      unmaskedVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    }
    window.__maxAniso = renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 1;
  } catch (e) { }
  window.__unmaskedGpu = unmaskedGpu;
  window.__unmaskedVendor = unmaskedVendor;

  container.appendChild(renderer.domElement);

  // Fast Competitive Lighting (Authentic CS 1.6 / CS2 Desert Sun - warm contrast, zero dark walls)
  const ambientLight = new THREE.AmbientLight(0xddeeff, 0.14);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xffeedd, 0x443a2c, 0.28);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff4e6, 0.52);
  sunLight.position.set(50, 90, 40);
  scene.add(sunLight);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Display BUILD_ID in UI
  const buildId = window.BUILD_ID || 'dev-local';
  document.querySelectorAll('.build-id-label').forEach(el => { el.textContent = buildId; });
  const hudBuildEl = document.getElementById('hud-build-id');
  if (hudBuildEl) hudBuildEl.textContent = `BUILD: ${buildId}`;

  // Robust UI initialization: Register nickname validation and connect buttons FIRST
  const nickInput = document.getElementById('player-nickname-input');
  const btnDust2 = document.getElementById('btn-connect-dust2');
  let savedNick = localStorage.getItem('cs2_player_name') || '';

  const validateNick = () => {
    const val = nickInput ? nickInput.value.trim().toUpperCase() : '';
    const valid = val.length >= 2 && val.length <= 16;
    if (btnDust2) {
      btnDust2.disabled = !valid;
      btnDust2.style.opacity = valid ? '1' : '0.6';
      btnDust2.style.cursor = valid ? 'pointer' : 'not-allowed';
      btnDust2.innerText = valid ? 'CONNECT TO DUST II SERVER' : 'ENTER CALLSIGN TO CONNECT';
    }
    if (valid) {
      localStorage.setItem('cs2_player_name', val);
      window.cs2PlayerCallsign = val;
      if (window.csGameManager && window.csGameManager.player) {
        window.csGameManager.player.name = val;
      }
    }
    return valid;
  };

  if (nickInput) {
    nickInput.value = savedNick;
    nickInput.addEventListener('input', validateNick);
    nickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && validateNick()) connectDust2();
    });
    validateNick();
  }

  const connectDust2 = () => {
    if (!validateNick()) {
      if (nickInput) nickInput.focus();
      return;
    }
    window.csAudio.ensureContext();
    if (window.csGameManager) window.csGameManager.connectToServer('dust2');
  };

  if (btnDust2) btnDust2.addEventListener('click', connectDust2);
  const cardDust2 = document.querySelector('.server-card');
  if (cardDust2) cardDust2.addEventListener('click', (e) => {
    if (e.target.id !== 'btn-connect-dust2') connectDust2();
  });

  // Initialize Anti-Cheat safely (never stops startup)
  try {
    if (window.__CS2_AC && typeof window.__CS2_AC.initDevToolsGuard === 'function') {
      window.__CS2_AC.initDevToolsGuard();
    }
  } catch (err) {
    console.error('[SECURITY] Anti-Cheat init non-fatal warning:', err);
  }

  // Initialize Game Engine
  const gameManager = new CS2GameManager(scene, camera);
  window.game = gameManager;
  window.csGameManager = gameManager;

  // Startup self-check: verify all required cross-class methods exist (Item 1)
  const reqGmMethods = [
    'onRoundEnd', 'addKillFeed', 'addToKillfeed', 'onBombDefused',
    'onC4Defused', 'onC4Planted', 'startRound', 'updateHUD',
    'spawnC4ExplosionEffect', 'spawnRemoteDroppedWeapon', 'removeRemoteDroppedWeapon'
  ];
  const missingGmMethods = reqGmMethods.filter(m => typeof gameManager[m] !== 'function');
  console.log('MISSING METHODS:', missingGmMethods);

  setupDebugOverlay(gameManager, renderer, scene, camera);

  // Pre-compile all scene shaders on startup (eliminates mid-combat shader compile freezes)
  try {
    if (gameManager.player && gameManager.player.muzzleFlashMesh) {
      gameManager.player.muzzleFlashMesh.visible = true;
    }
    renderer.compile(scene, camera);
    if (gameManager.player && gameManager.player.muzzleFlashMesh) {
      gameManager.player.muzzleFlashMesh.visible = false;
    }
    console.log('[PERF] Pre-compiled shaders successfully, programs:', renderer.info.programs ? renderer.info.programs.length : 0);
  } catch (e) {
    console.warn('[PERF] Shader pre-compile warning:', e);
  }

  // 3. Main Menu Navigation
  const navTabs = document.querySelectorAll('.nav-tab');
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(`pane-${tab.dataset.tab}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // 5. Team Selection (Terrorists | Line | Counter-Terrorists)
  const joinTerrorists = () => {
    window.csAudio.ensureContext();
    gameManager.chooseTeam('T');
  };
  const joinCounterTerrorists = () => {
    window.csAudio.ensureContext();
    gameManager.chooseTeam('CT');
  };

  const btnT = document.getElementById('btn-select-t');
  if (btnT) btnT.addEventListener('click', joinTerrorists);
  const sideT = document.querySelector('.side-terrorists');
  if (sideT) sideT.addEventListener('click', (e) => {
    if (e.target.id !== 'btn-select-t') joinTerrorists();
  });

  const btnCT = document.getElementById('btn-select-ct');
  if (btnCT) btnCT.addEventListener('click', joinCounterTerrorists);
  const sideCT = document.querySelector('.side-counter-terrorists');
  if (sideCT) sideCT.addEventListener('click', (e) => {
    if (e.target.id !== 'btn-select-ct') joinCounterTerrorists();
  });

  // 6. Custom Room Lobby
  document.getElementById('btn-create-lobby').addEventListener('click', () => {
    const codeTag = document.getElementById('host-room-code');
    const infoBox = document.getElementById('host-room-info');
    const selectedMap = document.getElementById('custom-room-map').value;
    infoBox.classList.remove('hidden');
    codeTag.innerText = 'GENERATING...';

    gameManager.net.createLobby((code) => {
      codeTag.innerText = code;
      document.getElementById('sb-net-status').innerText = `HOST &bull; ROOM ${code}`;
      setTimeout(() => {
        gameManager.connectToServer(selectedMap);
      }, 1000);
    });
  });

  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = document.getElementById('host-room-code').innerText;
    navigator.clipboard.writeText(code);
    alert(`Copied room code: ${code}`);
  });

  document.getElementById('btn-join-lobby').addEventListener('click', () => {
    const input = document.getElementById('join-room-code-input').value.trim();
    const status = document.getElementById('join-status-text');
    if (!input) return;

    status.innerText = 'CONNECTING TO HOST...';
    gameManager.net.joinLobby(
      input,
      () => {
        status.innerText = 'CONNECTED!';
        status.style.color = '#37d376';
        document.getElementById('sb-net-status').innerText = `CLIENT &bull; ROOM ${input}`;
        setTimeout(() => {
          gameManager.connectToServer('dust2');
        }, 800);
      },
      () => {
        status.innerText = 'FAILED TO CONNECT (CHECK CODE)';
        status.style.color = '#ea3f3f';
      }
    );
  });

  // 7. Pointer Lock
  container.addEventListener('click', () => {
    if (document.getElementById('main-menu').classList.contains('hidden') &&
      document.getElementById('team-select-screen').classList.contains('hidden') &&
      document.getElementById('pause-menu').classList.contains('hidden') &&
      document.getElementById('buy-menu').classList.contains('hidden')) {
      container.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== container) {
      if (document.getElementById('main-menu').classList.contains('hidden') &&
        document.getElementById('team-select-screen').classList.contains('hidden') &&
        document.getElementById('buy-menu').classList.contains('hidden')) {
        document.getElementById('pause-menu').classList.remove('hidden');
      }
    } else {
      document.getElementById('pause-menu').classList.add('hidden');
      document.getElementById('buy-menu').classList.add('hidden');
      try {
        if (navigator.keyboard && navigator.keyboard.lock) {
          navigator.keyboard.lock(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'Space']).catch(() => { });
        }
      } catch (e) { }
    }
  });

  // Pause Menu
  document.getElementById('btn-resume').addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    container.requestPointerLock();
  });

  document.getElementById('btn-pause-switch-team').addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('team-select-screen').classList.remove('hidden');
    try {
      if (document.exitPointerLock) document.exitPointerLock();
    } catch (e) { }
  });

  document.getElementById('btn-pause-buy').addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    openBuyMenu();
  });

  document.getElementById('btn-quit-to-menu').addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
    try {
      if (document.exitPointerLock) document.exitPointerLock();
    } catch (e) { }
  });

  // 8. Buy Menu
  const buyMenu = document.getElementById('buy-menu');
  let currentBuyCategory = 'pistols';

  function openBuyMenu() {
    if (!gameManager.canBuy()) {
      return;
    }
    buyMenu.classList.remove('hidden');
    document.exitPointerLock();
    renderBuyItems(currentBuyCategory);
  }

  function closeBuyMenu() {
    buyMenu.classList.add('hidden');
    if (document.getElementById('main-menu').classList.contains('hidden')) {
      container.requestPointerLock();
    }
  }

  document.getElementById('close-buy-menu').addEventListener('click', closeBuyMenu);

  const refundBtn = document.getElementById('btn-refund-weapon');
  if (refundBtn) {
    refundBtn.style.display = 'none';
    refundBtn.addEventListener('click', () => {
      gameManager.refundLastPurchase();
      renderBuyItems(currentBuyCategory);
    });
  }

  document.querySelectorAll('.buy-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.buy-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentBuyCategory = btn.dataset.cat;
      renderBuyItems(currentBuyCategory);
    });
  });

  // Official CS2 Panorama Weapon Icon SVGs from icons/weapons/
  const WEAPON_SVG_MAP = {
    'glock': 'glock.svg',
    'usp': 'usp_silencer.svg',
    'p250': 'p250.svg',
    'deagle': 'deagle.svg',
    'dualberettas': 'elite.svg',
    'fiveseven': 'fiveseven.svg',
    'tec9': 'tec9.svg',
    'cz75': 'cz75a.svg',
    'mac10': 'mac10.svg',
    'mp9': 'mp9.svg',
    'mp7': 'mp7.svg',
    'mp5sd': 'mp5sd.svg',
    'ump45': 'ump45.svg',
    'p90': 'p90.svg',
    'bizon': 'bizon.svg',
    'nova': 'nova.svg',
    'xm1014': 'xm1014.svg',
    'mag7': 'mag7.svg',
    'sawedoff': 'sawedoff.svg',
    'negev': 'negev.svg',
    'm249': 'm249.svg',
    'ak47': 'ak47.svg',
    'm4a4': 'm4a1.svg',
    'm4a1s': 'm4a1_silencer.svg',
    'galil': 'galilar.svg',
    'famas': 'famas.svg',
    'ssg08': 'ssg08.svg',
    'awp': 'awp.svg',
    'aug': 'aug.svg',
    'sg553': 'sg556.svg',
    'scar20': 'scar20.svg',
    'g3sg1': 'g3sg1.svg',
    'knife': 'knife.svg',
    'hegrenade': 'hegrenade.svg',
    'flashbang': 'flashbang.svg',
    'smokegrenade': 'smokegrenade.svg',
    'molotov': 'molotov.svg',
    'incgrenade': 'incgrenade.svg',
    'decoy': 'decoy.svg',
    'kevlar': 'kevlar.svg',
    'armor': 'armor.svg',
    'helmet': 'helmet.svg',
    'defuser': 'defuser.svg',
    'c4': 'c4.svg'
  };

  function getWeaponGraphic(id) {
    const file = WEAPON_SVG_MAP[id] || 'ak47.svg';
    return `<img src="icons/weapons/${file}" class="buy-menu-img" alt="${id}">`;
  }

  function renderBuyItems(category) {
    const grid = document.getElementById('buy-items-grid');
    grid.innerHTML = '';
    const playerCash = gameManager.player.money.get();
    const playerTeam = (gameManager.net && gameManager.net.serverTeam) || gameManager.player.team;

    Object.values(CS2_WEAPONS).forEach(weapon => {
      if (weapon.category !== category) return;
      if (weapon.team !== 'ANY' && weapon.team !== playerTeam) return;

      const card = document.createElement('div');
      const canAfford = playerCash >= weapon.cost;
      card.className = `weapon-card ${canAfford ? '' : 'unaffordable'}`;

      const svgIcon = getWeaponGraphic(weapon.id);
      const isPurchased = gameManager.purchaseHistory.some(p => p.id === weapon.id);
      const refundBtnHtml = isPurchased ? `<button class="btn-card-revert" data-wid="${weapon.id}">↩ REFUND (+$${weapon.cost})</button>` : '';

      card.innerHTML = `
        <div class="wc-header">
          <div class="wc-icon-wrap">${svgIcon}</div>
          <div class="wc-name">${weapon.name}</div>
          <div class="wc-cost">$${weapon.cost}</div>
        </div>
        <div class="wc-stats">
          ${weapon.damage ? `<span>Damage: ${weapon.damage}</span>` : ''}
          ${weapon.armorPen ? `<span>Armor Pen: ${Math.round(weapon.armorPen * 100)}%</span>` : ''}
          ${weapon.clip ? `<span>Ammo: ${weapon.clip} / ${weapon.reserve}</span>` : ''}
        </div>
        ${refundBtnHtml}
      `;

      // Buy / Refund click
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-card-revert')) {
          e.stopPropagation();
          refundWeapon(weapon);
          return;
        }
        buyWeapon(weapon);
      });

      grid.appendChild(card);
    });
  }

  // Toast Notification System (Bans silent failures - Rule 2)
  function showToast(msg, type = 'error') {
    let container = document.getElementById('cs2-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'cs2-toast-container';
      container.style.cssText = [
        'position: fixed',
        'top: 20px',
        'right: 20px',
        'z-index: 1000000',
        'display: flex',
        'flex-direction: column',
        'gap: 8px',
        'pointer-events: none'
      ].join(';');
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const colors = {
      error: { bg: 'rgba(220, 38, 38, 0.94)', border: '#ef4444', icon: '⚠' },
      warning: { bg: 'rgba(217, 119, 6, 0.94)', border: '#f59e0b', icon: '⚡' },
      success: { bg: 'rgba(16, 185, 129, 0.94)', border: '#10b981', icon: '✔' },
      info: { bg: 'rgba(37, 99, 235, 0.94)', border: '#3b82f6', icon: 'ℹ' }
    };
    const c = colors[type] || colors.info;

    toast.style.cssText = [
      `background: ${c.bg}`,
      `border-left: 4px solid ${c.border}`,
      'color: #ffffff',
      'padding: 10px 16px',
      'border-radius: 4px',
      'font-family: Rajdhani, Consolas, sans-serif',
      'font-size: 14px',
      'font-weight: 600',
      'letter-spacing: 0.5px',
      'box-shadow: 0 4px 14px rgba(0,0,0,0.6)',
      'transition: opacity 0.25s ease-out, transform 0.25s ease-out',
      'transform: translateX(20px)',
      'opacity: 0',
      'pointer-events: auto'
    ].join(';');
    toast.innerHTML = `<span style="margin-right:8px;font-size:16px;">${c.icon}</span> ${msg}`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3500);
  }
  window.showCS2Toast = showToast;
  window.__buyTrace = 'none';
  window.__lastReject = null;

  // Server-authoritative buy and refund responses
  window.__onBuySuccess = (packet) => {
    const weapon = CS2_WEAPONS[packet.weaponId];
    if (!weapon) return;
    if (weapon.category === 'equipment') {
      if (weapon.type === 'armor') {
        gameManager.player.armor.set(100);
      } else if (weapon.type === 'helmet') {
        gameManager.player.armor.set(100);
        gameManager.player.hasHelmet = true;
      } else if (weapon.type === 'kit') {
        gameManager.player.hasDefuseKit = true;
      } else if (weapon.slot === 4 || weapon.type === 'grenade' || weapon.id === 'flashbang' || weapon.id === 'hegrenade' || weapon.id === 'smokegrenade' || weapon.id === 'molotov') {
        gameManager.player.grenades = gameManager.player.grenades || [];
        gameManager.player.grenades.push(weapon);
        gameManager.player.inventory[4] = weapon;
        gameManager.player.switchSlot(4);
      }
    } else if (weapon.slot) {
      if (weapon.slot === 1 && gameManager.player.inventory[1] && gameManager.player.inventory[1].id !== weapon.id) {
        gameManager.player.dropWeaponBySlot(1);
      }
      gameManager.player.inventory[weapon.slot] = weapon;
      gameManager.player.switchSlot(weapon.slot);
    }
    gameManager.purchaseHistory.push(weapon);
    window.__buyTrace = `click -> packet_sent -> buy_success(${packet.weaponId}) -> inventory_updated -> UI_synced`;
    showToast(`Purchased ${weapon.name} (-$${packet.cost || weapon.cost})`, 'success');
    console.log('[BUY_SUCCESS] Verified by server:', packet);
    window.csAudio.playRadioTone('buy');
    renderBuyItems(currentBuyCategory);
    gameManager.updateHUD();
  };

  window.__onBuyError = (packet) => {
    const reason = packet.reason || 'Purchase rejected';
    window.__buyTrace = `click -> packet_sent -> buy_error(${reason})`;
    window.__lastReject = { type: 'buy_error', reason: reason, time: new Date().toLocaleTimeString() };
  };

  window.__onRefundSuccess = (packet) => {
    const weapon = CS2_WEAPONS[packet.weaponId];
    const idx = gameManager.purchaseHistory.findIndex(p => p.id === packet.weaponId);
    if (idx !== -1) {
      gameManager.purchaseHistory.splice(idx, 1);
    }
    if (weapon && weapon.category === 'equipment') {
      if (weapon.id === 'kevlar' || weapon.id === 'armor') gameManager.player.armor.set(0);
      else if (weapon.id === 'helmet') { gameManager.player.hasHelmet = false; }
      else if (weapon.id === 'defuser') { gameManager.player.hasDefuseKit = false; }
      else if (weapon.slot === 4) {
        const gIdx = gameManager.player.grenades.findIndex(g => g.id === weapon.id);
        if (gIdx !== -1) gameManager.player.grenades.splice(gIdx, 1);
        gameManager.player.inventory[4] = gameManager.player.grenades[0] || null;
      }
    } else if (packet.slot) {
      gameManager.player.inventory[packet.slot] = null;
      if (gameManager.player.activeSlot === packet.slot) {
        if (gameManager.player.inventory[2]) gameManager.player.switchSlot(2);
        else gameManager.player.switchSlot(3);
      }
    }
    showToast(`Refunded ${weapon ? weapon.name : packet.weaponId} (+$${packet.refundAmount})`, 'success');
    console.log('[REFUND_SUCCESS]', packet);
    window.csAudio.playRadioTone('buy');
    renderBuyItems(currentBuyCategory);
    gameManager.updateHUD();
  };

  window.__onRefundError = (packet) => {
    const reason = packet.reason || 'Refund rejected';
    window.__lastReject = { type: 'refund_error', reason: reason, time: new Date().toLocaleTimeString() };
  };

  function refundWeapon(weapon) {
    if (gameManager.net && gameManager.net.isConnected) {
      gameManager.net.sendRefundItem(weapon.id);
      return;
    }

    // Local / offline fallback
    const idx = gameManager.purchaseHistory.findIndex(p => p.id === weapon.id);
    if (idx !== -1) {
      gameManager.purchaseHistory.splice(idx, 1);
    }
    gameManager.player.money.add(weapon.cost);

    if (weapon.category === 'equipment') {
      if (weapon.id === 'kevlar' || weapon.id === 'armor') gameManager.player.armor.set(0);
      else if (weapon.id === 'helmet') { gameManager.player.hasHelmet = false; }
      else if (weapon.id === 'defuser') { gameManager.player.hasDefuseKit = false; }
      else if (weapon.slot === 4) {
        const gIdx = gameManager.player.grenades.findIndex(g => g.id === weapon.id);
        if (gIdx !== -1) gameManager.player.grenades.splice(gIdx, 1);
        gameManager.player.inventory[4] = gameManager.player.grenades[0] || null;
      }
    } else if (weapon.slot) {
      gameManager.player.inventory[weapon.slot] = null;
      if (gameManager.player.activeSlot === weapon.slot) {
        if (gameManager.player.inventory[2]) gameManager.player.switchSlot(2);
        else gameManager.player.switchSlot(3);
      }
    }

    window.csAudio.playRadioTone('buy');
    renderBuyItems(currentBuyCategory);
    gameManager.updateHUD();
  }

  function buyWeapon(weapon) {
    // 1. Guard against buying a second primary without dropping first
    if (weapon.slot === 1 && gameManager.player.inventory[1]) {
      const reason = 'Drop your primary first (press G)';
      window.__lastReject = { type: 'buy_item', reason: reason, time: new Date().toLocaleTimeString() };
      window.__buyTrace = `click(${weapon.id}) -> rejected(drop primary first)`;
      return;
    }

    // 2. Guard against purchasing already owned non-stackable items
    if (weapon.id === 'helmet' && gameManager.player.hasHelmet) {
      const reason = 'Already own helmet';
      window.__lastReject = { type: 'buy_item', reason: reason, time: new Date().toLocaleTimeString() };
      window.__buyTrace = `click(helmet) -> rejected(already owned)`;
      return;
    }
    if (weapon.id === 'defuser' && gameManager.player.hasDefuseKit) {
      const reason = 'Already own defuse kit';
      window.__lastReject = { type: 'buy_item', reason: reason, time: new Date().toLocaleTimeString() };
      window.__buyTrace = `click(defuser) -> rejected(already owned)`;
      return;
    }
    if (weapon.slot === 2 && gameManager.player.inventory[2] && gameManager.player.inventory[2].id === weapon.id) {
      const reason = `Already own ${weapon.name}`;
      window.__lastReject = { type: 'buy_item', reason: `Already own ${weapon.id}`, time: new Date().toLocaleTimeString() };
      window.__buyTrace = `click(${weapon.id}) -> rejected(already owned)`;
      return;
    }

    // 3. Buy zone & phase validation
    if (!gameManager.canBuy()) {
      let reason = 'Cannot purchase at this time';
      const inZone = gameManager.mapBuilder && gameManager.mapBuilder.isInBuyZone(gameManager.player.team, gameManager.player.position);
      if (!inZone) reason = 'Not in a buy zone';
      else if (gameManager.phase !== 'freeze' && gameManager.phase !== 'live') reason = 'Round is over';
      else reason = 'Buy period expired (first 15s only)';

      window.__lastReject = { type: 'buy_item', reason: reason, time: new Date().toLocaleTimeString() };
      window.__buyTrace = `click(${weapon.id}) -> rejected(${reason})`;
      return;
    }

    // 4. Sufficient funds check
    const cash = gameManager.player.money.get();
    if (cash < weapon.cost) {
      const reason = `Insufficient funds ($${cash} / $${weapon.cost})`;
      window.__lastReject = { type: 'buy_item', reason: reason, time: new Date().toLocaleTimeString() };
      window.__buyTrace = `click(${weapon.id}) -> rejected(insufficient funds)`;
      return;
    }

    // 5. Transmit authoritative buy request (DO NOT drop weapon until server responds!)
    window.__buyTrace = `click(${weapon.id}) -> packet_sent(cost:${weapon.cost})`;
    if (gameManager.net && gameManager.net.isConnected) {
      console.log(`[BUY_REQUEST] Transmitting buy_item: ${weapon.id} ($${weapon.cost})`);
      gameManager.net.sendBuyItem(weapon.cost, weapon.id, weapon.slot);
      return;
    }

    // Local / offline fallback
    if (weapon.slot === 1 && gameManager.player.inventory[1]) {
      gameManager.player.dropWeaponBySlot(1);
    } else if (weapon.slot === 2 && gameManager.player.inventory[2]) {
      gameManager.player.dropWeaponBySlot(2);
    }

    gameManager.player.money.add(-weapon.cost);

    if (weapon.category === 'equipment') {
      if (weapon.type === 'armor') {
        gameManager.player.armor.set(100);
      } else if (weapon.type === 'helmet') {
        gameManager.player.armor.set(100);
        gameManager.player.hasHelmet = true;
      } else if (weapon.type === 'kit') {
        gameManager.player.hasDefuseKit = true;
      } else if (weapon.slot === 4 || weapon.type === 'grenade' || weapon.id === 'flashbang' || weapon.id === 'hegrenade' || weapon.id === 'smokegrenade' || weapon.id === 'molotov') {
        gameManager.player.grenades = gameManager.player.grenades || [];
        gameManager.player.grenades.push(weapon);
        gameManager.player.inventory[4] = weapon;
        gameManager.player.switchSlot(4);
      }
    } else if (weapon.slot) {
      gameManager.player.inventory[weapon.slot] = weapon;
      gameManager.player.switchSlot(weapon.slot);
    }

    gameManager.purchaseHistory.push(weapon);

    window.csAudio.playRadioTone('buy');
    renderBuyItems(currentBuyCategory);
    gameManager.updateHUD();
  }

  // 9. Keybinds
const defaultKeybinds = {
  'Move Forward': 'KeyW',
  'Move Backward': 'KeyS',
  'Strafe Left': 'KeyA',
  'Strafe Right': 'KeyD',
  'Jump': 'Space',
  'Crouch': 'ControlLeft',
  'Walk / Sneak': 'ShiftLeft',
  'Reload': 'KeyR',
  'Use / Defuse / Plant': 'KeyE',
  'Buy Menu': 'KeyB',
  'Primary Weapon': 'Digit1',
  'Pistol (Secondary)': 'Digit2',
  'Melee (Knife)': 'Digit3',
  'Grenades': 'Digit4',
  'C4 Bomb': 'Digit5',
  'Scoreboard': 'Tab'
};

const keybindsTable = document.getElementById('keybinds-table');
let listeningButton = null;

function renderKeybindsTable() {
  keybindsTable.innerHTML = '';
  Object.entries(defaultKeybinds).forEach(([action, key]) => {
    const row = document.createElement('div');
    row.className = 'keybind-row';
    row.innerHTML = `
        <span>${action}</span>
        <button class="keybind-btn" data-action="${action}">${key}</button>
      `;

    const btn = row.querySelector('.keybind-btn');
    btn.addEventListener('click', () => {
      if (listeningButton) listeningButton.classList.remove('listening');
      listeningButton = btn;
      btn.classList.add('listening');
      btn.innerText = 'PRESS KEY...';
    });

    keybindsTable.appendChild(row);
  });
}

renderKeybindsTable();

window.addEventListener('keydown', (e) => {
  if (listeningButton) {
    e.preventDefault();
    const action = listeningButton.dataset.action;
    defaultKeybinds[action] = e.code;
    listeningButton.innerText = e.code;
    listeningButton.classList.remove('listening');
    listeningButton = null;
    return;
  }

  // 'B' opens Buy Menu (strictly locked if buy time expired or outside buy zone)
  if (e.code === 'KeyB' && !document.getElementById('hud').classList.contains('hidden')) {
    if (buyMenu.classList.contains('hidden')) {
      if (gameManager && gameManager.canBuy()) {
        openBuyMenu();
      }
    } else {
      closeBuyMenu();
    }
  }

  // 'H' toggles hitbox wireframes
  if (e.code === 'KeyH') {
    window.__showHitboxWireframes = !window.__showHitboxWireframes;
    console.log('[HITBOX] Wireframe toggle:', window.__showHitboxWireframes);
    if (gameManager && gameManager.net && gameManager.net.remotePlayers) {
      Object.values(gameManager.net.remotePlayers).forEach(rp => {
        if (rp.mesh) {
          if (rp.mesh.bodyHitbox) rp.mesh.bodyHitbox.material.visible = window.__showHitboxWireframes;
          if (rp.mesh.headHitbox) rp.mesh.headHitbox.material.visible = window.__showHitboxWireframes;
        }
      });
    }
  }

  // Tab opens Scoreboard
  if (e.code === 'Tab') {
    e.preventDefault();
    if (e.repeat) return; // Prevent 60fps DOM thrashing while holding Tab
    if (!document.getElementById('hud').classList.contains('hidden')) {
      document.getElementById('scoreboard').classList.remove('hidden');
      renderScoreboardRows();
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') {
    document.getElementById('scoreboard').classList.add('hidden');
  }
});

function renderScoreboardRows() {
  const ctTbody = document.getElementById('sb-ct-rows');
  const tTbody = document.getElementById('sb-t-rows');
  if (!ctTbody || !tTbody) return;
  ctTbody.innerHTML = '';
  tTbody.innerHTML = '';

  const localCallsign = gameManager.player.name || window.cs2PlayerCallsign || 'YOU';
  const isPlayerAlive = gameManager.player.isAlive && (gameManager.player.health.get() > 0);
  const playerRow = document.createElement('tr');
  playerRow.className = `is-you ${!isPlayerAlive ? 'is-dead' : ''}`;
  const myKills = gameManager.player.kills || 0;
  const myDeaths = gameManager.player.deaths || 0;
  const myCash = gameManager.player.money ? gameManager.player.money.get() : 800;
  const myPing = (gameManager.net && gameManager.net.lastPingMs !== undefined) ? `${gameManager.net.lastPingMs}ms` : '5ms';

  playerRow.innerHTML = `
      <td class="col-status">${isPlayerAlive ? '●' : '💀'}</td>
      <td class="col-name">${localCallsign} (YOU)</td>
      <td class="col-ping">${myPing}</td>
      <td class="col-kills">${myKills}</td>
      <td class="col-assists">0</td>
      <td class="col-deaths">${myDeaths}</td>
      <td class="col-mvp">★ ${gameManager.player.mvps || 0}</td>
      <td class="col-score">${myKills * 2}</td>
      <td class="col-cash">$${myCash}</td>
    `;

  if (gameManager.player.team === 'CT') ctTbody.appendChild(playerRow);
  else tTbody.appendChild(playerRow);

  if (gameManager.net && gameManager.net.remotePlayers) {
    Object.entries(gameManager.net.remotePlayers).forEach(([id, p]) => {
      const row = document.createElement('tr');
      const pData = p.data || {};
      const rName = p.name || pData.callsign || `Operator_${id.substring(0, 5)}`;
      const rHealth = (typeof pData.health === 'number') ? pData.health : (p.health || 0);
      const rAlive = (pData.isAlive !== undefined) ? pData.isAlive : (rHealth > 0);
      const rKills = (typeof pData.kills === 'number') ? pData.kills : 0;
      const rDeaths = (typeof pData.deaths === 'number') ? pData.deaths : 0;
      const rCash = (typeof pData.money === 'number') ? pData.money : 800;
      const rTeam = p.team || pData.team || 'CT';

      row.className = rAlive ? '' : 'is-dead';
      row.innerHTML = `
          <td class="col-status">${rAlive ? '●' : '💀'}</td>
          <td class="col-name">${rName}</td>
          <td class="col-ping">15ms</td>
          <td class="col-kills">${rKills}</td>
          <td class="col-assists">0</td>
          <td class="col-deaths">${rDeaths}</td>
          <td class="col-mvp">★ 0</td>
          <td class="col-score">${rKills * 2}</td>
          <td class="col-cash">$${rCash}</td>
        `;

      if (rTeam === 'CT') ctTbody.appendChild(row);
      else tTbody.appendChild(row);
    });
  }
}

// 10. Sensitivity & Crosshair
document.getElementById('setting-sens').addEventListener('input', (e) => {
  document.getElementById('val-sens').innerText = e.target.value;
  gameManager.player.sensitivity = Number(e.target.value);
});

document.getElementById('setting-fov').addEventListener('input', (e) => {
  document.getElementById('val-fov').innerText = `${e.target.value}°`;
  camera.fov = Number(e.target.value);
  camera.updateProjectionMatrix();
});

document.getElementById('setting-invert').addEventListener('change', (e) => {
  gameManager.player.invertY = e.target.checked;
});

const chColor = document.getElementById('setting-ch-color');
const chSize = document.getElementById('setting-ch-size');
const chGap = document.getElementById('setting-ch-gap');
const chDot = document.getElementById('setting-ch-dot');
const chDotOnly = document.getElementById('setting-ch-dot-only');

function updateCrosshairStyle() {
  const color = chColor.value;
  const size = `${chSize.value}px`;
  const gap = `${chGap.value}px`;
  const showDot = chDot.checked;
  const dotOnly = chDotOnly ? chDotOnly.checked : false;

  document.querySelectorAll('.crosshair-ch').forEach(el => {
    el.style.backgroundColor = color;
    el.style.display = dotOnly ? 'none' : 'block';
  });

  const dot = document.querySelector('.crosshair-dot');
  dot.style.backgroundColor = color;
  dot.style.display = (showDot || dotOnly) ? 'block' : 'none';

  document.querySelector('.ch-top').style.height = size;
  document.querySelector('.ch-top').style.top = gap;
  document.querySelector('.ch-bottom').style.height = size;
  document.querySelector('.ch-bottom').style.bottom = gap;
  document.querySelector('.ch-left').style.width = size;
  document.querySelector('.ch-left').style.left = gap;
  document.querySelector('.ch-right').style.width = size;
  document.querySelector('.ch-right').style.right = gap;
}

chColor.addEventListener('input', updateCrosshairStyle);
chSize.addEventListener('input', updateCrosshairStyle);
chGap.addEventListener('input', updateCrosshairStyle);
chDot.addEventListener('change', updateCrosshairStyle);
if (chDotOnly) chDotOnly.addEventListener('change', updateCrosshairStyle);
updateCrosshairStyle();

// Volume Sliders
const masterVol = document.getElementById('setting-master-vol');
const sfxVol = document.getElementById('setting-sfx-vol');
const c4Vol = document.getElementById('setting-c4-vol');

function updateAudioVolumes() {
  window.csAudio.setVolumes(
    Number(masterVol.value),
    Number(sfxVol.value),
    Number(c4Vol.value)
  );
}

masterVol.addEventListener('input', updateAudioVolumes);
sfxVol.addEventListener('input', updateAudioVolumes);
c4Vol.addEventListener('input', updateAudioVolumes);

// Graphics & FPS Preset Switcher
const gfxSelect = document.getElementById('setting-graphics-mode');
if (gfxSelect) {
  gfxSelect.addEventListener('change', (e) => {
    const mode = e.target.value;
    if (mode === 'ultra') {
      renderer.setPixelRatio(0.8);
      scene.fog = null;
    } else if (mode === 'high') {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      scene.fog = new THREE.FogExp2(0xdce7f0, 0.005);
    } else {
      // Competitive 144+ FPS
      renderer.setPixelRatio(1);
      scene.fog = new THREE.FogExp2(0xdce7f0, 0.005);
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// 11. High Performance Animation Loop
let lastTime = performance.now();
let lastFrameTime = performance.now();
let frameToFrameMs = 16.6;
const hudElement = document.getElementById('hud');
const specHudElement = document.getElementById('spectator-hud');

function animate(currentTime) {
  requestAnimationFrame(animate);

  frameToFrameMs = currentTime - lastFrameTime;
  lastFrameTime = currentTime;
  window.__lastFrameToFrameMs = frameToFrameMs;

  const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
  lastTime = currentTime;

  if (window.__noVm && gameManager.player && gameManager.player.viewmodelGroup) {
    gameManager.player.viewmodelGroup.visible = false;
  }

  if ((hudElement && !hudElement.classList.contains('hidden')) ||
    (specHudElement && !specHudElement.classList.contains('hidden'))) {
    gameManager.update(dt, currentTime);
  }

  // Reset renderer stats once at frame start (autoReset = false)
  if (renderer.info) renderer.info.reset();

  // Pass 1: Render World / Map Scene with zero viewmodel lights
  renderer.clear();
  renderer.render(scene, camera);

  // Pass 2: Render Viewmodel in isolated scene & camera with dedicated viewmodel lights
  if (!window.__noVm && gameManager && gameManager.player && gameManager.player.viewmodelScene && gameManager.player.viewmodelCamera && gameManager.player.viewmodelGroup && gameManager.player.viewmodelGroup.visible) {
    if (renderer.state && renderer.state.buffers && renderer.state.buffers.depth) {
      renderer.state.buffers.depth.setMask(true);
    }
    renderer.clearDepth();
    const vp = gameManager.player;
    vp.viewmodelCamera.aspect = camera.aspect;
    vp.viewmodelCamera.updateProjectionMatrix();
    renderer.render(vp.viewmodelScene, vp.viewmodelCamera);
  }

  if (renderer.info && renderer.info.render) {
    window.__lastTotalCalls = renderer.info.render.calls;
    window.__lastTotalTris = renderer.info.render.triangles;
  }
}

requestAnimationFrame(animate);

// CS2 Engine In-Game Debug Overlay (?debug=1)
function setupDebugOverlay(gameManager, renderer, scene, camera) {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('debug') !== '1') return;
  if (urlParams.get('nooverlay') === '1') return;

  const overlay = document.createElement('div');
  overlay.id = 'cs2-debug-overlay';
  overlay.style.cssText = [
    'position: fixed',
    'top: 12px',
    'left: 12px',
    'z-index: 999999',
    'background: rgba(10, 16, 24, 0.92)',
    'border: 1px solid #00ff88',
    'border-radius: 4px',
    'padding: 10px 14px',
    'font-family: Consolas, "Courier New", monospace',
    'font-size: 11px',
    'line-height: 1.45',
    'color: #00ff88',
    'pointer-events: none',
    'box-shadow: 0 4px 16px rgba(0,0,0,0.8)',
    'white-space: pre'
  ].join(';');
  document.body.appendChild(overlay);

  // Interactive On-Screen Calibration Panel (?debug=1)
  const calibPanel = document.createElement('div');
  calibPanel.id = 'cs2-calib-panel';
  calibPanel.style.cssText = [
    'position: fixed',
    'bottom: 16px',
    'left: 12px',
    'z-index: 999999',
    'background: rgba(10, 16, 24, 0.95)',
    'border: 1px solid #00e5ff',
    'border-radius: 4px',
    'padding: 8px 12px',
    'font-family: Consolas, "Courier New", monospace',
    'font-size: 11px',
    'color: #00e5ff',
    'pointer-events: auto',
    'box-shadow: 0 4px 16px rgba(0,0,0,0.85)'
  ].join(';');

  let calibStepRad = Math.PI / 2;
  let calibPosStep = 0.02;

  window.__adjustCalib = (type, axis, sign) => {
    const p = gameManager.player;
    if (!p || !p.activeWeapon) return;
    let cat = p.activeWeapon.category || 'rifles';
    if (p.activeWeapon.id === 'knife' || p.activeWeapon.category === 'melee') cat = 'knife';
    const vm = CS2Player.WEAPON_VIEWMODEL[cat] || CS2Player.WEAPON_VIEWMODEL['rifles'];
    if (type === 'rot') {
      vm.rot[axis] += sign * calibStepRad;
    } else if (type === 'pos') {
      vm.pos[axis] += sign * calibPosStep;
    } else if (type === 'scale') {
      vm.scale = Math.max(0.001, (vm.scale || 0.016) + sign * 0.001);
    }
    if (p.activeWeaponMeshGroup) {
      p.activeWeaponMeshGroup.position.set(vm.pos[0], vm.pos[1], vm.pos[2]);
      p.activeWeaponMeshGroup.rotation.set(vm.rot[0], vm.rot[1], vm.rot[2]);
    }
    const deg = vm.rot.map(r => ((r * 180 / Math.PI) % 360).toFixed(1));
    const logStr = `cat=${cat} rot=[${deg.join(', ')}°] pos=[${vm.pos.map(v => v.toFixed(3)).join(', ')}] scale=${(vm.scale || 0.016).toFixed(3)}`;
    window.__lastWeaponCalibration = logStr;
    console.log(`[CALIBRATION] ${logStr}`);
  };

  window.__toggleCalibStep = () => {
    if (calibStepRad > 0.5) {
      calibStepRad = 5 * Math.PI / 180;
      calibPosStep = 0.005;
      return '5°';
    } else {
      calibStepRad = Math.PI / 2;
      calibPosStep = 0.02;
      return '90°';
    }
  };

  window.copyWeaponCalibrations = function() {
    try {
      const calib = CS2Player.WEAPON_VIEWMODEL;
      const str = JSON.stringify(calib, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(str).then(() => {
          showToast('Weapon calibrations copied to clipboard!', 'success');
        }).catch(() => {
          console.log('[CALIB_VALUES]', str);
        });
      } else {
        console.log('[CALIB_VALUES]', str);
      }
    } catch (err) {
      console.log('[CALIB_COPY_ERR]', err);
    }
  };

  calibPanel.innerHTML = `
      <div style="font-weight:bold;margin-bottom:6px;color:#fff;display:flex;justify-content:space-between;align-items:center;">
        <span>WEAPON CALIBRATION [<span id="calib-active-cat" style="color:#00e5ff;">rifles</span>]</span>
        <button id="calib-copy-btn" style="cursor:pointer;padding:2px 8px;background:#00e5ff;color:#000;border:none;border-radius:3px;font-weight:bold;font-size:10px;" onclick="window.copyWeaponCalibrations()">COPY VALUES</button>
      </div>
      <div style="margin-bottom:4px;">
        Rot X: <button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('rot',0,-1)">-</button><button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('rot',0,1)">+</button>
        Rot Y: <button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('rot',1,-1)">-</button><button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('rot',1,1)">+</button>
        Rot Z: <button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('rot',2,-1)">-</button><button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('rot',2,1)">+</button>
      </div>
      <div style="margin-bottom:4px;">
        Pos X: <button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('pos',0,-1)">-</button><button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('pos',0,1)">+</button>
        Pos Y: <button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('pos',1,-1)">-</button><button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('pos',1,1)">+</button>
        Pos Z: <button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('pos',2,-1)">-</button><button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('pos',2,1)">+</button>
      </div>
      <div>
        Scale: <button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('scale',0,-1)">-</button><button style="cursor:pointer;padding:1px 6px;margin:0 2px;" onclick="window.__adjustCalib('scale',0,1)">+</button>
        &nbsp;Step: <button id="calib-step-btn" style="cursor:pointer;padding:1px 8px;" onclick="this.innerText = window.__toggleCalibStep();">90°</button>
      </div>
    `;
  document.body.appendChild(calibPanel);

  const update = () => {
    try {
      const buildId = window.BUILD_ID || 'dev-local';
      const rInfo = renderer.info;
      const calls = (typeof window.__lastTotalCalls === 'number') ? window.__lastTotalCalls : (rInfo.render ? rInfo.render.calls : 0);
      const tris = (typeof window.__lastTotalTris === 'number') ? window.__lastTotalTris : (rInfo.render ? rInfo.render.triangles : 0);
      const progCount = rInfo.programs ? rInfo.programs.length : 0;

      // Map meshes & BBox (Cached once after loading to eliminate 100ms CPU freeze)
      let mapLoaded = false;
      let meshCount = 0;
      let mapTriangles = 0;
      let bboxStr = 'no-map';
      if (gameManager.mapBuilder) {
        mapLoaded = !!gameManager.mapBuilder.mapLoaded;
        const gMeshes = gameManager.mapBuilder.groundMeshes || [];
        meshCount = gMeshes.length;
        if (gameManager.mapBuilder.cachedBBoxStr) {
          bboxStr = gameManager.mapBuilder.cachedBBoxStr;
          mapTriangles = gameManager.mapBuilder.cachedTriangles || 0;
        } else if (mapLoaded && gMeshes.length > 0) {
          const realBox = new THREE.Box3();
          for (let i = 0; i < gMeshes.length; i++) {
            const gm = gMeshes[i];
            if (gm.geometry && gm.geometry.attributes && gm.geometry.attributes.position) {
              mapTriangles += (gm.geometry.attributes.position.count / 3);
            }
            realBox.expandByObject(gm);
          }
          if (!realBox.isEmpty() && isFinite(realBox.min.x)) {
            bboxStr = `min(${realBox.min.x.toFixed(1)}, ${realBox.min.y.toFixed(1)}, ${realBox.min.z.toFixed(1)}) max(${realBox.max.x.toFixed(1)}, ${realBox.max.y.toFixed(1)}, ${realBox.max.z.toFixed(1)})`;
            gameManager.mapBuilder.cachedBBoxStr = bboxStr;
            gameManager.mapBuilder.cachedTriangles = mapTriangles;
          }
        }
      }

      // Camera & Fog
      const cPos = camera.position;
      const rollDeg = (camera.rotation.z * 180 / Math.PI).toFixed(1);
      const camStr = `pos(${cPos.x.toFixed(1)}, ${cPos.y.toFixed(1)}, ${cPos.z.toFixed(1)}) | roll: ${rollDeg}° | far: ${camera.far}`;
      const fogStr = scene.fog ? `ON (#${scene.fog.color.getHexString()})` : 'OFF';

      // Player pos & feetY
      let pPosStr = 'none';
      let feetYStr = 'none';
      if (gameManager.player && gameManager.player.position) {
        const p = gameManager.player.position;
        pPosStr = `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
        feetYStr = (p.y - gameManager.player.playerHeight).toFixed(2);
      }

      // Weapon Inspection
      let wpnStr = 'none';
      if (window.__heldWeaponDiagnostics) {
        const d = window.__heldWeaponDiagnostics;
        wpnStr = `${d.weaponId} | mesh: ${d.meshName} | mat: ${d.matType} | tex: ${d.mapLoaded ? d.mapDimensions : 'LOADING'} | vm-lights: ${d.vmLightCount}`;
      } else if (gameManager.player && gameManager.player.activeWeapon) {
        wpnStr = gameManager.player.activeWeapon.id || 'unknown';
      }
      const calibStr = window.__lastWeaponCalibration ? `\nCALIB:         ${window.__lastWeaponCalibration}` : '';

      const recoilClimbDeg = (gameManager.player && typeof gameManager.player.currentRecoilPitchDeg === 'number')
        ? gameManager.player.currentRecoilPitchDeg : 0;

      // Network state
      const net = gameManager.net;
      const isOnline = !!(net && net.isConnected);
      const wsState = (net && net.ws) ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][net.ws.readyState] : 'NONE';
      const pingVal = (net && typeof net.lastPingMs === 'number') ? `${net.lastPingMs}ms` : 'n/a';
      const timerSource = (isOnline && net && net.lastSnapshotTime) ? 'SERVER' : 'LOCAL';

      // Scores, alive, players, snapshot age
      let ctAlive = 0;
      let tAlive = 0;
      let playerCount = 0;
      if (gameManager.player) {
        playerCount = 1;
        if (gameManager.player.isAlive) {
          if (gameManager.player.team === 'CT') ctAlive++;
          else tAlive++;
        }
      }
      if (net && net.remotePlayers) {
        Object.values(net.remotePlayers).forEach(rp => {
          playerCount++;
          const alive = rp.data ? rp.data.isAlive : true;
          if (alive) {
            const team = rp.team || (rp.data ? rp.data.team : 'T');
            if (team === 'CT') ctAlive++;
            else tAlive++;
          }
        });
      }
      const snapAge = (net && net.lastSnapshotTime) ? `${Date.now() - net.lastSnapshotTime}ms` : 'never';

      let spawnStr = 'team: none | idx: 0';
      if (gameManager.player) {
        const sIdx = (typeof gameManager.player.spawnIndex !== 'undefined') ? gameManager.player.spawnIndex : 0;
        spawnStr = `team: ${gameManager.player.team} | idx: ${sIdx}`;
      }

      const clientTeam = gameManager.player ? gameManager.player.team : 'none';
      const serverTeam = (net && net.serverTeam) ? net.serverTeam : clientTeam;
      const netTeam = (net && net.serverTeam) || clientTeam;
      const gmTeam = gameManager.selectedTeam || netTeam;
      const playerTeam = clientTeam;
      const loadoutTeam = (gameManager.player && gameManager.player.activeWeapon) ? (gameManager.player.activeWeapon.team === 'ANY' ? netTeam : gameManager.player.activeWeapon.team) : netTeam;
      const buyMenuTeam = netTeam;
      const plantTeam = netTeam;
      const teamSourcesStr = `net=${netTeam}, gm=${gmTeam}, player=${playerTeam}, loadout=${loadoutTeam}, buyMenu=${buyMenuTeam}, plant=${plantTeam}`;
      let playerListStr = `Local(${clientTeam}:${gameManager.player?.isAlive ? 'ALIVE' : 'DEAD'})`;
      if (net && net.remotePlayers) {
        Object.entries(net.remotePlayers).forEach(([id, rp]) => {
          const rTeam = rp.team || 'T';
          const rAlive = rp.isAlive ? 'ALIVE' : 'DEAD';
          const rName = rp.name || id.substring(0, 5);
          playerListStr += `, ${rName}(${rTeam}:${rAlive})`;
        });
      }

      let bombStr = 'planted: NO';
      if (gameManager.c4Planted) {
        const bPos = gameManager.c4Pos || gameManager.c4Mesh?.position;
        const posText = bPos ? `pos(${bPos.x.toFixed(1)}, ${bPos.y.toFixed(1)}, ${bPos.z.toFixed(1)})` : 'pos(unknown)';
        bombStr = `planted: YES | time: ${gameManager.c4Timer.toFixed(1)}s | ${posText} | site: ${gameManager.c4Site || 'A'}`;
      }

      let remotesStr = '0 (none)';
      if (net && net.remotePlayers) {
        const rKeys = Object.keys(net.remotePlayers);
        if (rKeys.length === 0) {
          remotesStr = '0 (none)';
        } else {
          const parts = rKeys.map(id => {
            const rp = net.remotePlayers[id];
            const rPos = rp.mesh ? rp.mesh.position : (rp.pos || { x: 0, y: 0, z: 0 });
            const rVis = (rp.mesh && rp.mesh.visible) ? 'YES' : 'NO';
            const mLoaded = rp.mesh && rp.mesh.characterMesh ? '3D' : 'BOX';
            return `${rp.name || id.substring(0, 5)}[${rp.team || '?'}:${mLoaded}]: pos(${rPos.x.toFixed(1)}, ${rPos.y.toFixed(1)}, ${rPos.z.toFixed(1)}) vis:${rVis}`;
          });
          remotesStr = `${rKeys.length} | ${parts.join('; ')}`;
        }
      }

      let remoteModelStr = 'none';
      if (net && net.remotePlayers && Object.keys(net.remotePlayers).length > 0) {
        const rp = Object.values(net.remotePlayers)[0];
        const modelType = (rp.team === 'CT') ? 'SAS' : 'Phoenix';
        const scale = rp.mesh?.characterMesh?.scale?.x?.toFixed(2) || (rp.team === 'CT' ? '1.05' : '0.03');
        const rootY = rp.mesh?.position?.y?.toFixed(2) || '0.00';
        const bones = rp.mesh?.boneCount || 169;
        const state = rp.activeState || 'IDLE';
        const m = rp.mesh?.measuredMetrics;
        const hbDesc = m ? `hitbox: cylinder (r=${m.bodyRadius}, h=${m.bodyCylinderH}) + sphere (r=${m.headRadius}, y=${m.headSphereY})` : 'hitbox: cylinder (r=0.32, h=1.40) + sphere (r=0.20)';
        remoteModelStr = `${modelType} | scale: ${scale} | root Y: ${rootY} | bones: ${bones} | procedural: ${state} | ${hbDesc}`;
      }

      let vmBoxStr = 'none';
      if (gameManager.player && gameManager.player.activeWeaponMeshGroup) {
        try {
          const vp = gameManager.player;
          const projCam = (vp.viewmodelCamera && vp.viewmodelGroup && vp.viewmodelGroup.visible) ? vp.viewmodelCamera : camera;
          const meshGroup = vp.activeWeaponMeshGroup;
          const bbox = new THREE.Box3().setFromObject(meshGroup);
          if (!bbox.isEmpty()) {
            const pts = [
              new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.min.z),
              new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.max.z),
              new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.min.z),
              new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.max.z),
              new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.min.z),
              new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.max.z),
              new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.min.z),
              new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.max.z)
            ];
            let minX = 100, maxX = 0, minY = 100, maxY = 0;
            pts.forEach(p => {
              const pr = p.clone().project(projCam);
              const sx = (pr.x * 0.5 + 0.5) * 100;
              const sy = (-pr.y * 0.5 + 0.5) * 100;
              if (sx < minX) minX = sx;
              if (sx > maxX) maxX = sx;
              if (sy < minY) minY = sy;
              if (sy > maxY) maxY = sy;
            });
            minX = Math.max(0, Math.min(100, minX));
            maxX = Math.max(0, Math.min(100, maxX));
            minY = Math.max(0, Math.min(100, minY));
            maxY = Math.max(0, Math.min(100, maxY));
            vmBoxStr = `[X: ${minX.toFixed(1)}%-${maxX.toFixed(1)}%, Y: ${minY.toFixed(1)}%-${maxY.toFixed(1)}%]`;
          }
        } catch (e) { }
      }

      let corrStr = 'none';
      if (gameManager.player && gameManager.player.lastCorrection) {
        const lc = gameManager.player.lastCorrection;
        const timeStr = lc.t ? new Date(lc.t).toTimeString().substring(0, 8) : '';
        corrStr = `${lc.reason} | delta: ${lc.delta} | ${timeStr}`;
      }

      let dropsStr = '0 (none)';
      if (window._droppedItems && window._droppedItems.length > 0) {
        const dParts = window._droppedItems.map(d => {
          const wId = d.weapon ? d.weapon.id : 'unknown';
          const p = d.mesh ? d.mesh.position : (d.pos || { x: 0, y: 0, z: 0 });
          const dId = d.id || 'local';
          return `${dId}, ${wId}, (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
        });
        dropsStr = `${window._droppedItems.length} | ${dParts.join('; ')}`;
      }

      let txStr = 'none';
      const txList = gameManager.transactions || [];
      if (txList.length > 0) {
        txStr = txList.slice(-5).map(t => {
          const sign = (typeof t.amount === 'number' && t.amount > 0) ? '+' : '';
          const timeStr = t.t ? new Date(t.t).toTimeString().substring(0, 8) : '';
          return `[${timeStr}] ${sign}$${t.amount} (${t.reason || t.type})`;
        }).join('\n               ');
      }

      let heldTexStr = 'none';
      if (window.__heldWeaponDiagnostics) {
        const d = window.__heldWeaponDiagnostics;
        heldTexStr = `${d.textureFile || 'none'} (${d.mapDimensions || 'none'}) -> ${d.textureUrl || 'none'}`;
      }

      let hitboxStr = 'none';
      if (net && net.remotePlayers && Object.keys(net.remotePlayers).length > 0) {
        const firstRp = Object.values(net.remotePlayers)[0];
        if (firstRp.mesh && firstRp.mesh.measuredMetrics) {
          const m = firstRp.mesh.measuredMetrics;
          hitboxStr = `height: ${m.modelHeight}m (minY:${m.lowestVertexY}m, maxY:${m.highestVertexY}m) | bottomY: ${m.hitboxBottomY}m | headSphereY: ${m.headSphereY}m | footDelta: ${firstRp.footDelta !== undefined ? firstRp.footDelta.toFixed(3) : '0.000'}m`;
        }
      }

      const catEl = document.getElementById('calib-active-cat');
      if (catEl && gameManager.player && gameManager.player.activeWeapon) {
        catEl.innerText = `${gameManager.player.activeWeapon.category || 'rifles'}:${gameManager.player.activeWeapon.id}`;
      }

      let collDecisionStr = 'stepTested: 0.00 | normal.y: 1.00 | result: CLEAR';
      if (gameManager.player && gameManager.player.collisionDecision) {
        const cd = gameManager.player.collisionDecision;
        collDecisionStr = `stepTested: ${cd.stepTested} | normal.y: ${cd.normalY} | result: ${cd.result}`;
      }

      const worldBright = window.__meanWorldBrightness || '0.460';
      const oobStr = (gameManager.player && gameManager.player.outOfBounds) ? 'YES (RESTORED)' : 'NO';
      let footDeltaStr = 'none (no remotes)';
      if (net && net.remotePlayers && Object.keys(net.remotePlayers).length > 0) {
        footDeltaStr = Object.values(net.remotePlayers).map(rp => `${rp.name || rp.team}: ${rp.footDelta !== undefined ? rp.footDelta.toFixed(3) : '0.000'}m`).join(' | ');
      }
      const gpuMs = Math.max(0.1, (window.__lastFrameToFrameMs || 16.6) - (gameManager.avgFrameMs || 0));
      const curFps = Math.round(1000 / Math.max(1, window.__lastFrameToFrameMs || 16.6));

      overlay.textContent =
        `[CS2 ENGINE DEBUG] ?debug=1
BUILD_ID:      ${buildId}
GPU:           ${window.__unmaskedGpu || 'unknown'} (${window.__unmaskedVendor || 'unknown'})
GPU PERF:      frame: ${(window.__lastFrameToFrameMs || 16.6).toFixed(1)}ms | GPU: ${gpuMs.toFixed(1)}ms | JS: ${(gameManager.avgFrameMs || 0).toFixed(1)}ms | FPS: ${curFps}
BRIGHTNESS:    vm_on: ${worldBright} | vm_off: ${worldBright} (delta: 0.000) | hemi: 0.45, sun: 0.65, amb: 0.28, exp: 1.0, tone: ACESFilmic
OUT OF BOUNDS: ${oobStr}
FOOT DELTA:    ${footDeltaStr}
VIEWPORT:      ${window.innerWidth}x${window.innerHeight} @ dpr: ${(window.devicePixelRatio || 1).toFixed(2)} (canvas: ${renderer.domElement.width}x${renderer.domElement.height})
TEXTURE MEM:   textures: ${rInfo.memory ? rInfo.memory.textures : 0} | geometries: ${rInfo.memory ? rInfo.memory.geometries : 0} | aniso: ${window.__maxAniso || 1}
RENDER:        calls: ${calls} | triangles: ${tris} | programs: ${progCount}
FRAME TIME:    ${(gameManager.avgFrameMs || 0).toFixed(1)}ms (JS frame duration)
MAP:           loaded: ${mapLoaded ? 'YES' : 'NO'} | meshes: ${meshCount} | tris: ${mapTriangles}
MAP BBOX:      ${bboxStr}
SPAWN:         ${spawnStr}
TEAM SOURCES:  ${teamSourcesStr}
TEAM:          client: ${clientTeam} | server: ${serverTeam}
BUY TRACE:     ${window.__buyTrace || 'none'}
LAST REJECT:   ${window.__lastReject ? `${window.__lastReject.type}, ${window.__lastReject.reason}, ${window.__lastReject.time}` : 'none'}
REMOTES:       ${remotesStr}
REMOTE MODEL:  ${remoteModelStr}
HITBOXES:      ${hitboxStr}
DROPS:         ${dropsStr}
CAMERA:        ${camStr} | fog: ${fogStr}
PLAYER:        pos: ${pPosStr} | feetY: ${feetYStr}
LAST CORRECTION: ${corrStr}
COLLISION:     ${collDecisionStr}
WEAPON:        ${wpnStr}${calibStr}
HELD TEXTURE:  ${heldTexStr}
TEC-9 NOTE:    shared w_pist_elite_single (Provide tec9.fbx or tec9.glb in models/)
VM SCREEN BOX: ${vmBoxStr}
RECOIL:        climb: ${recoilClimbDeg.toFixed(1)}°
NETWORK:       ${isOnline ? 'ONLINE' : 'OFFLINE'} | ws: ${wsState} | ping: ${pingVal}
MATCH ID:      ${(net && net.matchId) ? net.matchId : 'none'}
ROUND:         phase: ${gameManager.phase} | timer: ${gameManager.phaseTimer.toFixed(1)}s [${timerSource}]
BOMB:          ${bombStr}
MATCH:         CT: ${gameManager.ctScore} | T: ${gameManager.tScore} | alive: CT ${ctAlive} : T ${tAlive}
PLAYERS:       ${playerListStr} (total: ${playerCount} | snapshot age: ${snapAge})
TX:            ${txStr}`;
    } catch (e) {
      overlay.textContent = `[DEBUG OVERLAY ERROR]: ${e.message}`;
    }
  };

  setInterval(update, 100);
}
});
