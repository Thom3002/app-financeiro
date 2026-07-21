const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');

// ─── Configurações do AutoUpdater ───────────────────────────────────────────
// autoDownload=false: o usuário decide quando baixar (via botão na UI)
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Caminho do arquivo de configuração do Desenvolvedor
const devConfigPath = path.join(app.getPath('userData'), 'dev-config.json');

// ─── Helpers de configuração ─────────────────────────────────────────────────

function getDevConfig() {
    if (!fs.existsSync(devConfigPath)) {
        return { devMode: false, devPath: '', allowPrerelease: false };
    }
    try {
        const content = fs.readFileSync(devConfigPath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        console.error('[Electron] Erro ao ler dev-config.json:', e);
        return { devMode: false, devPath: '', allowPrerelease: false };
    }
}

function saveDevConfig(config) {
    try {
        fs.writeFileSync(devConfigPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) {
        console.error('[Electron] Erro ao salvar dev-config.json:', e);
    }
}

// ─── Helper: detecta canal pela versão instalada ──────────────────────────────
// Ex: "1.1.3-beta.42" → 'beta', "1.1.3-dev.5" → 'dev', "1.1.3" → 'latest'
function detectChannelFromVersion(version) {
    if (version.includes('-dev.')) return 'dev';
    if (version.includes('-beta.')) return 'beta';
    return 'latest';
}

// ─── Helper: testa se uma porta local está rodando ───────────────────────────
function checkLocalServerRunning(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}`, () => {
            resolve(true);
        });
        req.on('error', () => {
            resolve(false);
        });
        req.setTimeout(800, () => {
            req.destroy();
            resolve(false);
        });
    });
}

let mainWindow = null;

function createWindow(url) {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'App Financeiro',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadURL(url).catch(err => {
        console.error('[Electron] Falha ao carregar URL:', err);
    });

    const config = getDevConfig();
    if (!app.isPackaged || config.devMode) {
        mainWindow.webContents.openDevTools();
    }
}

// ─── Inicialização do Backend NestJS ─────────────────────────────────────────
async function startNestApp(devPath = null) {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }

    if (devPath) {
        const localDbDir = path.join(devPath, 'backend', 'data');
        if (!fs.existsSync(localDbDir)) {
            fs.mkdirSync(localDbDir, { recursive: true });
        }
        process.env.DATABASE_PATH = path.join(localDbDir, 'financeiro.db');
        process.env.NODE_ENV = 'development';
        console.log(`[Electron] [DEV] Carregando NestJS local de: ${devPath}`);
        console.log(`[Electron] [DEV] Banco SQLite configurado em: ${process.env.DATABASE_PATH}`);

        const localNestMainSrc = path.join(devPath, 'backend', 'dist', 'src', 'main.js');
        const localNestMain = path.join(devPath, 'backend', 'dist', 'main.js');
        if (fs.existsSync(localNestMainSrc)) {
            require(localNestMainSrc);
        } else {
            require(localNestMain);
        }
    } else {
        process.env.DATABASE_PATH = path.join(userDataPath, 'financeiro.db');
        process.env.NODE_ENV = 'production';
        process.env.APP_PATH = app.getAppPath();
        console.log(`[Electron] Banco SQLite configurado em: ${process.env.DATABASE_PATH}`);

        const mainSrcPath = path.join(__dirname, '..', 'dist', 'src', 'main.js');
        const mainPath = path.join(__dirname, '..', 'dist', 'main.js');
        if (fs.existsSync(mainSrcPath)) {
            require(mainSrcPath);
        } else {
            require(mainPath);
        }
    }
}

// ─── App bootstrap ────────────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.whenReady().then(async () => {
        const config = getDevConfig();
        const currentVersion = app.getVersion();
        const detectedChannel = detectChannelFromVersion(currentVersion);

        // Configura canal e allowPrerelease baseado na versão instalada + config do usuário
        autoUpdater.channel = detectedChannel;
        autoUpdater.allowPrerelease = !!config.allowPrerelease || detectedChannel !== 'latest';

        console.log(`[Electron] Versão: ${currentVersion} | Canal: ${detectedChannel} | allowPrerelease: ${autoUpdater.allowPrerelease}`);

        let serverUrl = '';

        if (config.devMode && config.devPath) {
            console.log('[Electron] Modo Desenvolvedor Ativo.');

            const isViteRunning = await checkLocalServerRunning(5173);
            if (isViteRunning) {
                console.log('[Electron] Servidor Vite detectado na porta 5173. Redirecionando...');
                serverUrl = 'http://localhost:5173';
            } else {
                const localNestMainSrc = path.join(config.devPath, 'backend', 'dist', 'src', 'main.js');
                const localNestMain = path.join(config.devPath, 'backend', 'dist', 'main.js');
                const localMainPath = fs.existsSync(localNestMainSrc)
                    ? localNestMainSrc
                    : (fs.existsSync(localNestMain) ? localNestMain : null);

                if (localMainPath) {
                    await startNestApp(config.devPath);
                } else {
                    console.error('[Electron] Modo Dev ativo mas nenhuma build local encontrada. Usando produção.');
                    await startNestApp();
                }
                const port = process.env.PORT || 8000;
                serverUrl = `http://localhost:${port}`;
            }
        } else {
            await startNestApp();
            const port = process.env.PORT || 8000;
            serverUrl = `http://localhost:${port}`;
        }

        // Aguarda backend ficar pronto
        const waitForBackend = (url, retries = 20) => {
            return new Promise((resolve) => {
                const check = (attempt) => {
                    http.get(url, (res) => {
                        console.log(`[Electron] Backend pronto (Status: ${res.statusCode})`);
                        resolve();
                    }).on('error', () => {
                        if (attempt < retries) {
                            console.log(`[Electron] Aguardando backend... (${attempt}/${retries})`);
                            setTimeout(() => check(attempt + 1), 500);
                        } else {
                            console.error('[Electron] Backend não respondeu a tempo.');
                            resolve();
                        }
                    });
                };
                check(1);
            });
        };

        if (serverUrl.includes(':8000') || serverUrl.includes(':8001')) {
            await waitForBackend(serverUrl);
        }

        createWindow(serverUrl);
        setupIpcHandlers();
        setupAutoUpdaterEvents();

        // Verificação silenciosa 3s após iniciar (somente em produção e fora do modo dev)
        if (app.isPackaged && !config.devMode) {
            setTimeout(() => {
                console.log('[Electron] Iniciando verificação automática de atualização...');
                autoUpdater.checkForUpdates().catch(e => {
                    console.error('[Electron] Erro na verificação automática:', e.message);
                    sendUpdateEvent({
                        status: 'error',
                        message: `Não foi possível verificar atualizações automaticamente: ${e.message}`
                    });
                });
            }, 3000);
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow(serverUrl);
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}

