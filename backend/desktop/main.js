const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

// ─── Módulo de verificação de versão ─────────────────────────────────────────
// Carregado do TypeScript compilado (dist/src/update/version-checker.js).
// Incluído no bundle via "files": ["dist/**/*"] no package.json.
let checkForUpdate = null;
try {
    const checker = require('../dist/src/update/version-checker');
    checkForUpdate = checker.checkForUpdate;
} catch (e) {
    // Normal em desenvolvimento (antes do primeiro `npm run build`)
    console.warn('[Electron] version-checker não disponível:', e.message);
}

// Caminho do arquivo de configuração do Desenvolvedor
const devConfigPath = path.join(app.getPath('userData'), 'dev-config.json');

// Caminho temporário para o instalador baixado (persiste entre chamadas IPC)
let downloadedInstallerPath = null;

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
// Cache do último evento de update enviado antes do renderer estar pronto
let pendingUpdateEvent = null;

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

// ─── Verificação de atualização via version-checker.ts ───────────────────────
async function performUpdateCheck() {
    const config = getDevConfig();
    const version = app.getVersion();
    const channel = detectChannelFromVersion(version);
    const allowPrerelease = !!config.allowPrerelease || channel !== 'latest';

    if (!checkForUpdate) {
        return {
            status: 'error',
            currentVersion: version,
            channel,
            message: 'Módulo de verificação indisponível. Execute npm run build primeiro.',
        };
    }

    return await checkForUpdate(version, 'Thom3002', 'app-financeiro', allowPrerelease);
}

// ─── Download de arquivo com progresso e suporte a redirecionamentos ──────────
// O GitHub redireciona downloads de assets para a CDN (Fastly).
// Seguimos os redirects manualmente para controlar o progresso.
function downloadFile(url, dest, totalSize, onProgress) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        let downloaded = 0;
        let lastPercent = -1;

        const doRequest = (requestUrl) => {
            const mod = requestUrl.startsWith('https://') ? https : http;
            const req = mod.get(
                requestUrl,
                { headers: { 'User-Agent': 'app-financeiro-updater/1.0' } },
                (res) => {
                    // Segue redirecionamentos (GitHub usa CDN com redirect 302)
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        res.resume(); // libera memória da resposta de redirect
                        return doRequest(res.headers.location);
                    }
                    if (res.statusCode !== 200) {
                        file.destroy();
                        return reject(new Error(`HTTP ${res.statusCode} ao baixar atualização.`));
                    }
                    const fileSize = totalSize || parseInt(res.headers['content-length'] || '0', 10);
                    res.on('data', (chunk) => {
                        downloaded += chunk.length;
                        if (fileSize > 0) {
                            const percent = Math.round((downloaded / fileSize) * 100);
                            if (percent !== lastPercent) {
                                lastPercent = percent;
                                onProgress(percent);
                            }
                        }
                    });
                    res.pipe(file);
                    file.on('finish', () => file.close(() => resolve(dest)));
                },
            );
            req.setTimeout(60000, () => {
                req.destroy(new Error('Timeout ao baixar atualização.'));
            });
            req.on('error', (err) => {
                file.destroy();
                fs.unlink(dest, () => {});
                reject(err);
            });
        };

        doRequest(url);
        file.on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
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

        console.log(`[Electron] Versão: ${currentVersion} | Canal: ${detectedChannel}`);

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

        // IMPORTANTE: setupIpcHandlers() deve ser chamado ANTES de createWindow()
        // para garantir que os handlers IPC já existam quando o renderer invocar
        // qualquer ipcRenderer.invoke() logo após o carregamento da página.
        setupIpcHandlers();
        createWindow(serverUrl);

        // Verificação silenciosa 3s após iniciar
        setTimeout(async () => {
            console.log('[Electron] Iniciando verificação automática de atualização...');
            try {
                const result = await performUpdateCheck();
                sendUpdateEvent(result);
            } catch (e) {
                console.error('[Electron] Erro na verificação automática:', e.message);
                sendUpdateEvent({
                    status: 'error',
                    message: 'Não foi possível verificar atualizações automaticamente.',
                });
            }
        }, 3000);

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow(serverUrl);
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}

