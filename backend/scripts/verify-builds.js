const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const frontendDir = path.join(rootDir, 'frontend');
const backendDir = path.join(rootDir, 'backend');

function runCommand(command, cwd) {
  console.log(`\n🤖 Running: "${command}" inside ${path.basename(cwd)}...`);
  try {
    execSync(command, { cwd, stdio: 'inherit' });
    console.log(`✅ Completed: "${command}"`);
  } catch (error) {
    console.error(`❌ Failed: "${command}"`);
    process.exit(1);
  }
}

console.log('🏁 Starting Complete Build and Test Verification Process...');

// 1. Build Frontend
runCommand('npm run build', frontendDir);

// 2. Build Backend
runCommand('npm run build', backendDir);

// 3. Run Backend Tests
runCommand('npm run test', backendDir);

// 4. Verify Built Artifacts
console.log('\n🔍 Verifying built artifacts existence and integrity...');

const frontendIndexHtml = path.join(frontendDir, 'dist', 'index.html');
const backendMainJs = path.join(backendDir, 'dist', 'main.js');

if (!fs.existsSync(frontendIndexHtml)) {
  console.error(`❌ ERROR: Frontend build file is missing at: ${frontendIndexHtml}`);
  process.exit(1);
}

const frontendSize = fs.statSync(frontendIndexHtml).size;
if (frontendSize === 0) {
  console.error(`❌ ERROR: Frontend index.html is empty!`);
  process.exit(1);
}
console.log(`✅ Frontend index.html verified successfully (${frontendSize} bytes).`);

if (!fs.existsSync(backendMainJs)) {
  console.error(`❌ ERROR: Backend build file is missing at: ${backendMainJs}`);
  process.exit(1);
}

const backendSize = fs.statSync(backendMainJs).size;
if (backendSize === 0) {
  console.error(`❌ ERROR: Backend main.js is empty!`);
  process.exit(1);
}
console.log(`✅ Backend main.js verified successfully (${backendSize} bytes).`);

console.log('\n🎉 SUCCESS: All builds, tests, and integrity checks passed successfully!');
process.exit(0);
