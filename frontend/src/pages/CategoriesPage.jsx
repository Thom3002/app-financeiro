import { useState, useEffect } from 'react';
import { api } from '../api';

export default function CategoriesPage() {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ nome: '', parent_id: '', cor: '#6366f1' });

    const loadData = async () => {
        setLoading(true);
        try { setCategories(await api.getCategories()); } catch (e) { console.error(e); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const openNew = (parentId = null) => {
        setEditing(null);
        setForm({ nome: '', parent_id: parentId || '', cor: '#6366f1' });
        setShowModal(true);
    };

    const openEdit = (cat) => {
        setEditing(cat);
        setForm({ nome: cat.nome, parent_id: cat.parent_id || '', cor: cat.cor || '#6366f1' });
        setShowModal(true);
    };

    const save = async () => {
        try {
            const d = { nome: form.nome, parent_id: form.parent_id || null, cor: form.cor };
            if (editing) await api.updateCategory(editing.id, d);
            else await api.createCategory(d);
            setShowModal(false);
            loadData();
        } catch (e) { alert(e.message); }
    };

    const remove = async (id) => {
        if (!confirm('Excluir esta categoria?')) return;
        await api.deleteCategory(id).catch((e) => alert(e.message));
        loadData();
    };

    return (
        <div>
            <div className="page-header flex-between">
                <div>
                    <h2>🏷️ Categorias</h2>
                    <p>Gerencie categorias e subcategorias</p>
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
                                    </div>
                                    <div className="btn-group">
                                        <button className="btn btn-sm btn-secondary" onClick={() => openNew(cat.id)}>+ Sub</button>
                                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(cat)}>✏️</button>
                                        <button className="btn btn-sm btn-danger" onClick={() => remove(cat.id)}>🗑</button>
                                    </div>
                                </div>
                                {cat.children?.map((sub) => (
                                    <div key={sub.id} className="category-item subcategory">
                                        <div className="category-name">
                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: sub.cor || 'var(--text-muted)', display: 'inline-block' }} />
                                            {sub.nome}
                                        </div>
                                        <div className="btn-group">
                                            <button className="btn btn-sm btn-secondary" onClick={() => openEdit(sub)}>✏️</button>
                                            <button className="btn btn-sm btn-danger" onClick={() => remove(sub.id)}>🗑</button>
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
                            <input type="color" value={form.cor} onChange={(e) => setForm(f => ({ ...f, cor: e.target.value }))} />
                        </div>
                        {form.parent_id && <div className="alert alert-success text-sm">🔗 Subcategoria</div>}
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
