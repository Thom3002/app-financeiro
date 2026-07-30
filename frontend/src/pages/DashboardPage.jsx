import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useVisibility } from '../contexts/VisibilityContext';

// Cores distintas e vibrantes com alto contraste para as categorias
const CATEGORY_COLORS = [
    '#1d4ed8', // Azul royal
    '#047857', // Esmeralda
    '#c2410c', // Laranja escuro / Ferrugem
    '#7e22ce', // Roxo profundo
    '#be185d', // Rosa choque
    '#0284c7', // Azul ciano
    '#b45309', // Amarelo queimado / Âmbar
    '#e11d48', // Vermelho carmim
    '#0d9488', // Verde água / Teal
    '#6366f1', // Índigo
    '#4f46e5', // Roxo azulado
    '#d97706', // Dourado
    '#dc2626', // Vermelho vivo
    '#8b5cf6', // Violeta
];

const fmtCurrency = (v) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatDate = (d) => {
    if (!d) return '';
    const parts = d.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
};

// Funções utilitárias para calcular datas de filtro
const getLastMonthDates = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
        dataInicio: start.toISOString().split('T')[0],
        dataFim: end.toISOString().split('T')[0],
    };
};

const get3MonthsDates = () => {
    const now = new Date();
    const start = new Date();
    start.setMonth(now.getMonth() - 3);
    return {
        dataInicio: start.toISOString().split('T')[0],
        dataFim: now.toISOString().split('T')[0],
    };
};

const get6MonthsDates = () => {
    const now = new Date();
    const start = new Date();
    start.setMonth(now.getMonth() - 6);
    return {
        dataInicio: start.toISOString().split('T')[0],
        dataFim: now.toISOString().split('T')[0],
    };
};

const get1YearDates = () => {
    const now = new Date();
    const start = new Date();
    start.setFullYear(now.getFullYear() - 1);
    return {
        dataInicio: start.toISOString().split('T')[0],
        dataFim: now.toISOString().split('T')[0],
    };
};

// Sempre carrega até os últimos 12 meses para a aba Acompanhamento Mensal
const getLast12MonthsDates = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
        dataInicio: start.toISOString().split('T')[0],
        dataFim: end.toISOString().split('T')[0],
    };
};

