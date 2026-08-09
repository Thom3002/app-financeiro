import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

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

// Mapeia o status retornado pela API (UpdateCheckResult) para o estado interno da UI
function mapApiStatus(apiStatus) {
    const map = {
        'up-to-date':       UPDATE_STATUS.NOT_AVAILABLE,
        'update-available': UPDATE_STATUS.AVAILABLE,
        'not-available':    UPDATE_STATUS.NOT_AVAILABLE,
        'error':            UPDATE_STATUS.ERROR,
        'checking':         UPDATE_STATUS.CHECKING,
        'downloading':      UPDATE_STATUS.DOWNLOADING,
        'downloaded':       UPDATE_STATUS.DOWNLOADED,
    };
    return map[apiStatus] || UPDATE_STATUS.ERROR;
}

// ─── Sub-componente: Painel de Atualização ────────────────────────────────────

function UpdatePanel({ isElectron }) {
    const [version, setVersion] = useState('');
    const [updateStatus, setUpdateStatus] = useState(UPDATE_STATUS.IDLE);
    const [updateMsg, setUpdateMsg] = useState('');
    const [updateVersion, setUpdateVersion] = useState('');
    const [downloadPercent, setDownloadPercent] = useState(0);
    // Guarda o resultado completo da verificação (contém downloadUrl e downloadSize)
    const [updateInfo, setUpdateInfo] = useState(null);

    useEffect(() => {
        if (!isElectron) return;

        window.electronAPI.getVersion().then(setVersion).catch(console.error);

        // Helper para processar um evento de update (reutilizado abaixo)
        const applyUpdateEvent = (evt) => {
            if (!evt) return;
            const uiStatus = mapApiStatus(evt.status);
            setUpdateStatus(uiStatus);
            setUpdateMsg(evt.message || '');
            if (evt.status === 'update-available') {
                setUpdateInfo(evt);
                if (evt.latestVersion) setUpdateVersion(evt.latestVersion);
            }
            if (evt.percent !== undefined) setDownloadPercent(evt.percent);
        };

        // Listener para eventos de progresso de download (vindos do main process)
        const removeListener = window.electronAPI.onUpdateEvent(applyUpdateEvent);

        // Recupera evento de update que pode ter chegado ANTES deste listener ser registrado
        // (o main process dispara a verificação automática 3s após o boot)
        if (window.electronAPI.getPendingUpdate) {
            window.electronAPI.getPendingUpdate()
                .then(applyUpdateEvent)
                .catch(console.error);
        }

        return () => removeListener();
    }, [isElectron]);

    const handleCheckForUpdates = useCallback(async () => {
        if (!isElectron) return;
        setUpdateStatus(UPDATE_STATUS.CHECKING);
        setUpdateMsg('Verificando atualizações...');
        setUpdateInfo(null);
        setUpdateVersion('');
        try {
            const result = await window.electronAPI.checkForUpdates();
            const uiStatus = mapApiStatus(result.status);
            setUpdateStatus(uiStatus);
            setUpdateMsg(result.message || '');
            if (result.status === 'update-available') {
                setUpdateInfo(result);
                if (result.latestVersion) setUpdateVersion(result.latestVersion);
            }
        } catch (e) {
            setUpdateStatus(UPDATE_STATUS.ERROR);
            setUpdateMsg(`Erro ao verificar atualizações: ${e.message}`);
        }
    }, [isElectron]);

    const handleQuitAndInstall = useCallback(() => {
        if (!isElectron) return;
        window.electronAPI.quitAndInstall();
    }, [isElectron]);

    const handleDownloadUpdate = useCallback(() => {
        if (!isElectron || !updateInfo?.downloadUrl) return;
        setUpdateStatus(UPDATE_STATUS.DOWNLOADING);
        setDownloadPercent(0);
        setUpdateMsg('Iniciando download...');
        // O progresso vem via onUpdateEvent (status: downloading, percent)
        window.electronAPI.downloadUpdate(updateInfo.downloadUrl, updateInfo.downloadSize);
    }, [isElectron, updateInfo]);

    // ─── Estados visuais do card de update ──────────────────────────────────

    const isChecking = updateStatus === UPDATE_STATUS.CHECKING;
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
            ) : isAvailable ? (
                /* Update encontrado — aguarda o usuário confirmar o download */
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        id="btn-download-update"
                        onClick={handleDownloadUpdate}
                        style={{
                            flex: 1,
                            minWidth: '160px',
                            padding: '10px 20px',
                            background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '7px',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                        onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                    >
                        📥 Baixar Atualização
                    </button>
                </div>
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
    // isElectron via flag síncrona — nunca precisa de await, nunca undefined em Electron
    const isElectron = !!window.electronAPI?.isElectron;
    // Diagnóstico: se o preload falhou, window.__preloadError conterá a mensagem de erro
    const preloadError = window.__preloadError || null;

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

            {/* Banner de diagnóstico: visível apenas quando o preload falhou */}
            {preloadError && (
                <div style={{
                    marginBottom: '20px',
                    padding: '14px 16px',
                    background: 'rgba(239,68,68,0.10)',
                    border: '1px solid rgba(239,68,68,0.35)',
                    borderRadius: '10px',
                    fontSize: '13px',
                    color: '#f87171',
                    lineHeight: '1.6',
                }}>
                    <strong>⚠️ Erro no preload do Electron:</strong>
                    <br />
                    <code style={{ wordBreak: 'break-all', fontSize: '12px' }}>{preloadError}</code>
                    <br />
                    <span style={{ color: 'var(--text-muted)' }}>
                        Por favor, reporte este erro ao desenvolvedor.
                    </span>
                </div>
            )}

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

                <PluggySettingsPanel />
                <ResetAppPanel />
            </div>
        </div>
    );
}

function ResetAppPanel() {
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [resetType, setResetType] = useState('transactions'); // 'transactions' | 'full'
    const [resetting, setResetting] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });

    const handleOpenReset = (type) => {
        setResetType(type);
        setConfirmModalOpen(true);
    };

    const handleConfirmReset = async () => {
        setResetting(true);
        setMsg({ text: '', type: '' });
        try {
            await api.resetApp(resetType);
            setMsg({
                text: resetType === 'full'
                    ? 'Aplicativo resetado com sucesso! Todos os dados foram limpos.'
                    : 'Transações e históricos zerados com sucesso!',
                type: 'success',
            });
            window.dispatchEvent(new Event('unclassified-count-changed'));
            setConfirmModalOpen(false);
        } catch (err) {
            setMsg({ text: 'Erro ao resetar: ' + err.message, type: 'danger' });
        }
        setResetting(false);
    };

    return (
        <div className="card" style={{ marginTop: '20px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            <div className="card-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.2)' }}>
                <h3 className="card-title" style={{ color: 'var(--accent-danger, #ef4444)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ⚠️ Zona de Perigo (Reset do Aplicativo)
                </h3>
            </div>
            <div className="card-body">
                <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                    Utilize as opções abaixo para zerar o banco de dados. Atenção: estas ações são irreversíveis.
                </p>

                {msg.text && (
                    <div className={`alert alert-${msg.type}`} style={{ marginBottom: '16px' }}>
                        {msg.text}
                    </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    <button
                        className="btn btn-danger"
                        onClick={() => handleOpenReset('transactions')}
                        disabled={resetting}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        🗑️ Resetar Apenas Transações
                    </button>
                    <button
                        className="btn"
                        onClick={() => handleOpenReset('full')}
                        disabled={resetting}
                        style={{
                            backgroundColor: '#991b1b',
                            color: '#fff',
                            border: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                    >
                        ⚠️ Resetar Aplicativo Inteiro
                    </button>
                </div>

                {confirmModalOpen && (
                    <div
                        style={{
                            position: 'fixed',
                            top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.75)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 9999,
                            padding: '16px',
                        }}
                        onClick={() => setConfirmModalOpen(false)}
                    >
                        <div
                            className="card"
                            style={{ maxWidth: '500px', width: '100%', padding: '24px' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 style={{ color: 'var(--accent-danger, #ef4444)', marginTop: 0, marginBottom: '12px' }}>
                                Confirmar Reset de Dados?
                            </h3>
                            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
                                {resetType === 'full'
                                    ? 'Tem certeza de que deseja resetar o aplicativo inteiro? Isso excluirá PERMANENTEMENTE todas as transações, conexões do Pluggy, regras de classificação, categorias customizadas e configurações.'
                                    : 'Tem certeza de que deseja resetar todas as transações? Isso excluirá PERMANENTEMENTE o histórico de transações, extratos importados e conexões salvas do Pluggy (regras e categorias serão mantidas).'}
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setConfirmModalOpen(false)}
                                    disabled={resetting}
                                >
                                    Cancelar
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={handleConfirmReset}
                                    disabled={resetting}
                                >
                                    {resetting ? 'Resetando...' : 'Sim, Resetar Agora'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function PluggySettingsPanel() {
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [hasCredentials, setHasCredentials] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [showSecret, setShowSecret] = useState(false);

    useEffect(() => {
        api.getPluggyConfig()
            .then((data) => {
                setHasCredentials(data.hasCredentials);
                if (data.clientId) setClientId(data.clientId);
                if (data.clientSecret) setClientSecret(data.clientSecret);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!clientId || !clientSecret) return;
        setSaving(true);
        setMsg('');
        try {
            await api.savePluggyConfig({ clientId, clientSecret });
            setHasCredentials(true);
            setMsg('Credenciais do Pluggy salvas com sucesso!');
            setTimeout(() => setMsg(''), 4000);
        } catch (err) {
            setMsg('Erro ao salvar credenciais: ' + err.message);
        }
        setSaving(false);
    };

    return (
        <div className="card" style={{ marginTop: '20px' }}>
            <div className="card-header">
                <h3 className="card-title">
                    Integração Pluggy (Open Finance)
                </h3>
                <span className={`badge ${hasCredentials ? 'badge-success' : 'badge-warning'}`}>
                    {hasCredentials ? 'Configurado' : 'Não Configurado'}
                </span>
            </div>
            <div className="card-body">
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    Insira abaixo o Client ID e Client Secret gerados na sua conta do Pluggy (dashboard.pluggy.ai) para habilitar a conexão automática com seus bancos.
                </p>

                {msg && <div className="alert alert-info" style={{ marginBottom: '16px' }}>{msg}</div>}

                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group">
                        <label className="form-label">Client ID do Pluggy</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Ex: 5ff1265b-4e7e-4785-af23-..."
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Client Secret do Pluggy</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type={showSecret ? 'text' : 'password'}
                                className="form-input"
                                placeholder={hasCredentials ? '••••••••••••••••' : 'Insira seu Client Secret'}
                                value={clientSecret}
                                onChange={(e) => setClientSecret(e.target.value)}
                                required={!hasCredentials}
                            />
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setShowSecret(!showSecret)}
                            >
                                {showSecret ? 'Ocultar' : 'Mostrar'}
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                        <button type="submit" className="btn btn-primary" disabled={saving || !clientId}>
                            {saving ? 'Salvando...' : 'Salvar Credenciais Pluggy'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
