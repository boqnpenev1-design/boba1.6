const fs = require('fs');
const { execSync } = require('child_process');

let sha = '';
try {
  sha = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  sha = Date.now().toString(36);
}

const htmlPath = 'index.html';
if (fs.existsSync(htmlPath)) {
  let content = fs.readFileSync(htmlPath, 'utf8');
  content = content.replace(/\?v=[0-9a-zA-Z._-]+/g, `?v=${sha}`);
  content = content.replace(/BUILD_ID = ['"][^'"]+['"]/g, `BUILD_ID = '${sha}'`);
  fs.writeFileSync(htmlPath, content, 'utf8');
  console.log(`[BUILD] index.html stamped with SHA: ${sha}`);
} else {
  console.warn('[BUILD] index.html not found');
}

