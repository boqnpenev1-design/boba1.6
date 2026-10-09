// CS2 Main Bootstrap & UI Controller

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Three.js 3D Scene, Camera & WebGL Renderer
  const container = document.getElementById('game-canvas-container');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd6e5f3); // CS2 Sky blue
  scene.fog = new THREE.FogExp2(0xd6e5f3, 0.007);

  const camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 1000);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Sunlight and Ambient Lighting
  const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.65);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xfffaed, 1.2);
  sunLight.position.set(60, 100, 40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 250;
  sunLight.shadow.camera.left = -90;
  sunLight.shadow.camera.right = 90;
  sunLight.shadow.camera.top = 90;
  sunLight.shadow.camera.bottom = -90;
  scene.add(sunLight);

  // Resize handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 2. Initialize Anti-Cheat & Game Engine
  window.__CS2_AC.initDevToolsGuard();
  const gameManager = new CS2GameManager(scene, camera);

  // 3. Main Menu Navigation & Tab Switching
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

  // 4. Map & Team Radio selection UI
  document.querySelectorAll('.map-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.map-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });

  document.querySelectorAll('.team-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.team-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });

  // 5. Deploy / Start Match Button
  const btnStartMatch = document.getElementById('btn-start-match');
  btnStartMatch.addEventListener('click', () => {
    window.csAudio.ensureContext();

    const selectedMap = document.querySelector('input[name="selected-map"]:checked').value;
    const selectedTeam = document.querySelector('input[name="selected-team"]:checked').value;

    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');

    gameManager.startMatch(selectedMap, selectedTeam);

    // Request pointer lock
    container.requestPointerLock();
  });

  // Click on canvas to lock pointer during match
  container.addEventListener('click', () => {
    if (document.getElementById('main-menu').classList.contains('hidden') &&
        document.getElementById('pause-menu').classList.contains('hidden') &&
        document.getElementById('buy-menu').classList.contains('hidden')) {
      container.requestPointerLock();
    }
  });

  // Pointer lock state changes
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== container) {
      // If pointer is unlocked during an active match, open pause menu
      if (document.getElementById('main-menu').classList.contains('hidden') &&
          document.getElementById('buy-menu').classList.contains('hidden')) {
        document.getElementById('pause-menu').classList.remove('hidden');
      }
    } else {
      document.getElementById('pause-menu').classList.add('hidden');
      document.getElementById('buy-menu').classList.add('hidden');
    }
  });

  // Pause Menu Buttons
  document.getElementById('btn-resume').addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    container.requestPointerLock();
  });

  document.getElementById('btn-pause-buy').addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    openBuyMenu();
  });

  document.getElementById('btn-pause-settings').addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
    // Switch to settings tab
    document.querySelector('.nav-tab[data-tab="settings"]').click();
  });

  document.getElementById('btn-quit-to-menu').addEventListener('click', () => {
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
  });

  // 6. Online Multiplayer Buttons
  document.getElementById('btn-create-lobby').addEventListener('click', () => {
    const codeTag = document.getElementById('host-room-code');
    const infoBox = document.getElementById('host-room-info');
    infoBox.classList.remove('hidden');
    codeTag.innerText = 'CONNECTING...';

    gameManager.net.createLobby((code) => {
      codeTag.innerText = code;
      document.getElementById('sb-net-status').innerText = `ONLINE HOST &bull; ROOM ${code}`;
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
        status.innerText = 'CONNECTED! READY TO DEPLOY';
        status.style.color = '#37d376';
        document.getElementById('sb-net-status').innerText = `ONLINE CLIENT &bull; ROOM ${input}`;
      },
      (err) => {
        status.innerText = 'FAILED TO CONNECT (CHECK CODE)';
        status.style.color = '#ea3f3f';
      }
    );
  });

  // 7. Buy Menu Setup
  const buyMenu = document.getElementById('buy-menu');
  let currentBuyCategory = 'pistols';

  function openBuyMenu() {
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
      }
    } else if (weapon.slot) {
      gameManager.player.inventory[weapon.slot] = weapon;
      gameManager.player.switchSlot(weapon.slot);
    }

    window.csAudio.playRadioTone('buy');
    renderBuyItems(currentBuyCategory);
    gameManager.updateHUD();
  }

  // 8. Keybindings Remapping Table Setup
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
    // Keybind remapping capture
    if (listeningButton) {
      e.preventDefault();
      const action = listeningButton.dataset.action;
      defaultKeybinds[action] = e.code;
      listeningButton.innerText = e.code;
      listeningButton.classList.remove('listening');
      listeningButton = null;
      return;
    }

    // In-game 'B' opens Buy Menu during freeze / buy time
    if (e.code === 'KeyB' && !document.getElementById('hud').classList.contains('hidden')) {
      if (buyMenu.classList.contains('hidden')) {
        openBuyMenu();
      } else {
        closeBuyMenu();
      }
    }

    // Scoreboard on Tab
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

    // Render local player row
    const playerRow = document.createElement('tr');
    playerRow.className = `is-you ${gameManager.player.health.get() <= 0 ? 'is-dead' : ''}`;
    playerRow.innerHTML = `
      <td class="col-status">${gameManager.player.health.get() > 0 ? '●' : '💀'}</td>
      <td class="col-name">YOU (Player)</td>
      <td class="col-ping">5ms</td>
      <td class="col-kills">${gameManager.player.team === 'CT' ? gameManager.ctScore : gameManager.tScore}</td>
      <td class="col-assists">1</td>
      <td class="col-deaths">0</td>
      <td class="col-mvp">★ 2</td>
      <td class="col-score">18</td>
      <td class="col-cash">$${gameManager.player.money.get()}</td>
    `;

    if (gameManager.player.team === 'CT') ctTbody.appendChild(playerRow);
    else tTbody.appendChild(playerRow);

    // Render bots rows
    gameManager.bots.forEach(bot => {
      const row = document.createElement('tr');
      row.className = bot.isAlive ? '' : 'is-dead';
      row.innerHTML = `
        <td class="col-status">${bot.isAlive ? '●' : '💀'}</td>
        <td class="col-name">${bot.name}</td>
        <td class="col-ping">0ms</td>
        <td class="col-kills">${bot.kills}</td>
        <td class="col-assists">${bot.assists}</td>
        <td class="col-deaths">${bot.deaths}</td>
        <td class="col-mvp">★ ${Math.floor(bot.kills / 3)}</td>
        <td class="col-score">${bot.kills * 2}</td>
        <td class="col-cash">$${bot.cash}</td>
      `;

      if (bot.team === 'CT') ctTbody.appendChild(row);
      else tTbody.appendChild(row);
    });
  }

  // 9. Settings Sliders & Crosshair Realtime Binding
  const sensSlider = document.getElementById('setting-sens');
  sensSlider.addEventListener('input', (e) => {
    document.getElementById('val-sens').innerText = e.target.value;
    gameManager.player.sensitivity = Number(e.target.value);
  });

  const fovSlider = document.getElementById('setting-fov');
  fovSlider.addEventListener('input', (e) => {
    document.getElementById('val-fov').innerText = `${e.target.value}°`;
    camera.fov = Number(e.target.value);
    camera.updateProjectionMatrix();
  });

  const invertCheck = document.getElementById('setting-invert');
  invertCheck.addEventListener('change', (e) => {
    gameManager.player.invertY = e.target.checked;
  });

  // Crosshair Customization
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

  // DevTools Guard Toggle
  const devtoolsGuard = document.getElementById('setting-devtools-guard');
  devtoolsGuard.addEventListener('change', (e) => {
    window.__CS2_AC.setEnabled(e.target.checked);
  });

  // 10. Main Animation Loop (High Performance 60+ FPS)
  let lastTime = performance.now();

  function animate(currentTime) {
    requestAnimationFrame(animate);

    const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;

    // Run game logic only when match has started
    if (!document.getElementById('hud').classList.contains('hidden')) {
      gameManager.update(dt, currentTime);
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
});
