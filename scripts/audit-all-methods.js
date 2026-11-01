const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, '..', 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

// Extract defined methods from CS2GameManager
const gameJs = fs.readFileSync(path.join(jsDir, 'game.js'), 'utf8');
const gmMethods = new Set();
const gmMethodMatches = gameJs.matchAll(/^\s*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/gm);
for (const m of gmMethodMatches) {
  if (!['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(m[1])) {
    gmMethods.add(m[1]);
  }
}

// Find all calls to this.gm.<method> or gm.<method> across all files
const callRegex = /(?:this\.gm|gm|gameManager|window\.csGameManager)\.([a-zA-Z0-9_$]+)\s*\(/g;
const calls = [];
const missing = new Set();

for (const f of files) {
  const content = fs.readFileSync(path.join(jsDir, f), 'utf8');
  let m;
  while ((m = callRegex.exec(content)) !== null) {
    const method = m[1];
    calls.push({ file: f, method });
    if (!gmMethods.has(method)) {
      missing.add(method);
    }
  }
}

console.log('=== CS2GameManager Method Audit ===');
console.log('Total CS2GameManager methods defined:', gmMethods.size);
console.log('Total calls across js/*.js:', calls.length);
console.log('Missing methods detected:', Array.from(missing));

if (missing.size > 0) {
  console.log('\nDetails of missing method calls:');
  calls.filter(c => missing.has(c.method)).forEach(c => {
    console.log(`  - File: ${c.file} -> Method: ${c.method}`);
  });
} else {
  console.log('\nALL CS2GameManager METHODS ARE PRESENT AND VALID.');
}
