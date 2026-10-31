// CS2 High-Performance Bootstrap & Server Browser Controller

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

  // 4. Player Nickname Validation & Server Connect Button (Dust II)
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
      if (gameManager.player) gameManager.player.name = val;
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
    gameManager.connectToServer('dust2');
  };

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

  // Authentic CS2 Buy Menu Weapon Illustrations (High-fidelity vector silhouettes with real colors & details)
  function getWeaponGraphic(id) {
    switch (id) {
      // PISTOLS
      case 'glock':
        return `<svg viewBox="0 0 100 48" class="buy-menu-img">
          <rect x="22" y="10" width="62" height="13" rx="2" fill="#383c44" stroke="#25282e" stroke-width="1.2"/>
          <line x1="72" y1="12" x2="72" y2="21" stroke="#202328" stroke-width="1.5"/>
          <line x1="76" y1="12" x2="76" y2="21" stroke="#202328" stroke-width="1.5"/>
          <line x1="80" y1="12" x2="80" y2="21" stroke="#202328" stroke-width="1.5"/>
          <rect x="18" y="12" width="5" height="8" fill="#181a1d"/>
          <rect x="23" y="8" width="3" height="3" fill="#ffffff"/>
          <rect x="80" y="8" width="3" height="3" fill="#ffffff"/>
          <path d="M36 23 L44 23 L47 30 L55 30 L53 23 L78 23 L76 43 L58 43 L62 27 L48 27 Z" fill="#1e2024" stroke="#121316" stroke-width="1.2"/>
          <path d="M46 25 Q42 32 50 32 L52 25" fill="none" stroke="#25282e" stroke-width="1.5"/>
          <path d="M49 26 Q46 29 48 30" fill="none" stroke="#e0e0e0" stroke-width="1.2"/>
        </svg>`;

      case 'usp':
        return `<svg viewBox="0 0 110 48" class="buy-menu-img">
          <rect x="4" y="12" width="34" height="11" rx="2" fill="#1f2226" stroke="#141618" stroke-width="1.2"/>
          <line x1="30" y1="12" x2="30" y2="23" stroke="#141618" stroke-width="1.5"/>
          <rect x="38" y="11" width="52" height="13" rx="2" fill="#2d3137" stroke="#1c1e22" stroke-width="1.2"/>
          <line x1="78" y1="13" x2="78" y2="22" stroke="#1c1e22" stroke-width="1.5"/>
          <line x1="82" y1="13" x2="82" y2="22" stroke="#1c1e22" stroke-width="1.5"/>
          <path d="M50 24 L58 24 L60 30 L66 30 L64 24 L86 24 L83 43 L68 43 L72 28 L60 28 Z" fill="#1b1c20" stroke="#111215" stroke-width="1.2"/>
          <path d="M58 25 Q55 32 63 32 L64 25" fill="none" stroke="#222" stroke-width="1.5"/>
          <path d="M60 26 Q58 29 60 30" fill="none" stroke="#bbb" stroke-width="1.2"/>
        </svg>`;

      case 'p250':
        return `<svg viewBox="0 0 100 48" class="buy-menu-img">
          <rect x="25" y="11" width="56" height="13" rx="2" fill="#444952" stroke="#2d3138" stroke-width="1.2"/>
          <rect x="21" y="13" width="5" height="8" fill="#181a1d"/>
          <path d="M38 24 L46 24 L48 30 L55 30 L53 24 L77 24 L74 42 L60 42 L64 28 L50 28 Z" fill="#202226" stroke="#131417" stroke-width="1.2"/>
          <path d="M47 25 Q44 32 52 32 L53 25" fill="none" stroke="#222" stroke-width="1.5"/>
        </svg>`;

      case 'deagle':
        return `<svg viewBox="0 0 100 48" class="buy-menu-img">
          <rect x="12" y="9" width="34" height="15" fill="#d2d9e0" stroke="#9aa3ad" stroke-width="1.2"/>
          <rect x="18" y="7" width="22" height="3" fill="#b0b8c2"/>
          <rect x="46" y="9" width="40" height="15" fill="#c0c8d1" stroke="#8d97a2" stroke-width="1.2"/>
          <line x1="74" y1="11" x2="74" y2="22" stroke="#77808a" stroke-width="2"/>
          <line x1="79" y1="11" x2="79" y2="22" stroke="#77808a" stroke-width="2"/>
          <path d="M35 24 L48 24 L50 32 L60 32 L58 24 L82 24 L79 44 L58 44 L64 28 L48 28 Z" fill="#18191c" stroke="#0f1012" stroke-width="1.2"/>
          <circle cx="69" cy="35" r="3" fill="#eab308"/>
          <path d="M48 25 Q44 34 56 34 L57 25" fill="none" stroke="#8d97a2" stroke-width="1.8"/>
          <path d="M51 27 Q48 30 51 32" fill="none" stroke="#fff" stroke-width="1.5"/>
        </svg>`;

      case 'dualberettas':
        return `<svg viewBox="0 0 100 48" class="buy-menu-img">
          <g opacity="0.65" transform="translate(10, -4)">
            <rect x="18" y="12" width="48" height="12" rx="2" fill="#2d3137"/>
            <path d="M36 24 L44 24 L46 29 L52 29 L50 24 L64 24 L62 40 L50 40 Z" fill="#1b1c20"/>
          </g>
          <rect x="14" y="14" width="50" height="12" rx="2" fill="#3a3f47" stroke="#25282e" stroke-width="1.2"/>
          <rect x="24" y="12" width="22" height="3" fill="#181a1d"/>
          <path d="M32 26 L40 26 L42 32 L49 32 L47 26 L62 26 L60 44 L48 44 L51 30 L40 30 Z" fill="#18191c" stroke="#101113" stroke-width="1.2"/>
          <path d="M41 27 Q38 33 46 33 L47 27" fill="none" stroke="#25282e" stroke-width="1.5"/>
        </svg>`;

      case 'tec9':
        return `<svg viewBox="0 0 100 48" class="buy-menu-img">
          <rect x="14" y="11" width="34" height="13" rx="2" fill="#22252a" stroke="#141618" stroke-width="1.2"/>
          <circle cx="20" cy="17" r="2" fill="#0e0f11"/>
          <circle cx="28" cy="17" r="2" fill="#0e0f11"/>
          <circle cx="36" cy="17" r="2" fill="#0e0f11"/>
          <circle cx="44" cy="17" r="2" fill="#0e0f11"/>
          <rect x="48" y="11" width="34" height="13" fill="#32363e" stroke="#1f2227" stroke-width="1.2"/>
          <circle cx="56" cy="14" r="2.5" fill="#c0c8d1"/>
          <path d="M50 24 L60 24 L60 30 L65 30 L64 24 L78 24 L75 42 L62 42 L65 28 L54 28 Z" fill="#1c1e22" stroke="#111215" stroke-width="1.2"/>
          <rect x="46" y="24" width="7" height="22" fill="#101113" stroke="#2b2e34" stroke-width="1.2"/>
        </svg>`;

      case 'fiveseven':
      case 'cz75':
        return `<svg viewBox="0 0 100 48" class="buy-menu-img">
          <rect x="22" y="11" width="58" height="13" rx="2" fill="#2d3137" stroke="#1b1c20" stroke-width="1.2"/>
          <path d="M38 24 L48 24 L50 30 L56 30 L54 24 L76 24 L73 43 L60 43 L64 28 L50 28 Z" fill="#18191c" stroke="#101113" stroke-width="1.2"/>
          ${id === 'cz75' ? '<rect x="36" y="24" width="7" height="16" fill="#121316" transform="rotate(-15 36 24)"/>' : ''}
          <path d="M47 25 Q44 32 52 32 L53 25" fill="none" stroke="#222" stroke-width="1.5"/>
        </svg>`;

      // RIFLES & SNIPERS
      case 'ak47':
        return `<svg viewBox="0 0 110 44" class="buy-menu-img">
          <rect x="4" y="16" width="6" height="3" fill="#222428"/>
          <rect x="10" y="13" width="3" height="7" fill="#1c1e22"/>
          <rect x="10" y="16" width="22" height="4" fill="#2b2e34"/>
          <rect x="26" y="14" width="22" height="9" rx="2" fill="#964b18" stroke="#68320e" stroke-width="1.2"/>
          <rect x="48" y="13" width="26" height="12" fill="#24262c" stroke="#15171a" stroke-width="1.2"/>
          <rect x="54" y="15" width="8" height="3" fill="#6d7580"/>
          <path d="M52 25 Q46 36 38 41 L45 43 Q54 36 59 25 Z" fill="#b4581c" stroke="#75350d" stroke-width="1.2"/>
          <path d="M68 25 L64 38 L57 38 L62 25 Z" fill="#7a3a12" stroke="#502409" stroke-width="1.2"/>
          <path d="M74 15 L104 18 L106 33 L98 33 L74 25 Z" fill="#8d4414" stroke="#5a290a" stroke-width="1.2"/>
          <rect x="104" y="18" width="3" height="15" fill="#1b1c20"/>
        </svg>`;

      case 'm4a4':
      case 'm4a1s':
        return `<svg viewBox="0 0 110 44" class="buy-menu-img">
          ${id === 'm4a1s' ? '<rect x="2" y="16" width="22" height="7" rx="1.5" fill="#1e2024" stroke="#111215" stroke-width="1"/>' : '<rect x="12" y="17" width="6" height="4" fill="#222"/>'}
          <rect x="${id === 'm4a1s' ? '24' : '18'}" y="18" width="16" height="3" fill="#2b2e34"/>
          <polygon points="34,13 37,13 38,20 33,20" fill="#1b1c20"/>
          <rect x="36" y="15" width="22" height="9" fill="#1a1c20" stroke="#0f1012" stroke-width="1.2"/>
          <rect x="58" y="14" width="22" height="11" fill="#25282e" stroke="#16181b" stroke-width="1.2"/>
          <rect x="58" y="12" width="20" height="2" fill="#3b3f47"/>
          <path d="M60 25 L57 39 L65 41 L67 25 Z" fill="#444952" stroke="#25272c" stroke-width="1.2"/>
          <path d="M74 25 L71 38 L65 38 L69 25 Z" fill="#181a1d"/>
          <rect x="80" y="17" width="10" height="4" fill="#33373e"/>
          <path d="M88 14 L105 16 L106 31 L98 30 L93 23 L88 23 Z" fill="#18191c" stroke="#0d0e10" stroke-width="1.2"/>
        </svg>`;

      case 'awp':
        return `<svg viewBox="0 0 115 44" class="buy-menu-img">
          <rect x="2" y="16" width="7" height="6" fill="#1b1d20"/>
          <rect x="9" y="17" width="34" height="4" fill="#272b30"/>
          <rect x="36" y="9" width="32" height="5" fill="#18191c" stroke="#0f1012" stroke-width="1"/>
          <rect x="32" y="8" width="5" height="7" fill="#141517"/>
          <rect x="66" y="8" width="6" height="7" fill="#141517"/>
          <rect x="49" y="6" width="6" height="3" fill="#2a2d32"/>
          <rect x="38" y="14" width="4" height="3" fill="#111"/>
          <rect x="60" y="14" width="4" height="3" fill="#111"/>
          <path d="M40 17 L76 17 L78 26 L108 26 L110 33 L98 33 L86 28 L72 32 L58 32 L54 22 L40 22 Z" fill="#44553b" stroke="#283323" stroke-width="1.2"/>
          <circle cx="82" cy="24" r="3.5" fill="#0f120e"/>
          <rect x="56" y="25" width="11" height="9" fill="#1b1c20" stroke="#111" stroke-width="1"/>
          <rect x="108" y="24" width="4" height="11" rx="1.5" fill="#141517"/>
        </svg>`;

      case 'galil':
      case 'famas':
      case 'aug':
      case 'sg553':
      case 'ssg08':
      case 'g3sg1':
      case 'scar20':
        return `<svg viewBox="0 0 110 44" class="buy-menu-img">
          <rect x="10" y="17" width="28" height="3" fill="#2b2e34"/>
          <rect x="38" y="14" width="36" height="11" fill="#282b30" stroke="#16181b" stroke-width="1.2"/>
          <path d="M52 25 L48 39 L56 40 L60 25 Z" fill="#33373e"/>
          <path d="M68 25 L65 37 L59 37 L63 25 Z" fill="#181a1d"/>
          <path d="M74 15 L102 17 L104 31 L96 30 L74 24 Z" fill="#22252a" stroke="#111" stroke-width="1.2"/>
        </svg>`;

      // MID-TIER (SMGs & SHOTGUNS & HEAVY)
      case 'mp5sd':
        return `<svg viewBox="0 0 105 44" class="buy-menu-img">
          <rect x="6" y="16" width="32" height="9" rx="2" fill="#1b1d20" stroke="#101113" stroke-width="1.2"/>
          <line x1="14" y1="16" x2="14" y2="25" stroke="#2d3137" stroke-width="1.5"/>
          <line x1="20" y1="16" x2="20" y2="25" stroke="#2d3137" stroke-width="1.5"/>
          <line x1="26" y1="16" x2="26" y2="25" stroke="#2d3137" stroke-width="1.5"/>
          <line x1="32" y1="16" x2="32" y2="25" stroke="#2d3137" stroke-width="1.5"/>
          <rect x="38" y="15" width="28" height="11" fill="#26292f" stroke="#15171a" stroke-width="1.2"/>
          <path d="M48 26 Q44 36 38 42 L44 43 Q50 37 54 26 Z" fill="#181a1d" stroke="#0e0f11" stroke-width="1"/>
          <path d="M62 26 L59 38 L53 38 L57 26 Z" fill="#141517"/>
          <line x1="66" y1="20" x2="98" y2="20" stroke="#444952" stroke-width="2.5"/>
          <rect x="96" y="16" width="4" height="14" rx="1.5" fill="#18191c"/>
        </svg>`;

      case 'p90':
        return `<svg viewBox="0 0 100 44" class="buy-menu-img">
          <path d="M12 21 L28 21 L34 16 L88 16 L94 22 L94 33 L82 35 L70 35 L58 37 L38 37 L32 28 L20 28 L14 26 Z" fill="#282c32" stroke="#181a1d" stroke-width="1.2"/>
          <rect x="34" y="13" width="48" height="4" rx="1" fill="#94a3b8" opacity="0.8"/>
          <circle cx="48" cy="28" r="4.5" fill="#0d0e10"/>
          <circle cx="76" cy="27" r="4.5" fill="#0d0e10"/>
        </svg>`;

      case 'mac10':
      case 'mp9':
      case 'mp7':
      case 'ump45':
      case 'bizon':
        return `<svg viewBox="0 0 100 44" class="buy-menu-img">
          <rect x="18" y="15" width="42" height="12" rx="1.5" fill="#26292f" stroke="#15171a" stroke-width="1.2"/>
          <rect x="42" y="27" width="7" height="15" fill="#141517"/>
          <path d="M56 27 L53 38 L48 38 L52 27 Z" fill="#1a1c20"/>
          <line x1="60" y1="19" x2="88" y2="19" stroke="#3b3f47" stroke-width="2"/>
        </svg>`;

      case 'nova':
      case 'xm1014':
      case 'mag7':
      case 'sawedoff':
        return `<svg viewBox="0 0 110 44" class="buy-menu-img">
          <rect x="8" y="16" width="48" height="4" fill="#282b30"/>
          <rect x="14" y="20" width="38" height="4" fill="#1c1e22"/>
          <rect x="28" y="18" width="18" height="7" rx="1" fill="#111215" stroke="#2b2e34" stroke-width="1"/>
          <rect x="56" y="15" width="22" height="11" fill="#2d3137" stroke="#181a1d" stroke-width="1.2"/>
          <path d="M74 26 L70 38 L64 38 L69 26 Z" fill="#16181b"/>
          <path d="M78 17 L104 20 L105 32 L98 32 L78 24 Z" fill="#1c1e22" stroke="#0e0f11" stroke-width="1.2"/>
        </svg>`;

      case 'm249':
      case 'negev':
        return `<svg viewBox="0 0 110 44" class="buy-menu-img">
          <rect x="8" y="17" width="38" height="5" fill="#22252a"/>
          <path d="M26 17 L26 10 L38 10 L38 17" fill="none" stroke="#111" stroke-width="2"/>
          <rect x="46" y="14" width="30" height="14" fill="#2a2d34" stroke="#16181c" stroke-width="1.2"/>
          <rect x="48" y="28" width="18" height="14" rx="2" fill="#3a4834" stroke="#222c1e" stroke-width="1.2"/>
          <path d="M76 28 L72 39 L66 39 L71 28 Z" fill="#16181b"/>
          <path d="M76 16 L104 18 L105 32 L96 32 L76 25 Z" fill="#1c1e22"/>
        </svg>`;

      // GEAR & GRENADES
      case 'kevlar':
      case 'armor':
        return `<svg viewBox="0 0 80 50" class="buy-menu-img">
          <path d="M22 6 L32 6 L36 14 L44 14 L48 6 L58 6 L64 16 L62 44 L18 44 L16 16 Z" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
          <rect x="24" y="18" width="14" height="12" rx="2" fill="#0f172a" stroke="#475569" stroke-width="1"/>
          <rect x="42" y="18" width="14" height="12" rx="2" fill="#0f172a" stroke="#475569" stroke-width="1"/>
          <rect x="26" y="32" width="28" height="8" rx="2" fill="#0f172a" stroke="#475569" stroke-width="1"/>
          <text x="40" y="38" fill="#38bdf8" font-size="6" font-weight="bold" font-family="sans-serif" text-anchor="middle">KEVLAR</text>
        </svg>`;

      case 'helmet':
      case 'assaultsuit':
        return `<svg viewBox="0 0 80 50" class="buy-menu-img">
          <path d="M20 22 Q40 6 60 22 L62 30 Q40 33 18 30 Z" fill="#334155" stroke="#f59e0b" stroke-width="1.5"/>
          <rect x="36" y="14" width="8" height="8" rx="1" fill="#0f172a" stroke="#94a3b8" stroke-width="1"/>
          <rect x="22" y="24" width="10" height="3" fill="#1e293b"/>
          <path d="M26 30 L36 43 L44 43 L54 30" fill="none" stroke="#64748b" stroke-width="1.5"/>
          <text x="40" y="47" fill="#f59e0b" font-size="6" font-weight="bold" font-family="sans-serif" text-anchor="middle">HELMET</text>
        </svg>`;

      case 'defuser':
        return `<svg viewBox="0 0 80 50" class="buy-menu-img">
          <path d="M30 18 L40 8 L46 16 L36 24 Z" fill="#94a3b8" stroke="#475569" stroke-width="1.2"/>
          <path d="M50 18 L40 8 L34 16 L44 24 Z" fill="#cbd5e1" stroke="#475569" stroke-width="1.2"/>
          <circle cx="40" cy="18" r="3" fill="#eab308"/>
          <rect x="24" y="23" width="8" height="22" rx="3" fill="#0284c7" stroke="#0369a1" stroke-width="1.2"/>
          <rect x="48" y="23" width="8" height="22" rx="3" fill="#0284c7" stroke="#0369a1" stroke-width="1.2"/>
        </svg>`;

      case 'taser':
        return `<svg viewBox="0 0 80 50" class="buy-menu-img">
          <rect x="18" y="14" width="38" height="16" rx="2" fill="#eab308" stroke="#ca8a04" stroke-width="1.2"/>
          <rect x="14" y="17" width="5" height="10" fill="#1e293b"/>
          <path d="M38 30 L35 44 L25 44 L30 30 Z" fill="#1e293b"/>
          <text x="35" y="25" fill="#000" font-size="6" font-weight="bold" font-family="sans-serif">ZEUS</text>
        </svg>`;

      case 'flashbang':
        return `<svg viewBox="0 0 60 50" class="buy-menu-img">
          <rect x="20" y="18" width="20" height="26" rx="3" fill="#cbd5e1" stroke="#64748b" stroke-width="1.2"/>
          <rect x="24" y="12" width="12" height="6" fill="#475569"/>
          <path d="M26 12 L20 18 L20 38" fill="none" stroke="#334155" stroke-width="2"/>
          <circle cx="36" cy="12" r="4.5" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
          <text x="30" y="32" fill="#334155" font-size="5" font-weight="bold" font-family="sans-serif" text-anchor="middle">FLASH</text>
        </svg>`;

      case 'hegrenade':
        return `<svg viewBox="0 0 60 50" class="buy-menu-img">
          <ellipse cx="30" cy="30" rx="14" ry="15" fill="#4d5d3e" stroke="#2d3724" stroke-width="1.2"/>
          <line x1="16" y1="30" x2="44" y2="30" stroke="#2d3724" stroke-width="1"/>
          <line x1="30" y1="15" x2="30" y2="45" stroke="#2d3724" stroke-width="1"/>
          <rect x="26" y="9" width="8" height="6" fill="#64748b"/>
          <path d="M28 9 L22 15 L22 34" fill="none" stroke="#334155" stroke-width="2"/>
          <circle cx="36" cy="10" r="4" fill="none" stroke="#eab308" stroke-width="1.5"/>
        </svg>`;

      case 'smokegrenade':
        return `<svg viewBox="0 0 60 50" class="buy-menu-img">
          <rect x="20" y="17" width="20" height="28" rx="2" fill="#64748b" stroke="#334155" stroke-width="1.2"/>
          <rect x="20" y="27" width="20" height="6" fill="#f8fafc"/>
          <rect x="24" y="11" width="12" height="6" fill="#475569"/>
          <circle cx="36" cy="11" r="4" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
          <text x="30" y="32" fill="#334155" font-size="5" font-weight="bold" font-family="sans-serif" text-anchor="middle">SMOKE</text>
        </svg>`;

      case 'molotov':
      case 'incgrenade':
        return `<svg viewBox="0 0 60 50" class="buy-menu-img">
          <rect x="22" y="24" width="16" height="22" rx="3" fill="#b45309" stroke="#78350f" stroke-width="1.2"/>
          <rect x="26" y="14" width="8" height="10" fill="#d97706"/>
          <rect x="28" y="9" width="4" height="6" fill="#f8fafc"/>
          <path d="M30 4 Q35 9 30 13 Q25 9 30 4 Z" fill="#ef4444"/>
          <circle cx="30" cy="8" r="2.5" fill="#f59e0b"/>
        </svg>`;

      case 'decoy':
        return `<svg viewBox="0 0 60 50" class="buy-menu-img">
          <rect x="22" y="18" width="16" height="26" rx="2" fill="#71717a" stroke="#3f3f46" stroke-width="1.2"/>
          <rect x="25" y="12" width="10" height="6" fill="#52525b"/>
          <text x="30" y="32" fill="#fff" font-size="5" font-weight="bold" font-family="sans-serif" text-anchor="middle">DECOY</text>
        </svg>`;

      case 'knife':
        return `<svg viewBox="0 0 100 44" class="buy-menu-img">
          <path d="M12 21 L36 14 L62 14 L56 26 L22 26 Z" fill="#cbd5e1" stroke="#64748b" stroke-width="1.2"/>
          <rect x="62" y="12" width="4" height="18" fill="#334155"/>
          <rect x="66" y="16" width="24" height="10" rx="2" fill="#1e293b" stroke="#0f172a" stroke-width="1"/>
        </svg>`;

      default:
        return `<svg viewBox="0 0 100 44" class="buy-menu-img">
          <rect x="20" y="16" width="60" height="12" rx="2" fill="#334155"/>
        </svg>`;
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
    ctTbody.innerHTML = '';
    tTbody.innerHTML = '';

    const localCallsign = gameManager.player.name || window.cs2PlayerCallsign || 'YOU';
    const playerRow = document.createElement('tr');
    playerRow.className = `is-you ${gameManager.player.health.get() <= 0 ? 'is-dead' : ''}`;
    playerRow.innerHTML = `
      <td class="col-status">${gameManager.player.health.get() > 0 ? '●' : '💀'}</td>
      <td class="col-name">${localCallsign} (YOU)</td>
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
      const rName = p.name || `Operator_${id.substring(0, 5)}`;
      row.innerHTML = `
        <td class="col-status">${p.health > 0 ? '●' : '💀'}</td>
        <td class="col-name">${rName}</td>
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
});
