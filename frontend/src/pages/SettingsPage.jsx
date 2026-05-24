import { useState, useEffect } from 'react';

function Toggle({ checked, onChange }) {
    return (
        <label style={{ position: 'relative', display: 'inline-block', width: '46px', height: '24px', cursor: 'pointer' }}>
            <input
                type="checkbox"
                style={{ opacity: 0, width: 0, height: 0 }}
                checked={checked}
                onChange={onChange}
            />
            <span style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: checked ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                borderRadius: '24px',
                transition: '0.2s',
            }}>
                <span style={{
                    position: 'absolute',
                    height: '18px', width: '18px',
                    left: checked ? '24px' : '4px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.2s',
                }} />
            </span>
        </label>
    );
}

export default function SettingsPage() {
    const isElectron = !!window.electronAPI;

    const [version, setVersion] = useState('—');
    const [allowPrerelease, setAllowPrerelease] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState('');

    const [updateStatus, setUpdateStatus] = useState('idle');
    const [updateMsg, setUpdateMsg] = useState('');

    useEffect(() => {
        if (!isElectron) return;

        window.electronAPI.getVersion().then(setVersion).catch(console.error);
        window.electronAPI.getAllowPrerelease().then(setAllowPrerelease).catch(console.error);

        const removeListener = window.electronAPI.onUpdateEvent((evt) => {
            setUpdateStatus(evt.status);
            setUpdateMsg(evt.message || '');
        });

        return () => removeListener();
    }, [isElectron]);

    const handleTogglePrerelease = async (e) => {
        const value = e.target.checked;
        setAllowPrerelease(value);
        setSaving(true);
        setSavedMsg('');
        try {
            await window.electronAPI.setAllowPrerelease(value);
            setSavedMsg(value
                ? 'Canal de desenvolvimento ativado. Próxima verificação incluirá versões beta.'
                : 'Canal de produção ativado. Apenas versões estáveis serão instaladas.');
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
            setTimeout(() => setSavedMsg(''), 4000);
        }
    };

    const handleCheckNow = async () => {
        if (!isElectron) return;
        setUpdateStatus('checking');
        setUpdateMsg('');
        const res = await window.electronAPI.checkForUpdates().catch(e => ({ success: false, error: e.message }));
        if (!res.success) {
            setUpdateStatus('error');
            setUpdateMsg(res.error || 'Falha ao verificar.');
        }
    };

    const handleInstall = () => {
        if (!isElectron) return;
        window.electronAPI.quitAndInstall();
    };

    const statusColor = {
        idle: 'var(--text-muted)',
        checking: '#60a5fa',
        available: '#f59e0b',
        downloading: '#f59e0b',
        downloaded: '#22c55e',
        'not-available': 'var(--text-muted)',
        error: '#f87171',
    }[updateStatus] || 'var(--text-muted)';

    return (
        <div style={{ maxWidth: '720px', margin: '0 auto', paddingBottom: '40px' }}>
            <div className="page-header">
                <h2>⚙️ Configurações</h2>
                <p>Gerencie a versão instalada e o canal de atualizações</p>
            </div>

            {/* ── SOBRE & ATUALIZAÇÕES ── */}
            <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '20px' }}>📦 Versão & Atualizações</h3>

                {/* Versão atual */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-muted)' }}>Versão Instalada</p>
                        <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                            v{version}
                        </p>
                    </div>

                    {isElectron && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                            {updateStatus === 'downloaded' ? (
                                <button
                                    className="btn btn-primary"
                                    onClick={handleInstall}
                                    style={{ background: '#22c55e', borderColor: '#22c55e' }}
                                >
                                    🔄 Reiniciar para Atualizar
                                </button>
                            ) : (
                                <button
                                    className="btn"
                                    onClick={handleCheckNow}
                                    disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                                    style={{ fontSize: '12px', padding: '6px 14px' }}
                                >
                                    {updateStatus === 'checking' ? '🔍 Verificando...' : '🔍 Verificar Agora'}
                                </button>
                            )}
                        </div>
                    )}

                    {!isElectron && (
                        <span style={{
                            fontSize: '12px', color: 'var(--text-muted)',
                            padding: '6px 12px',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '6px',
                        }}>
                            Apenas no app Desktop
                        </span>
                    )}
                </div>

                {/* Status de update */}
                {updateStatus !== 'idle' && (
                    <div style={{
                        padding: '10px 14px',
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${statusColor}44`,
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: statusColor,
                        marginBottom: '20px',
                    }}>
                        {updateStatus === 'checking' && '🔍 Procurando atualizações...'}
                        {updateStatus === 'not-available' && '✅ Você já está na versão mais recente.'}
                        {updateStatus === 'available' && `📥 ${updateMsg || 'Nova versão disponível!'}`}
                        {updateStatus === 'downloading' && `📥 ${updateMsg || 'Baixando...'}`}
                        {updateStatus === 'downloaded' && `✅ ${updateMsg || 'Atualização pronta!'}`}
                        {updateStatus === 'error' && `❌ ${updateMsg || 'Erro ao verificar.'}`}
                    </div>
                )}

                {/* Toggle canal dev/prod */}
                {isElectron && (
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '16px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '8px',
                    }}>
                        <div style={{ flex: 1, paddingRight: '16px' }}>
                            <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: '500' }}>
                                Receber versões de Desenvolvimento (Beta)
                            </p>
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                                {allowPrerelease
                                    ? '🧪 Ativo — você receberá builds de teste e versões beta antes do lançamento oficial.'
                                    : '🚀 Inativo — você receberá apenas versões estáveis de produção.'}
                            </p>
                            {savedMsg && (
                                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#60a5fa' }}>
                                    {savedMsg}
                                </p>
                            )}
                        </div>
                        <Toggle
                            checked={allowPrerelease}
                            onChange={saving ? undefined : handleTogglePrerelease}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
