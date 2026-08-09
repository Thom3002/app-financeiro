import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useVisibility } from '../contexts/VisibilityContext';
import PluggyConnectModal from '../components/PluggyConnectModal';

const STEPS = ['Banco', 'Upload', 'Preview', 'Resultado'];

export default function ImportPage() {
    const { isVisible } = useVisibility();
    const navigate = useNavigate();

    // Tab principal: 'open-finance' (padrão) ou 'csv-file'
    const [mainTab, setMainTab] = useState('open-finance');

    // Estado do Pluggy / Open Finance
    const [pluggyConfig, setPluggyConfig] = useState({ hasCredentials: false, clientId: null });
    const [connections, setConnections] = useState([]);
    const [loadingPluggy, setLoadingPluggy] = useState(true);
    const [isPluggyOpen, setIsPluggyOpen] = useState(false);
    const [syncingAll, setSyncingAll] = useState(false);

    // Estado do Importador CSV
    const [banks, setBanks] = useState([]);
    const [selectedBank, setSelectedBank] = useState('');
    const [step, setStep] = useState(0);
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const [loadingCSV, setLoadingCSV] = useState(false);
    const [errorCSV, setErrorCSV] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [history, setHistory] = useState([]);

    const loadPluggyData = useCallback(async () => {
        setLoadingPluggy(true);
        try {
            const config = await api.getPluggyConfig();
            setPluggyConfig(config);
            if (config.hasCredentials) {
                const conns = await api.getPluggyConnections();
                setConnections(conns);
            }
        } catch (err) {
            console.error('Erro ao carregar dados do Pluggy:', err);
        }
        setLoadingPluggy(false);
    }, []);

    useEffect(() => {
        loadPluggyData();
        api.getBanks().then(setBanks).catch(() => { });
        api.getImportHistory().then(setHistory).catch(() => { });
    }, [loadPluggyData]);

    const handleSyncAll = async () => {
        setSyncingAll(true);
        try {
            const res = await api.syncPluggy();
            await loadPluggyData();
            window.dispatchEvent(new Event('unclassified-count-changed'));
            const count = res?.newTransactionsCount ?? 0;
            alert(count > 0 ? `Sincronização concluída com sucesso! ${count} nova(s) transação(ões) importada(s).` : 'Sincronização concluída! Suas contas já estavam atualizadas.');
        } catch (err) {
            alert('Erro ao sincronizar contas: ' + err.message);
        }
        setSyncingAll(false);
    };

    const handleDeleteConnection = async (id, name) => {
        if (!confirm(`Tem certeza que deseja desconectar o banco ${name || id}? Isso removerá as transações vinculadas.`)) {
            return;
        }
        try {
            await api.deletePluggyConnection(id);
            await loadPluggyData();
            window.dispatchEvent(new Event('unclassified-count-changed'));
        } catch (err) {
            alert('Erro ao desconectar: ' + err.message);
        }
    };

    // Handlers do CSV
    const handleFileChange = (e) => {
        const f = e.target.files?.[0];
        if (f) {
            setFile(f);
            setErrorCSV('');
        }
    };

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) {
            setFile(f);
            setErrorCSV('');
        }
    }, []);

    const doPreview = async () => {
        if (!file || !selectedBank) return;
        setLoadingCSV(true);
        setErrorCSV('');
        try {
            const data = await api.importPreview(selectedBank, file);
            setPreview(data);
            setStep(2);
        } catch (e) {
            setErrorCSV(e.message);
        }
        setLoadingCSV(false);
    };

    const doImport = async () => {
        if (!file || !selectedBank) return;
        setLoadingCSV(true);
        setErrorCSV('');
        try {
            const data = await api.importExecute(selectedBank, file);
            setResult(data);
            setStep(3);
            api.getImportHistory().then(setHistory).catch(() => { });
            window.dispatchEvent(new Event('unclassified-count-changed'));
        } catch (e) {
            setErrorCSV(e.message);
        }
        setLoadingCSV(false);
    };

    const resetCSV = () => {
        setStep(0);
        setFile(null);
        setPreview(null);
        setResult(null);
        setErrorCSV('');
        setSelectedBank('');
    };

    const handleDeleteCSV = async (id) => {
        if (!confirm('Tem certeza que deseja deletar esta importação? Isso excluirá permanentemente todas as transações importadas neste lote.')) {
            return;
        }
        try {
            await api.deleteImport(id);
            api.getImportHistory().then(setHistory).catch(() => { });
            window.dispatchEvent(new Event('unclassified-count-changed'));
        } catch (e) {
            alert('Erro ao deletar importação: ' + e.message);
        }
    };

    const formatCurrency = (v) => {
        if (!isVisible) return '*****';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    };

    const formatDate = (d) => {
        if (!d) return '';
        const dt = new Date(d);
        return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div>
            <div className="page-header">
                <h2>Conectar & Importar</h2>
                <p>Sincronize automaticamente via Open Finance ou importe arquivos CSV</p>
            </div>

            {/* Modal Pluggy Connect */}
            <PluggyConnectModal
                isOpen={isPluggyOpen}
                onClose={() => setIsPluggyOpen(false)}
                onSuccessSync={() => {
                    loadPluggyData();
                    window.dispatchEvent(new Event('unclassified-count-changed'));
                }}
            />

            {/* Sub-abas de Navegação */}
            <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
                <button
                    onClick={() => setMainTab('open-finance')}
                    style={{
                        padding: '10px 18px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: mainTab === 'open-finance' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        color: mainTab === 'open-finance' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        fontWeight: mainTab === 'open-finance' ? '600' : '400',
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    Sincronização Automática (Open Finance)
                </button>

                <button
                    onClick={() => setMainTab('csv-file')}
                    style={{
                        padding: '10px 18px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: mainTab === 'csv-file' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        color: mainTab === 'csv-file' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        fontWeight: mainTab === 'csv-file' ? '600' : '400',
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    Importar Arquivo (CSV / OFX)
                </button>
            </div>

            {/* Aba 1: Open Finance (Pluggy) */}
            {mainTab === 'open-finance' && (
                <div>
                    {!pluggyConfig.hasCredentials ? (
                        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', color: 'var(--text-primary)' }}>
                                Conexão Open Finance Desativada
                            </h3>
                            <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto 24px auto', fontSize: '0.9rem' }}>
                                Para conectar suas contas bancárias automaticamente com atualização em tempo real, cadastre seu Client ID e Client Secret nas Configurações.
                            </p>
                            <button
                                className="btn btn-primary btn-lg"
                                onClick={() => navigate('/settings')}
                            >
                                Ir para Configurações
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="card">
                                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 className="card-title">Bancos Conectados</h3>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                                            Sua integração via Pluggy Open Finance está ativa
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={handleSyncAll}
                                            disabled={syncingAll}
                                            title="Atualizar extrato de todas as contas salvas"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: syncingAll ? 'spin 1s linear infinite' : 'none' }}>
                                                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                                            </svg>
                                            {syncingAll ? 'Sincronizando...' : 'Atualizar Extratos'}
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => setIsPluggyOpen(true)}
                                        >
                                            + Conectar Banco
                                        </button>
                                    </div>
                                </div>

                                {loadingPluggy ? (
                                    <div className="loading" style={{ padding: '24px' }}>Carregando conexões bancárias...</div>
                                ) : connections.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '32px' }}>
                                        <h3>Nenhum banco conectado ainda</h3>
                                        <p style={{ margin: 0 }}>Utilize o botão acima para conectar seu Itaú, Nubank, Bradesco ou outros bancos.</p>
                                    </div>
                                ) : (
                                    <div className="table-container">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Instituição</th>
                                                    <th>Status da Conexão</th>
                                                    <th>Última Sincronização</th>
                                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {connections.map((item) => (
                                                    <tr key={item.id}>
                                                        <td style={{ fontWeight: '600' }}>
                                                            {item.connector_name || 'Banco Conectado'}
                                                        </td>
                                                        <td>
                                                            <span className={`badge ${item.status === 'UPDATED' ? 'badge-success' : 'badge-warning'}`}>
                                                                {item.status === 'UPDATED' ? 'Sincronizado' : item.status}
                                                            </span>
                                                        </td>
                                                        <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                            {item.last_synced_at ? formatDate(item.last_synced_at) : 'Nunca'}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <button
                                                                className="btn btn-sm btn-danger"
                                                                onClick={() => handleDeleteConnection(item.id, item.connector_name)}
                                                            >
                                                                Desconectar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Aba 2: Importação de Arquivo CSV */}
            {mainTab === 'csv-file' && (
                <div>
                    {/* Steps */}
                    <div className="steps">
                        {STEPS.map((s, i) => (
                            <div key={s}>
                                <div className={`step ${i === step ? 'active' : i < step ? 'completed' : ''}`}>
                                    <div className="step-number">{i < step ? '✓' : i + 1}</div>
                                    {s}
                                </div>
                                {i < STEPS.length - 1 && <div className="step-divider" />}
                            </div>
                        ))}
                    </div>

                    {errorCSV && <div className="alert alert-danger">{errorCSV}</div>}

                    {/* Step 0: Select Bank */}
                    {step === 0 && (
                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title">Selecione o banco</h3>
                            </div>
                            <div className="bank-grid">
                                {banks.map((b) => (
                                    <div
                                        key={b.id}
                                        className={`bank-card ${selectedBank === b.id ? 'selected' : ''}`}
                                        onClick={() => setSelectedBank(b.id)}
                                    >
                                        <div className="bank-name">{b.nome}</div>
                                        <div className="bank-desc">{b.descricao}</div>
                                    </div>
                                ))}
                            </div>
                            <button
                                className="btn btn-primary btn-lg"
                                disabled={!selectedBank}
                                onClick={() => setStep(1)}
                            >
                                Continuar →
                            </button>
                        </div>
                    )}

                    {/* Step 1: Upload File */}
                    {step === 1 && (
                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title">Upload do arquivo CSV</h3>
                            </div>
                            <div
                                className={`upload-dropzone ${dragOver ? 'dragover' : ''} ${file ? 'has-file' : ''}`}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                onClick={() => document.getElementById('file-input').click()}
                            >
                                <input
                                    id="file-input"
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ display: 'none' }}
                                />
                                {file ? (
                                    <div>
                                        <h4 style={{ color: 'var(--accent-primary)', marginBottom: '4px' }}>{file.name}</h4>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{(file.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                ) : (
                                    <div>
                                        <p>Arraste seu arquivo CSV aqui ou clique para selecionar</p>
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                                <button className="btn btn-secondary" onClick={() => setStep(0)}>← Voltar</button>
                                <button
                                    className="btn btn-primary btn-lg"
                                    disabled={!file || loadingCSV}
                                    onClick={doPreview}
                                >
                                    {loadingCSV ? 'Analisando...' : 'Pré-visualizar →'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Preview */}
                    {step === 2 && preview && (
                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title">Pré-visualização</h3>
                                <p>{preview.totalParsed} transações encontradas no arquivo</p>
                            </div>

                            {preview.errors.length > 0 && (
                                <div className="alert alert-warning">
                                    {preview.errors.length} erro(s) ao processar algumas linhas.
                                </div>
                            )}

                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Data</th>
                                            <th>Título</th>
                                            <th>Descrição</th>
                                            <th style={{ textAlign: 'right' }}>Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.transactions.map((tx, idx) => (
                                            <tr key={idx}>
                                                <td>{tx.data}</td>
                                                <td>{tx.titulo}</td>
                                                <td>{tx.descricao}</td>
                                                <td className={`text-right ${tx.valor >= 0 ? 'valor-positivo' : 'valor-negativo'}`}>
                                                    {formatCurrency(tx.valor)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                                <button className="btn btn-secondary" onClick={() => setStep(1)}>← Voltar</button>
                                <button
                                    className="btn btn-primary btn-lg"
                                    disabled={loadingCSV}
                                    onClick={doImport}
                                >
                                    {loadingCSV ? 'Importando...' : 'Confirmar Importação'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Result */}
                    {step === 3 && result && (
                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title">Importação Concluída</h3>
                            </div>
                            <div className="alert alert-success">
                                Sucesso! {result.log.novas} novas transações adicionadas ({result.log.duplicadas} duplicadas ignoradas).
                            </div>
                            <button className="btn btn-primary" onClick={resetCSV}>
                                Importar Outro Arquivo
                            </button>
                        </div>
                    )}

                    {/* History */}
                    {history.length > 0 && (
                        <div className="card" style={{ marginTop: '24px' }}>
                            <div className="card-header">
                                <h3 className="card-title">Histórico de Arquivos Importados</h3>
                            </div>
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Data</th>
                                            <th>Banco</th>
                                            <th>Arquivo</th>
                                            <th>Total</th>
                                            <th>Novas</th>
                                            <th>Duplicadas</th>
                                            <th>Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map((h) => (
                                            <tr key={h.id}>
                                                <td>{formatDate(h.created_at)}</td>
                                                <td><span className="badge badge-accent">{h.banco}</span></td>
                                                <td>{h.filename}</td>
                                                <td>{h.total}</td>
                                                <td>{h.novas}</td>
                                                <td>{h.duplicadas}</td>
                                                <td>
                                                    <button
                                                        className="btn btn-sm btn-danger"
                                                        onClick={() => handleDeleteCSV(h.id)}
                                                    >
                                                        Excluir Lote
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
