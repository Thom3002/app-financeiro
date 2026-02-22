import { useState, useEffect } from 'react';
import { api } from '../api';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#f472b6', '#38bdf8', '#fb923c'];

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function DashboardPage() {
    const [summary, setSummary] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [drilldown, setDrilldown] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ dataInicio: '', dataFim: '' });

    const load = async () => {
        setLoading(true);
        try {
            const [s, t] = await Promise.all([
                api.getDashboardSummary(filters),
                api.getDashboardTimeline(filters),
            ]);
            setSummary(s);
            setTimeline(t);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    useEffect(() => { load(); }, [filters.dataInicio, filters.dataFim]);

    const openDrilldown = async (cat) => {
        try {
            const d = await api.getDashboardDrilldown(cat, filters);
            setDrilldown(d);
        } catch (e) { console.error(e); }
    };

    if (loading) return <div className="loading">Carregando dashboard...</div>;
    if (!summary) return <div className="empty-state"><div className="empty-icon">📊</div><h3>Sem dados</h3><p>Importe um extrato primeiro</p></div>;

    const catData = (summary.byCategory || []).filter(c => c.categoria).map(c => ({
        name: c.categoria, saidas: parseFloat(c.total_saidas) || 0, entradas: parseFloat(c.total_entradas) || 0,
    }));

    const pieData = catData.filter(c => c.saidas > 0).slice(0, 8);

    return (
        <div>
            <div className="page-header flex-between">
                <div><h2>📊 Dashboard</h2><p>Visão geral das suas finanças</p></div>
                <div className="flex gap-3">
                    <input type="date" className="form-input" value={filters.dataInicio} onChange={(e) => setFilters(f => ({ ...f, dataInicio: e.target.value }))} />
                    <input type="date" className="form-input" value={filters.dataFim} onChange={(e) => setFilters(f => ({ ...f, dataFim: e.target.value }))} />
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">💰 Total Entradas</div>
                    <div className="stat-value positive">{fmt(summary.entradas)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">💸 Total Saídas</div>
                    <div className="stat-value negative">{fmt(summary.saidas)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">📈 Saldo</div>
                    <div className={`stat-value ${summary.saldo >= 0 ? 'positive' : 'negative'}`}>{fmt(summary.saldo)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">🧾 Transações</div>
                    <div className="stat-value">{summary.totalTransactions}</div>
                </div>
            </div>

            <div className="charts-grid">
                {/* Timeline */}
                <div className="card">
                    <h3 className="card-title">Evolução Mensal</h3>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={timeline}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="mes" stroke="#64748b" fontSize={12} />
                                <YAxis stroke="#64748b" fontSize={12} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f1f5f9' }} formatter={v => fmt(v)} />
                                <Legend />
                                <Bar dataKey="entradas" fill="#34d399" name="Entradas" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="saidas" fill="#f87171" name="Saídas" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Pie - Top Categories */}
                <div className="card">
                    <h3 className="card-title">Gastos por Categoria</h3>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} dataKey="saidas" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 11 }}>
                                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f1f5f9' }} formatter={v => fmt(v)} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Top Categories Table */}
            <div className="card mb-6">
                <h3 className="card-title mb-4">Top Categorias (Saídas)</h3>
                <div className="table-container">
                    <table>
                        <thead><tr><th>Categoria</th><th className="text-right">Saídas</th><th className="text-right">Entradas</th><th></th></tr></thead>
                        <tbody>
                            {catData.map((c, i) => (
                                <tr key={i}>
                                    <td><span className="badge badge-accent" style={{ cursor: 'pointer' }} onClick={() => openDrilldown(c.name)}>{c.name}</span></td>
                                    <td className="text-right valor-negativo">{fmt(c.saidas)}</td>
                                    <td className="text-right valor-positivo">{fmt(c.entradas)}</td>
                                    <td><button className="btn btn-sm btn-secondary" onClick={() => openDrilldown(c.name)}>Detalhar →</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Biggest Transactions */}
            <div className="card mb-6">
                <h3 className="card-title mb-4">Maiores Transações</h3>
                <div className="table-container">
                    <table>
                        <thead><tr><th>Data</th><th>Título</th><th className="text-right">Valor</th><th>Categoria</th></tr></thead>
                        <tbody>
                            {(summary.biggestTransactions || []).slice(0, 10).map((t) => (
                                <tr key={t.id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{t.data?.split('-').reverse().join('/')}</td>
                                    <td className="truncate">{t.titulo}</td>
                                    <td className={`text-right ${t.valor >= 0 ? 'valor-positivo' : 'valor-negativo'}`}>{fmt(t.valor)}</td>
                                    <td><span className="badge badge-default">{t.categoria || '—'}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Drilldown Modal */}
            {drilldown && (
                <div className="modal-overlay" onClick={() => setDrilldown(null)}>
                    <div className="modal" style={{ maxWidth: 800 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>📂 {drilldown.categoria}</h3>
                            <button className="modal-close" onClick={() => setDrilldown(null)}>✕</button>
                        </div>
                        {drilldown.bySubcategory?.length > 0 && (
                            <div className="table-container mb-4">
                                <table>
                                    <thead><tr><th>Subcategoria</th><th className="text-right">Saídas</th><th className="text-right">#</th></tr></thead>
                                    <tbody>
                                        {drilldown.bySubcategory.map((s, i) => (
                                            <tr key={i}>
                                                <td>{s.subcategoria || '(sem sub)'}</td>
                                                <td className="text-right valor-negativo">{fmt(parseFloat(s.total_saidas) || 0)}</td>
                                                <td className="text-right text-muted">{s.count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <h4 className="card-title mb-4">Transações</h4>
                        <div className="table-container">
                            <table>
                                <thead><tr><th>Data</th><th>Descrição</th><th className="text-right">Valor</th></tr></thead>
                                <tbody>
                                    {(drilldown.transactions || []).map((t) => (
                                        <tr key={t.id}>
                                            <td style={{ whiteSpace: 'nowrap' }}>{t.data?.split('-').reverse().join('/')}</td>
                                            <td className="truncate">{t.descricao}</td>
                                            <td className={`text-right ${t.valor >= 0 ? 'valor-positivo' : 'valor-negativo'}`}>{fmt(t.valor)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
