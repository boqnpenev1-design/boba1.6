const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const targetUrl = 'https://boqnpenev1-design.github.io/boba1.6/?debug=1';

const dir1 = path.join(process.env.TEMP || 'C:\\Temp', 'cs2_dual_w1');
const dir2 = path.join(process.env.TEMP || 'C:\\Temp', 'cs2_dual_w2');

try { fs.rmSync(dir1, { recursive: true, force: true }); } catch (e) {}
try { fs.rmSync(dir2, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(dir1, { recursive: true });
fs.mkdirSync(dir2, { recursive: true });

console.log('[DUAL-WINDOW] Launching Chrome Window 1 on port 9222...');
const p1 = spawn(chromePath, [
  '--remote-debugging-port=9222',
  `--user-data-dir=${dir1}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--ignore-certificate-errors',
  '--window-position=0,0',
  '--window-size=960,1040',
  '--autoplay-policy=no-user-gesture-required',
  targetUrl
], { stdio: 'ignore' });

console.log('[DUAL-WINDOW] Launching Chrome Window 2 on port 9223...');
const p2 = spawn(chromePath, [
  '--remote-debugging-port=9223',
  `--user-data-dir=${dir2}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--ignore-certificate-errors',
  '--window-position=960,0',
  '--window-size=960,1040',
  '--autoplay-policy=no-user-gesture-required',
  targetUrl
], { stdio: 'ignore' });

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getWsUrl(port) {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const list = await res.json();
      const page = list.find(t => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(500);
  }
  throw new Error(`Could not get ws url on port ${port}`);
}

async function connectCDP(port, name) {
  const wsUrl = await getWsUrl(port);
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();
  const errors = [];
  const logs = [];

  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const reqId = id++;
      callbacks.set(reqId, resolve);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      callbacks.get(data.id)(data.result);
      callbacks.delete(data.id);
    }
    if (data.method === 'Runtime.consoleAPICalled') {
      const { type, args } = data.params;
      const text = args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
      if (type === 'error') {
        errors.push(text);
        console.error(`[${name} CONSOLE_ERROR] ${text}`);
      } else {
        logs.push(`[${type}] ${text}`);
      }
    } else if (data.method === 'Log.entryAdded') {
      if (data.params.entry.level === 'error') {
        const text = data.params.entry.text;
        errors.push(text);
        console.error(`[${name} LOG_ERROR] ${text}`);
      }
    }
  };

  await send('Runtime.enable');
  await send('Log.enable');

  async function evaluate(expr) {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return res && res.result ? res.result.value : null;
  }

  return { name, ws, send, evaluate, errors, logs };
}

async function run() {
  try {
    console.log('[DUAL-WINDOW] Connecting to CDP sessions...');
    const w1 = await connectCDP(9222, 'WIN1_T');
    const w2 = await connectCDP(9223, 'WIN2_CT');
    console.log('[DUAL-WINDOW] Connected to both windows!');

    await sleep(2500);

    // Join Window 1
    console.log('[DUAL-WINDOW] Joining Window 1 as PLAYER_T...');
    await w1.evaluate(`
      (function() {
        const inp = document.getElementById('player-callsign-input');
        if (inp) inp.value = 'PLAYER_T';
        window.cs2PlayerCallsign = 'PLAYER_T';
        if (window.csGameManager) {
          window.csGameManager.connectToServer('dust2');
        }
      })()
    `);

    await sleep(1000);
    await w1.evaluate(`
      (function() {
        if (window.csGameManager) {
          window.csGameManager.chooseTeam('T');
        }
      })()
    `);

    // Join Window 2
    console.log('[DUAL-WINDOW] Joining Window 2 as PLAYER_CT...');
    await w2.evaluate(`
      (function() {
        const inp = document.getElementById('player-callsign-input');
        if (inp) inp.value = 'PLAYER_CT';
        window.cs2PlayerCallsign = 'PLAYER_CT';
        if (window.csGameManager) {
          window.csGameManager.connectToServer('dust2');
        }
      })()
    `);

    await sleep(1000);
    await w2.evaluate(`
      (function() {
        if (window.csGameManager) {
          window.csGameManager.chooseTeam('CT');
        }
      })()
    `);

    console.log('[DUAL-WINDOW] Waiting 5s for Dust 2 map & authentic models to finish loading in both windows...');
    await sleep(5000);

    console.log('[DUAL-WINDOW] Monitoring for 60 seconds of live multi-window gameplay...');
    const startTime = Date.now();
    let sampleOverlayW1 = '';
    let sampleOverlayW2 = '';

    while (Date.now() - startTime < 60000) {
      await sleep(10000);
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      const overlay1 = await w1.evaluate(`document.getElementById('cs2-debug-overlay') ? document.getElementById('cs2-debug-overlay').innerText : 'NO_OVERLAY'`);
      const overlay2 = await w2.evaluate(`document.getElementById('cs2-debug-overlay') ? document.getElementById('cs2-debug-overlay').innerText : 'NO_OVERLAY'`);
      sampleOverlayW1 = overlay1;
      sampleOverlayW2 = overlay2;

      console.log(`\n--- [${elapsed}s] OVERLAY WIN1 (T) ---`);
      console.log(overlay1);
      console.log(`--- [${elapsed}s] OVERLAY WIN2 (CT) ---`);
      console.log(overlay2);
      console.log(`WIN1 Errors: ${w1.errors.length} | WIN2 Errors: ${w2.errors.length}`);
    }

    console.log('\n================ FINAL RESULTS ================');
    console.log(`WIN1 (T) Total Red Errors: ${w1.errors.length}`);
    if (w1.errors.length > 0) {
      console.log('WIN1 Errors list:');
      w1.errors.forEach(e => console.log('  ' + e));
    }
    console.log(`WIN2 (CT) Total Red Errors: ${w2.errors.length}`);
    if (w2.errors.length > 0) {
      console.log('WIN2 Errors list:');
      w2.errors.forEach(e => console.log('  ' + e));
    }

    console.log('\n[WIN1 FINAL OVERLAY]');
    console.log(sampleOverlayW1);
    console.log('\n[WIN2 FINAL OVERLAY]');
    console.log(sampleOverlayW2);

    // Collect weapon diagnostics
    const diag1 = await w1.evaluate(`window.__heldWeaponDiagnostics`);
    const diag2 = await w2.evaluate(`window.__heldWeaponDiagnostics`);
    console.log('\n[WIN1 WEAPON DIAGNOSTICS]:', JSON.stringify(diag1, null, 2));
    console.log('\n[WIN2 WEAPON DIAGNOSTICS]:', JSON.stringify(diag2, null, 2));

    w1.ws.close();
    w2.ws.close();
    p1.kill();
    p2.kill();
    console.log('[DUAL-WINDOW] Test completed successfully.');
  } catch (err) {
    console.error('[DUAL-WINDOW FATAL]:', err);
    try { p1.kill(); } catch (e) {}
    try { p2.kill(); } catch (e) {}
  }
}

run();