// ─── Eventos do AutoUpdater ───────────────────────────────────────────────────
function setupAutoUpdaterEvents() {
    autoUpdater.on('checking-for-update', () => {
        console.log('[Updater] Verificando atualizações...');

        // electron-updater emite 'checking-for-update' mas então aborta silenciosamente
        // quando o app não está empacotado (sem emitir not-available ou error).
        // Resolvemos imediatamente para não deixar a UI presa.
        if (!app.isPackaged) {
            console.log('[Updater] App não empacotado — resolvendo estado de verificação imediatamente.');
            setTimeout(() => {
                sendUpdateEvent({
                    status: 'not-available',
                    message: 'Verificação disponível apenas na versão instalada (.exe).'
                });
            }, 500); // pequeno delay para a UI mostrar brevemente o "verificando..."
            return;
        }

        sendUpdateEvent({ status: 'checking', message: 'Verificando atualizações...' });
    });

    autoUpdater.on('update-available', (info) => {
        console.log(`[Updater] Atualização disponível: ${info.version}`);
        sendUpdateEvent({
            status: 'available',
            version: info.version,
            message: `Nova versão ${info.version} encontrada! Baixando...`
        });
    });

    autoUpdater.on('update-not-available', (info) => {
        console.log(`[Updater] Já na versão mais recente: ${info?.version || app.getVersion()}`);
        sendUpdateEvent({
            status: 'not-available',
            version: info?.version || app.getVersion(),
            message: 'Você já possui a versão mais recente.'
        });
    });

    autoUpdater.on('error', (err) => {
        console.error('[Updater] Erro:', err.message);

        // Traduz erros técnicos em mensagens amigáveis
        let userMessage = 'Não foi possível verificar atualizações.';
        const msg = err.message || '';

        if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
            userMessage = 'Sem conexão com a internet. Verifique sua rede e tente novamente.';
        } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
            userMessage = 'Tempo de resposta esgotado. Verifique sua conexão e tente novamente.';
        } else if (msg.includes('ECONNREFUSED')) {
            userMessage = 'Conexão recusada ao verificar atualizações. Tente novamente mais tarde.';
        } else if (msg.includes('net::ERR')) {
            userMessage = 'Erro de rede ao verificar atualizações. Tente novamente.';
        } else if (msg.includes('404') || msg.includes('not found')) {
            userMessage = 'Repositório de atualizações não encontrado.';
        } else if (msg.includes('403') || msg.includes('rate limit')) {
            userMessage = 'Muitas requisições ao GitHub. Tente novamente em alguns minutos.';
        } else if (msg.length > 0 && msg.length < 120) {
            userMessage = `Erro: ${msg}`;
        }

        sendUpdateEvent({ status: 'error', message: userMessage, error: msg });
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const percent = Math.round(progressObj.percent);
        const speed = progressObj.bytesPerSecond
            ? ` (${(progressObj.bytesPerSecond / 1024).toFixed(0)} KB/s)`
            : '';
        console.log(`[Updater] Download: ${percent}%${speed}`);
        sendUpdateEvent({
            status: 'downloading',
            percent,
            message: `Baixando atualização... ${percent}%${speed}`
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log(`[Updater] Atualização ${info.version} baixada e pronta.`);
        sendUpdateEvent({
            status: 'downloaded',
            version: info.version,
            message: `Versão ${info.version} pronta! Reinicie para aplicar a atualização.`
        });
    });
}

