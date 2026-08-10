import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import ConflictPanel from '../components/ConflictPanel';
import ClassificationModal from '../components/ClassificationModal';
import CategoryTreeSelect from '../components/CategoryTreeSelect';
import { useVisibility } from '../contexts/VisibilityContext';
import {
    Tag,
    Pencil,
    EyeOff,
    UserCheck,
    RefreshCw,
    Filter,
    Check,
    Building2,
    CreditCard,
    Plus,
    Search,
    Sparkles,
    Pin
} from 'lucide-react';

function extractKeywordFromTx(tx) {
    const text = (tx.descricao || tx.titulo || '').toLowerCase();
    const noise = /\b(debito de cartao|rever par deb cartao|pix recebido de|pix enviado para|transf enviada pix|bra)\b/gi;
    let cleaned = text.replace(noise, '').replace(/\s+/g, ' ').trim();
    const words = cleaned.split(' ').filter(w => w.length > 2).slice(0, 3);
    return words.join(' ');
}

export default function TransactionsPage() {
    const { isVisible } = useVisibility();
    const navigate = useNavigate();
    const [data, setData] = useState({ items: [], total: 0, page: 1, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState([]);
    const [allCategories, setAllCategories] = useState([]);
    const [banks, setBanks] = useState([]);
    
    // Modal Pluggy Connect
    const [isPluggyOpen, setIsPluggyOpen] = useState(false);
    const [syncingPluggy, setSyncingPluggy] = useState(false);

    // Modal / Estado de Edição de Transação
    const [editingTx, setEditingTx] = useState(null);

    // +Regra state
    const [ruleTarget, setRuleTarget] = useState(null);
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
        categoria: [],
        banco: '',
        busca: '',
        tipo: '',
        somente_nao_classificados: false,
        ordem: 'DESC',
        page: 1,
        limit: 30,
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const catParam = Array.isArray(filters.categoria) && filters.categoria.length > 0
                ? filters.categoria.join(',')
                : (typeof filters.categoria === 'string' && filters.categoria ? filters.categoria : undefined);
            const result = await api.getTransactions({
                ...filters,
                categoria: catParam,
                somente_nao_classificados: filters.somente_nao_classificados ? 'true' : undefined,
            });
            setData(result);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, [filters]);

    const refreshCategories = useCallback(() => {
        api.getDistinctCategories().then(cats => setCategories(cats.sort((a, b) => a.localeCompare(b, 'pt-BR')))).catch(() => { });
        api.getCategoriesFlat().then(cats => {
            setAllCategories(cats.filter(c => !c.parent_id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
        }).catch(() => { });
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        api.getDistinctBanks().then(setBanks).catch(() => { });
        refreshCategories();

        const handleUnclassifiedChanged = () => {
            loadData();
            refreshCategories();
        };

        window.addEventListener('unclassified-count-changed', handleUnclassifiedChanged);
        return () => {
            window.removeEventListener('unclassified-count-changed', handleUnclassifiedChanged);
        };
    }, [loadData, refreshCategories]);

    const getSubcategoryOptions = (catName) => {
        const cat = allCategories.find(c => c.nome === catName);
        return cat?.children || [];
    };

    const updateFilter = (key, value) => {
        setFilters((f) => ({ ...f, [key]: value, page: 1 }));
    };

    const handleSyncPluggy = async () => {
        setSyncingPluggy(true);
        try {
            await api.syncPluggy();
            setSuccessMsg('Sincronização com o Pluggy concluída!');
            loadData();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (e) {
            alert('Erro ao sincronizar: ' + e.message);
        }
        setSyncingPluggy(false);
    };

    const startEdit = (tx) => {
        setEditingTx(tx);
    };

    const saveEdit = async (editData) => {
        if (!editingTx) return;
        const scrollY = window.scrollY;
        try {
            await api.updateTransactionCategory(editingTx.id, {
                categoria: editData.categoria || null,
                subcategoria: editData.subcategoria || null,
                ignorar_dashboard: editData.ignorar_dashboard,
                is_custo_fixo: editData.is_custo_fixo,
                createRule: editData.saveRule,
                createRulePattern: editData.saveRule ? editData.createRulePattern : undefined,
                rulePattern: editData.saveRule ? editData.createRulePattern : undefined,
                is_manual: true,
            });
            setEditingTx(null);
            await loadData();
            refreshCategories();
            window.dispatchEvent(new Event('unclassified-count-changed'));
            requestAnimationFrame(() => window.scrollTo(0, scrollY));
        } catch (e) {
            alert('Erro ao salvar transação: ' + e.message);
        }
    };

    const toggleIgnorarDashboard = async (tx, e) => {
        e.stopPropagation();
        const scrollY = window.scrollY;
        try {
            await api.updateTransactionCategory(tx.id, {
                ignorar_dashboard: !tx.ignorar_dashboard,
                ignore_reason: !tx.ignorar_dashboard ? 'Definido manualmente pelo usuário' : null,
            });
            await loadData();
            requestAnimationFrame(() => window.scrollTo(0, scrollY));
        } catch (err) {
            console.error(err);
        }
    };

    // +Regra handlers
    const startRule = (tx) => {
        const kw = extractKeywordFromTx(tx);
        setRuleTarget(tx);
        setRuleKeywords(kw);
        setRuleCategoria(tx.categoria || '');
        setRuleSubcategoria(tx.subcategoria || '');
        setRulePreview(null);
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
        const scrollY = window.scrollY;
        try {
            const result = await api.applyClassification({
                keywords: ruleKeywords,
                categoria: ruleCategoria,
                subcategoria: ruleSubcategoria || undefined,
                targetTxId: ruleTarget?.id,
            });
            setRuleTarget(null);
            const countClassified = result.transactionsClassified !== undefined ? result.transactionsClassified : (result.totalChanged || 0);
            setSuccessMsg(`Regra salva! ${countClassified} transação(ões) classificada(s).`);
            await loadData();
            refreshCategories();
            window.dispatchEvent(new Event('unclassified-count-changed'));
            setTimeout(() => setSuccessMsg(''), 4000);
            requestAnimationFrame(() => window.scrollTo(0, scrollY));
        } catch (e) {
            alert('Erro ao salvar regra: ' + e.message);
        }
        setRuleSaving(false);
    };

    const handleReorder = async (ruleIds) => {
        try {
            await api.reorderRules(ruleIds);
            setConflicts(null);
            setSuccessMsg('Prioridades atualizadas e transações reclassificadas.');
            loadData();
            window.dispatchEvent(new Event('unclassified-count-changed'));
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    };

    const formatCurrency = (v) => {
        if (!isVisible) return '*****';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    };

    const formatDate = (d) => {
        if (!d) return '';
        const parts = d.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
    };

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2>Transações</h2>
                    <p>{data.total} transações encontradas</p>
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

            {/* Modal de Edição / Classificação Detalhada */}
            {editingTx && (
                <ClassificationModal
                    tx={editingTx}
                    allCategories={allCategories}
                    onSave={saveEdit}
                    onClose={() => setEditingTx(null)}
                    isVisible={isVisible}
                />
            )}

            {/* +Regra Modal */}
            {ruleTarget && (
                <div className="card rule-creation-card" style={{ marginBottom: 20 }}>
                    <div className="card-header">
                        <h3 className="card-title">
                            Criar regra a partir de: <em style={{ color: 'var(--accent-primary-hover)' }}>
                                {ruleTarget.descricao || ruleTarget.titulo}
                            </em>
                        </h3>
                        <button className="btn btn-sm btn-secondary" onClick={cancelRule}>✕ Fechar</button>
                    </div>
                    <div className="keyword-form">
                        <div className="keyword-row">
                            <div className="form-group" style={{ flex: 2 }}>
                                <label className="form-label">Palavras-chave</label>
                                <input
                                    className="form-input"
                                    value={ruleKeywords}
                                    onChange={(e) => { setRuleKeywords(e.target.value); setRulePreview(null); }}
                                />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">Categoria</label>
                                <select
                                    className="form-select"
                                    value={ruleCategoria}
                                    onChange={(e) => { setRuleCategoria(e.target.value); setRuleSubcategoria(''); }}
                                    autoFocus
                                >
                                    <option value="">Selecione...</option>
                                    {allCategories.map((c) => (
                                        <option key={c.id || c.nome} value={c.nome}>{c.nome}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">Subcategoria</label>
                                <select
                                    className="form-select"
                                    value={ruleSubcategoria}
                                    onChange={(e) => setRuleSubcategoria(e.target.value)}
                                    disabled={!ruleCategoria}
                                >
                                    <option value="">Nenhuma (Opcional)</option>
                                    {getSubcategoryOptions(ruleCategoria).map((s) => (
                                        <option key={s.id || s.nome} value={s.nome}>{s.nome}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="keyword-actions">
                            <button className="btn btn-secondary" onClick={previewRule} disabled={!ruleKeywords.trim()}>
                                Pré-visualizar
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
                                {ruleSaving ? 'Salvando...' : 'Salvar regra e classificar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            <div className="filter-bar">
                <div className="form-group" style={{ flex: '1 1 240px', minWidth: 200 }}>
                    <label className="form-label" style={{ fontWeight: 600, color: 'var(--accent-primary-hover)' }}>🔍 Buscar</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Buscar por título ou descrição..."
                        value={filters.busca}
                        onChange={(e) => updateFilter('busca', e.target.value)}
                        style={{ border: '1px solid var(--accent-primary)' }}
                    />
                </div>
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
                <div className="form-group" style={{ minWidth: '180px' }}>
                    <label className="form-label">Categoria</label>
                    <CategoryTreeSelect
                        categories={allCategories}
                        selectedValues={filters.categoria || []}
                        onChange={(val) => updateFilter('categoria', val)}
                        multiSelect={true}
                        placeholder="Todas as categorias"
                    />
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
                    <h3>Nenhuma transação encontrada</h3>
                    <p style={{ marginBottom: 16 }}>Importe um extrato bancário ou conecte seu banco via Pluggy para começar</p>
                    <button className="btn btn-primary" onClick={() => navigate('/import')}>
                        📥 Ir para a aba Importar Extratos
                    </button>
                </div>
            ) : (
                <>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th 
                                        className="sortable-header" 
                                        onClick={() => updateFilter('ordem', filters.ordem === 'ASC' ? 'DESC' : 'ASC')}
                                    >
                                        Data {filters.ordem === 'ASC' ? '▲' : '▼'}
                                    </th>
                                    <th>Operação</th>
                                    <th>Título</th>
                                    <th>Descrição</th>
                                    <th style={{ textAlign: 'right' }}>Valor</th>
                                    <th>Categoria</th>
                                    <th>Subcategoria</th>
                                    <th>Banco</th>
                                    <th>Origem</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.items.map((tx) => {
                                    const isCredit = tx.account_type === 'CREDIT';
                                    const hasInstallments = tx.parcela_atual && tx.total_parcelas;
                                    const isIgnored = !!tx.ignorar_dashboard;
                                    const isUnclassified = !tx.categoria || tx.categoria === 'Não classificado';

                                    return (
                                        <tr key={tx.id} className={isIgnored ? 'tr-ignored' : ''}>
                                            <td style={{ whiteSpace: 'nowrap' }}>{formatDate(tx.data)}</td>
                                            <td>
                                                <span className={`badge ${isCredit ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '0.7rem' }}>
                                                    {isCredit ? 'Crédito' : 'Débito'}
                                                </span>
                                            </td>
                                            <td className="truncate" title={tx.titulo}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {isIgnored && (
                                                        <span className="info-tooltip-wrapper">
                                                            <EyeOff size={14} color="var(--warning)" />
                                                            <span className="info-tooltip-content">
                                                                Esta transação está ignorada do Dashboard e excluída dos cálculos de saldo e gráficos.
                                                            </span>
                                                        </span>
                                                    )}
                                                    <span>{tx.titulo}</span>
                                                    {hasInstallments && (
                                                        <span className="badge badge-secondary" style={{ fontSize: '0.68rem', padding: '1px 4px' }}>
                                                            {tx.parcela_atual}/{tx.total_parcelas}
                                                        </span>
                                                    )}
                                                    {tx.is_custo_fixo && (
                                                        <span className="badge badge-accent" style={{ fontSize: '0.68rem', padding: '1px 4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                            <Pin size={10} /> Fixo
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="truncate" title={tx.descricao}>{tx.descricao}</td>
                                            <td className={`text-right ${tx.valor >= 0 ? 'valor-positivo' : 'valor-negativo'}`}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                                    <span>{formatCurrency(tx.valor)}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span
                                                    className="editable-cell"
                                                    onClick={() => startEdit(tx)}
                                                >
                                                    {tx.categoria || <span className="text-muted">—</span>}
                                                    {tx.is_manual && (
                                                        <span
                                                            className="badge-manual ml-1"
                                                            title="Classificação definida manualmente pelo usuário. Fica salva e protegida contra reclassificações automáticas."
                                                        >
                                                            <UserCheck size={11} /> Manual
                                                        </span>
                                                    )}
                                                </span>
                                            </td>
                                            <td>
                                                <span
                                                    className="editable-cell"
                                                    onClick={() => startEdit(tx)}
                                                >
                                                    {tx.subcategoria || <span className="text-muted">—</span>}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="badge badge-accent">{tx.banco}</span>
                                            </td>
                                            <td>
                                                <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                                                    {tx.source === 'PLUGGY' ? 'Pluggy' : tx.source === 'CSV' ? 'CSV' : 'Manual'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="btn-group">
                                                    {isUnclassified ? (
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => startEdit(tx)}
                                                            title="Classificar esta transação"
                                                            style={{ fontWeight: 600 }}
                                                        >
                                                            🏷️ Classificar
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            onClick={() => startEdit(tx)}
                                                            title="Editar categoria e opções"
                                                        >
                                                            ✏️ Editar
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

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
