import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

export default function TransactionsPage() {
    const [data, setData] = useState({ items: [], total: 0, page: 1, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState([]);
    const [banks, setBanks] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editValues, setEditValues] = useState({ categoria: '', subcategoria: '' });

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
                                            {editingId === tx.id && (
                                                <div className="btn-group">
                                                    <button className="btn btn-sm btn-primary" onClick={saveEdit}>✓</button>
                                                    <button className="btn btn-sm btn-secondary" onClick={cancelEdit}>✕</button>
                                                </div>
                                            )}
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
