import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import ConflictPanel from '../components/ConflictPanel';

function extractKeywordFromTx(tx) {
    // Extract a meaningful keyword from the transaction description
    const text = (tx.descricao || tx.titulo || '').toLowerCase();
    // Remove common noise
    const noise = /\b(debito de cartao|rever par deb cartao|pix recebido de|pix enviado para|transf enviada pix|bra)\b/gi;
    let cleaned = text.replace(noise, '').replace(/\s+/g, ' ').trim();
    // Take first meaningful words (up to 3)
    const words = cleaned.split(' ').filter(w => w.length > 2).slice(0, 3);
    return words.join(' ');
}

export default function TransactionsPage() {
    const [data, setData] = useState({ items: [], total: 0, page: 1, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState([]);
    const [banks, setBanks] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editValues, setEditValues] = useState({ categoria: '', subcategoria: '' });

    // +Regra state
    const [ruleTarget, setRuleTarget] = useState(null); // transaction being used to create rule
    const [ruleKeywords, setRuleKeywords] = useState('');
    const [ruleCategoria, setRuleCategoria] = useState('');
    const [ruleSubcategoria, setRuleSubcategoria] = useState('');
    const [rulePreview, setRulePreview] = useState(null);
    const [ruleSaving, setRuleSaving] = useState(false);
    const [conflicts, setConflicts] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    const [filters, setFilters] = useState({
        dataInicio: '',
        dataFim: '',
        categoria: '',
        banco: '',
        busca: '',
        tipo: '',
        somente_nao_classificados: false,
        page: 1,
        limit: 30,
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await api.getTransactions({
                ...filters,
                somente_nao_classificados: filters.somente_nao_classificados ? 'true' : undefined,
            });
            setData(result);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, [filters]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        api.getDistinctCategories().then(setCategories).catch(() => { });
        api.getDistinctBanks().then(setBanks).catch(() => { });
    }, []);

    const updateFilter = (key, value) => {
        setFilters((f) => ({ ...f, [key]: value, page: 1 }));
    };

    const startEdit = (tx) => {
        setEditingId(tx.id);
        setEditValues({ categoria: tx.categoria || '', subcategoria: tx.subcategoria || '' });
    };

    const saveEdit = async () => {
        if (!editingId) return;
        try {
            await api.updateTransactionCategory(editingId, editValues);
            setEditingId(null);
            loadData();
            api.getDistinctCategories().then(setCategories).catch(() => { });
        } catch (e) {
            console.error(e);
        }
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditValues({ categoria: '', subcategoria: '' });
    };

    // +Regra handlers
    const startRule = (tx) => {
        const kw = extractKeywordFromTx(tx);
        setRuleTarget(tx);
        setRuleKeywords(kw);
        setRuleCategoria('');
        setRuleSubcategoria('');
        setRulePreview(null);
        // Auto-preview
        if (kw) {
            api.previewKeyword({ keywords: kw }).then(setRulePreview).catch(() => { });
        }
    };

    const cancelRule = () => {
        setRuleTarget(null);
        setRuleKeywords('');
        setRuleCategoria('');
        setRuleSubcategoria('');
        setRulePreview(null);
    };

    const previewRule = async () => {
        if (!ruleKeywords.trim()) return;
        try {
            const data = await api.previewKeyword({ keywords: ruleKeywords });
            setRulePreview(data);
        } catch (e) {
            console.error(e);
        }
    };

    const saveRule = async () => {
        if (!ruleKeywords.trim() || !ruleCategoria.trim() || ruleSaving) return;
        setRuleSaving(true);
        try {
            const result = await api.applyClassification({
                keywords: ruleKeywords,
                categoria: ruleCategoria,
                subcategoria: ruleSubcategoria || undefined,
            });
            if (result.conflicts && result.conflicts.length > 0) {
                setConflicts(result.conflicts);
            }
            setSuccessMsg(
                `✅ Regra criada! ${result.transactionsClassified} transações reclassificadas.`
            );
            cancelRule();
            loadData();
            api.getDistinctCategories().then(setCategories).catch(() => { });
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (e) {
            alert('Erro: ' + e.message);
        }
        setRuleSaving(false);
    };

    const handleReorder = async (ruleIds) => {
        try {
            await api.reorderRules(ruleIds);
            setConflicts(null);
            setSuccessMsg('✅ Prioridades atualizadas e transações reclassificadas.');
            loadData();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    };

    const formatCurrency = (v) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    const formatDate = (d) => {
        if (!d) return '';
        const parts = d.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
    };

    return (
        <div>
            <div className="page-header">
                <h2>💳 Transações</h2>
                <p>{data.total} transações encontradas</p>
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

            {/* +Regra Modal */}
            {ruleTarget && (
                <div className="card rule-creation-card" style={{ marginBottom: 20 }}>
                    <div className="card-header">
                        <h3 className="card-title">
                            ➕ Criar regra a partir de: <em style={{ color: 'var(--accent-primary-hover)' }}>
                                {ruleTarget.descricao || ruleTarget.titulo}
                            </em>
                        </h3>
                        <button className="btn btn-sm btn-secondary" onClick={cancelRule}>✕ Fechar</button>
                    </div>
                    <div className="keyword-form">
                        <div className="keyword-row">
                            <div className="form-group" style={{ flex: 2 }}>
                                <label className="form-label">Palavras-chave (edite se necessário)</label>
                                <input
                                    className="form-input"
                                    value={ruleKeywords}
                                    onChange={(e) => { setRuleKeywords(e.target.value); setRulePreview(null); }}
                                />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">Categoria</label>
                                <input
                                    className="form-input"
                                    placeholder="Ex: Transporte"
                                    value={ruleCategoria}
                                    onChange={(e) => setRuleCategoria(e.target.value)}
                                    list="cat-list"
                                    autoFocus
                                />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">Subcategoria</label>
                                <input
                                    className="form-input"
                                    placeholder="Opcional"
                                    value={ruleSubcategoria}
                                    onChange={(e) => setRuleSubcategoria(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="keyword-actions">
                            <button className="btn btn-secondary" onClick={previewRule} disabled={!ruleKeywords.trim()}>
                                👁 Pré-visualizar
                            </button>
                            {rulePreview && (
                                <span className="preview-badge" style={{ margin: 0 }}>
                                    <strong>{rulePreview.matchCount}</strong> transações seriam classificadas
                                </span>
                            )}
                            <button
                                className="btn btn-lg btn-primary"
                                style={{ marginLeft: 'auto' }}
                                disabled={!ruleKeywords.trim() || !ruleCategoria.trim() || ruleSaving}
                                onClick={saveRule}
                            >
                                {ruleSaving ? '⏳ Salvando...' : '✅ Salvar regra e classificar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            <div className="filter-bar">
                <div className="form-group">
                    <label className="form-label">De</label>
                    <input
                        type="date"
                        className="form-input"
                        value={filters.dataInicio}
                        onChange={(e) => updateFilter('dataInicio', e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Até</label>
                    <input
                        type="date"
                        className="form-input"
                        value={filters.dataFim}
                        onChange={(e) => updateFilter('dataFim', e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Categoria</label>
                    <select
                        className="form-select"
                        value={filters.categoria}
                        onChange={(e) => updateFilter('categoria', e.target.value)}
                    >
                        <option value="">Todas</option>
                        {categories.map((c) => (
                            <option key={c}>{c}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Banco</label>
                    <select
                        className="form-select"
                        value={filters.banco}
                        onChange={(e) => updateFilter('banco', e.target.value)}
                    >
                        <option value="">Todos</option>
                        {banks.map((b) => (
                            <option key={b}>{b}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select
                        className="form-select"
                        value={filters.tipo}
                        onChange={(e) => updateFilter('tipo', e.target.value)}
                    >
                        <option value="">Todos</option>
                        <option value="entrada">Entradas</option>
                        <option value="saida">Saídas</option>
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Buscar</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Título ou descrição..."
                        value={filters.busca}
                        onChange={(e) => updateFilter('busca', e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <label className="form-checkbox">
                        <input
                            type="checkbox"
                            checked={filters.somente_nao_classificados}
                            onChange={(e) => updateFilter('somente_nao_classificados', e.target.checked)}
                        />
                        Somente não classificados
                    </label>
                </div>
            </div>

            {loading ? (
                <div className="loading">Carregando transações...</div>
            ) : data.items.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">📭</div>
                    <h3>Nenhuma transação encontrada</h3>
                    <p>Importe um extrato para começar</p>
                </div>
            ) : (
                <>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Título</th>
                                    <th>Descrição</th>
                                    <th style={{ textAlign: 'right' }}>Valor</th>
                                    <th>Categoria</th>
                                    <th>Subcategoria</th>
                                    <th>Banco</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.items.map((tx) => (
                                    <tr key={tx.id}>
                                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(tx.data)}</td>
                                        <td className="truncate" title={tx.titulo}>{tx.titulo}</td>
                                        <td className="truncate" title={tx.descricao}>{tx.descricao}</td>
                                        <td className={`text-right ${tx.valor >= 0 ? 'valor-positivo' : 'valor-negativo'}`}>
                                            {formatCurrency(tx.valor)}
                                        </td>
                                        <td>
                                            {editingId === tx.id ? (
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    style={{ width: 130, padding: '4px 8px', fontSize: '0.75rem' }}
                                                    value={editValues.categoria}
                                                    onChange={(e) => setEditValues((v) => ({ ...v, categoria: e.target.value }))}
                                                    list="cat-list"
                                                />
                                            ) : (
                                                <span
                                                    className="editable-cell"
                                                    onClick={() => startEdit(tx)}
                                                >
                                                    {tx.categoria || <span className="text-muted">—</span>}
                                                    {tx.is_manual && <span className="badge badge-manual ml-1">manual</span>}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {editingId === tx.id ? (
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    style={{ width: 120, padding: '4px 8px', fontSize: '0.75rem' }}
                                                    value={editValues.subcategoria}
                                                    onChange={(e) => setEditValues((v) => ({ ...v, subcategoria: e.target.value }))}
                                                />
                                            ) : (
                                                <span
                                                    className="editable-cell"
                                                    onClick={() => startEdit(tx)}
                                                >
                                                    {tx.subcategoria || <span className="text-muted">—</span>}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="badge badge-accent">{tx.banco}</span>
                                        </td>
                                        <td>
                                            <div className="btn-group">
                                                {editingId === tx.id ? (
                                                    <>
                                                        <button className="btn btn-sm btn-primary" onClick={saveEdit}>✓</button>
                                                        <button className="btn btn-sm btn-secondary" onClick={cancelEdit}>✕</button>
                                                    </>
                                                ) : (
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => startRule(tx)}
                                                        title="Criar regra a partir desta transação"
                                                    >
                                                        + Regra
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <datalist id="cat-list">
                        {categories.map((c) => (
                            <option key={c} value={c} />
                        ))}
                    </datalist>

                    {/* Pagination */}
                    {data.totalPages > 1 && (
                        <div className="pagination">
                            <button
                                disabled={data.page <= 1}
                                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                            >
                                ←
                            </button>
                            <span className="pagination-info">
                                {data.page} / {data.totalPages}
                            </span>
                            <button
                                disabled={data.page >= data.totalPages}
                                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                            >
                                →
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
