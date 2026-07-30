import { useState, useEffect } from 'react';
import { api } from '../api';

const PRESET_COLORS = [
    '#6366f1', // Indigo
    '#3b82f6', // Azul
    '#0ea5e9', // Celeste
    '#10b981', // Verde Esmeralda
    '#84cc16', // Verde Lima
    '#eab308', // Amarelo
    '#f97316', // Laranja
    '#ef4444', // Vermelho
    '#ec4899', // Rosa
    '#a855f7', // Roxo
    '#64748b', // Cinza Slate
];

export default function CategoriesPage() {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ nome: '', parent_id: '', cor: '#6366f1', ignorar_dashboard: false });
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);

    const loadData = async () => {
        setLoading(true);
        try { setCategories(await api.getCategories()); } catch (e) { console.error(e); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const openNew = (parentId = null) => {
        setEditing(null);
        setForm({ nome: '', parent_id: parentId || '', cor: '#6366f1', ignorar_dashboard: false });
        setShowModal(true);
    };

    const openEdit = (cat) => {
        setEditing(cat);
        setForm({
            nome: cat.nome,
            parent_id: cat.parent_id || '',
            cor: cat.cor || '#6366f1',
            ignorar_dashboard: !!cat.ignorar_dashboard,
        });
        setShowModal(true);
    };

    const save = async () => {
        try {
            const d = {
                nome: form.nome,
                parent_id: form.parent_id || null,
                cor: form.cor,
                ignorar_dashboard: form.ignorar_dashboard,
            };
            if (editing) await api.updateCategory(editing.id, d);
            else await api.createCategory(d);
            setShowModal(false);
            loadData();
        } catch (e) { alert(e.message); }
    };

    const remove = async (id) => {
        try {
            await api.deleteCategory(id);
            setConfirmDeleteId(null);
            loadData();
        } catch (e) { alert(e.message); }
    };

    return (
        <div>
            <div className="page-header flex-between">
                <div>
                    <h2>🏷️ Categorias</h2>
                    <p>Gerencie categorias, subcategorias e regras de exibição no Dashboard</p>
                </div>
                <button className="btn btn-primary" onClick={() => openNew()}>+ Nova Categoria</button>
            </div>
            {loading ? <div className="loading">Carregando...</div> : categories.length === 0 ? (
                <div className="empty-state"><div className="empty-icon">🏷️</div><h3>Nenhuma categoria</h3></div>
            ) : (
                <div className="card">
                    <ul className="category-tree">
                        {categories.map((cat) => (
                            <li key={cat.id}>
                                <div className="category-item">
                                    <div className="category-name">
                                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: cat.cor || 'var(--accent-primary)', display: 'inline-block' }} />
                                        {cat.nome}
                                        {cat.children?.length > 0 && <span className="text-xs text-muted">({cat.children.length} sub)</span>}
                                        {cat.ignorar_dashboard && (
                                            <span className="badge badge-warning ml-2" style={{ fontSize: '0.7rem', padding: '1px 6px' }} title="Esta categoria não afeta os totais/gráficos do Dashboard">
                                                🚫 Ignorada no Dashboard
                                            </span>
                                        )}
                                    </div>
                                    <div className="btn-group">
                                        <button className="btn btn-sm btn-secondary" onClick={() => openNew(cat.id)}>+ Sub</button>
                                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(cat)}>✏️</button>
                                        {confirmDeleteId === cat.id ? (
                                            <button className="btn btn-sm btn-danger" onClick={() => remove(cat.id)}>Confirmar?</button>
                                        ) : (
                                            <button className="btn btn-sm btn-danger" onClick={() => setConfirmDeleteId(cat.id)}>🗑</button>
                                        )}
                                    </div>
                                </div>
                                {cat.children?.map((sub) => (
                                    <div key={sub.id} className="category-item subcategory">
                                        <div className="category-name">
                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: sub.cor || 'var(--text-muted)', display: 'inline-block' }} />
                                            {sub.nome}
                                            {sub.ignorar_dashboard && (
                                                <span className="badge badge-warning ml-2" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                                                    🚫 Ignorada no Dashboard
                                                </span>
                                            )}
                                        </div>
                                        <div className="btn-group">
                                            <button className="btn btn-sm btn-secondary" onClick={() => openEdit(sub)}>✏️</button>
                                            {confirmDeleteId === sub.id ? (
                                                <button className="btn btn-sm btn-danger" onClick={() => remove(sub.id)}>Confirmar?</button>
                                            ) : (
                                                <button className="btn btn-sm btn-danger" onClick={() => setConfirmDeleteId(sub.id)}>🗑</button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editing ? 'Editar' : 'Nova'} Categoria</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Nome</label>
                            <input type="text" className="form-input" value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Cor</label>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                                {PRESET_COLORS.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        style={{
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '50%',
                                            backgroundColor: c,
                                            border: form.cor === c ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.15)',
                                            boxShadow: form.cor === c ? '0 0 8px ' + c : 'none',
                                            cursor: 'pointer',
                                            transform: form.cor === c ? 'scale(1.15)' : 'none',
                                            transition: 'all 0.15s ease',
                                        }}
                                        onClick={() => setForm((f) => ({ ...f, cor: c }))}
                                        title={c}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="form-group mt-4">
                            <label className="form-checkbox">
                                <input
                                    type="checkbox"
                                    checked={form.ignorar_dashboard}
                                    onChange={(e) => setForm((f) => ({ ...f, ignorar_dashboard: e.target.checked }))}
                                />
                                🚫 Ignorar nos gráficos e totais do Dashboard (ex: Investimentos, CDB)
                            </label>
                            <p className="text-xs text-muted mt-1" style={{ marginLeft: 24 }}>
                                Transações desta categoria não serão contabilizadas como Receita/Despesa nos gráficos de saldo e mensal.
                            </p>
                        </div>

                        {form.parent_id && <div className="alert alert-success text-sm mt-2">🔗 Subcategoria</div>}
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={save} disabled={!form.nome}>{editing ? 'Salvar' : 'Criar'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