// ─── Envio de eventos para o renderer ────────────────────────────────────────
function sendUpdateEvent(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-event', payload);
    } else {
        // Renderer ainda não está pronto — armazena para enviar quando ele pedir
        pendingUpdateEvent = payload;
    }
}

// ─── Handlers IPC ─────────────────────────────────────────────────────────────
function setupIpcHandlers() {
    // 1. Versão atual do app
    ipcMain.handle('get-version', () => {
        return app.getVersion();
    });

    // 2. Verificar atualizações (retorna UpdateCheckResult diretamente ao chamador)
    ipcMain.handle('check-for-updates', async () => {
        const version = app.getVersion();

        try {
            const result = await performUpdateCheck();
            console.log(`[Updater] Verificação concluída: ${result.status} | ${result.message}`);
            return result;
        } catch (e) {
            console.error('[Updater] Erro inesperado:', e.message);
            return {
                status: 'error',
                currentVersion: version,
                channel: detectChannelFromVersion(version),
                message: 'Erro inesperado ao verificar atualizações. Tente novamente.',
                error: e.message,
            };
        }
    });

    // 3. Download da atualização com progresso em tempo real via update-event
    ipcMain.handle('download-update', async (event, downloadUrl, totalSize) => {
        if (!downloadUrl || !downloadUrl.startsWith('https://github.com/')) {
            const msg = 'URL de download inválida ou não autorizada.';
            sendUpdateEvent({ status: 'error', message: msg });
            return { success: false, error: msg };
        }

        const fileName = path.basename(downloadUrl.split('?')[0]);
        const destPath = path.join(app.getPath('temp'), fileName);

        console.log(`[Updater] Iniciando download: ${fileName}`);
        sendUpdateEvent({ status: 'downloading', percent: 0, message: 'Iniciando download...' });

        try {
            await downloadFile(downloadUrl, destPath, totalSize, (percent) => {
                const msg = percent < 100 ? `Baixando... ${percent}%` : 'Finalizando...';
                sendUpdateEvent({ status: 'downloading', percent, message: msg });
            });

            downloadedInstallerPath = destPath;
            console.log(`[Updater] Download concluído: ${destPath}`);
            sendUpdateEvent({
                status: 'downloaded',
                message: 'Download concluído! Clique em "Reiniciar e Instalar" para atualizar.',
            });
            return { success: true };
        } catch (e) {
            console.error('[Updater] Erro no download:', e.message);
            const userMsg = e.message.includes('HTTP 404')
                ? 'Arquivo de atualização não encontrado. Tente novamente mais tarde.'
                : e.message.includes('Timeout')
                    ? 'Tempo de resposta esgotado. Verifique sua conexão e tente novamente.'
                    : `Falha no download: ${e.message}`;
            sendUpdateEvent({ status: 'error', message: userMsg });
            return { success: false, error: e.message };
        }
    });

    // 4. Reiniciar e instalar a atualização baixada
    // --updated: flag NSIS que ativa instalação silenciosa e reinicia o app após concluir
    ipcMain.handle('quit-and-install', () => {
        if (!downloadedInstallerPath || !fs.existsSync(downloadedInstallerPath)) {
            console.error('[Updater] Arquivo do instalador não encontrado em:', downloadedInstallerPath);
            sendUpdateEvent({
                status: 'error',
                message: 'Arquivo do instalador não encontrado. Faça o download novamente.',
            });
            return;
        }
        console.log('[Updater] Executando instalador:', downloadedInstallerPath);
        spawn(downloadedInstallerPath, ['--updated'], {
            detached: true,
            stdio: 'ignore',
        }).unref();
        app.quit();
    });

    // 5. Evento de update pendente (enviado antes do renderer estar pronto)
    // O renderer chama isso no mount do SettingsPage para não perder o evento automático
    ipcMain.handle('get-pending-update', () => {
        const evt = pendingUpdateEvent;
        pendingUpdateEvent = null; // consome o evento
        return evt;             // null se não houver nada pendente
    });

    // 6. Configurações de desenvolvedor
    ipcMain.handle('get-dev-settings', () => {
        const config = getDevConfig();
        return {
            devMode: !!config.devMode,
            devPath: config.devPath || '',
            allowPrerelease: !!config.allowPrerelease,
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
}
