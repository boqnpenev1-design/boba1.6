const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require(path.join(__dirname, '../../cs2-server/node_modules/ws'));
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CLIENT_URL = 'http://localhost:8000/index.html?debug=1';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function connectCDP(port, name) {
  let list = [];
  for (let i = 0; i < 20; i++) {
    try {
      list = await getJson(port, '/json/list');
      if (list && list.length > 0) break;
    } catch (e) {}
    await sleep(500);
  }
  const page = list.find(p => p.type === 'page');
  if (!page) throw new Error(`No page target on port ${port}`);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let idCounter = 1;
  const pending = new Map();
  const errors = [];
  const warnings = [];

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const type = msg.params.type;
      const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
      if (type === 'error') {
        errors.push(`[${name} ERROR] ${text}`);
      } else if (type === 'warning') {
        warnings.push(`[${name} WARN] ${text}`);
      }
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const text = msg.params.exceptionDetails ? msg.params.exceptionDetails.text : 'Unknown exception';
      errors.push(`[${name} EXCEPTION] ${text}`);
    }
    if (msg.method === 'Log.entryAdded') {
      const entry = msg.params.entry;
      if (entry.level === 'error') {
        errors.push(`[${name} LOG_ERR] ${entry.text}`);
      } else if (entry.level === 'warning') {
        warnings.push(`[${name} LOG_WARN] ${entry.text}`);
      }
    }
  });

  function send(method, params = {}) {
    const id = idCounter++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Runtime.enable');
  await send('Log.enable');

  async function evaluate(expr) {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return res && res.result ? res.result.value : null;
  }

  async function captureScreenshot(filepath) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    if (res && res.data) {
      fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
    }
  }

  return { name, ws, send, evaluate, captureScreenshot, errors, warnings };
}

async function run() {
  const shotsDir = path.join(__dirname, '../screenshots');
  if (!fs.existsSync(shotsDir)) fs.mkdirSync(shotsDir, { recursive: true });

  console.log('[SCREENSHOT-VERIFY] Spawning Chrome instances...');
  const p1 = spawn(CHROME_PATH, [
    `--remote-debugging-port=9222`,
    '--user-data-dir=C:\\temp\\chrome-test-profile-1',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,720',
    '--window-position=50,50',
    CLIENT_URL
  ], { detached: false });

  const p2 = spawn(CHROME_PATH, [
    `--remote-debugging-port=9223`,
    '--user-data-dir=C:\\temp\\chrome-test-profile-2',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,720',
    '--window-position=650,50',
    CLIENT_URL
  ], { detached: false });

  try {
    await sleep(2500);
    const w1 = await connectCDP(9222, 'WIN1_T');
    const w2 = await connectCDP(9223, 'WIN2_CT');
    console.log('[SCREENSHOT-VERIFY] Connected to both windows!');

    await sleep(2500);
    // Join T
    await w1.evaluate(`
      (function() {
        const inp = document.getElementById('player-callsign-input');
        if (inp) inp.value = 'TEST_T';
        window.cs2PlayerCallsign = 'TEST_T';
        if (window.csGameManager) window.csGameManager.connectToServer('dust2');
      })()
    `);
    await sleep(1500);
    await w1.evaluate(`
      (function() {
        if (window.csGameManager) window.csGameManager.chooseTeam('T');
      })()
    `);

    // Join CT
    await w2.evaluate(`
      (function() {
        const inp = document.getElementById('player-callsign-input');
        if (inp) inp.value = 'TEST_CT';
        window.cs2PlayerCallsign = 'TEST_CT';
        if (window.csGameManager) window.csGameManager.connectToServer('dust2');
      })()
    `);
    await sleep(1500);
    await w2.evaluate(`
      (function() {
        if (window.csGameManager) window.csGameManager.chooseTeam('CT');
      })()
    `);

    console.log('[SCREENSHOT-VERIFY] Waiting 10s for map, weapons, and 3D scenes to settle...');
    await sleep(10000);

    const shot1 = path.join(shotsDir, 'win1_t_live.png');
    const shot2 = path.join(shotsDir, 'win2_ct_live.png');
    await w1.captureScreenshot(shot1);
    await w2.captureScreenshot(shot2);
    console.log('[SCREENSHOT-VERIFY] Screenshots saved to:', shot1, shot2);

    const overlay1 = await w1.evaluate(`document.getElementById('cs2-debug-overlay') ? document.getElementById('cs2-debug-overlay').innerText : 'NO_OVERLAY'`);
    const overlay2 = await w2.evaluate(`document.getElementById('cs2-debug-overlay') ? document.getElementById('cs2-debug-overlay').innerText : 'NO_OVERLAY'`);

    console.log('\n[WIN1 OVERLAY]:\n' + overlay1);
    console.log('\n[WIN2 OVERLAY]:\n' + overlay2);
    console.log(`WIN1 Errors: ${w1.errors.length}, Warnings: ${w1.warnings.length}`);
    if (w1.errors.length) console.log('WIN1 Errors:', w1.errors);
    if (w1.warnings.length) console.log('WIN1 Warnings:', w1.warnings);
    console.log(`WIN2 Errors: ${w2.errors.length}, Warnings: ${w2.warnings.length}`);
    if (w2.errors.length) console.log('WIN2 Errors:', w2.errors);
    if (w2.warnings.length) console.log('WIN2 Warnings:', w2.warnings);

    w1.ws.close();
    w2.ws.close();
    p1.kill();
    p2.kill();
  } catch (err) {
    console.error('[SCREENSHOT-VERIFY FATAL]:', err);
    try { p1.kill(); } catch (e) {}
    try { p2.kill(); } catch (e) {}
  }
}

run();
