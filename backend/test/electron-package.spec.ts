/**
 * Electron Package Integrity Tests
 *
 * These tests guard against regressions that cause the packaged Electron app to
 * open a blank/empty window. Two root causes have been identified and fixed:
 *
 * Bug 1 — Missing preload.js in electron-builder files (commit fix(electron): add missing preload.js)
 *   desktop/preload.js was added to the project but NOT to the electron-builder `files`
 *   array, so the ASAR bundle was shipped without it. Electron silently fails when the
 *   preload path cannot be resolved, producing an empty HTML page.
 *
 * Bug 2 — Native .node binary packed inside ASAR (this fix)
 *   better-sqlite3 is a native C++ addon that the OS must load via dlopen(). Files
 *   inside an ASAR archive are virtual — dlopen() cannot open them from a path inside
 *   .asar. Without `asarUnpack`, the binary ends up inside app.asar and the TypeORM
 *   connection fails immediately, so the NestJS backend never starts, and the Electron
 *   window opens a blank page (ERR_CONNECTION_REFUSED → empty <html><head></head><body>).
 *
 * Passing all tests here guarantees that:
 *   1. All Electron desktop source files exist.
 *   2. The electron-builder `files` list includes main.js + preload.js.
 *   3. `asarUnpack` is configured for better-sqlite3 and all *.node binaries.
 *   4. `extraResources` includes the frontend/dist build.
 *   5. The frontend Vite build is non-trivial (has JS + CSS assets).
 *   6. The frontend index.html references the bundled assets.
 *   7. The backend NestJS dist exists and is non-empty.
 */

import * as fs from 'fs';
import * as path from 'path';

const rootDir = path.resolve(__dirname, '..', '..');
const backendDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');

