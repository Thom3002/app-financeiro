import { useState, useEffect } from 'react';
import { api } from '../api';
import ConflictPanel from '../components/ConflictPanel';

const fmt = (v) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function ClassifyPage() {
    const [suggestions, setSuggestions] = useState([]);
    const [totalUnclassified, setTotalUnclassified] = useState(0);
    const [loading, setLoading] = useState(true);

    // Keyword form
    const [kwKeywords, setKwKeywords] = useState('');
    const [kwCategoria, setKwCategoria] = useState('');
    const [kwSubcategoria, setKwSubcategoria] = useState('');
    const [kwPreview, setKwPreview] = useState(null);
    const [kwLoading, setKwLoading] = useState(false);
    const [kwSaving, setKwSaving] = useState(false);

    // Suggestion inline edits
    const [editingSuggestion, setEditingSuggestion] = useState(null);
    const [sugCategoria, setSugCategoria] = useState('');
    const [sugSubcategoria, setSugSubcategoria] = useState('');

    // Conflict modal
    const [conflicts, setConflicts] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    const loadSuggestions = async () => {
        setLoading(true);
        try {
            const data = await api.getClassificationSuggestions();
            setSuggestions(data.suggestions || []);
            setTotalUnclassified(data.totalUnclassified || 0);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    useEffect(() => { loadSuggestions(); }, []);

    const handlePreviewKeyword = async () => {
        if (!kwKeywords.trim()) return;
        setKwLoading(true);
        try {
            const data = await api.previewKeyword({ keywords: kwKeywords });
            setKwPreview(data);
        } catch (e) {
            console.error(e);
        }
        setKwLoading(false);
    };

    const handleApplyKeyword = async () => {
        if (!kwKeywords.trim() || !kwCategoria.trim() || kwSaving) return;
        setKwSaving(true);
        try {
            const result = await api.applyClassification({
                keywords: kwKeywords,
                categoria: kwCategoria,
                subcategoria: kwSubcategoria || undefined,
            });
            if (result.conflicts && result.conflicts.length > 0) {
                setConflicts(result.conflicts);
            }
            setSuccessMsg(
                `✅ Regra criada! ${result.transactionsClassified} transações reclassificadas.`
            );
            setKwKeywords('');
            setKwCategoria('');
            setKwSubcategoria('');
            setKwPreview(null);
            await loadSuggestions();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (e) {
            alert('Erro: ' + e.message);
        }
        setKwSaving(false);
    };

    const handleApplySuggestion = async (suggestion) => {
        if (!sugCategoria.trim()) return;
        try {
            const result = await api.applyClassification({
                keywords: suggestion.keyword,
                categoria: sugCategoria,
                subcategoria: sugSubcategoria || undefined,
            });
            if (result.conflicts && result.conflicts.length > 0) {
                setConflicts(result.conflicts);
            }
            setSuccessMsg(
                `✅ "${suggestion.keyword}" → ${sugCategoria}. ${result.transactionsClassified} transações atualizadas.`
            );
            setEditingSuggestion(null);
            setSugCategoria('');
            setSugSubcategoria('');
            await loadSuggestions();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    };

    const handleReorder = async (ruleIds) => {
        try {
            await api.reorderRules(ruleIds);
            setConflicts(null);
            setSuccessMsg('✅ Prioridades atualizadas e transações reclassificadas.');
            await loadSuggestions();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h2 className="page-title">🏷️ Classificar</h2>
                <p className="page-subtitle">
                    Classifique transações por padrões ou palavras-chave
                </p>
            </div>

            {successMsg && (
                <div className="alert alert-success">{successMsg}</div>
            )}

            {/* Conflict Modal */}
            {conflicts && conflicts.length > 0 && (
                <ConflictPanel
                    conflicts={conflicts}
                    onReorder={handleReorder}
                    onDismiss={() => setConflicts(null)}
                />
            )}

            {/* Keyword Section */}
            <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                    <h3 className="card-title">🔑 Classificar por palavras-chave</h3>
                    <p className="text-muted text-sm">
                        Digite palavras separadas por vírgula. Ex: "uber, 99 pop, taxi"
                    </p>
                </div>
                <div className="keyword-form">
                    <div className="keyword-row">
                        <div className="form-group" style={{ flex: 2 }}>
                            <label className="form-label">Palavras-chave</label>
                            <input
                                className="form-input"
                                placeholder="uber, 99 pop, taxi"
                                value={kwKeywords}
                                onChange={(e) => { setKwKeywords(e.target.value); setKwPreview(null); }}
                            />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">Categoria</label>
                            <input
                                className="form-input"
                                placeholder="Ex: Transporte"
                                value={kwCategoria}
                                onChange={(e) => setKwCategoria(e.target.value)}
                            />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">Subcategoria</label>
                            <input
                                className="form-input"
                                placeholder="Opcional"
                                value={kwSubcategoria}
                                onChange={(e) => setKwSubcategoria(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="keyword-actions">
                        <button
                            className="btn btn-secondary"
                            onClick={handlePreviewKeyword}
                            disabled={!kwKeywords.trim() || kwLoading}
                        >
                            {kwLoading ? '...' : '👁 Pré-visualizar'}
                        </button>
                        <button
                            className="btn btn-lg btn-primary"
                            disabled={!kwKeywords.trim() || !kwCategoria.trim() || kwSaving}
                            onClick={handleApplyKeyword}
                        >
                            {kwSaving ? '⏳ Salvando...' : '✅ Salvar regra e classificar'}
                        </button>
                    </div>

                    {kwPreview && (
                        <div className="keyword-preview">
                            <div className="preview-badge">
                                <strong>{kwPreview.matchCount}</strong> transações seriam classificadas
                            </div>
                            {kwPreview.examples.length > 0 && (
                                <div className="preview-examples">
                                    {kwPreview.examples.map((ex, i) => (
                                        <div key={i} className="preview-example">
                                            <span className="text-muted">{ex.data}</span>
                                            <span>{ex.titulo}</span>
                                            <span className="text-muted text-sm">{ex.descricao}</span>
                                            <span className={ex.valor >= 0 ? 'text-positive' : 'text-negative'}>
                                                {fmt(ex.valor)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Suggestions Section */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">
                        📊 Sugestões por frequência
                        {totalUnclassified > 0 && (
                            <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                                {totalUnclassified} não classificadas
                            </span>
                        )}
                    </h3>
                    <p className="text-muted text-sm">
                        Padrões detectados nas suas transações, ordenados por frequência
                    </p>
                </div>

                {loading ? (
                    <div className="loading">Analisando transações...</div>
                ) : suggestions.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🎉</div>
                        <h3>Tudo classificado!</h3>
                        <p>Não há padrões pendentes de classificação.</p>
                    </div>
                ) : (
                    <div className="suggestions-list">
                        {suggestions.map((s, idx) => (
                            <div key={idx} className="suggestion-card">
                                <div className="suggestion-header">
                                    <div className="suggestion-info">
                                        <span className="suggestion-keyword">"{s.keyword}"</span>
                                        <span className="suggestion-count">
                                            {s.count} transaç{s.count === 1 ? 'ão' : 'ões'}
                                        </span>
                                        <span className="text-muted text-sm">
                                            Total: {fmt(s.totalValue)}
                                        </span>
                                    </div>
                                    {editingSuggestion !== idx ? (
                                        <button
                                            className="btn btn-sm btn-primary"
                                            onClick={() => {
                                                setEditingSuggestion(idx);
                                                setSugCategoria('');
                                                setSugSubcategoria('');
                                            }}
                                        >
                                            Classificar
                                        </button>
                                    ) : (
                                        <button
                                            className="btn btn-sm btn-secondary"
                                            onClick={() => setEditingSuggestion(null)}
                                        >
                                            Cancelar
                                        </button>
                                    )}
                                </div>

                                {/* Examples */}
                                <div className="suggestion-examples">
                                    {s.examples.map((ex, i) => (
                                        <div key={i} className="suggestion-example">
                                            <span className="text-muted">{ex.data}</span>
                                            <span className="example-titulo">{ex.titulo}</span>
                                            <span className="text-muted text-sm example-desc">{ex.descricao}</span>
                                            <span className={ex.valor >= 0 ? 'text-positive' : 'text-negative'}>
                                                {fmt(ex.valor)}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Inline classify form */}
                                {editingSuggestion === idx && (
                                    <div className="suggestion-classify">
                                        <div className="classify-row">
                                            <input
                                                className="form-input"
                                                placeholder="Categoria"
                                                value={sugCategoria}
                                                onChange={(e) => setSugCategoria(e.target.value)}
                                                autoFocus
                                            />
                                            <input
                                                className="form-input"
                                                placeholder="Subcategoria (opcional)"
                                                value={sugSubcategoria}
                                                onChange={(e) => setSugSubcategoria(e.target.value)}
                                            />
                                            <button
                                                className="btn btn-primary"
                                                disabled={!sugCategoria.trim()}
                                                onClick={() => handleApplySuggestion(s)}
                                            >
                                                Salvar → classifica {s.count}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
