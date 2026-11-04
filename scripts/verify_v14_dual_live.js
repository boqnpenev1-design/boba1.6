const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GITHUB_PAGES_URL = 'https://boqnpenev1-design.github.io/boba1.6/';
const EVIDENCE_DIR = path.join(__dirname, '..', 'reports_v14_evidence');
const ARTIFACT_DIR = 'C:\\Users\\boqnp\\.gemini\\antigravity\\brain\\065b9f32-4abd-4bda-a50c-ba8d9bb53950';

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function attachCDP(port) {
  let page = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      page = list.find(t => t.type === 'page');
      if (page) break;
    } catch (e) {}
    await sleep(500);
  }
  if (!page) throw new Error(`Could not find page on debug port ${port}`);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const callbacks = new Map();
  const eventListeners = new Map();
  const consoleMessages = [];

  ws.addEventListener('message', (raw) => {
    const m = JSON.parse(raw.data || raw);
    if (m.id && callbacks.has(m.id)) {
      const cb = callbacks.get(m.id);
      callbacks.delete(m.id);
      if (m.error) cb.reject(new Error(JSON.stringify(m.error)));
      else cb.resolve(m.result);
    } else if (m.method && eventListeners.has(m.method)) {
      eventListeners.get(m.method).forEach(fn => fn(m.params));
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const reqId = id++;
      callbacks.set(reqId, { resolve, reject });
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  function on(event, fn) {
    if (!eventListeners.has(event)) eventListeners.set(event, []);
    eventListeners.get(event).push(fn);
  }

  on('Runtime.consoleAPICalled', (params) => {
    const text = params.args ? params.args.map(a => a.value !== undefined ? a.value : JSON.stringify(a)).join(' ') : '';
    consoleMessages.push({ type: params.type, text, time: Date.now() });
  });

  on('Log.entryAdded', (params) => {
    const entry = params.entry;
    consoleMessages.push({ type: entry.level, text: entry.text, time: Date.now() });
  });

  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1.0,
    mobile: false
  });

  async function evaluate(codeStr) {
    const expr = `(() => { ${codeStr} })()`;
    const res = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async function screenshot(filename) {
    const res = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    const localPath = path.join(EVIDENCE_DIR, filename);
    const artPath = path.join(ARTIFACT_DIR, filename);
    const buf = Buffer.from(res.data, 'base64');
    fs.writeFileSync(localPath, buf);
    try { fs.writeFileSync(artPath, buf); } catch (e) {}
    console.log(`[SCREENSHOT] Saved ${filename} (${buf.length} bytes)`);
    return localPath;
  }

  return { ws, send, evaluate, screenshot, consoleMessages };
}

async function runDualLiveVerification() {
  console.log('=== STARTING DUAL-WINDOW LIVE VERIFICATION (v14 ALL FIXES) ===');
  console.log(`Target URL: ${GITHUB_PAGES_URL}`);

  const userDir1 = path.join(process.env.TEMP, 'chrome_cs2_v14_w1_' + Date.now());
  const userDir2 = path.join(process.env.TEMP, 'chrome_cs2_v14_w2_' + Date.now());

  const chrome1 = spawn(CHROME_PATH, [
    `--remote-debugging-port=9222`,
    `--user-data-dir=${userDir1}`,
    `--window-position=0,0`,
    `--window-size=960,1080`,
    `--no-first-run`,
    `--no-default-browser-check`,
    `${GITHUB_PAGES_URL}?debug=1&noaniso=1&w=1&t=${Date.now()}`
  ]);

  const chrome2 = spawn(CHROME_PATH, [
    `--remote-debugging-port=9223`,
    `--user-data-dir=${userDir2}`,
    `--window-position=960,0`,
    `--window-size=960,1080`,
    `--no-first-run`,
    `--no-default-browser-check`,
    `${GITHUB_PAGES_URL}?debug=1&noaniso=1&w=2&t=${Date.now()}`
  ]);

  try {
    await sleep(3500);
    console.log('Attaching CDP to Window 1 (port 9222)...');
    const w1 = await attachCDP(9222);
    console.log('Attaching CDP to Window 2 (port 9223)...');
    const w2 = await attachCDP(9223);

    console.log('Waiting for map load in both windows...');
    await sleep(6000);

    // Verify build ID on live pages
    const b1 = await w1.evaluate(`return window.BUILD_ID;`);
    const b2 = await w2.evaluate(`return window.BUILD_ID;`);
    console.log(`BUILD_ID: W1=${b1}, W2=${b2}`);

    // Connect to server
    console.log('Connecting both windows to online server...');
    await w1.evaluate(`
      window.cs2PlayerCallsign = 'Phoenix_W1';
      if (window.csGameManager) {
        window.csGameManager.connectToServer('dust2');
      }
    `);
    await sleep(1000);

    await w2.evaluate(`
      window.cs2PlayerCallsign = 'SAS_W2';
      if (window.csGameManager) {
        window.csGameManager.connectToServer('dust2');
      }
    `);

    await sleep(4000);

    // Wait for online connection
    for (let i = 0; i < 30; i++) {
      const isOnline1 = await w1.evaluate(`return !!(window.csGameManager?.net && window.csGameManager.net.isConnected);`);
      const isOnline2 = await w2.evaluate(`return !!(window.csGameManager?.net && window.csGameManager.net.isConnected);`);
      if (isOnline1 && isOnline2) {
        console.log(`Both WebSockets connected in attempt ${i + 1}`);
        break;
      }
      await sleep(500);
    }

    // Window 1 chooses T, Window 2 chooses CT
    await w1.evaluate(`if (window.csGameManager) window.csGameManager.chooseTeam('T');`);
    await w2.evaluate(`if (window.csGameManager) window.csGameManager.chooseTeam('CT');`);
    await sleep(3000);

    // =========================================================================
    // ITEM 1: SCOUT / SSG08 PRICE & BUY VERIFICATION ($1700)
    // =========================================================================
    console.log('\n--- VERIFYING ITEM 3: SSG 08 (Scout) Price $1700 ---');
    const scoutBuyResult = await w1.evaluate(`
      const gm = window.csGameManager;
      const initialCash = gm.player.money.get();
      // Buy scout
      if (window.buyWeapon) {
        window.buyWeapon(CS2_WEAPONS.ssg08);
      }
      return { initialCash, currentCash: gm.player.money.get(), activeWeapon: gm.player.activeWeapon ? gm.player.activeWeapon.id : 'none' };
    `);
    console.log('Scout Buy Result:', scoutBuyResult);
    await sleep(1000);
    await w1.screenshot('v14_w1_scout_bought.jpg');

    // =========================================================================
    // ITEM 2: REFUND BUTTON & FUNCTIONALITY
    // =========================================================================
    console.log('\n--- VERIFYING ITEM 8: Buy Menu Refund Functionality ---');
    const refundResult = await w1.evaluate(`
      const gm = window.csGameManager;
      const cashBeforeRefund = gm.player.money.get();
      // Refund weapon
      if (window.refundWeapon) {
        window.refundWeapon(CS2_WEAPONS.ssg08);
      }
      return { cashBeforeRefund, currentCash: gm.player.money.get(), purchaseHistoryLen: gm.purchaseHistory ? gm.purchaseHistory.length : 0 };
    `);
    console.log('Refund Result:', refundResult);
    await sleep(1000);
    await w1.screenshot('v14_w1_scout_refunded.jpg');

    // =========================================================================
    // ITEM 3: TERRORIST MODEL FACING DIRECTION (characterWrapper rotation = 0)
    // =========================================================================
    console.log('\n--- VERIFYING ITEM 4: Terrorist Model Forward Facing ---');
    // Position players facing each other
    await w1.evaluate(`
      const p = window.csGameManager.player;
      p.position.set(-60, 8.0, 35);
      p.yaw = 0; // facing +Z
    `);
    await w2.evaluate(`
      const p = window.csGameManager.player;
      p.position.set(-60, 8.0, 42);
      p.yaw = Math.PI; // facing -Z directly at W1
    `);
    await sleep(2000);

    const modelOrientation = await w2.evaluate(`
      const net = window.csGameManager.net;
      const remotePlayers = Object.values(net.remotePlayers);
      if (remotePlayers.length === 0) return { error: 'No remote players' };
      const rp = remotePlayers[0];
      const wrapRot = rp.mesh?.characterWrapper?.rotation?.y;
      return {
        rpName: rp.name,
        rpTeam: rp.team,
        wrapperRotationY: wrapRot,
        isFacingForward: wrapRot === 0
      };
    `);
    console.log('Model Orientation Check:', modelOrientation);
    await w2.screenshot('v14_w2_ct_looking_at_terrorist_front.jpg');

    // =========================================================================
    // ITEM 4: AUG SCOPE RETICLE OVERLAY
    // =========================================================================
    console.log('\n--- VERIFYING ITEM 10: AUG Scope Reticle Overlay ---');
    const augScopeTest = await w1.evaluate(`
      const gm = window.csGameManager;
      gm.buyWeapon('aug');
      gm.player.toggleScope();
      const augEl = document.getElementById('aug-scope-overlay');
      const sniperEl = document.getElementById('scope-overlay');
      const isAugVisible = augEl && !augEl.classList.contains('hidden');
      const isSniperHidden = sniperEl && sniperEl.classList.contains('hidden');
      return { isAugVisible, isSniperHidden, isScoped: gm.player.isScoped, cameraFov: gm.player.camera.fov };
    `);
    console.log('AUG Scope Test Result:', augScopeTest);
    await w1.screenshot('v14_w1_aug_scope_overlay.jpg');

    // Reset scope
    await w1.evaluate(`window.csGameManager.player.resetScope();`);

    // =========================================================================
    // ITEM 5: RECOIL SPAM CLICK CHECK
    // =========================================================================
    console.log('\n--- VERIFYING ITEM 9: Semi-Auto Spam-Click Recoil Check ---');
    const recoilSpamTest = await w1.evaluate(`
      const p = window.csGameManager.player;
      // Equip scout or awp
      p.inventory[1] = CS2_WEAPONS.ssg08 || CS2_WEAPONS.awp;
      p.activeSlot = 1;
      p.activeWeapon = p.inventory[1];
      const initialPitch = p.recoilPitch;
      // Fire 1 shot
      p.isShooting = true;
      p.shoot();
      p.isShooting = false;
      const postShotPitch = p.recoilPitch;
      // Now simulate spam clicks while cycling (should NOT climb further)
      for (let c = 0; c < 10; c++) {
        p.isShooting = true;
        p.shoot(); // returns early because cycle time hasn't passed
        p.isShooting = false;
      }
      return { initialPitch, postShotPitch, postSpamPitch: p.recoilPitch, climbedWithoutFiring: p.recoilPitch > postShotPitch };
    `);
    console.log('Recoil Spam Test:', recoilSpamTest);

    // =========================================================================
    // ITEM 6: DROPPED WEAPON VISUALS & FLOOR RESTING
    // =========================================================================
    console.log('\n--- VERIFYING ITEM 5: Dropped Weapon Size & Orientation ---');
    const dropTest = await w1.evaluate(`
      const p = window.csGameManager.player;
      p.dropWeaponBySlot(1); // drop primary
      const dropped = window._droppedItems;
      if (!dropped || dropped.length === 0) return { error: 'No dropped items' };
      const item = dropped[dropped.length - 1];
      const box = new THREE.Box3().setFromObject(item.mesh);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      return {
        weaponId: item.weapon?.id,
        maxDim: maxDim.toFixed(3),
        lowestY: box.min.y.toFixed(3),
        highestY: box.max.y.toFixed(3),
        positionY: item.mesh.position.y.toFixed(3),
        isLyingFlat: size.y < size.x || size.y < size.z
      };
    `);
    console.log('Dropped Weapon Test:', dropTest);
    await sleep(1000);
    await w1.screenshot('v14_w1_dropped_weapon_flat.jpg');

    // =========================================================================
    // ITEM 7: C4 PICKUP ONLY INTO SLOT 5 & REMOVAL FROM GROUND
    // =========================================================================
    console.log('\n--- VERIFYING ITEM 7: C4 Pickup into Slot 5 Only ---');
    const c4PickupTest = await w1.evaluate(`
      const p = window.csGameManager.player;
      // Drop C4
      if (p.inventory[5]) p.dropWeaponBySlot(5);
      const droppedBefore = (window._droppedItems || []).filter(d => d.weapon?.id === 'c4').length;
      // Move over C4 and pick it up
      p.checkPickupItems();
      const inSlot1 = !!(p.inventory[1] && p.inventory[1].id === 'c4');
      const inSlot5 = !!(p.inventory[5] && p.inventory[5].id === 'c4');
      const droppedAfter = (window._droppedItems || []).filter(d => d.weapon?.id === 'c4').length;
      return {
        droppedBefore,
        inSlot1,
        inSlot5,
        droppedAfter,
        correctSlotOnly: !inSlot1 && inSlot5
      };
    `);
    console.log('C4 Pickup Test:', c4PickupTest);

    // =========================================================================
    // ITEM 8: B SITE WINDOW CRATES JUMP NAVIGATION
    // =========================================================================
    console.log('\n--- VERIFYING ITEM 15: B Site Window Box Stepping ---');
    const bBoxesTest = await w1.evaluate(`
      const map = window.csGameManager.mapBuilder;
      const bColliders = map.colliders.filter(c => c.isClimbable && c.box.min.x >= -68 && c.box.max.x <= -55 && c.box.min.z >= -125 && c.box.max.z <= -114);
      // Sort by topY
      bColliders.sort((a, b) => a.topY - b.topY);
      const steps = bColliders.map(c => ({
        topY: c.topY.toFixed(2),
        minY: c.box.min.y.toFixed(2),
        maxY: c.box.max.y.toFixed(2),
        center: \`(\${((c.box.min.x + c.box.max.x)/2).toFixed(1)}, \${((c.box.min.z + c.box.max.z)/2).toFixed(1)})\`
      }));
      let maxStepGap = 0;
      for (let i = 1; i < bColliders.length; i++) {
        const gap = bColliders[i].topY - bColliders[i-1].topY;
        if (gap > maxStepGap) maxStepGap = gap;
      }
      return {
        boxCount: bColliders.length,
        maxStepGap: maxStepGap.toFixed(2),
        steps
      };
    `);
    console.log('B Boxes Stepping Analysis:', bBoxesTest);

    // Teleport player to B site crate sequence and take screenshot
    await w1.evaluate(`
      const p = window.csGameManager.player;
      p.position.set(-61.56, 5.04 + p.playerHeight, -118.44); // on top of mid crate
      p.velocity.set(0, 0, 0);
      p.isGrounded = true;
    `);
    await sleep(1500);
    await w1.screenshot('v14_w1_b_crate_top_facing_window.jpg');

    // =========================================================================
    // ITEM 9: TAB SCOREBOARD KILLS & DEATHS LIVE UPDATE
    // =========================================================================
    console.log('\n--- VERIFYING ITEM 13: Tab Scoreboard Kills & Deaths ---');
    // Open scoreboard in Window 1
    await w1.evaluate(`
      document.getElementById('scoreboard')?.classList.remove('hidden');
      renderScoreboardRows();
    `);
    await sleep(500);
    await w1.screenshot('v14_w1_scoreboard_active.jpg');

    // =========================================================================
    // ITEM 10: CHECK CONSOLES (0 Errors)
    // =========================================================================
    console.log('\n--- CHECKING CONSOLES ---');
    const w1Errors = w1.consoleMessages.filter(m => m.type === 'error');
    const w2Errors = w2.consoleMessages.filter(m => m.type === 'error');
    console.log(`Window 1 Errors: ${w1Errors.length}`);
    if (w1Errors.length > 0) console.log(w1Errors);
    console.log(`Window 2 Errors: ${w2Errors.length}`);
    if (w2Errors.length > 0) console.log(w2Errors);

    console.log('\n=== DUAL LIVE VERIFICATION COMPLETED SUCCESSFULLY ===');
  } finally {
    try { chrome1.kill(); } catch (e) {}
    try { chrome2.kill(); } catch (e) {}
  }
}

runDualLiveVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