function sendUpdateEvent(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-event', payload);
    }
}

// ─── Handlers IPC ─────────────────────────────────────────────────────────────
function setupIpcHandlers() {
    // 1. Versão atual do app
    ipcMain.handle('get-version', () => {
        return app.getVersion();
    });

    // 2. Verificar atualizações manualmente (acionado pelo botão na UI)
    ipcMain.handle('check-for-updates', async () => {
        // electron-updater recusa verificar quando o app não está empacotado
        // (mensagem: "Skip checkForUpdates because application is not packed")
        // Nesse caso retorna null silenciosamente sem emitir nenhum evento,
        // deixando a UI presa em "checking". Detectamos esse caso e emitimos
        // um evento informativo manualmente.
        if (!app.isPackaged) {
            console.log('[Updater] App não empacotado — simulando verificação para a UI.');
            sendUpdateEvent({
                status: 'not-available',
                message: 'Verificação de atualizações disponível apenas na versão instalada.'
            });
            return { success: true, skipped: true };
        }

        try {
            const result = await autoUpdater.checkForUpdates();
            // Pode retornar null mesmo em produção em alguns edge cases
            if (!result) {
                sendUpdateEvent({
                    status: 'not-available',
                    message: 'Você já possui a versão mais recente.'
                });
            }
            return { success: true, result };
        } catch (e) {
            console.error('[IPC check-for-updates] Erro:', e.message);
            return { success: false, error: e.message };
        }
    });

    // 3. Reiniciar e instalar a atualização já baixada
    ipcMain.handle('quit-and-install', () => {
        console.log('[Updater] Executando quitAndInstall...');
        autoUpdater.quitAndInstall();
    });

    // 4. Configurações de desenvolvedor
    ipcMain.handle('get-dev-settings', () => {
        const config = getDevConfig();
        return {
            devMode: !!config.devMode,
            devPath: config.devPath || '',
            allowPrerelease: !!config.allowPrerelease
        };
    });

    ipcMain.handle('save-dev-settings', (event, settings) => {
        const config = getDevConfig();
        config.devMode = !!settings.devMode;
        config.devPath = settings.devPath;
        config.allowPrerelease = !!settings.allowPrerelease;
        saveDevConfig(config);

        app.relaunch();
        app.exit(0);
        return { success: true };
    });

    ipcMain.handle('set-allow-prerelease', (event, value) => {
        const config = getDevConfig();
        config.allowPrerelease = !!value;
        saveDevConfig(config);
        autoUpdater.allowPrerelease = !!value;
        console.log(`[Updater] allowPrerelease definido como: ${!!value}`);
        return { success: true };
    });
}
