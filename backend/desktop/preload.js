const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getVersion: () => ipcRenderer.invoke('get-version'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
    getDevSettings: () => ipcRenderer.invoke('get-dev-settings'),
    saveDevSettings: (settings) => ipcRenderer.invoke('save-dev-settings', settings),
    setAllowPrerelease: (value) => ipcRenderer.invoke('set-allow-prerelease', value),
    startGitHubAuth: () => ipcRenderer.invoke('start-github-auth'),
    logoutGitHub: () => ipcRenderer.invoke('logout-github'),
    onUpdateEvent: (callback) => {
        const subscription = (event, value) => callback(value);
        ipcRenderer.on('update-event', subscription);
        return () => ipcRenderer.removeListener('update-event', subscription);
    },
    onGitHubAuthEvent: (callback) => {
        const subscription = (event, value) => callback(value);
        ipcRenderer.on('github-auth-event', subscription);
        return () => ipcRenderer.removeListener('github-auth-event', subscription);
    }
});
