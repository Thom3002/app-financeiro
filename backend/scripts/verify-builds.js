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

function verifyFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ERROR: ${label} is missing at: ${filePath}`);
    process.exit(1);
  }
  const size = fs.statSync(filePath).size;
  if (size === 0) {
    console.error(`❌ ERROR: ${label} is empty (0 bytes)!`);
    process.exit(1);
  }
  console.log(`✅ ${label} verified successfully (${size} bytes).`);
  return size;
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

// 4a. Frontend
const frontendIndexHtml = path.join(frontendDir, 'dist', 'index.html');
verifyFile(frontendIndexHtml, 'Frontend index.html');

// Check that Vite generated at least one JS asset (the main bundle)
const frontendAssetsDir = path.join(frontendDir, 'dist', 'assets');
if (!fs.existsSync(frontendAssetsDir)) {
  console.error(`❌ ERROR: Frontend assets directory is missing at: ${frontendAssetsDir}`);
  process.exit(1);
}
const assetFiles = fs.readdirSync(frontendAssetsDir);
const jsAssets = assetFiles.filter(f => f.endsWith('.js'));
const cssAssets = assetFiles.filter(f => f.endsWith('.css'));
if (jsAssets.length === 0) {
  console.error(`❌ ERROR: No JS bundles found in frontend/dist/assets! The Vite build may be broken.`);
  process.exit(1);
}
if (cssAssets.length === 0) {
  console.error(`❌ ERROR: No CSS bundles found in frontend/dist/assets! The Vite build may be broken.`);
  process.exit(1);
}
console.log(`✅ Frontend assets verified: ${jsAssets.length} JS bundle(s), ${cssAssets.length} CSS bundle(s).`);

// Check that the index.html references the generated assets (not empty body)
const indexContent = fs.readFileSync(frontendIndexHtml, 'utf8');
if (!indexContent.includes('<script') || !indexContent.includes('assets/')) {
  console.error(`❌ ERROR: Frontend index.html does not reference Vite-generated assets. The build may be corrupt.`);
  console.error(`   Content preview: ${indexContent.substring(0, 200)}`);
  process.exit(1);
}
console.log(`✅ Frontend index.html correctly references bundled assets.`);

// 4b. Backend NestJS compiled output
const backendMainJsSrc = path.join(backendDir, 'dist', 'src', 'main.js');
const backendMainJs = path.join(backendDir, 'dist', 'main.js');

let resolvedBackendMainJs = null;
if (fs.existsSync(backendMainJsSrc)) {
  resolvedBackendMainJs = backendMainJsSrc;
} else if (fs.existsSync(backendMainJs)) {
  resolvedBackendMainJs = backendMainJs;
}

if (!resolvedBackendMainJs) {
  console.error(`❌ ERROR: Backend build file is missing! Checked: ${backendMainJs} and ${backendMainJsSrc}`);
  process.exit(1);
}
verifyFile(resolvedBackendMainJs, 'Backend main.js');

// 4c. Electron desktop files — CRITICAL: these must all be present in the ASAR bundle
const electronMainJs = path.join(backendDir, 'desktop', 'main.js');
const electronPreloadJs = path.join(backendDir, 'desktop', 'preload.js');

verifyFile(electronMainJs, 'Electron desktop/main.js');
verifyFile(electronPreloadJs, 'Electron desktop/preload.js');

// Also verify that package.json lists preload.js in the electron-builder "files" array
const pkgJson = JSON.parse(fs.readFileSync(path.join(backendDir, 'package.json'), 'utf8'));
const electronFiles = pkgJson?.build?.files || [];
if (!electronFiles.some(f => f === 'desktop/preload.js' || f === 'desktop/*')) {
  console.error(`❌ ERROR: desktop/preload.js is NOT listed in package.json electron-builder "files"!`);
  console.error(`   Current files list: ${JSON.stringify(electronFiles)}`);
  console.error(`   This causes the packaged app to fail loading the preload script (blank window).`);
  process.exit(1);
}
console.log(`✅ Electron builder "files" config correctly includes desktop/preload.js.`);

console.log('\n🎉 SUCCESS: All builds, tests, and integrity checks passed successfully!');
process.exit(0);
