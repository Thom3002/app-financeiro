import { useState, useEffect } from 'react';

export default function SettingsPage() {
    const isElectron = !!window.electronAPI;

    const [version, setVersion] = useState('1.0.0 (Web)');
    const [updateStatus, setUpdateStatus] = useState('idle'); // idle, checking, available, downloading, downloaded, not-available, error
    const [updateMsg, setUpdateMsg] = useState('');

    // Configurações locais editáveis
    const [devSettings, setDevSettings] = useState({
        devMode: false,
        devPath: '',
        allowPrerelease: false
    });
    
    // Configurações originais para comparar se houve alteração
    const [initialSettings, setInitialSettings] = useState({
        devMode: false,
        devPath: '',
        allowPrerelease: false
    });

    const [devPathInput, setDevPathInput] = useState('');

    useEffect(() => {
        if (!isElectron) return;

        // Carrega versão
        window.electronAPI.getVersion().then(setVersion).catch(console.error);

        // Carrega configurações
        window.electronAPI.getDevSettings().then(settings => {
            setDevSettings(settings);
            setInitialSettings(settings);
            setDevPathInput(settings.devPath || '');
        }).catch(console.error);

        // Escuta eventos de atualização
        const removeUpdateListener = window.electronAPI.onUpdateEvent((evt) => {
            setUpdateStatus(evt.status);
            setUpdateMsg(evt.message || '');
        });

        return () => {
            removeUpdateListener();
        };
    }, [isElectron]);

    const handleQuitAndInstall = () => {
        if (!isElectron) return;
        window.electronAPI.quitAndInstall();
    };

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
                allowPrerelease: devSettings.allowPrerelease
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

            {/* SEÇÃO 1: SOBRE & ATUALIZAÇÕES */}
            <div className="card" style={{ marginBottom: '24px', padding: '24px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📦 Atualização do Sistema
                </h3>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: 'var(--text-muted)' }}>Versão Atual Instalada</p>
                        <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace' }}>v{version}</p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        {isElectron ? (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {updateStatus === 'downloaded' ? (
                                    <button 
                                        className="btn btn-success" 
                                        onClick={handleQuitAndInstall}
                                        style={{ background: '#22c55e', color: 'white', padding: '8px 16px' }}
                                    >
                                        Reiniciar para Atualizar
                                    </button>
                                ) : (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ width: '8px', height: '8px', background: '#3b82f6', borderRadius: '50%', display: 'inline-block' }} />
                                        Verificação automática de atualizações ativa
                                    </span>
                                )}
                            </span>
                        ) : (
                            <span className="text-xs text-muted" style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                                Apenas no app Desktop
                            </span>
                        )}
                    </div>
                </div>

                {isElectron && (
                    <div style={{
                        padding: '16px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        {/* Toggle de Canal de Pré-lançamento (Beta) */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '500' }}>Receber versões de Pré-lançamento (Beta)</p>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Ativa a busca por builds de teste ou releases beta no GitHub (ideal para homologação).
                                </p>
                            </div>

                            {/* Toggle Switch */}
                            <label style={{
                                position: 'relative',
                                display: 'inline-block',
                                width: '46px',
                                height: '24px',
                                cursor: 'pointer'
                            }}>
                                <input
                                    type="checkbox"
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                    checked={devSettings.allowPrerelease}
                                    onChange={(e) => setDevSettings(prev => ({ ...prev, allowPrerelease: e.target.checked }))}
                                />
                                <span style={{
                                    position: 'absolute',
                                    top: 0, left: 0, right: 0, bottom: 0,
                                    backgroundColor: devSettings.allowPrerelease ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                                    borderRadius: '24px',
                                    transition: '0.2s',
                                }}>
                                    <span style={{
                                        position: 'absolute',
                                        content: '""',
                                        height: '18px', width: '18px',
                                        left: devSettings.allowPrerelease ? '24px' : '4px',
                                        bottom: '3px',
                                        backgroundColor: 'white',
                                        borderRadius: '50%',
                                        transition: '0.2s'
                                    }} />
                                </span>
                            </label>
                        </div>

                        {/* Status de Download atual */}
                        {updateStatus !== 'idle' && updateStatus !== 'not-available' && updateStatus !== 'downloaded' && (
                            <div style={{
                                padding: '10px 14px',
                                background: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid rgba(59, 130, 246, 0.2)',
                                borderRadius: '6px',
                                fontSize: '13px',
                                color: '#60a5fa'
                            }}>
                                {updateStatus === 'checking' && '🔍 Procurando atualizações...'}
                                {(updateStatus === 'available' || updateStatus === 'downloading') && `📥 ${updateMsg || 'Baixando nova versão...'}`}
                                {updateStatus === 'error' && `❌ ${updateMsg || 'Falha ao buscar atualizações.'}`}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* SEÇÃO 2: MODO DESENVOLVEDOR */}
            <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🛠️ Modo Desenvolvedor
                </h3>

                {!isElectron ? (
                    <div style={{ textAlign: 'center', padding: '10px 0', color: 'var(--text-muted)' }}>
                        <p style={{ margin: 0 }}>O Modo Desenvolvedor e desvio de código local estão disponíveis apenas rodando na casca Electron instalada.</p>
                    </div>
                ) : (
                    <div>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5', margin: '0 0 20px 0' }}>
                            O Modo Desenvolvedor redireciona este aplicativo instalado para ler os arquivos e servidores locais da sua pasta de desenvolvimento.
                            Qualquer alteração feita no seu código refletirá aqui em tempo real.
                        </p>

                        <div className="form-group" style={{ marginBottom: '20px' }}>
                            <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                                Caminho do Repositório Local
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                style={{ fontFamily: 'monospace', fontSize: '13px' }}
                                placeholder="Ex: /Users/usuario/Desktop/Projetos-Pessoais/app-financeiro"
                                value={devPathInput}
                                onChange={(e) => setDevPathInput(e.target.value)}
                            />
                            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                                Caminho absoluto da pasta raiz do seu projeto <code>app-financeiro</code> nesta máquina.
                            </p>
                        </div>

                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '16px',
                            background: 'rgba(255,255,255,0.02)',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.06)',
                            marginBottom: '20px'
                        }}>
                            <div>
                                <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '500' }}>Ativar Desvio Local</p>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Redireciona o aplicativo para sua porta local ou builds locais ao iniciar.
                                </p>
                            </div>

                            {/* Toggle Switch */}
                            <label style={{
                                position: 'relative',
                                display: 'inline-block',
                                width: '46px',
                                height: '24px',
                                cursor: 'pointer'
                            }}>
                                <input
                                    type="checkbox"
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                    checked={devSettings.devMode}
                                    onChange={(e) => setDevSettings(prev => ({ ...prev, devMode: e.target.checked }))}
                                />
                                <span style={{
                                    position: 'absolute',
                                    top: 0, left: 0, right: 0, bottom: 0,
                                    backgroundColor: devSettings.devMode ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                                    borderRadius: '24px',
                                    transition: '0.2s',
                                }}>
                                    <span style={{
                                        position: 'absolute',
                                        content: '""',
                                        height: '18px', width: '18px',
                                        left: devSettings.devMode ? '24px' : '4px',
                                        bottom: '3px',
                                        backgroundColor: 'white',
                                        borderRadius: '50%',
                                        transition: '0.2s'
                                    }} />
                                </span>
                            </label>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
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
