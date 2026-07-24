const { contextBridge, ipcRenderer } = require('electron');

try {
    contextBridge.exposeInMainWorld('electronAPI', {
        // Flag síncrona — detectável imediatamente sem await, nunca undefined
        isElectron: true,

        // Informações de versão
        getVersion: () => ipcRenderer.invoke('get-version'),

        // Controle de atualizações
        // checkForUpdates retorna UpdateCheckResult diretamente (com status, downloadUrl, etc.)
        checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
        downloadUpdate: (url, size) => ipcRenderer.invoke('download-update', url, size),
        quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),

        // Listener de eventos de progresso de download (main → renderer)
        // Retorna função de cleanup para remover o listener no unmount do componente
        onUpdateEvent: (callback) => {
            const subscription = (event, value) => callback(value);
            ipcRenderer.on('update-event', subscription);
            return () => ipcRenderer.removeListener('update-event', subscription);
        },

        // Configurações de desenvolvedor / canal
        getDevSettings: () => ipcRenderer.invoke('get-dev-settings'),
        saveDevSettings: (settings) => ipcRenderer.invoke('save-dev-settings', settings),

        // Recupera evento de update pendente (disparado antes do renderer montar)
        getPendingUpdate: () => ipcRenderer.invoke('get-pending-update'),
    });

    console.log('[Preload] electronAPI exposto com sucesso.');
} catch (err) {
    // Qualquer erro aqui tornaria window.electronAPI undefined —
    // logamos explicitamente e armazenamos no DOM para diagnóstico sem DevTools.
    console.error('[Preload] Falha crítica ao expor electronAPI:', err);
    try {
        // Expõe o erro no mundo principal para o renderer detectar
        contextBridge.exposeInMainWorld('__preloadError', String(err));
    } catch (_) {
        // Se até isso falhar, não há nada mais a fazer aqui
    }
}
