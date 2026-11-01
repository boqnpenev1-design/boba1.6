// CS2 High-Performance Bootstrap & Server Browser Controller

// Global Rate-Limited Error Logger
(function() {
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // Fast Competitive Lighting (Soft Desert Sun - clean textures, zero blowout)
  const hemiLight = new THREE.HemisphereLight(0xffeedd, 0x5a4836, 0.60);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffaed, 0.70);
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
  setupDebugOverlay(gameManager, renderer, scene, camera);

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
          navigator.keyboard.lock(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'Space']).catch(() => {});
        }
      } catch (e) {}
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
    } catch (e) {}
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
    } catch (e) {}
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
    const playerTeam = gameManager.player.team;

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
        if (canAfford) {
          buyWeapon(weapon);
        }
      });

      grid.appendChild(card);
    });
  }

  function refundWeapon(weapon) {
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
    if (!gameManager.canBuy()) return;
    const cash = gameManager.player.money.get();
    if (cash < weapon.cost) return;

    // When buying a primary (slot 1) and player already holds a primary:
    // Drop the current primary to the ground so other players can pick it up!
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

    // 'B' opens Buy Menu
    if (e.code === 'KeyB' && !document.getElementById('hud').classList.contains('hidden')) {
      if (buyMenu.classList.contains('hidden')) {
        openBuyMenu();
      } else {
        closeBuyMenu();
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
  const hudElement = document.getElementById('hud');
  const specHudElement = document.getElementById('spectator-hud');

  function animate(currentTime) {
    requestAnimationFrame(animate);

    const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
    lastTime = currentTime;

    if ((hudElement && !hudElement.classList.contains('hidden')) ||
        (specHudElement && !specHudElement.classList.contains('hidden'))) {
      gameManager.update(dt, currentTime);
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);

  // CS2 Engine In-Game Debug Overlay (?debug=1)
  function setupDebugOverlay(gameManager, renderer, scene, camera) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') !== '1') return;

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

    const update = () => {
      try {
        const buildId = window.BUILD_ID || 'dev-local';
        const rInfo = renderer.info;
        const calls = rInfo.render ? rInfo.render.calls : 0;
        const tris = rInfo.render ? rInfo.render.triangles : 0;
        const progCount = rInfo.programs ? rInfo.programs.length : 0;

        // Map meshes & BBox (Calculated strictly from real loaded map meshes)
        let mapLoaded = false;
        let meshCount = 0;
        let mapTriangles = 0;
        let bboxStr = 'no-map';
        if (gameManager.mapBuilder) {
          mapLoaded = !!gameManager.mapBuilder.mapLoaded;
          const gMeshes = gameManager.mapBuilder.groundMeshes || [];
          meshCount = gMeshes.length;
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
          }
        }

        // Camera & Fog
        const cPos = camera.position;
        const camStr = `pos(${cPos.x.toFixed(1)}, ${cPos.y.toFixed(1)}, ${cPos.z.toFixed(1)}) | far: ${camera.far}`;
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
        let wpnName = 'none';
        let wpnMeshName = 'none';
        let wpnTexLoaded = 'none';
        let wpnMatType = 'none';
        if (gameManager.player) {
          if (gameManager.player.activeWeapon) {
            wpnName = gameManager.player.activeWeapon.name || gameManager.player.activeWeapon.id || 'unknown';
          }
          if (gameManager.player.weaponGroup) {
            gameManager.player.weaponGroup.traverse(c => {
              if (c.isMesh && wpnMeshName === 'none') {
                wpnMeshName = c.name || 'unnamed_mesh';
                const m = Array.isArray(c.material) ? c.material[0] : c.material;
                if (m) {
                  wpnMatType = m.type || 'unknown';
                  if (m.map && m.map.image) {
                    wpnTexLoaded = `${m.map.image.width}x${m.map.image.height}`;
                  } else if (m.map) {
                    wpnTexLoaded = 'loading';
                  } else {
                    wpnTexLoaded = 'NO_MAP';
                  }
                }
              }
            });
          }
        }

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

        overlay.textContent =
`[CS2 ENGINE DEBUG] ?debug=1
BUILD_ID:      ${buildId}
RENDER:        calls: ${calls} | triangles: ${tris} | programs: ${progCount}
MAP:           loaded: ${mapLoaded ? 'YES' : 'NO'} | meshes: ${meshCount} | tris: ${mapTriangles}
MAP BBOX:      ${bboxStr}
CAMERA:        ${camStr} | fog: ${fogStr}
PLAYER:        pos: ${pPosStr} | feetY: ${feetYStr}
WEAPON:        ${wpnName} | mesh: ${wpnMeshName} | tex: ${wpnTexLoaded} | mat: ${wpnMatType}
RECOIL:        climb: ${recoilClimbDeg.toFixed(1)}°
NETWORK:       ${isOnline ? 'ONLINE' : 'OFFLINE'} | ws: ${wsState} | ping: ${pingVal}
ROUND:         phase: ${gameManager.phase} | timer: ${gameManager.phaseTimer.toFixed(1)}s [${timerSource}]
MATCH:         CT: ${gameManager.ctScore} | T: ${gameManager.tScore} | alive: CT ${ctAlive} : T ${tAlive}
PLAYERS:       total: ${playerCount} | snapshot age: ${snapAge}`;
      } catch (e) {
        overlay.textContent = `[DEBUG OVERLAY ERROR]: ${e.message}`;
      }
    };

    setInterval(update, 100);
  }
});
