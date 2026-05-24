/**
 * verify-builds.js
 * Verifica a integridade dos artefatos de build ANTES do electron-builder empacotar.
 * NÃO faz builds — os builds já foram feitos pelo CI/CD ou pelo desenvolvedor.
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const frontendDir = path.join(rootDir, 'frontend');
const backendDir = path.join(rootDir, 'backend');

let ok = true;

function check(filePath, label) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ MISSING: ${label}\n   Caminho: ${filePath}`);
        ok = false;
        return;
    }
    const size = fs.statSync(filePath).size;
    if (size === 0) {
        console.error(`❌ EMPTY: ${label} tem 0 bytes\n   Caminho: ${filePath}`);
        ok = false;
        return;
    }
    console.log(`✅ ${label} (${size} bytes)`);
}

console.log('🔍 Verificando artefatos antes do empacotamento...\n');

// ── Frontend ──────────────────────────────────────────────────────────────────
const frontendIndex = path.join(frontendDir, 'dist', 'index.html');
check(frontendIndex, 'frontend/dist/index.html');

const assetsDir = path.join(frontendDir, 'dist', 'assets');
if (!fs.existsSync(assetsDir)) {
    console.error('❌ MISSING: frontend/dist/assets/');
    ok = false;
} else {
    const assets = fs.readdirSync(assetsDir);
    const js = assets.filter(f => f.endsWith('.js'));
    const css = assets.filter(f => f.endsWith('.css'));
    if (js.length === 0) { console.error('❌ Nenhum JS bundle em frontend/dist/assets/'); ok = false; }
    else console.log(`✅ frontend/dist/assets/ — ${js.length} JS, ${css.length} CSS`);
}

if (ok) {
    const indexContent = fs.readFileSync(frontendIndex, 'utf8');
    if (!indexContent.includes('<script') || !indexContent.includes('assets/')) {
        console.error('❌ index.html não referencia assets do Vite (build corrompido?)');
        ok = false;
    }
}

// ── Backend ───────────────────────────────────────────────────────────────────
const backendMain1 = path.join(backendDir, 'dist', 'main.js');
const backendMain2 = path.join(backendDir, 'dist', 'src', 'main.js');
const backendMain = fs.existsSync(backendMain1) ? backendMain1 : (fs.existsSync(backendMain2) ? backendMain2 : null);

if (!backendMain) {
    console.error(`❌ MISSING: backend NestJS compiled main.js`);
    console.error(`   Verificado: ${backendMain1}`);
    console.error(`   Verificado: ${backendMain2}`);
    ok = false;
} else {
    check(backendMain, `backend/${path.relative(backendDir, backendMain)}`);
}

// ── Electron desktop files ────────────────────────────────────────────────────
check(path.join(backendDir, 'desktop', 'main.js'), 'desktop/main.js');
check(path.join(backendDir, 'desktop', 'preload.js'), 'desktop/preload.js');

// Garante que preload.js está no files do electron-builder
const pkg = JSON.parse(fs.readFileSync(path.join(backendDir, 'package.json'), 'utf8'));
const files = pkg?.build?.files || [];
if (!files.some(f => f === 'desktop/preload.js' || f === 'desktop/*')) {
    console.error('❌ desktop/preload.js NÃO está listado em package.json build.files!');
    ok = false;
} else {
    console.log('✅ desktop/preload.js está em build.files');
}

// ── Resultado ─────────────────────────────────────────────────────────────────
console.log('');
if (ok) {
    console.log('🎉 Todos os artefatos verificados com sucesso!');
    process.exit(0);
} else {
    console.error('💥 Falha na verificação. Faça o build do frontend e backend antes de empacotar.');
    console.error('   Frontend: cd frontend && npm run build');
    console.error('   Backend:  cd backend && npm run build');
    process.exit(1);
}