describe('Electron Package Integrity', () => {

  // ─── 1. Desktop source files ────────────────────────────────────────────────

  describe('Desktop source files', () => {
    it('desktop/main.js deve existir e não estar vazio', () => {
      const mainJsPath = path.join(backendDir, 'desktop', 'main.js');
      expect(fs.existsSync(mainJsPath)).toBe(true);
      const size = fs.statSync(mainJsPath).size;
      expect(size).toBeGreaterThan(0);
    });

    it('desktop/preload.js deve existir e não estar vazio', () => {
      const preloadPath = path.join(backendDir, 'desktop', 'preload.js');
      expect(fs.existsSync(preloadPath)).toBe(true);
      const size = fs.statSync(preloadPath).size;
      expect(size).toBeGreaterThan(0);
    });

    it('desktop/preload.js deve expor contextBridge (electronAPI)', () => {
      const preloadPath = path.join(backendDir, 'desktop', 'preload.js');
      const content = fs.readFileSync(preloadPath, 'utf8');
      expect(content).toContain('contextBridge');
      expect(content).toContain('electronAPI');
    });

    it('desktop/main.js deve referenciar preload.js corretamente', () => {
      const mainJsPath = path.join(backendDir, 'desktop', 'main.js');
      const content = fs.readFileSync(mainJsPath, 'utf8');
      // The preload path must point to the sibling preload.js inside __dirname
      expect(content).toContain('preload.js');
      expect(content).toContain('__dirname');
    });
  });

  // ─── 2. electron-builder package.json config ─────────────────────────────────

  describe('electron-builder files config in package.json', () => {
    let pkgJson: any;
    let electronFiles: string[];

    beforeAll(() => {
      const pkgPath = path.join(backendDir, 'package.json');
      pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      electronFiles = pkgJson?.build?.files ?? [];
    });

    it('package.json deve ter uma seção build.files', () => {
      expect(Array.isArray(electronFiles)).toBe(true);
      expect(electronFiles.length).toBeGreaterThan(0);
    });

    it('build.files deve incluir desktop/main.js', () => {
      const included = electronFiles.some(
        f => f === 'desktop/main.js' || f === 'desktop/**/*' || f === 'desktop/*'
      );
      expect(included).toBe(true);
    });

    /**
     * REGRESSION TEST (Bug 1): preload.js was added to the project but NOT to
     * the electron-builder "files" list, so it was excluded from the ASAR bundle,
     * causing the renderer window to fail initialization (blank window).
     */
    it('build.files deve incluir desktop/preload.js (regressão bug 1: tela branca)', () => {
      const included = electronFiles.some(
        f => f === 'desktop/preload.js' || f === 'desktop/**/*' || f === 'desktop/*'
      );
      expect(included).toBe(true);
    });

    it('build.files deve incluir o dist compilado do NestJS', () => {
      const included = electronFiles.some(
        f => f === 'dist/**/*' || f === 'dist/**' || f.startsWith('dist/')
      );
      expect(included).toBe(true);
    });

    /**
     * REGRESSION TEST (Bug 2): Native .node binaries CANNOT be loaded by dlopen()
     * from inside an ASAR archive (virtual filesystem). Without asarUnpack, the
     * better-sqlite3 binary ends up inside app.asar and TypeORM fails to connect,
     * preventing the NestJS backend from starting → Electron loads blank page.
     *
     * asarUnpack tells electron-builder to keep these files on the real filesystem
     * at app.asar.unpacked/ and automatically rebuilds them for Electron's ABI.
     */
    it('build.asarUnpack deve incluir better-sqlite3 (regressão bug 2: tela branca por .node dentro do ASAR)', () => {
      const asarUnpack: string[] = pkgJson?.build?.asarUnpack ?? [];
      expect(Array.isArray(asarUnpack)).toBe(true);
      expect(asarUnpack.length).toBeGreaterThan(0);

      const coversBetterSqlite3 = asarUnpack.some(
        pattern =>
          pattern.includes('better-sqlite3') ||
          pattern.includes('node_modules/**') ||
          pattern === '**/*.node'
      );
      expect(coversBetterSqlite3).toBe(true);
    });

    it('build.asarUnpack deve incluir arquivos *.node para cobrir todos os módulos nativos', () => {
      const asarUnpack: string[] = pkgJson?.build?.asarUnpack ?? [];
      const coversNodeFiles = asarUnpack.some(
        pattern => pattern.includes('*.node') || pattern.includes('**/*.node')
      );
      expect(coversNodeFiles).toBe(true);
    });

    it('build.extraResources deve incluir o frontend/dist', () => {
      const extraResources: any[] = pkgJson?.build?.extraResources ?? [];
      const hasFrontend = extraResources.some(
        r => typeof r === 'object' && r.from && r.from.includes('frontend')
      );
      expect(hasFrontend).toBe(true);
    });

    it('build.extraResources NÃO deve mais ter entrada manual do better-sqlite3 (substituído por asarUnpack)', () => {
      const extraResources: any[] = pkgJson?.build?.extraResources ?? [];
      const hasBetterSqlite3 = extraResources.some(
        r => typeof r === 'object' && r.from && r.from.includes('better-sqlite3')
      );
      // This was a misguided fix that didn't resolve the module path correctly.
      // asarUnpack is the correct approach.
      expect(hasBetterSqlite3).toBe(false);
    });
  });


  // ─── 3. Frontend build integrity ─────────────────────────────────────────────

  describe('Frontend build artifacts (frontend/dist)', () => {
    const distDir = path.join(frontendDir, 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    const assetsDir = path.join(distDir, 'assets');

    it('frontend/dist/index.html deve existir', () => {
      expect(fs.existsSync(indexHtmlPath)).toBe(true);
    });

    it('frontend/dist/index.html não deve estar vazio', () => {
      const size = fs.statSync(indexHtmlPath).size;
      expect(size).toBeGreaterThan(0);
    });

    it('frontend/dist/index.html deve ter um <body> com o div#root', () => {
      const content = fs.readFileSync(indexHtmlPath, 'utf8');
      expect(content).toContain('<body>');
      expect(content).toContain('id="root"');
    });

    it('frontend/dist/index.html deve referenciar assets JS gerados pelo Vite', () => {
      const content = fs.readFileSync(indexHtmlPath, 'utf8');
      // Vite injects <script type="module" src="/assets/index-HASH.js">
      expect(content).toContain('<script');
      expect(content).toContain('assets/');
    });

    it('frontend/dist/assets/ deve existir', () => {
      expect(fs.existsSync(assetsDir)).toBe(true);
    });

    it('frontend/dist/assets/ deve conter pelo menos um arquivo JS', () => {
      const files = fs.readdirSync(assetsDir);
      const jsFiles = files.filter(f => f.endsWith('.js'));
      expect(jsFiles.length).toBeGreaterThan(0);
    });

    it('frontend/dist/assets/ deve conter pelo menos um arquivo CSS', () => {
      const files = fs.readdirSync(assetsDir);
      const cssFiles = files.filter(f => f.endsWith('.css'));
      expect(cssFiles.length).toBeGreaterThan(0);
    });
  });

  // ─── 4. Backend NestJS compiled output ───────────────────────────────────────

  describe('Backend NestJS build artifacts (backend/dist)', () => {
    it('backend/dist deve existir', () => {
      const distDir = path.join(backendDir, 'dist');
      expect(fs.existsSync(distDir)).toBe(true);
    });

    it('backend/dist/src/main.js ou backend/dist/main.js deve existir', () => {
      const mainSrcPath = path.join(backendDir, 'dist', 'src', 'main.js');
      const mainPath = path.join(backendDir, 'dist', 'main.js');
      const exists = fs.existsSync(mainSrcPath) || fs.existsSync(mainPath);
      expect(exists).toBe(true);
    });

    it('o main.js compilado do NestJS não deve estar vazio', () => {
      const mainSrcPath = path.join(backendDir, 'dist', 'src', 'main.js');
      const mainPath = path.join(backendDir, 'dist', 'main.js');
      const resolvedPath = fs.existsSync(mainSrcPath) ? mainSrcPath : mainPath;
      const size = fs.statSync(resolvedPath).size;
      expect(size).toBeGreaterThan(0);
    });
  });
});
