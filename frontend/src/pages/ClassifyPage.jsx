import { useState, useEffect } from 'react';
import { api } from '../api';
import ConflictPanel from '../components/ConflictPanel';
import { useVisibility } from '../contexts/VisibilityContext';
import {
    Tag,
    Calendar,
    KeyRound,
    BarChart3,
    RefreshCw,
    Eye,
    Check,
    Pencil,
    Trash2,
    Building2,
    CreditCard,
    X,
    Pin,
    EyeOff,
    Sparkles,
    AlertCircle
} from 'lucide-react';

export default function ClassifyPage() {
    const { isVisible } = useVisibility();
    const fmt = (v) => {
        if (!isVisible) return '*****';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    };

    const [suggestions, setSuggestions] = useState([]);
    const [totalUnclassified, setTotalUnclassified] = useState(0);
    const [loading, setLoading] = useState(true);
    const [allCategories, setAllCategories] = useState([]);

    // Keyword form
    const [kwKeywords, setKwKeywords] = useState('');
    const [kwCategoria, setKwCategoria] = useState('');
    const [kwSubcategoria, setKwSubcategoria] = useState('');
    const [kwIsCustoFixo, setKwIsCustoFixo] = useState(false);
    const [kwIgnorarDashboard, setKwIgnorarDashboard] = useState(false);
    const [kwPreview, setKwPreview] = useState(null);
    const [kwLoading, setKwLoading] = useState(false);
    const [kwSaving, setKwSaving] = useState(false);

    // Suggestion inline edits
    const [editingSuggestion, setEditingSuggestion] = useState(null);
    const [sugCategoria, setSugCategoria] = useState('');
    const [sugSubcategoria, setSugSubcategoria] = useState('');
    const [sugIsCustoFixo, setSugIsCustoFixo] = useState(false);
    const [sugIgnorarDashboard, setSugIgnorarDashboard] = useState(false);

    // Conflict & Detail modals
    const [conflicts, setConflicts] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [selectedGroupModal, setSelectedGroupModal] = useState(null);

    const loadCategories = () => {
        api.getCategoriesFlat().then(cats => {
            setAllCategories(cats.filter(c => !c.parent_id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
        }).catch(() => { });
    };

    const getSubcategoryOptions = (catName) => {
        const cat = allCategories.find(c => c.nome === catName);
        return cat?.children || [];
    };

    const [periodPreset, setPeriodPreset] = useState('tudo');

    const getPeriodDates = (preset) => {
        const now = new Date();
        const todayStr = now.toISOString().substring(0, 10);
        if (preset === 'este_mes') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().substring(0, 10);
            return { dataInicio: start, dataFim: todayStr };
        }
        if (preset === 'ultimo_mes') {
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().substring(0, 10);
            const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().substring(0, 10);
            return { dataInicio: start, dataFim: end };
        }
        if (preset === 'ultimos_3_meses') {
            const d = new Date(now);
            d.setDate(d.getDate() - 90);
            return { dataInicio: d.toISOString().substring(0, 10), dataFim: todayStr };
        }
        if (preset === 'ultimos_6_meses') {
            const d = new Date(now);
            d.setDate(d.getDate() - 180);
            return { dataInicio: d.toISOString().substring(0, 10), dataFim: todayStr };
        }
        if (preset === 'este_ano') {
            const start = `${now.getFullYear()}-01-01`;
            return { dataInicio: start, dataFim: todayStr };
        }
        return { dataInicio: '', dataFim: '' };
    };

    // Ignored suggestions & custom edited keywords
    const [ignoredKeywords, setIgnoredKeywords] = useState([]);
    const [customKeywords, setCustomKeywords] = useState({});
    const [customPreviews, setCustomPreviews] = useState({});
    const [editingKeywordKey, setEditingKeywordKey] = useState(null);

    const loadSuggestions = async (preset = periodPreset, resetIgnored = false) => {
        setLoading(true);
        try {
            const dates = getPeriodDates(preset);
            const data = await api.getClassificationSuggestions(dates);
            setSuggestions(data.suggestions || []);
            setTotalUnclassified(data.totalUnclassified || 0);
            if (resetIgnored) {
                setIgnoredKeywords([]);
                setCustomKeywords({});
                setCustomPreviews({});
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadSuggestions();
        loadCategories();

        const handleUnclassifiedChanged = () => {
            loadSuggestions();
            loadCategories();
        };

        window.addEventListener('unclassified-count-changed', handleUnclassifiedChanged);
        return () => {
            window.removeEventListener('unclassified-count-changed', handleUnclassifiedChanged);
        };
    }, []);

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
        const scrollY = window.scrollY;
        try {
            const result = await api.applyClassification({
                keywords: kwKeywords,
                categoria: kwCategoria,
                subcategoria: kwSubcategoria || undefined,
                set_custo_fixo: kwIsCustoFixo,
                ignorar_dashboard: kwIgnorarDashboard,
            });
            if (result.conflicts && result.conflicts.length > 0) {
                setConflicts(result.conflicts);
            }
            setSuccessMsg(
                `Regra criada! ${result.transactionsClassified} transações reclassificadas.`
            );
            setKwKeywords('');
            setKwCategoria('');
            setKwSubcategoria('');
            setKwIsCustoFixo(false);
            setKwIgnorarDashboard(false);
            setKwPreview(null);
            await loadSuggestions();
            loadCategories();
            setTimeout(() => setSuccessMsg(''), 4000);
            requestAnimationFrame(() => window.scrollTo(0, scrollY));
        } catch (e) {
            alert('Erro: ' + e.message);
        }
        setKwSaving(false);
    };

    const handleIgnoreSuggestion = (keyword) => {
        setIgnoredKeywords(prev => [...prev, keyword]);
    };

    const handleKeywordChange = async (keywordKey, newKeyword) => {
        setCustomKeywords(prev => ({ ...prev, [keywordKey]: newKeyword }));
        if (!newKeyword.trim()) return;
        try {
            const preview = await api.previewKeyword({ keywords: newKeyword });
            setCustomPreviews(prev => ({ ...prev, [keywordKey]: preview }));
        } catch (e) {
            console.error(e);
        }
    };

    const handleApplySuggestion = async (suggestion) => {
        const keywordToApply = (customKeywords[suggestion.keyword] !== undefined ? customKeywords[suggestion.keyword] : suggestion.keyword).trim();
        if (!sugCategoria.trim() || !keywordToApply) return;
        const scrollY = window.scrollY;
        try {
            const result = await api.applyClassification({
                keywords: keywordToApply,
                categoria: sugCategoria,
                subcategoria: sugSubcategoria || undefined,
                set_custo_fixo: sugIsCustoFixo,
                ignorar_dashboard: sugIgnorarDashboard,
            });
            if (result.conflicts && result.conflicts.length > 0) {
                setConflicts(result.conflicts);
            }
            setSuccessMsg(
                `"${keywordToApply}" → ${sugCategoria}. ${result.transactionsClassified} transações reclassificadas.`
            );
            setEditingSuggestion(null);
            setEditingKeywordKey(null);
            setSugCategoria('');
            setSugSubcategoria('');
            setSugIsCustoFixo(false);
            setSugIgnorarDashboard(false);
            await loadSuggestions();
            loadCategories();
            setTimeout(() => setSuccessMsg(''), 4000);
            requestAnimationFrame(() => window.scrollTo(0, scrollY));
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    };

    const handleReorder = async (ruleIds) => {
        const scrollY = window.scrollY;
        try {
            await api.reorderRules(ruleIds);
            setConflicts(null);
            setSuccessMsg('✅ Prioridades atualizadas e transações reclassificadas.');
            await loadSuggestions();
            loadCategories();
            setTimeout(() => setSuccessMsg(''), 4000);
            requestAnimationFrame(() => window.scrollTo(0, scrollY));
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    };

    return (
        <div className="page-content">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h2 className="page-title icon-align" style={{ gap: '8px' }}>
                        <Tag size={24} color="var(--accent-primary)" /> Classificar Transações
                    </h2>
                    <p className="page-subtitle">
                        {totalUnclassified} transação(ões) pendente(s) de classificação no período selecionado
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={15} /> Período:
                    </label>
                    <select
                        className="form-select"
                        value={periodPreset}
                        onChange={(e) => {
                            const newP = e.target.value;
                            setPeriodPreset(newP);
                            loadSuggestions(newP);
                        }}
                        style={{ width: 'auto', minWidth: '170px' }}
                    >
                        <option value="tudo">Todo o Período</option>
                        <option value="este_mes">Este Mês</option>
                        <option value="ultimo_mes">Último Mês</option>
                        <option value="ultimos_3_meses">Últimos 3 Meses</option>
                        <option value="ultimos_6_meses">Últimos 6 Meses</option>
                        <option value="este_ano">Este Ano</option>
                    </select>
                </div>
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
                    <h3 className="card-title icon-align" style={{ gap: '8px' }}>
                        <KeyRound size={20} color="var(--accent-primary)" /> Classificar por palavras-chave
                    </h3>
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
                                list="classify-cat-list"
                            />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">Subcategoria</label>
                            <input
                                className="form-input"
                                placeholder="Opcional"
                                value={kwSubcategoria}
                                onChange={(e) => setKwSubcategoria(e.target.value)}
                                list="classify-subcat-list"
                            />
                        </div>
                    </div>

                    <div className="keyword-actions" style={{ flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                        <label className="modal-checkbox-row" style={{ cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={kwIsCustoFixo}
                                onChange={(e) => setKwIsCustoFixo(e.target.checked)}
                            />
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <Pin size={14} color="var(--accent-primary)" /> Custo Fixo / Recorrente
                            </span>
                        </label>

                        <label className="modal-checkbox-row" style={{ cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={kwIgnorarDashboard}
                                onChange={(e) => setKwIgnorarDashboard(e.target.checked)}
                            />
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <EyeOff size={14} color="var(--warning)" /> Ignorar no Dashboard
                            </span>
                        </label>

                        <button
                            className="btn btn-secondary"
                            onClick={handlePreviewKeyword}
                            disabled={!kwKeywords.trim() || kwLoading}
                            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Eye size={15} /> {kwLoading ? '...' : 'Pré-visualizar'}
                        </button>
                        <button
                            className="btn btn-lg btn-primary"
                            disabled={!kwKeywords.trim() || !kwCategoria.trim() || kwSaving}
                            onClick={handleApplyKeyword}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Check size={18} /> {kwSaving ? 'Salvando...' : 'Salvar regra e classificar'}
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
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h3 className="card-title icon-align" style={{ gap: '8px' }}>
                            <BarChart3 size={20} color="var(--accent-primary)" /> Sugestões por frequência
                            {totalUnclassified > 0 && (
                                <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                                    {totalUnclassified} não classificadas
                                </span>
                            )}
                        </h3>
                        <p className="text-muted text-sm" style={{ margin: 0 }}>
                            Padrões detectados nas suas transações, ordenados por frequência
                        </p>
                    </div>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => loadSuggestions(periodPreset, true)}
                        disabled={loading}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                        {loading ? 'Atualizando...' : 'Atualizar Sugestões'}
                    </button>
                </div>

                {loading ? (
                    <div className="loading">Analisando transações...</div>
                ) : suggestions.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon"><Sparkles size={40} color="var(--accent-primary)" /></div>
                        <h3>Tudo classificado!</h3>
                        <p>Não há padrões pendentes de classificação.</p>
                    </div>
                ) : (
                    <div className="suggestions-list">
                        {suggestions.filter(s => !ignoredKeywords.includes(s.keyword)).map((s) => {
                            const currentKw = customKeywords[s.keyword] !== undefined ? customKeywords[s.keyword] : s.keyword;
                            const hasCustomKw = customKeywords[s.keyword] !== undefined && customKeywords[s.keyword] !== s.keyword;
                            const activePreview = customPreviews[s.keyword];
                            const displayCount = activePreview ? activePreview.matchCount : s.count;
                            const isEditingThisKw = editingKeywordKey === s.keyword;
                            const isClassifyingThisSug = editingSuggestion === s.keyword;

                            return (
                                <div key={s.keyword} className="suggestion-card">
                                    <div className="suggestion-header">
                                        <div className="suggestion-info" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            {isEditingThisKw ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <input
                                                        className="form-input"
                                                        style={{ width: '180px', padding: '4px 8px', fontSize: '0.9rem' }}
                                                        value={currentKw}
                                                        onChange={(e) => handleKeywordChange(s.keyword, e.target.value)}
                                                        placeholder="Palavra-chave"
                                                        autoFocus
                                                    />
                                                    <button className="btn btn-sm btn-secondary" onClick={() => setEditingKeywordKey(null)}>
                                                        <Check size={14} /> OK
                                                    </button>
                                                </div>
                                            ) : (
                                                <span
                                                    className="suggestion-keyword"
                                                    style={{ cursor: 'pointer', borderBottom: '1px dashed var(--accent)', paddingBottom: '2px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                    title="Clique para editar este padrão"
                                                    onClick={() => setEditingKeywordKey(s.keyword)}
                                                >
                                                    "{currentKw}" <Pencil size={12} color="var(--accent-primary)" />
                                                </span>
                                            )}

                                            <span className="suggestion-count">
                                                {displayCount} transaç{displayCount === 1 ? 'ão' : 'ões'}
                                            </span>
                                            {hasCustomKw && (
                                                <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                                                    Padrão customizado
                                                </span>
                                            )}
                                            <span className="text-muted text-sm">
                                                Total: {fmt(s.totalValue)}
                                            </span>
                                        </div>

                                        {!isClassifyingThisSug ? (
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {s.count > 3 && (
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => setSelectedGroupModal(s)}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                        <Eye size={14} /> Ver todas ({s.count})
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-sm btn-primary"
                                                    onClick={() => {
                                                        setEditingSuggestion(s.keyword);
                                                        setSugCategoria('');
                                                        setSugSubcategoria('');
                                                    }}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Tag size={14} /> Classificar
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    title="Ignorar esta sugestão"
                                                    onClick={() => handleIgnoreSuggestion(s.keyword)}
                                                    style={{ color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Trash2 size={14} /> Ignorar
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => setEditingSuggestion(null)}
                                            >
                                                Cancelar
                                            </button>
                                        )}
                                    </div>

                                {/* Examples: Exibição rica em linha dupla sem cortes */}
                                <div className="suggestion-examples" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                                    {s.examples.map((ex, i) => (
                                        <div key={i} className="suggestion-example-card" title={ex.descricao || ex.titulo} style={{
                                            padding: '10px 14px',
                                            borderRadius: '8px',
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid rgba(255, 255, 255, 0.06)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{ex.data}</span>
                                                    {ex.banco && (
                                                        <span className="badge badge-secondary" style={{ fontSize: '0.75rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            {ex.tipo === 'CREDIT' || ex.tipo === 'CREDIT_CARD' ? <CreditCard size={12} /> : <Building2 size={12} />}
                                                            {ex.banco}
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontWeight: 600, fontSize: '0.95rem' }} className={ex.valor >= 0 ? 'text-positive' : 'text-negative'}>
                                                    {fmt(ex.valor)}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                                {ex.titulo || ex.descricao}
                                            </div>
                                            {ex.descricao && ex.descricao !== ex.titulo && (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                                    {ex.descricao}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Inline classify form */}
                                {isClassifyingThisSug && (
                                    <div className="suggestion-classify" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div className="classify-row">
                                            <input
                                                className="form-input"
                                                placeholder="Categoria"
                                                value={sugCategoria}
                                                onChange={(e) => setSugCategoria(e.target.value)}
                                                list="sug-cat-list"
                                                autoFocus
                                            />
                                            <input
                                                className="form-input"
                                                placeholder="Subcategoria (opcional)"
                                                value={sugSubcategoria}
                                                onChange={(e) => setSugSubcategoria(e.target.value)}
                                                list="sug-subcat-list"
                                            />
                                            <button
                                                className="btn btn-primary"
                                                disabled={!sugCategoria.trim()}
                                                onClick={() => handleApplySuggestion(s)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                            >
                                                Salvar → classifica {displayCount}
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '4px' }}>
                                            <label className="modal-checkbox-row" style={{ cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={sugIsCustoFixo}
                                                    onChange={(e) => setSugIsCustoFixo(e.target.checked)}
                                                />
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}>
                                                    <Pin size={13} color="var(--accent-primary)" /> Custo Fixo
                                                </span>
                                            </label>

                                            <label className="modal-checkbox-row" style={{ cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={sugIgnorarDashboard}
                                                    onChange={(e) => setSugIgnorarDashboard(e.target.checked)}
                                                />
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}>
                                                    <EyeOff size={13} color="var(--warning)" /> Ignorar no Dashboard
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Modal de Detalhamento Completo do Padrão */}
            {selectedGroupModal && (
                <div className="modal-backdrop" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '800px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 className="card-title">👁️ Transações do Padrão "{selectedGroupModal.keyword}"</h3>
                                <p className="text-muted text-sm" style={{ margin: 0 }}>
                                    Total de {selectedGroupModal.count} lançamentos • Soma dos valores: {fmt(selectedGroupModal.totalValue)}
                                </p>
                            </div>
                            <button className="btn btn-secondary" onClick={() => setSelectedGroupModal(null)}>
                                ✕ Fechar
                            </button>
                        </div>
                        <div className="table-container" style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Data</th>
                                        <th>Origem / Banco</th>
                                        <th>Descrição Integral / Título</th>
                                        <th style={{ textAlign: 'right' }}>Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedGroupModal.allTransactions || selectedGroupModal.examples).map((tx, idx) => (
                                        <tr key={idx}>
                                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{tx.data}</td>
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {tx.banco ? (
                                                    <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                                                        {tx.tipo === 'CREDIT' || tx.tipo === 'CREDIT_CARD' ? '💳 ' : '🏦 '}
                                                        {tx.banco}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td style={{ wordBreak: 'break-word', whiteSpace: 'normal', fontSize: '0.85rem' }}>
                                                <div style={{ fontWeight: 600 }}>{tx.titulo}</div>
                                                {tx.descricao && tx.descricao !== tx.titulo && (
                                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{tx.descricao}</div>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }} className={tx.valor >= 0 ? 'text-positive' : 'text-negative'}>
                                                {fmt(tx.valor)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Datalists for autocomplete */}
            <datalist id="classify-cat-list">
                {allCategories.map(c => <option key={c.id} value={c.nome} />)}
            </datalist>
            <datalist id="classify-subcat-list">
                {getSubcategoryOptions(kwCategoria).map(s => <option key={s.id} value={s.nome} />)}
            </datalist>
            <datalist id="sug-cat-list">
                {allCategories.map(c => <option key={c.id} value={c.nome} />)}
            </datalist>
            <datalist id="sug-subcat-list">
                {getSubcategoryOptions(sugCategoria).map(s => <option key={s.id} value={s.nome} />)}
            </datalist>
        </div>
    );
}