export default function DashboardPage() {
    const { isVisible } = useVisibility();
    const formatValue = (v) => (!isVisible ? '*****' : fmtCurrency(v));

    // Estados do Período Principal (Padrão: Último Mês)
    const [dateFilters, setDateFilters] = useState(() => getLastMonthDates());
    const [activePreset, setActivePreset] = useState('lastMonth');

    // Estado da Aba de Gráfico selecionada ('category' | 'monthly')
    const [activeTab, setActiveTab] = useState('category');

    // Dados do Dashboard
    const [summary, setSummary] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [loadingSummary, setLoadingSummary] = useState(true);

    // Lista de categorias únicas para filtro
    const [categoriesList, setCategoriesList] = useState([]);

    // Estados da Tabela de Transações abaixo dos gráficos
    const [txData, setTxData] = useState({ items: [], total: 0, page: 1, totalPages: 0 });
    const [txLoading, setTxLoading] = useState(true);
    const [txFilters, setTxFilters] = useState({
        busca: '',
        categoria: '',
        ordem: 'DESC',
        orderBy: 'data',
        page: 1,
        limit: 50,
    });

    // Carrega categorias distintas para o seletor
    useEffect(() => {
        api.getDistinctCategories()
            .then(setCategoriesList)
            .catch(() => {});
    }, []);

    // Carrega Resumo e Linha do Tempo (Timeline sempre de 12 meses independentemente do período)
    const loadDashboardData = useCallback(async () => {
        setLoadingSummary(true);
        try {
            const [s, t] = await Promise.all([
                api.getDashboardSummary(dateFilters),
                api.getDashboardTimeline(getLast12MonthsDates()),
            ]);
            setSummary(s);
            setTimeline(t);
        } catch (e) {
            console.error('Erro ao carregar dados do dashboard:', e);
        }
        setLoadingSummary(false);
    }, [dateFilters]);

    useEffect(() => {
        loadDashboardData();
    }, [loadDashboardData]);

    // Carrega Tabela de Transações (com base no período e filtros específicos da tabela)
    const loadTransactions = useCallback(async () => {
        setTxLoading(true);
        try {
            const result = await api.getTransactions({
                dataInicio: dateFilters.dataInicio,
                dataFim: dateFilters.dataFim,
                categoria: txFilters.categoria || undefined,
                busca: txFilters.busca || undefined,
                ordem: txFilters.ordem,
                page: txFilters.page,
                limit: txFilters.limit,
            });
            setTxData(result);
        } catch (e) {
            console.error('Erro ao carregar transações da tabela:', e);
        }
        setTxLoading(false);
    }, [dateFilters, txFilters]);

    useEffect(() => {
        loadTransactions();
    }, [loadTransactions]);

    // Handlers para botões de atalho de período
    const applyPeriodPreset = (presetName, datesFn) => {
        setActivePreset(presetName);
        setDateFilters(datesFn());
        setTxFilters((prev) => ({ ...prev, page: 1 }));
    };

    // Handler para alternar filtro de categoria via clique na fatia do gráfico Donut
    const handlePieSliceClick = (entry) => {
        if (entry && entry.name) {
            setTxFilters((prev) => ({
                ...prev,
                categoria: prev.categoria === entry.name ? '' : entry.name,
                page: 1,
            }));
        }
    };

    // Dados de categorias para o gráfico Donut (Somente Saídas/Despesas)
    const catData = (summary?.byCategory || [])
        .filter((c) => c.categoria && (parseFloat(c.total_saidas) || 0) > 0)
        .map((c) => ({
            name: c.categoria,
            saidas: parseFloat(c.total_saidas) || 0,
            entradas: parseFloat(c.total_entradas) || 0,
            count: parseInt(c.count, 10) || 0,
        }));

    const totalSaidasCategorias = catData.reduce((acc, c) => acc + c.saidas, 0);

    // Ordenação dinâmica no cabeçalho da tabela
    const toggleSort = (field) => {
        setTxFilters((prev) => {
            const isSameField = prev.orderBy === field;
            const newOrdem = isSameField && prev.ordem === 'DESC' ? 'ASC' : 'DESC';
            return { ...prev, orderBy: field, ordem: newOrdem, page: 1 };
        });
    };

    // Cálculo do indicador de quantidade de linhas "X-Y de N"
    const startRecord = txData.total === 0 ? 0 : (txFilters.page - 1) * txFilters.limit + 1;
    const endRecord = Math.min(txFilters.page * txFilters.limit, txData.total);

    if (loadingSummary && !summary) {
        return <div className="loading">Carregando Minha Carteira...</div>;
    }

    return (
        <div>
            {/* Header da Página e Filtros Globais de Período */}
            <div className="page-header flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h2>💼 Minha Carteira</h2>
                    <p>Acompanhe suas finanças em tempo real.</p>
                </div>

                {/* Seletores de Período */}
                <div className="flex flex-column gap-2" style={{ alignItems: 'flex-end' }}>
                    <div className="period-quick-buttons">
                        <button
                            className={`btn-period-quick ${activePreset === 'lastMonth' ? 'active' : ''}`}
                            onClick={() => applyPeriodPreset('lastMonth', getLastMonthDates)}
                        >
                            Último Mês
                        </button>
                        <button
                            className={`btn-period-quick ${activePreset === '3m' ? 'active' : ''}`}
                            onClick={() => applyPeriodPreset('3m', get3MonthsDates)}
                        >
                            Últimos 3 meses
                        </button>
                        <button
                            className={`btn-period-quick ${activePreset === '6m' ? 'active' : ''}`}
                            onClick={() => applyPeriodPreset('6m', get6MonthsDates)}
                        >
                            Últimos 6 meses
                        </button>
                        <button
                            className={`btn-period-quick ${activePreset === '1y' ? 'active' : ''}`}
                            onClick={() => applyPeriodPreset('1y', get1YearDates)}
                        >
                            1 Ano
                        </button>
                    </div>

                    <div className="flex gap-2" style={{ alignItems: 'center' }}>
                        <span className="text-xs text-muted">de</span>
                        <input
                            type="date"
                            className="form-input"
                            style={{ padding: '3px 8px', fontSize: '0.8rem', width: 'auto' }}
                            value={dateFilters.dataInicio}
                            onChange={(e) => {
                                setActivePreset('custom');
                                setDateFilters((prev) => ({ ...prev, dataInicio: e.target.value }));
                            }}
                        />
                        <span className="text-xs text-muted">até</span>
                        <input
                            type="date"
                            className="form-input"
                            style={{ padding: '3px 8px', fontSize: '0.8rem', width: 'auto' }}
                            value={dateFilters.dataFim}
                            onChange={(e) => {
                                setActivePreset('custom');
                                setDateFilters((prev) => ({ ...prev, dataFim: e.target.value }));
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Grid de Cards de Resumo */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                <div className="stat-card">
                    <div className="stat-label flex-between">
                        <span>Receita período</span>
                        <span style={{ color: 'var(--green)', fontWeight: 'bold', fontSize: '1.2rem' }}>↑</span>
                    </div>
                    <div className="stat-value positive">{formatValue(summary?.entradas || 0)}</div>
                </div>

                <div className="stat-card">
                    <div className="stat-label flex-between">
                        <span>Despesa período</span>
                        <span style={{ color: 'var(--warning)', fontWeight: 'bold', fontSize: '1.2rem' }}>↓</span>
                    </div>
                    <div className="stat-value negative">{formatValue(summary?.saidas || 0)}</div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Saldo do Período</div>
                    <div className={`stat-value ${(summary?.saldo || 0) >= 0 ? 'positive' : 'negative'}`}>
                        {formatValue(summary?.saldo || 0)}
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Total Transações</div>
                    <div className="stat-value">{summary?.totalTransactions || 0}</div>
                </div>
            </div>

            {/* Contêiner Principal de Gráficos com Abas */}
            <div className="card mb-6" style={{ padding: '20px 24px' }}>
                <div className="dashboard-tabs">
                    <button
                        className={`dashboard-tab ${activeTab === 'category' ? 'active' : ''}`}
                        onClick={() => setActiveTab('category')}
                    >
                        Despesas por categoria
                    </button>
                    <button
                        className={`dashboard-tab ${activeTab === 'monthly' ? 'active' : ''}`}
                        onClick={() => setActiveTab('monthly')}
                    >
                        Acompanhamento mensal
                    </button>
                </div>

                {/* Conteúdo da Aba 1: Despesas por Categoria (Gráfico Donut) */}
                {activeTab === 'category' && (
                    <div>
                        {catData.length === 0 ? (
                            <div className="empty-state" style={{ padding: '40px 0' }}>
                                <h3>Sem despesas categorizadas no período selecionado</h3>
                            </div>
                        ) : (
                            <div className="flex gap-6" style={{ flexWrap: 'wrap', alignItems: 'center', minHeight: 340 }}>
                                <div style={{ flex: '1 1 340px', height: 320, position: 'relative' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={catData}
                                                dataKey="saidas"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={70}
                                                outerRadius={110}
                                                paddingAngle={2}
                                                style={{ cursor: 'pointer', outline: 'none' }}
                                                onClick={handlePieSliceClick}
                                                label={({ percent }) => (percent > 0.03 ? `${(percent * 100).toFixed(1)}%` : '')}
                                                labelLine={false}
                                            >
                                                {catData.map((entry, index) => {
                                                    const isSelected = txFilters.categoria === entry.name;
                                                    return (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                                                            stroke={isSelected ? '#ffffff' : 'transparent'}
                                                            strokeWidth={isSelected ? 3 : 1}
                                                            opacity={txFilters.categoria && !isSelected ? 0.4 : 1}
                                                        />
                                                    );
                                                })}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{
                                                    background: '#111827',
                                                    border: '1px solid rgba(255,255,255,0.15)',
                                                    borderRadius: 8,
                                                    color: '#f1f5f9',
                                                }}
                                                itemStyle={{ color: '#f1f5f9' }}
                                                labelStyle={{ color: '#f1f5f9' }}
                                                formatter={(value, name) => [
                                                    formatValue(value),
                                                    `${name} (${((value / (totalSaidasCategorias || 1)) * 100).toFixed(1)}%)`,
                                                ]}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Legenda e Seleção Rápida à Direita do Donut */}
                                <div style={{ flex: '1 1 300px', maxHeight: 320, overflowY: 'auto' }}>
                                    <div className="flex-between mb-3" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
                                        <span className="text-xs text-muted uppercase font-bold">Categoria</span>
                                        <span className="text-xs text-muted uppercase font-bold">Total / %</span>
                                    </div>
                                    {catData.map((c, i) => {
                                        const pct = totalSaidasCategorias > 0 ? ((c.saidas / totalSaidasCategorias) * 100).toFixed(1) : '0';
                                        const isSelected = txFilters.categoria === c.name;
                                        return (
                                            <div
                                                key={i}
                                                onClick={() => handlePieSliceClick(c)}
                                                className="flex-between"
                                                style={{
                                                    padding: '6px 10px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                                                    border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                                                    marginBottom: 4,
                                                    transition: 'all 0.15s ease',
                                                }}
                                            >
                                                <div className="flex gap-2" style={{ alignItems: 'center' }}>
                                                    <span
                                                        style={{
                                                            width: 10,
                                                            height: 10,
                                                            borderRadius: '50%',
                                                            backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                                                            display: 'inline-block',
                                                        }}
                                                    />
                                                    <span style={{ fontSize: '0.85rem', fontWeight: isSelected ? 600 : 400 }}>
                                                        {c.name}
                                                    </span>
                                                </div>
                                                <div className="text-right" style={{ fontSize: '0.85rem' }}>
                                                    <span className="font-bold valor-negativo" style={{ marginRight: 6 }}>
                                                        {formatValue(c.saidas)}
                                                    </span>
                                                    <span className="text-muted text-xs">({pct}%)</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="flex-between mt-2" style={{ alignItems: 'center' }}>
                            {summary?.ignoredCategories?.length > 0 ? (
                                <span className="text-xs text-muted" title={`Categorias desconsideradas nos totais: ${summary.ignoredCategories.join(', ')}`}>
                                    ℹ️ Algumas categorias não são consideradas no gráfico ({summary.ignoredCategories.join(', ')})
                                </span>
                            ) : <span />}
                            <span className="text-xs text-muted">
                                💡 <em>Dica: clique em uma fatia ou categoria para filtrar a tabela.</em>
                            </span>
                        </div>
                    </div>
                )}

                {/* Conteúdo da Aba 2: Acompanhamento Mensal (Exibe todos os meses disponíveis, até 12 meses) */}
                {activeTab === 'monthly' && (
                    <div style={{ height: 320 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={timeline} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="mes" stroke="#64748b" fontSize={12} />
                                <YAxis
                                    stroke="#64748b"
                                    fontSize={12}
                                    tickFormatter={(v) => (!isVisible ? '*****' : `R$${(v / 1000).toFixed(0)}k`)}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: '#111827',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        borderRadius: 8,
                                        color: '#f1f5f9',
                                    }}
                                    itemStyle={{ color: '#f1f5f9' }}
                                    labelStyle={{ color: '#f1f5f9' }}
                                    formatter={(v) => formatValue(v)}
                                />
                                <Legend wrapperStyle={{ paddingTop: 10 }} />
                                <Bar dataKey="entradas" fill="#34d399" name="Receita" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="saidas" fill="#fbbf24" name="Gastos" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Seção da Tabela de Transações (Directamente abaixo dos gráficos) */}
            <div className="card">
                <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <h3 className="card-title">Transações do Período</h3>
                        <p className="card-subtitle">
                            Exibindo registros ordenados por data
                        </p>
                    </div>

                    {/* Pílula indicadora de filtro por Categoria ativo */}
                    {txFilters.categoria && (
                        <div className="active-filter-pill">
                            <span>Filtrado por: <strong>{txFilters.categoria}</strong></span>
                            <button
                                onClick={() => setTxFilters((prev) => ({ ...prev, categoria: '', page: 1 }))}
                                title="Remover filtro de categoria"
                            >
                                ✕
                            </button>
                        </div>
                    )}
                </div>

                {/* Barra de Filtros UX/UI da Tabela */}
                <div className="filter-bar mb-4" style={{ background: 'var(--bg-glass)', gap: 12 }}>
                    <div className="form-group" style={{ flex: '2 1 200px' }}>
                        <label className="form-label">Buscar Transação</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Buscar por descrição ou título..."
                            value={txFilters.busca}
                            onChange={(e) => setTxFilters((prev) => ({ ...prev, busca: e.target.value, page: 1 }))}
                        />
                    </div>

                    <div className="form-group" style={{ flex: '1 1 180px' }}>
                        <label className="form-label">Categoria</label>
                        <select
                            className="form-select"
                            value={txFilters.categoria}
                            onChange={(e) => setTxFilters((prev) => ({ ...prev, categoria: e.target.value, page: 1 }))}
                        >
                            <option value="">Todas as categorias</option>
                            {categoriesList.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>

                    {(txFilters.busca || txFilters.categoria) && (
                        <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setTxFilters((prev) => ({ ...prev, busca: '', categoria: '', page: 1 }))}
                            >
                                🧹 Limpar Filtros
                            </button>
                        </div>
                    )}
                </div>

                {/* Tabela Scrollável com Cabeçalho Sticky */}
                {txLoading ? (
                    <div className="loading" style={{ padding: '40px 0' }}>Carregando transações...</div>
                ) : txData.items.length === 0 ? (
                    <div className="empty-state" style={{ padding: '40px 0' }}>
                        <div className="empty-icon">📭</div>
                        <h3>Nenhuma transação encontrada</h3>
                        <p>Tente ajustar o período ou os filtros aplicados.</p>
                    </div>
                ) : (
                    <>
                        <div className="table-scroll-container">
                            <table>
                                <thead className="sticky-header">
                                    <tr>
                                        <th
                                            className="sortable-header"
                                            onClick={() => toggleSort('data')}
                                            title="Clique para ordenar por data"
                                        >
                                            Data {txFilters.orderBy === 'data' ? (txFilters.ordem === 'ASC' ? '▲' : '▼') : ''}
                                        </th>
                                        <th>Título / Descrição</th>
                                        <th>Categoria</th>
                                        <th>Banco</th>
                                        <th
                                            className="text-right sortable-header"
                                            onClick={() => toggleSort('valor')}
                                            title="Clique para ordenar por valor"
                                        >
                                            Valor {txFilters.orderBy === 'valor' ? (txFilters.ordem === 'ASC' ? '▲' : '▼') : ''}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {txData.items.map((t) => (
                                        <tr key={t.id}>
                                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                                {formatDate(t.data)}
                                            </td>
                                            <td>
                                                <div className="font-medium truncate" title={t.titulo || t.descricao}>
                                                    {t.titulo || t.descricao}
                                                </div>
                                                {t.titulo && t.descricao && t.titulo !== t.descricao && (
                                                    <div className="text-xs text-muted truncate" title={t.descricao}>
                                                        {t.descricao}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                {t.categoria ? (
                                                    <span
                                                        className="badge badge-accent"
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={() => setTxFilters((prev) => ({ ...prev, categoria: t.categoria, page: 1 }))}
                                                    >
                                                        {t.categoria}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className="badge badge-default">{t.banco || '—'}</span>
                                            </td>
                                            <td className={`text-right ${t.valor >= 0 ? 'valor-positivo' : 'valor-negativo'}`}>
                                                {formatValue(t.valor)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer de Paginação com Seletor "Linhas por página" e "X-Y de N" */}
                        <div className="table-pagination-footer">
                            <div className="table-pagination-left">
                                <span className="text-xs text-muted">Linhas por página:</span>
                                <select
                                    className="form-select"
                                    style={{ width: 'auto', padding: '2px 24px 2px 8px', fontSize: '0.8rem' }}
                                    value={txFilters.limit}
                                    onChange={(e) =>
                                        setTxFilters((prev) => ({
                                            ...prev,
                                            limit: Number(e.target.value),
                                            page: 1,
                                        }))
                                    }
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>

                                <span className="text-xs text-muted ml-3">
                                    <strong>{startRecord}-{endRecord}</strong> de <strong>{txData.total}</strong>
                                </span>
                            </div>

                            {/* Controles de Navegação de Página */}
                            <div className="table-pagination-right">
                                <button
                                    className="btn btn-sm btn-secondary"
                                    disabled={txFilters.page <= 1}
                                    onClick={() => setTxFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                                >
                                    ← Anterior
                                </button>
                                <span className="text-xs text-muted" style={{ margin: '0 4px' }}>
                                    Página {txFilters.page} de {txData.totalPages || 1}
                                </span>
                                <button
                                    className="btn btn-sm btn-secondary"
                                    disabled={txFilters.page >= txData.totalPages}
                                    onClick={() => setTxFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                                >
                                    Próxima →
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
