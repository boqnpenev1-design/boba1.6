// CS2 High-Performance Bootstrap & Server Browser Controller

document.addEventListener('DOMContentLoaded', () => {
  // 1. High Performance WebGL Renderer (144+ FPS Optimized)
  const container = document.getElementById('game-canvas-container');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdce7f0); // Crisp CS2 daytime sky
  scene.fog = new THREE.FogExp2(0xdce7f0, 0.005);

  const camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 1000);
  scene.add(camera);

  // Pixel ratio locked to 1 & MSAA disabled for maximum competitive 144-240+ FPS
  const renderer = new THREE.WebGLRenderer({
    antialias: false, // Critical competitive optimization: 2x-3x framerate gain
    powerPreference: 'high-performance',
    precision: 'mediump',
    stencil: false,
    depth: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = false; // Zero shadow overhead
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

  // 4. Server Connect Buttons (Dust II & Mirage)
  document.getElementById('btn-connect-dust2').addEventListener('click', () => {
    window.csAudio.ensureContext();
    gameManager.connectToServer('dust2');
  });

  document.getElementById('btn-connect-mirage').addEventListener('click', () => {
    window.csAudio.ensureContext();
    gameManager.connectToServer('mirage');
  });

  // 5. Team Selection (Terrorists | Line | Counter-Terrorists)
  document.getElementById('btn-select-t').addEventListener('click', () => {
    window.csAudio.ensureContext();
    gameManager.chooseTeam('T');
  });

  document.getElementById('btn-select-ct').addEventListener('click', () => {
    window.csAudio.ensureContext();
    gameManager.chooseTeam('CT');
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
  });

  document.getElementById('btn-pause-buy').addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    openBuyMenu();
  });

  document.getElementById('btn-quit-to-menu').addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
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

      card.innerHTML = `
        <div>
          <div class="wc-name">${weapon.name}</div>
          <div class="wc-cost">$${weapon.cost}</div>
        </div>
        <div class="wc-stats">
          ${weapon.damage ? `<span>Damage: ${weapon.damage}</span>` : ''}
          ${weapon.armorPen ? `<span>Armor Pen: ${Math.round(weapon.armorPen * 100)}%</span>` : ''}
          ${weapon.clip ? `<span>Ammo: ${weapon.clip} / ${weapon.reserve}</span>` : ''}
        </div>
      `;

      if (canAfford) {
        card.addEventListener('click', () => {
          buyWeapon(weapon);
        });
      }

      grid.appendChild(card);
    });
  }

  function buyWeapon(weapon) {
    const cash = gameManager.player.money.get();
    if (cash < weapon.cost) return;

    gameManager.player.money.add(-weapon.cost);

    if (weapon.category === 'equipment') {
      if (weapon.type === 'armor') {
        gameManager.player.armor.set(100);
      } else if (weapon.type === 'helmet') {
        gameManager.player.armor.set(100);
        gameManager.player.hasHelmet = true;
      } else if (weapon.type === 'kit') {
        gameManager.player.hasDefuseKit = true;
      } else if (weapon.type === 'grenade' || weapon.id === 'flashbang' || weapon.id === 'hegrenade' || weapon.id === 'smoke') {
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

  function updateCrosshairStyle() {
    const color = chColor.value;
    const size = `${chSize.value}px`;
    const gap = `${chGap.value}px`;
    const showDot = chDot.checked;

    document.querySelectorAll('.crosshair-ch').forEach(el => {
      el.style.backgroundColor = color;
    });

    const dot = document.querySelector('.crosshair-dot');
    dot.style.backgroundColor = color;
    dot.style.display = showDot ? 'block' : 'none';

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
