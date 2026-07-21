import { useState, useEffect, useCallback } from 'react';

// ─── Constantes ───────────────────────────────────────────────────────────────

const UPDATE_STATUS = {
    IDLE: 'idle',
    CHECKING: 'checking',
    AVAILABLE: 'available',
    DOWNLOADING: 'downloading',
    DOWNLOADED: 'downloaded',
    NOT_AVAILABLE: 'not-available',
    ERROR: 'error',
};

// ─── Sub-componente: Painel de Atualização ────────────────────────────────────

function UpdatePanel({ isElectron }) {
    const [version, setVersion] = useState('');
    const [updateStatus, setUpdateStatus] = useState(UPDATE_STATUS.IDLE);
    const [updateMsg, setUpdateMsg] = useState('');
    const [updateVersion, setUpdateVersion] = useState('');
    const [downloadPercent, setDownloadPercent] = useState(0);
    const [allowPrerelease, setAllowPrerelease] = useState(false);

    useEffect(() => {
        if (!isElectron) return;

        window.electronAPI.getVersion().then(setVersion).catch(console.error);

        window.electronAPI.getDevSettings().then((s) => {
            setAllowPrerelease(!!s.allowPrerelease);
        }).catch(console.error);

        const removeListener = window.electronAPI.onUpdateEvent((evt) => {
            setUpdateStatus(evt.status);
            setUpdateMsg(evt.message || '');
            if (evt.version) setUpdateVersion(evt.version);
            if (evt.percent !== undefined) setDownloadPercent(evt.percent);
        });

        return () => removeListener();
    }, [isElectron]);

    const handleCheckForUpdates = useCallback(() => {
        if (!isElectron) return;
        setUpdateStatus(UPDATE_STATUS.CHECKING);
        setUpdateMsg('Verificando atualizações...');
        setUpdateVersion('');
        window.electronAPI.checkForUpdates().catch((e) => {
            setUpdateStatus(UPDATE_STATUS.ERROR);
            setUpdateMsg(`Erro ao iniciar verificação: ${e.message}`);
        });

        // Timeout de segurança: se o electron-updater não responder em 20s,
        // reseta o estado para não deixar o usuário preso em "Verificando..."
        const safetyTimer = setTimeout(() => {
            setUpdateStatus((prev) => {
                if (prev === UPDATE_STATUS.CHECKING) {
                    setUpdateMsg('Não foi possível verificar. Verifique sua conexão e tente novamente.');
                    return UPDATE_STATUS.ERROR;
                }
                return prev;
            });
        }, 20000);

        // Cancela o timer se o componente receber um evento antes disso
        return () => clearTimeout(safetyTimer);
    }, [isElectron]);

    const handleQuitAndInstall = useCallback(() => {
        if (!isElectron) return;
        window.electronAPI.quitAndInstall();
    }, [isElectron]);

    const handleTogglePrerelease = useCallback(async (val) => {
        setAllowPrerelease(val);
        if (isElectron) {
            await window.electronAPI.setAllowPrerelease(val);
        }
    }, [isElectron]);

    // ─── Estados visuais do card de update ──────────────────────────────────

    const isChecking = updateStatus === UPDATE_STATUS.CHECKING;
    // AVAILABLE é transitório (autoDownload=true vai logo para DOWNLOADING);
    // não bloqueamos o botão nesse estado para evitar loop visual
    const isDownloading = updateStatus === UPDATE_STATUS.DOWNLOADING;
    const isAvailable = updateStatus === UPDATE_STATUS.AVAILABLE;
    const isReady = updateStatus === UPDATE_STATUS.DOWNLOADED;
    const isError = updateStatus === UPDATE_STATUS.ERROR;
    const isUpToDate = updateStatus === UPDATE_STATUS.NOT_AVAILABLE;
    const isIdle = updateStatus === UPDATE_STATUS.IDLE;

    // Cor e ícone do status
    const statusConfig = {
        [UPDATE_STATUS.IDLE]: { color: 'rgba(255,255,255,0.4)', bg: 'transparent', border: 'rgba(255,255,255,0.08)' },
        [UPDATE_STATUS.CHECKING]: { color: '#60a5fa', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' },
        [UPDATE_STATUS.AVAILABLE]: { color: '#60a5fa', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' },
        [UPDATE_STATUS.DOWNLOADING]: { color: '#60a5fa', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' },
        [UPDATE_STATUS.DOWNLOADED]: { color: '#4ade80', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' },
        [UPDATE_STATUS.NOT_AVAILABLE]: { color: '#4ade80', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)' },
        [UPDATE_STATUS.ERROR]: { color: '#f87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
    };

    const current = statusConfig[updateStatus] || statusConfig[UPDATE_STATUS.IDLE];

    return (
        <div className="card" style={{ marginBottom: '24px', padding: '24px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                📦 Atualização do Sistema
            </h3>

            {/* Versão atual + nova */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <p style={{ margin: '0 0 3px 0', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Versão Instalada
                    </p>
                    <p style={{ margin: 0, fontSize: '22px', fontWeight: '700', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
                        {version ? `v${version}` : '—'}
                    </p>
                </div>

                {updateVersion && updateVersion !== version && (
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: '0 0 3px 0', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {isReady ? 'Pronta para instalar' : 'Nova versão'}
                        </p>
                        <p style={{ margin: 0, fontSize: '22px', fontWeight: '700', fontFamily: 'monospace', color: isReady ? '#4ade80' : '#60a5fa', letterSpacing: '-0.5px' }}>
                            v{updateVersion}
                        </p>
                    </div>
                )}
            </div>

            {/* Área de status */}
            {!isIdle && (
                <div style={{
                    padding: '14px 16px',
                    background: current.bg,
                    border: `1px solid ${current.border}`,
                    borderRadius: '10px',
                    marginBottom: '16px',
                    transition: 'all 0.3s ease',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: isDownloading ? '10px' : 0 }}>
                        {/* Ícone animado */}
                        {isChecking && (
                            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '16px' }}>⟳</span>
                        )}
                        {(isAvailable || isDownloading) && <span style={{ fontSize: '16px' }}>📥</span>}
                        {isReady && <span style={{ fontSize: '16px' }}>✅</span>}
                        {isUpToDate && <span style={{ fontSize: '16px' }}>✅</span>}
                        {isError && <span style={{ fontSize: '16px' }}>❌</span>}

                        <span style={{ fontSize: '13px', color: current.color, lineHeight: '1.4', fontWeight: '500' }}>
                            {updateMsg}
                        </span>
                    </div>

                    {/* Barra de progresso do download */}
                    {isDownloading && (
                        <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${downloadPercent}%`,
                                background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                                borderRadius: '2px',
                                transition: 'width 0.3s ease',
                            }} />
                        </div>
                    )}
                </div>
            )}

            {/* Botões de ação */}
            {!isElectron ? (
                <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', textAlign: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        🖥️ Atualização disponível apenas no aplicativo Desktop
                    </span>
                </div>
            ) : isReady ? (
                <button
                    id="btn-quit-and-install"
                    onClick={handleQuitAndInstall}
                    style={{
                        width: '100%',
                        padding: '12px 20px',
                        background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(34,197,94,0.25)',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                    onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                >
                    🔄 Reiniciar e Instalar Atualização
                </button>
            ) : (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        id="btn-check-for-updates"
                        onClick={handleCheckForUpdates}
                        disabled={isChecking || isDownloading}
                        style={{
                            flex: 1,
                            minWidth: '160px',
                            padding: '10px 20px',
                            background: isChecking || isDownloading
                                ? 'rgba(255,255,255,0.05)'
                                : 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                            color: isChecking || isDownloading ? 'var(--text-muted)' : 'white',
                            border: isChecking || isDownloading
                                ? '1px solid rgba(255,255,255,0.1)'
                                : 'none',
                            borderRadius: '10px',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: isChecking || isDownloading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '7px',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseOver={(e) => {
                            if (!isChecking && !isDownloading) e.currentTarget.style.opacity = '0.9';
                        }}
                        onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                    >
                        {isChecking
                            ? '⟳ Verificando...'
                            : isDownloading
                                ? '📥 Baixando...'
                                : isAvailable
                                    ? '📥 Baixando atualização...'
                                    : '🔍 Verificar Atualizações'}
                    </button>

                    {isError && (
                        <button
                            id="btn-retry-update"
                            onClick={handleCheckForUpdates}
                            style={{
                                padding: '10px 16px',
                                background: 'rgba(239,68,68,0.12)',
                                color: '#f87171',
                                border: '1px solid rgba(239,68,68,0.25)',
                                borderRadius: '10px',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                whiteSpace: 'nowrap',
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
                        >
                            ↻ Tentar novamente
                        </button>
                    )}
                </div>
            )}

            {/* Toggle: pré-lançamentos */}
            {isElectron && (
                <div style={{
                    marginTop: '20px',
                    paddingTop: '20px',
                    borderTop: '1px solid rgba(255,255,255,0.07)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                }}>
                    <div>
                        <p style={{ margin: '0 0 3px 0', fontSize: '13px', fontWeight: '500' }}>
                            Versões Beta
                        </p>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                            Receber builds de pré-lançamento (podem conter bugs)
                        </p>
                    </div>

                    <label id="toggle-prerelease" style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: '46px',
                        height: '24px',
                        cursor: 'pointer',
                        flexShrink: 0,
                    }}>
                        <input
                            type="checkbox"
                            style={{ opacity: 0, width: 0, height: 0 }}
                            checked={allowPrerelease}
                            onChange={(e) => handleTogglePrerelease(e.target.checked)}
                        />
                        <span style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: allowPrerelease ? 'var(--accent-primary)' : 'rgba(255,255,255,0.12)',
                            borderRadius: '24px',
                            transition: '0.25s',
                        }}>
                            <span style={{
                                position: 'absolute',
                                height: '18px', width: '18px',
                                left: allowPrerelease ? '24px' : '4px',
                                bottom: '3px',
                                backgroundColor: 'white',
                                borderRadius: '50%',
                                transition: '0.25s',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                            }} />
                        </span>
                    </label>
                </div>
            )}

            {/* Animação de spinner via style global */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

// ─── Componente principal: SettingsPage ───────────────────────────────────────

export default function SettingsPage() {
    const isElectron = !!window.electronAPI;

    const [devSettings, setDevSettings] = useState({
        devMode: false,
        devPath: '',
        allowPrerelease: false,
    });

    const [initialSettings, setInitialSettings] = useState({
        devMode: false,
        devPath: '',
        allowPrerelease: false,
    });

    const [devPathInput, setDevPathInput] = useState('');

    useEffect(() => {
        if (!isElectron) return;

        window.electronAPI.getDevSettings().then((settings) => {
            setDevSettings(settings);
            setInitialSettings(settings);
            setDevPathInput(settings.devPath || '');
        }).catch(console.error);
    }, [isElectron]);

    const handleSaveSettings = async () => {
        if (!isElectron) return;

        if (devSettings.devMode && !devPathInput.trim()) {
            alert('Por favor, informe o caminho do repositório para ativar o Modo Dev.');
            return;
        }

        const confirmRestart = window.confirm(
            'Para aplicar as alterações, o aplicativo será reiniciado. Deseja continuar?'
        );

        if (confirmRestart) {
            await window.electronAPI.saveDevSettings({
                devMode: devSettings.devMode,
                devPath: devPathInput.trim(),
                allowPrerelease: devSettings.allowPrerelease,
            });
        }
    };

    const hasChanges =
        devSettings.devMode !== initialSettings.devMode ||
        devPathInput !== initialSettings.devPath ||
        devSettings.allowPrerelease !== initialSettings.allowPrerelease;

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '40px' }}>
            <div className="page-header">
                <h2>⚙️ Configurações do Sistema</h2>
                <p>Gerencie atualizações de versões e canais de desenvolvimento</p>
            </div>

            {/* SEÇÃO 1: ATUALIZAÇÃO */}
            <UpdatePanel isElectron={isElectron} />

            {/* SEÇÃO 2: MODO DESENVOLVEDOR */}
            <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                    🛠️ Modo Desenvolvedor
                </h3>

                {!isElectron ? (
                    <div style={{ textAlign: 'center', padding: '10px 0', color: 'var(--text-muted)' }}>
                        <p style={{ margin: 0 }}>
                            O Modo Desenvolvedor está disponível apenas no aplicativo Desktop instalado.
                        </p>
                    </div>
                ) : (
                    <div>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', margin: '0 0 20px 0' }}>
                            Redireciona o app instalado para ler arquivos e servidores locais da sua pasta de desenvolvimento.
                            Qualquer alteração no código refletirá em tempo real.
                        </p>

                        <div className="form-group" style={{ marginBottom: '20px' }}>
                            <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '13px' }}>
                                Caminho do Repositório Local
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                style={{ fontFamily: 'monospace', fontSize: '13px' }}
                                placeholder="Ex: C:\Users\usuario\Desktop\app-financeiro"
                                value={devPathInput}
                                onChange={(e) => setDevPathInput(e.target.value)}
                            />
                            <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                                Caminho absoluto da pasta raiz do projeto <code>app-financeiro</code>.
                            </p>
                        </div>

                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '16px',
                            background: 'rgba(255,255,255,0.02)',
                            borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.07)',
                            marginBottom: '20px',
                        }}>
                            <div>
                                <p style={{ margin: '0 0 3px 0', fontSize: '13px', fontWeight: '500' }}>Ativar Desvio Local</p>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Redireciona para porta local ou builds locais ao iniciar.
                                </p>
                            </div>

                            <label id="toggle-dev-mode" style={{
                                position: 'relative',
                                display: 'inline-block',
                                width: '46px',
                                height: '24px',
                                cursor: 'pointer',
                                flexShrink: 0,
                            }}>
                                <input
                                    type="checkbox"
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                    checked={devSettings.devMode}
                                    onChange={(e) => setDevSettings((prev) => ({ ...prev, devMode: e.target.checked }))}
                                />
                                <span style={{
                                    position: 'absolute',
                                    top: 0, left: 0, right: 0, bottom: 0,
                                    backgroundColor: devSettings.devMode ? 'var(--accent-primary)' : 'rgba(255,255,255,0.12)',
                                    borderRadius: '24px',
                                    transition: '0.25s',
                                }}>
                                    <span style={{
                                        position: 'absolute',
                                        height: '18px', width: '18px',
                                        left: devSettings.devMode ? '24px' : '4px',
                                        bottom: '3px',
                                        backgroundColor: 'white',
                                        borderRadius: '50%',
                                        transition: '0.25s',
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                                    }} />
                                </span>
                            </label>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                id="btn-save-dev-settings"
                                className="btn btn-primary"
                                onClick={handleSaveSettings}
                                disabled={!hasChanges}
                            >
                                Salvar e Reiniciar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
