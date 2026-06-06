import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useVisibility } from '../contexts/VisibilityContext';

const STEPS = ['Banco', 'Upload', 'Preview', 'Resultado'];

export default function ImportPage() {
    const { isVisible } = useVisibility();
    const [banks, setBanks] = useState([]);
    const [selectedBank, setSelectedBank] = useState('');
    const [step, setStep] = useState(0);
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [history, setHistory] = useState([]);
    const [confirmDeleteImportId, setConfirmDeleteImportId] = useState(null);
    const [deletingImportId, setDeletingImportId] = useState(null);

    useEffect(() => {
        api.getBanks().then(setBanks).catch(() => { });
        api.getImportHistory().then(setHistory).catch(() => { });

        // Restore last selected bank and skip to upload step
        const lastBank = localStorage.getItem('lastSelectedBank');
        if (lastBank) {
            setSelectedBank(lastBank);
            setStep(1);
        }
    }, []);

    const handleFileChange = (e) => {
        const f = e.target.files?.[0];
        if (f) {
            setFile(f);
            setError('');
        }
    };

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) {
            setFile(f);
            setError('');
        }
    }, []);

    const doPreview = async () => {
        if (!file || !selectedBank) return;
        setLoading(true);
        setError('');
        try {
            const data = await api.importPreview(selectedBank, file);
            setPreview(data);
            setStep(2);
        } catch (e) {
            setError(e.message);
        }
        setLoading(false);
    };

    const doImport = async () => {
        if (!file || !selectedBank) return;
        setLoading(true);
        setError('');
        try {
            const data = await api.importExecute(selectedBank, file);
            setResult(data);
            setStep(3);
            api.getImportHistory().then(setHistory).catch(() => { });
        } catch (e) {
            setError(e.message);
        }
        setLoading(false);
    };

    const reset = () => {
        setStep(0);
        setFile(null);
        setPreview(null);
        setResult(null);
        setError('');
        setSelectedBank('');
        localStorage.removeItem('lastSelectedBank');
    };

    const formatCurrency = (v) => {
        if (!isVisible) return '*****';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    };

    return (
        <div>
            <div className="page-header">
                <h2>📥 Importar Extrato</h2>
                <p>Importe seus extratos bancários em CSV</p>
            </div>

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

            {error && <div className="alert alert-danger">⚠️ {error}</div>}

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
                                <div className="bank-icon">🏦</div>
                                <div className="bank-name">{b.nome}</div>
                                <div className="bank-desc">{b.descricao}</div>
                            </div>
                        ))}
                    </div>
                    <button
                        className="btn btn-primary btn-lg"
                        disabled={!selectedBank}
                        onClick={() => {
                            localStorage.setItem('lastSelectedBank', selectedBank);
                            setStep(1);
                        }}
                    >
                        Continuar →
                    </button>
                </div>
            )}

            {/* Step 1: Upload */}
            {step === 1 && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Upload do CSV — {selectedBank}</h3>
                    </div>
                    <div
                        className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                    >
                        <input type="file" accept=".csv" onChange={handleFileChange} />
                        <div className="upload-icon">📄</div>
                        {file ? (
                            <div className="upload-text">
                                <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                            </div>
                        ) : (
                            <div className="upload-text">
                                Arraste o arquivo CSV ou <strong>clique para selecionar</strong>
                            </div>
                        )}
                    </div>
                    <div className="btn-group mt-4">
                        <button className="btn btn-secondary" onClick={() => setStep(0)}>
                            ← Voltar
                        </button>
                        <button
                            className="btn btn-primary"
                            disabled={!file || loading}
                            onClick={doPreview}
                        >
                            {loading ? 'Processando...' : 'Visualizar →'}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 2: Preview */}
            {step === 2 && preview && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            Preview — {preview.totalParsed} transações encontradas
                        </h3>
                    </div>
                    {preview.errors?.length > 0 && (
                        <div className="alert alert-warning">
                            ⚠️ {preview.errors.length} aviso(s): {preview.errors[0]}
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
                                {preview.transactions.map((t, i) => (
                                    <tr key={i}>
                                        <td>{t.data}</td>
                                        <td className="truncate">{t.titulo}</td>
                                        <td className="truncate">{t.descricao}</td>
                                        <td
                                            className={`text-right ${t.valor >= 0 ? 'valor-positivo' : 'valor-negativo'}`}
                                        >
                                            {formatCurrency(t.valor)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="btn-group mt-4">
                        <button className="btn btn-secondary" onClick={() => setStep(1)}>
                            ← Voltar
                        </button>
                        <button
                            className="btn btn-primary btn-lg"
                            disabled={loading}
                            onClick={doImport}
                        >
                            {loading ? 'Importando...' : `Importar ${preview.totalParsed} transações →`}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: Result */}
            {step === 3 && result && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            {result.success ? '✅ Importação concluída!' : '❌ Erro na importação'}
                        </h3>
                    </div>
                    {result.log && (
                        <div className="import-results">
                            <div className="import-result-item">
                                <div className="import-result-value">{result.log.total}</div>
                                <div className="import-result-label">Total</div>
                            </div>
                            <div className="import-result-item">
                                <div className="import-result-value" style={{ color: 'var(--success)' }}>
                                    {result.log.novas}
                                </div>
                                <div className="import-result-label">Novas</div>
                            </div>
                            <div className="import-result-item">
                                <div className="import-result-value" style={{ color: 'var(--warning)' }}>
                                    {result.log.duplicadas}
                                </div>
                                <div className="import-result-label">Duplicadas</div>
                            </div>
                            <div className="import-result-item">
                                <div className="import-result-value" style={{ color: 'var(--danger)' }}>
                                    {result.log.invalidas}
                                </div>
                                <div className="import-result-label">Inválidas</div>
                            </div>
                        </div>
                    )}
                    <button className="btn btn-primary mt-4" onClick={reset}>
                        Nova importação
                    </button>
                </div>
            )}

            {/* Import History */}
            {history.length > 0 && (
                <div className="card mt-6">
                    <div className="card-header">
                        <h3 className="card-title">Histórico de importações</h3>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Banco</th>
                                    <th>Arquivo</th>
                                    <th className="text-right">Total</th>
                                    <th className="text-right">Novas</th>
                                    <th className="text-right">Duplic.</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((h) => (
                                    <tr key={h.id}>
                                        <td>{new Date(h.created_at).toLocaleDateString('pt-BR')}</td>
                                        <td><span className="badge badge-accent">{h.banco}</span></td>
                                        <td className="truncate">{h.filename}</td>
                                        <td className="text-right">{h.total}</td>
                                        <td className="text-right valor-positivo">{h.novas}</td>
                                        <td className="text-right text-muted">{h.duplicadas}</td>
                                        <td>
                                            {confirmDeleteImportId === h.id ? (
                                                <div className="btn-group">
                                                    <button
                                                        className="btn btn-sm btn-danger"
                                                        disabled={deletingImportId === h.id}
                                                        onClick={async () => {
                                                            setDeletingImportId(h.id);
                                                            try {
                                                                await api.deleteImport(h.id);
                                                                setHistory(hist => hist.filter(x => x.id !== h.id));
                                                            } catch (e) {
                                                                alert('Erro ao deletar: ' + e.message);
                                                            }
                                                            setDeletingImportId(null);
                                                            setConfirmDeleteImportId(null);
                                                        }}
                                                    >
                                                        {deletingImportId === h.id ? '...' : 'Confirmar?'}
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => setConfirmDeleteImportId(null)}
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="btn btn-sm btn-danger"
                                                    onClick={() => setConfirmDeleteImportId(h.id)}
                                                    title="Deletar importação e transações"
                                                >
                                                    🗑
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
