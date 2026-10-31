// CS2 High-Performance Bootstrap & Server Browser Controller

document.addEventListener('DOMContentLoaded', () => {
  // 1. High Performance WebGL Renderer (144+ FPS Optimized)
  const container = document.getElementById('game-canvas-container');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdce7f0); // Crisp CS2 daytime sky
  scene.fog = new THREE.FogExp2(0xdce7f0, 0.008); // Tighter fog for perf

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
  container.appendChild(renderer.domElement);

  // Fast Competitive Lighting (Hemisphere + Sun Directional)
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb89d7b, 0.75);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffaed, 0.85);
  sunLight.position.set(50, 90, 40);
  scene.add(sunLight);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 2. Anti-Cheat & Game Engine
  window.__CS2_AC.initDevToolsGuard();
  const gameManager = new CS2GameManager(scene, camera);

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

  // 4. Server Connect Button (Dust II)
  const connectDust2 = () => {
    window.csAudio.ensureContext();
    gameManager.connectToServer('dust2');
  };
  const btnDust2 = document.getElementById('btn-connect-dust2');
  if (btnDust2) btnDust2.addEventListener('click', connectDust2);
  const cardDust2 = document.querySelector('.server-card');
  if (cardDust2) cardDust2.addEventListener('click', (e) => {
    if (e.target.id !== 'btn-connect-dust2') connectDust2();
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

  // Authentic CS2 vector weapon silhouettes (crisp at any resolution, zero 404s, never broken)
  function getWeaponSVG(id) {
    switch (id) {
      case 'ak47':
        return `<svg viewBox="0 0 100 36" class="buy-svg"><path d="M4 22 L22 22 L26 27 L36 27 L38 23 L62 23 L64 26 L70 26 L72 20 L96 20 L96 17 L72 17 L70 14 L62 14 L55 17 L44 17 L36 12 L16 12 L8 16 Z M50 23 L46 34 L54 34 L56 23 Z" fill="#e2e8f0"/></svg>`;
      case 'm4a4':
      case 'm4a1s':
        return `<svg viewBox="0 0 100 36" class="buy-svg"><path d="M4 20 L24 20 L28 26 L36 26 L38 22 L66 22 L68 25 L72 25 L74 19 L96 19 L96 17 L74 17 L72 14 L60 14 L48 16 L32 14 L12 14 Z M48 22 L45 33 L52 33 L54 22 Z" fill="#e2e8f0"/></svg>`;
      case 'awp':
        return `<svg viewBox="0 0 110 34" class="buy-svg"><path d="M2 20 L22 20 L25 26 L35 26 L38 21 L98 21 L98 18 L48 18 L45 13 L65 13 L65 11 L42 11 L40 18 L18 16 L8 16 Z M48 21 L44 32 L51 32 L53 21 Z" fill="#e2e8f0"/></svg>`;
      case 'ssg08':
        return `<svg viewBox="0 0 100 34" class="buy-svg"><path d="M4 20 L22 20 L25 25 L34 25 L36 21 L96 21 L96 18 L50 18 L47 13 L64 13 L64 11 L44 11 L42 18 L16 16 Z" fill="#e2e8f0"/></svg>`;
      case 'deagle':
        return `<svg viewBox="0 0 64 36" class="buy-svg"><path d="M8 12 L56 12 L56 20 L44 20 L38 22 L32 34 L18 34 L22 20 L8 20 Z" fill="#e2e8f0"/></svg>`;
      case 'glock':
      case 'usp':
      case 'p250':
      case 'fiveseven':
      case 'dualberettas':
      case 'cz75':
      case 'tec9':
        return `<svg viewBox="0 0 60 36" class="buy-svg"><path d="M8 14 L52 14 L52 20 L42 20 L36 22 L30 33 L18 33 L22 20 L8 20 Z" fill="#e2e8f0"/></svg>`;
      case 'mp5sd':
      case 'mp7':
      case 'mp9':
      case 'ump45':
      case 'mac10':
      case 'bizon':
        return `<svg viewBox="0 0 80 36" class="buy-svg"><path d="M8 18 L24 18 L28 24 L34 24 L36 20 L68 20 L68 15 L44 15 L32 14 L12 14 Z M42 20 L38 33 L45 33 L48 20 Z" fill="#e2e8f0"/></svg>`;
      case 'p90':
        return `<svg viewBox="0 0 76 36" class="buy-svg"><path d="M8 24 L22 26 L36 26 L42 32 L56 32 L62 26 L70 26 L70 14 L20 14 L10 18 Z M26 22 A4 4 0 1 0 26 14 A4 4 0 1 0 26 22 Z" fill="#e2e8f0"/></svg>`;
      case 'nova':
      case 'xm1014':
      case 'mag7':
      case 'sawedoff':
        return `<svg viewBox="0 0 96 32" class="buy-svg"><path d="M4 20 L24 20 L28 24 L48 24 L52 20 L92 20 L92 16 L48 16 L32 14 L10 14 Z M52 23 L68 23 L68 21 L52 21 Z" fill="#e2e8f0"/></svg>`;
      case 'm249':
      case 'negev':
        return `<svg viewBox="0 0 96 38" class="buy-svg"><path d="M4 22 L24 22 L28 27 L40 27 L42 22 L92 22 L92 18 L50 18 L34 14 L12 14 Z M44 22 L40 34 L56 34 L56 22 Z" fill="#e2e8f0"/></svg>`;
      case 'famas':
      case 'galil':
      case 'aug':
      case 'sg553':
      case 'g3sg1':
      case 'scar20':
        return `<svg viewBox="0 0 96 36" class="buy-svg"><path d="M4 22 L22 22 L26 27 L36 27 L38 23 L68 23 L70 20 L94 20 L94 17 L56 17 L44 14 L20 14 Z M46 23 L42 34 L50 34 L52 23 Z" fill="#e2e8f0"/></svg>`;
      case 'hegrenade':
        return `<svg viewBox="0 0 40 40" class="buy-svg"><circle cx="20" cy="24" r="13" fill="#68bb59"/><rect x="17" y="5" width="6" height="7" fill="#888888"/><ellipse cx="20" cy="5" rx="5" ry="2" fill="#555555"/></svg>`;
      case 'flashbang':
        return `<svg viewBox="0 0 36 44" class="buy-svg"><rect x="11" y="14" width="14" height="24" rx="3" fill="#cbd5e1"/><rect x="14" y="6" width="8" height="8" fill="#64748b"/><circle cx="24" cy="9" r="4" fill="none" stroke="#94a3b8" stroke-width="2"/></svg>`;
      case 'smokegrenade':
        return `<svg viewBox="0 0 36 44" class="buy-svg"><rect x="10" y="14" width="16" height="26" rx="3" fill="#94a3b8"/><rect x="14" y="6" width="8" height="8" fill="#475569"/><line x1="10" y1="20" x2="26" y2="20" stroke="#f1f5f9" stroke-width="2"/></svg>`;
      case 'molotov':
        return `<svg viewBox="0 0 36 48" class="buy-svg"><path d="M12 20 L12 42 Q12 45 18 45 Q24 45 24 42 L24 20 L21 14 L21 8 L15 8 L15 14 Z" fill="#d97706"/><rect x="16" y="2" width="4" height="7" fill="#f8fafc"/><path d="M18 0 Q22 4 18 8 Q14 4 18 0 Z" fill="#ef4444"/></svg>`;
      case 'armor':
        return `<svg viewBox="0 0 44 44" class="buy-svg"><path d="M8 8 L16 8 L22 14 L28 8 L36 8 L38 22 L32 38 L12 38 L6 22 Z" fill="#3b82f6"/></svg>`;
      case 'helmet':
        return `<svg viewBox="0 0 44 44" class="buy-svg"><path d="M8 8 L16 8 L22 14 L28 8 L36 8 L38 22 L32 38 L12 38 L6 22 Z" fill="#3b82f6"/><path d="M12 8 Q22 0 32 8 L34 16 L10 16 Z" fill="#eab308"/></svg>`;
      case 'defuser':
        return `<svg viewBox="0 0 44 44" class="buy-svg"><rect x="10" y="14" width="24" height="22" rx="4" fill="#0284c7"/><path d="M16 14 L16 8 Q22 4 28 8 L28 14" stroke="#e0f2fe" stroke-width="3" fill="none"/><line x1="17" y1="22" x2="27" y2="22" stroke="#ffffff" stroke-width="2"/></svg>`;
      default:
        return `<svg viewBox="0 0 40 40" class="buy-svg"><rect x="8" y="14" width="24" height="12" rx="2" fill="#94a3b8"/></svg>`;
    }
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

      const svgIcon = getWeaponSVG(weapon.id);
      const isPurchased = gameManager.purchaseHistory.some(p => p.id === weapon.id);
      const refundBtnHtml = isPurchased ? `<button class="btn-card-revert" data-wid="${weapon.id}">↩ Revert (+$${weapon.cost})</button>` : '';

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

      // Buy click
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
    if (idx === -1) return;
    gameManager.purchaseHistory.splice(idx, 1);
    gameManager.player.money.add(weapon.cost);

    if (weapon.category === 'equipment') {
      if (weapon.type === 'armor') gameManager.player.armor.set(0);
      else if (weapon.type === 'helmet') { gameManager.player.hasHelmet = false; }
      else if (weapon.type === 'kit') { gameManager.player.hasDefuseKit = false; }
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
    ctTbody.innerHTML = '';
    tTbody.innerHTML = '';

    const playerRow = document.createElement('tr');
    playerRow.className = `is-you ${gameManager.player.health.get() <= 0 ? 'is-dead' : ''}`;
    playerRow.innerHTML = `
      <td class="col-status">${gameManager.player.health.get() > 0 ? '●' : '💀'}</td>
      <td class="col-name">YOU (Player)</td>
      <td class="col-ping">5ms</td>
      <td class="col-kills">${gameManager.player.team === 'CT' ? gameManager.ctScore : gameManager.tScore}</td>
      <td class="col-assists">0</td>
      <td class="col-deaths">0</td>
      <td class="col-mvp">★ 1</td>
      <td class="col-score">10</td>
      <td class="col-cash">$${gameManager.player.money.get()}</td>
    `;

    if (gameManager.player.team === 'CT') ctTbody.appendChild(playerRow);
    else tTbody.appendChild(playerRow);

    Object.entries(gameManager.net.remotePlayers).forEach(([id, p]) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="col-status">●</td>
        <td class="col-name">Player_${id.substring(0, 5)}</td>
        <td class="col-ping">18ms</td>
        <td class="col-kills">0</td>
        <td class="col-assists">0</td>
        <td class="col-deaths">0</td>
        <td class="col-mvp">★ 0</td>
        <td class="col-score">0</td>
        <td class="col-cash">$800</td>
      `;

      if (p.team === 'CT') ctTbody.appendChild(row);
      else tTbody.appendChild(row);
    });
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

  function animate(currentTime) {
    requestAnimationFrame(animate);

    const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
    lastTime = currentTime;

    if (!document.getElementById('hud').classList.contains('hidden') ||
        !document.getElementById('spectator-hud').classList.contains('hidden')) {
      gameManager.update(dt, currentTime);
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
});
