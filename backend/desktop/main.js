const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');

// Caminho do arquivo de config persistente
const configPath = path.join(app.getPath('userData'), 'app-config.json');

function getConfig() {
    if (!fs.existsSync(configPath)) return { allowPrerelease: false };
    try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
    catch { return { allowPrerelease: false }; }
}

function saveConfig(config) {
    try { fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8'); }
    catch (e) { console.error('[Electron] Erro ao salvar config:', e); }
}

let mainWindow = null;

async function startNestApp() {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }

    const dbPath = path.join(userDataPath, 'financeiro.db');
    process.env.DATABASE_PATH = dbPath;
    process.env.NODE_ENV = 'production';
    process.env.APP_PATH = app.getAppPath();

    console.log(`[Electron] Banco SQLite: ${dbPath}`);
    console.log(`[Electron] APP_PATH: ${process.env.APP_PATH}`);

    // O nest build gera dist/main.js (rootDir não definido = src implícito)
    // Mas versões mais novas do NestJS CLI geram dist/src/main.js
    // Tentamos os dois para compatibilidade
    const candidates = [
        path.join(__dirname, '..', 'dist', 'main.js'),
        path.join(__dirname, '..', 'dist', 'src', 'main.js'),
    ];

    const mainFile = candidates.find(f => fs.existsSync(f));
    if (!mainFile) {
        console.error('[Electron] NestJS main.js não encontrado! Candidatos:', candidates);
        return;
    }

    console.log(`[Electron] Carregando NestJS: ${mainFile}`);
    require(mainFile);
}

function waitForBackend(url, retries = 20) {
    return new Promise((resolve) => {
        const check = (attempt) => {
            http.get(url, (res) => {
                console.log(`[Electron] Backend pronto (HTTP ${res.statusCode})`);
                resolve();
            }).on('error', () => {
                if (attempt < retries) {
                    console.log(`[Electron] Aguardando backend... (${attempt}/${retries})`);
                    setTimeout(() => check(attempt + 1), 500);
                } else {
                    console.error('[Electron] Backend não respondeu. Abrindo assim mesmo.');
                    resolve();
                }
            });
        };
        check(1);
    });
}

function createWindow(url) {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'App Financeiro',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    mainWindow.loadURL(url).catch(err => {
        console.error('[Electron] Falha ao carregar URL:', err);
    });

    // DevTools apenas fora de produção
    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
    }
}

function setupIpcHandlers() {
    ipcMain.handle('get-version', () => app.getVersion());

    ipcMain.handle('get-allow-prerelease', () => getConfig().allowPrerelease);

    ipcMain.handle('set-allow-prerelease', (_, value) => {
        const config = getConfig();
        config.allowPrerelease = !!value;
        saveConfig(config);
        autoUpdater.allowPrerelease = config.allowPrerelease;
        return { success: true };
    });

    ipcMain.handle('check-for-updates', async () => {
        try {
            const result = await autoUpdater.checkForUpdates();
            return { success: true, result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('quit-and-install', () => autoUpdater.quitAndInstall());
}

function setupAutoUpdater() {
    const config = getConfig();
    autoUpdater.autoDownload = true;
    autoUpdater.allowPrerelease = config.allowPrerelease;

    autoUpdater.on('checking-for-update', () =>
        sendToRenderer('update-event', { status: 'checking', message: 'Verificando atualizações...' }));

    autoUpdater.on('update-available', (info) =>
        sendToRenderer('update-event', {
            status: 'available',
            version: info.version,
            message: `Nova versão ${info.version} disponível! Baixando...`,
        }));

    autoUpdater.on('update-not-available', () =>
        sendToRenderer('update-event', { status: 'not-available', message: 'Você já está na versão mais recente.' }));

    autoUpdater.on('error', (err) =>
        sendToRenderer('update-event', { status: 'error', message: `Erro: ${err.message}` }));

    autoUpdater.on('download-progress', (p) =>
        sendToRenderer('update-event', {
            status: 'downloading',
            percent: Math.round(p.percent),
            message: `Baixando atualização... ${Math.round(p.percent)}%`,
        }));

    autoUpdater.on('update-downloaded', (info) =>
        sendToRenderer('update-event', {
            status: 'downloaded',
            version: info.version,
            message: 'Atualização baixada! Clique para reiniciar.',
        }));
}

function sendToRenderer(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.whenReady().then(async () => {
        await startNestApp();

        const port = process.env.PORT || 8000;
        const url = `http://localhost:${port}`;

        await waitForBackend(url);
        createWindow(url);
        setupIpcHandlers();
        setupAutoUpdater();

        // Verifica atualizações 2s após abrir (só em produção)
        if (app.isPackaged) {
            setTimeout(() => {
                autoUpdater.checkForUpdates().catch(e =>
                    console.error('[Electron] Erro ao verificar updates:', e));
            }, 2000);
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}
