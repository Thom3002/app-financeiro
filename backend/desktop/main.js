const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');

// Configurações do AutoUpdater
autoUpdater.autoDownload = true;

// Caminho do arquivo de configuração do Desenvolvedor
const devConfigPath = path.join(app.getPath('userData'), 'dev-config.json');

// Helper para ler configurações locais
function getDevConfig() {
    if (!fs.existsSync(devConfigPath)) {
        return { devMode: false, devPath: '', allowPrerelease: false };
    }
    try {
        const content = fs.readFileSync(devConfigPath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        console.error('Erro ao ler dev-config.json:', e);
        return { devMode: false, devPath: '', allowPrerelease: false };
    }
}

// Helper para salvar configurações locais
function saveDevConfig(config) {
    try {
        fs.writeFileSync(devConfigPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) {
        console.error('Erro ao salvar dev-config.json:', e);
    }
}

// Helper para testar se uma porta local está rodando (usado para detectar o Vite dev server)
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

// Inicialização do Backend NestJS (Produção ou pasta Dev local)
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
        
        // Carrega o NestJS a partir da pasta do desenvolvedor (tentando dist/src/main.js ou dist/main.js)
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
        
        // Carrega o NestJS interno do ASAR (tentando dist/src/main.js ou dist/main.js)
        const mainSrcPath = path.join(__dirname, '..', 'dist', 'src', 'main.js');
        const mainPath = path.join(__dirname, '..', 'dist', 'main.js');
        if (fs.existsSync(mainSrcPath)) {
            require(mainSrcPath);
        } else {
            require(mainPath);
        }
    }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.whenReady().then(async () => {
        const config = getDevConfig();
        autoUpdater.allowPrerelease = !!config.allowPrerelease;
        autoUpdater.channel = 'latest';

        let serverUrl = '';

        if (config.devMode && config.devPath) {
            console.log('[Electron] Modo Desenvolvedor Ativo.');
            
            // 1. Testa se o Vite dev server está rodando (porta 5173)
            const isViteRunning = await checkLocalServerRunning(5173);
            if (isViteRunning) {
                console.log('[Electron] Servidor Vite de desenvolvimento detectado na porta 5173. Redirecionando...');
                serverUrl = 'http://localhost:5173';
            } else {
                // 2. Se o Vite não estiver rodando, tenta rodar o NestJS local da pasta do dev
                const localNestMainSrc = path.join(config.devPath, 'backend', 'dist', 'src', 'main.js');
                const localNestMain = path.join(config.devPath, 'backend', 'dist', 'main.js');
                const localMainPath = fs.existsSync(localNestMainSrc) ? localNestMainSrc : (fs.existsSync(localNestMain) ? localNestMain : null);
                if (localMainPath) {
                    await startNestApp(config.devPath);
                    const port = process.env.PORT || 8000;
                    serverUrl = `http://localhost:${port}`;
                } else {
                    console.error('[Electron] Modo Dev ativo mas nenhuma build local ou porta 5173 foi encontrada. Carregando modo produção.');
                    await startNestApp();
                    const port = process.env.PORT || 8000;
                    serverUrl = `http://localhost:${port}`;
                }
            }
        } else {
            // Modo Produção padrão
            await startNestApp();
            const port = process.env.PORT || 8000;
            serverUrl = `http://localhost:${port}`;
        }

        // Função para esperar o backend estar pronto
        const waitForBackend = (url, retries = 20) => {
            return new Promise((resolve) => {
                const check = (attempt) => {
                    http.get(url, (res) => {
                        console.log(`[Electron] Backend pronto (Status: ${res.statusCode})`);
                        resolve();
                    }).on('error', () => {
                        if (attempt < retries) {
                            console.log(`[Electron] Aguardando backend... (tentativa ${attempt}/${retries})`);
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

        // Configuração dos IPC listeners e AutoUpdater
        setupIpcHandlers();
        setupAutoUpdaterEvents();

        // Verifica atualizações silenciosamente 2 segundos após abrir (se em produção ou canal Beta ativo)
        if (app.isPackaged) {
            setTimeout(() => {
                autoUpdater.checkForUpdates().catch(e => console.error('Erro ao buscar updates iniciais:', e));
            }, 2000);
        }

        app.on('activate', function () {
            if (BrowserWindow.getAllWindows().length === 0) createWindow(serverUrl);
        });
    });

    app.on('window-all-closed', function () {
        if (process.platform !== 'darwin') app.quit();
    });
}

// Configura os eventos de atualização automática do electron-updater
function setupAutoUpdaterEvents() {
    autoUpdater.on('checking-for-update', () => {
        sendUpdateEvent({ status: 'checking', message: 'Verificando atualizações...' });
    });

    autoUpdater.on('update-available', (info) => {
        sendUpdateEvent({
            status: 'available',
            version: info.version,
            message: `Nova versão ${info.version} disponível! Baixando...`
        });
    });

    autoUpdater.on('update-not-available', () => {
        sendUpdateEvent({ status: 'not-available', message: 'Você já possui a versão mais recente.' });
    });

    autoUpdater.on('error', (err) => {
        sendUpdateEvent({ status: 'error', message: `Erro ao buscar atualizações: ${err.message}` });
    });

    autoUpdater.on('download-progress', (progressObj) => {
        sendUpdateEvent({
            status: 'downloading',
            percent: Math.round(progressObj.percent),
            message: `Baixando atualização... ${Math.round(progressObj.percent)}%`
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        sendUpdateEvent({
            status: 'downloaded',
            version: info.version,
            message: 'Atualização baixada! Clique para reiniciar e aplicar.'
        });
    });
}

function sendUpdateEvent(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-event', payload);
    }
}

// Configuração dos canais IPC
function setupIpcHandlers() {
    // 1. Informações básicas de versão
    ipcMain.handle('get-version', () => {
        return app.getVersion();
    });

    // 2. Comandos do AutoUpdater
    ipcMain.handle('check-for-updates', async () => {
        try {
            const result = await autoUpdater.checkForUpdates();
            return { success: true, result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('quit-and-install', () => {
        autoUpdater.quitAndInstall();
    });

    // 3. Configurações de desenvolvedor e canais de update
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

        // Reinicia o aplicativo para aplicar as novas configurações
        app.relaunch();
        app.exit(0);
        return { success: true };
    });
}
