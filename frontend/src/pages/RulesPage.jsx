import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useVisibility } from '../contexts/VisibilityContext';
import CategoryTreeSelect from '../components/CategoryTreeSelect';
import {
    ShieldCheck,
    Plus,
    Pencil,
    Trash2,
    Play,
    Check,
    X,
    Info,
    Code,
    Sparkles,
    Download,
    Upload,
    Search,
    Filter,
    HelpCircle,
    Eye
} from 'lucide-react';

function friendlyToRegex(text) {
    if (!text) return '';
    const parts = text.trim().split(/\s+/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return parts.join('.*');
}

export default function RulesPage() {
    const { isVisible } = useVisibility();
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [form, setForm] = useState(getEmptyForm());
    const [userPatternText, setUserPatternText] = useState('');
    const [rawRegexMode, setRawRegexMode] = useState(false);

    const [testResult, setTestResult] = useState(null);
    const [testText, setTestText] = useState('');
    const [showSimulate, setShowSimulate] = useState(false);
    const [allCategories, setAllCategories] = useState([]);
    const [simForm, setSimForm] = useState({
        dataInicio: '',
        dataFim: '',
        banco: '',
        somente_nao_classificados: false,
        overwrite_manual: false,
    });
    const [simResult, setSimResult] = useState(null);

    function getEmptyForm() {
        return {
            regex: '',
            campo_alvo: 'ambos',
            banco_escopo: 'qualquer',
            sinal_escopo: 'qualquer',
            categoria: '',
            subcategoria: '',
            priority: 100,
            enabled: true,
            overwrite_manual: false,
        };
    }

    const [ruleFilterCat, setRuleFilterCat] = useState([]);
    const [ruleSearch, setRuleSearch] = useState('');
    const [ruleSortBy, setRuleSortBy] = useState('priority');

    const loadRules = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getRules();
            setRules(data);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadRules();
        api.getCategoriesFlat().then(cats => {
            const sorted = cats
                .filter(c => !c.parent_id)
                .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
            setAllCategories(sorted);
        }).catch(() => { });
    }, [loadRules]);

    const getSubcategoryOptions = (catName) => {
        const cat = allCategories.find(c => c.nome === catName);
        return cat?.children || [];
    };

    const [formError, setFormError] = useState('');

    const openNew = () => {
        setEditingRule(null);
        setForm(getEmptyForm());
        setUserPatternText('');
        setRawRegexMode(false);
        setTestResult(null);
        setTestText('');
        setFormError('');
        setShowModal(true);
    };

    const openEdit = (rule) => {
        setEditingRule(rule);
        setForm({
            regex: rule.regex,
            campo_alvo: rule.campo_alvo,
            banco_escopo: rule.banco_escopo,
            sinal_escopo: rule.sinal_escopo,
            categoria: rule.categoria,
            subcategoria: rule.subcategoria || '',
            priority: rule.priority,
            enabled: rule.enabled,
            overwrite_manual: rule.overwrite_manual,
        });
        setUserPatternText(rule.regex);
        setRawRegexMode(true); // Na edição, abre em modo regex para preservar exatidão
        setTestResult(null);
        setTestText('');
        setFormError('');
        setShowModal(true);
    };

    const handlePatternChange = (val) => {
        setUserPatternText(val);
        if (!rawRegexMode) {
            setForm(f => ({ ...f, regex: friendlyToRegex(val) }));
        } else {
            setForm(f => ({ ...f, regex: val }));
        }
    };

    const toggleRawMode = (e) => {
        const checked = e.target.checked;
        setRawRegexMode(checked);
        if (!checked) {
            setForm(f => ({ ...f, regex: friendlyToRegex(userPatternText) }));
        } else {
            setForm(f => ({ ...f, regex: userPatternText }));
        }
    };

    const saveRule = async () => {
        setFormError('');
        const cat = (form.categoria || '').trim();
        if (!cat || cat === 'Não classificado') {
            setFormError("Selecione uma categoria válida para a regra (diferente de 'Não classificado').");
            return;
        }
        const cleanRegex = (form.regex || '').trim();
        if (!cleanRegex) {
            setFormError("Informe o texto ou expressão regular para a regra.");
            return;
        }

        const duplicate = rules.find(
            (r) => (!editingRule || r.id !== editingRule.id) && r.regex.trim().toLowerCase() === cleanRegex.toLowerCase()
        );
        if (duplicate) {
            setFormError(`Já existe uma regra cadastrada com a busca '${cleanRegex}' para a categoria '${duplicate.categoria}'.`);
            return;
        }

        const scrollY = window.scrollY;
        try {
            if (editingRule) {
                await api.updateRule(editingRule.id, { ...form, regex: cleanRegex, categoria: cat });
            } else {
                await api.createRule({ ...form, regex: cleanRegex, categoria: cat });
            }
            setShowModal(false);
            setFormError('');
            await loadRules();
            window.dispatchEvent(new Event('unclassified-count-changed'));
            requestAnimationFrame(() => window.scrollTo(0, scrollY));
        } catch (e) {
            setFormError(e.message);
        }
    };

    const [confirmDeleteId, setConfirmDeleteId] = useState(null);

    const deleteRule = async (id) => {
        const scrollY = window.scrollY;
        try {
            await api.deleteRule(id);
            await loadRules();
            setConfirmDeleteId(null);
            window.dispatchEvent(new Event('unclassified-count-changed'));
            requestAnimationFrame(() => window.scrollTo(0, scrollY));
        } catch (e) {
            alert(e.message);
        }
    };

    const handleTest = async () => {
        const result = await api.testRule({ regex: form.regex, text: testText });
        setTestResult(result);
    };

    const handleSimulate = async () => {
        try {
            const result = await api.simulateRules(simForm);
            setSimResult(result);
        } catch (e) {
            alert(e.message);
        }
    };

    const handleReprocess = async () => {
        if (!confirm('Aplicar regras? Isso modificará as categorias das transações.')) return;
        const scrollY = window.scrollY;
        try {
            const result = await api.reprocessRules(simForm);
            setSimResult(result);
            alert(`Reprocessamento concluído: ${result.totalChanged} transações alteradas.`);
            window.dispatchEvent(new Event('unclassified-count-changed'));
            requestAnimationFrame(() => window.scrollTo(0, scrollY));
        } catch (e) {
            alert(e.message);
        }
    };

    const handleExport = async () => {
        try {
            const data = await api.exportRules();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'regras.json';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert(e.message);
        }
    };

    const handleImport = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const rules = JSON.parse(text);
                const result = await api.importRules(Array.isArray(rules) ? rules : [rules]);
                alert(`Importadas: ${result.imported} regra(s). Erros: ${result.errors.length}`);
                loadRules();
            } catch (err) {
                alert('Erro ao importar: ' + err.message);
            }
        };
        input.click();
    };

    const distinctCategoriesInRules = Array.from(new Set(rules.map(r => r.categoria))).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const filteredRules = rules
        .filter(r => {
            if (Array.isArray(ruleFilterCat) && ruleFilterCat.length > 0) {
                if (!ruleFilterCat.includes(r.categoria) && !ruleFilterCat.includes(r.subcategoria)) return false;
            } else if (typeof ruleFilterCat === 'string' && ruleFilterCat && r.categoria !== ruleFilterCat && r.subcategoria !== ruleFilterCat) {
                return false;
            }
            if (ruleSearch) {
                const searchLower = ruleSearch.toLowerCase();
                const matchRegex = (r.regex || '').toLowerCase().includes(searchLower);
                const matchCat = (r.categoria || '').toLowerCase().includes(searchLower);
                const matchSub = (r.subcategoria || '').toLowerCase().includes(searchLower);
                if (!matchRegex && !matchCat && !matchSub) return false;
            }
            return true;
        })
        .sort((a, b) => {
            if (ruleSortBy === 'category') {
                const catComp = (a.categoria || '').localeCompare(b.categoria || '', 'pt-BR');
                if (catComp !== 0) return catComp;
            }
            return (a.priority || 0) - (b.priority || 0);
        });

    return (
        <div>
            <div className="page-header flex-between">
                <div>
                    <h2 className="icon-align" style={{ gap: '8px' }}>
                        <ShieldCheck size={24} color="var(--accent-primary)" /> Regras de Auto-Classificação
                    </h2>
                    <p>{rules.length} regra(s) configurada(s)</p>
                </div>
                <div className="btn-group">
                    <button className="btn btn-secondary" onClick={handleImport} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Upload size={15} /> Importar
                    </button>
                    <button className="btn btn-secondary" onClick={handleExport} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Download size={15} /> Exportar
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowSimulate(!showSimulate)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Eye size={15} /> Simular
                    </button>
                    <button className="btn btn-primary" onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Plus size={16} /> Nova Regra
                    </button>
                </div>
            </div>

            {/* Rule Filter / Sort Toolbar */}
            <div className="card mb-4" style={{ padding: '12px 16px' }}>
                <div className="flex gap-4" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: '1 1 200px' }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Buscar por termo ou categoria..."
                            value={ruleSearch}
                            onChange={(e) => setRuleSearch(e.target.value)}
                        />
                    </div>
                    <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, minWidth: '220px' }}>
                        <span className="text-xs text-muted">Filtrar por Categoria:</span>
                        <CategoryTreeSelect
                            categories={allCategories}
                            selectedValues={ruleFilterCat || []}
                            onChange={(val) => setRuleFilterCat(val)}
                            multiSelect={true}
                            placeholder={`Todas as categorias (${distinctCategoriesInRules.length})`}
                            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                        />
                    </div>
                    <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="text-xs text-muted">Ordenar por:</span>
                        <select
                            className="form-select"
                            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                            value={ruleSortBy}
                            onChange={(e) => setRuleSortBy(e.target.value)}
                        >
                            <option value="priority">Prioridade (Padrão)</option>
                            <option value="category">Categoria (A-Z)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Simulate Panel */}
            {showSimulate && (
                <div className="card mb-6">
                    <div className="card-header">
                        <h3 className="card-title icon-align" style={{ gap: '6px' }}>
                            <Eye size={18} color="var(--accent-primary)" /> Simular / Reprocessar Regras
                        </h3>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">De</label>
                            <input type="date" className="form-input"
                                value={simForm.dataInicio}
                                onChange={(e) => setSimForm((f) => ({ ...f, dataInicio: e.target.value }))}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Até</label>
                            <input type="date" className="form-input"
                                value={simForm.dataFim}
                                onChange={(e) => setSimForm((f) => ({ ...f, dataFim: e.target.value }))}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Banco</label>
                            <input type="text" className="form-input" placeholder="Qualquer"
                                value={simForm.banco}
                                onChange={(e) => setSimForm((f) => ({ ...f, banco: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-checkbox">
                            <input type="checkbox" checked={simForm.somente_nao_classificados}
                                onChange={(e) => setSimForm((f) => ({ ...f, somente_nao_classificados: e.target.checked }))}
                            />
                            Somente não classificados
                        </label>
                    </div>
                    <div className="form-group">
                        <label className="form-checkbox">
                            <input type="checkbox" checked={simForm.overwrite_manual}
                                onChange={(e) => setSimForm((f) => ({ ...f, overwrite_manual: e.target.checked }))}
                            />
                            Sobrescrever ajustes manuais
                        </label>
                    </div>
                    <div className="btn-group">
                        <button className="btn btn-secondary" onClick={handleSimulate} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <Eye size={14} /> Simular (Dry-run)
                        </button>
                        <button className="btn btn-primary" onClick={handleReprocess} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <Play size={14} /> Reprocessar Regras
                        </button>
                    </div>

                    {simResult && (
                        <div className="mt-4">
                            <div className="alert alert-success">
                                Analisadas: {simResult.totalAnalyzed} | Alteradas: {simResult.totalChanged}
                            </div>
                            {simResult.changes.length > 0 && (
                                <div className="table-container mt-4">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>Antes</th>
                                                <th>→</th>
                                                <th>Depois</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {simResult.changes.slice(0, 20).map((c) => (
                                                <tr key={c.id}>
                                                    <td className="text-xs text-muted">{c.id.slice(0, 10)}...</td>
                                                    <td><span className="badge badge-default">{c.before}</span></td>
                                                    <td>→</td>
                                                    <td><span className="badge badge-accent">{c.after}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Rules Table */}
            {loading ? (
                <div className="loading">Carregando regras...</div>
            ) : rules.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon"><ShieldCheck size={40} color="var(--accent-primary)" /></div>
                    <h3>Nenhuma regra cadastrada</h3>
                    <p>Crie regras para classificar automaticamente suas transações</p>
                </div>
            ) : (
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Prior.</th>
                                <th>Padrão de Busca</th>
                                <th>Campo</th>
                                <th>Banco</th>
                                <th>Sinal</th>
                                <th>Categoria</th>
                                <th>Subcategoria</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'center' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRules.map((r) => (
                                <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.5 }}>
                                    <td>{r.priority}</td>
                                    <td>
                                        <code style={{ fontSize: '0.75rem', color: 'var(--accent-primary-hover)' }}>
                                            {r.regex}
                                        </code>
                                    </td>
                                    <td className="text-xs">{r.campo_alvo}</td>
                                    <td className="text-xs">{r.banco_escopo}</td>
                                    <td className="text-xs">{r.sinal_escopo}</td>
                                    <td><span className="badge badge-accent">{r.categoria}</span></td>
                                    <td className="text-xs text-muted">{r.subcategoria || '—'}</td>
                                    <td>
                                        <span className={`badge ${r.enabled ? 'badge-success' : 'badge-default'}`}>
                                            {r.enabled ? 'Ativada' : 'Desativada'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div className="btn-group" style={{ justifyContent: 'center' }}>
                                            <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r)} title="Editar Regra">
                                                <Pencil size={13} />
                                            </button>
                                            {confirmDeleteId === r.id ? (
                                                <button className="btn btn-sm btn-danger" onClick={() => deleteRule(r.id)}>
                                                    Confirmar?
                                                </button>
                                            ) : (
                                                <button className="btn btn-sm btn-danger" onClick={() => setConfirmDeleteId(r.id)} title="Excluir Regra">
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal de Criação e Edição de Regra com Editor Amigável de Regex */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
                        <div className="modal-header">
                            <h3 className="icon-align" style={{ gap: '8px' }}>
                                <ShieldCheck size={20} color="var(--accent-primary)" />
                                {editingRule ? 'Editar Regra' : 'Nova Regra de Auto-Classificação'}
                            </h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        {formError && (
                            <div className="alert alert-danger" style={{ marginBottom: 16, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem' }}>
                                <X size={14} style={{ display: 'inline', marginRight: 4 }} /> {formError}
                            </div>
                        )}

                        {/* Campo Padrão de Busca Amigável */}
                        <div className="form-group mb-3">
                            <div className="flex-between mb-1">
                                <label className="form-label" style={{ marginBottom: 0 }}>
                                    {rawRegexMode ? 'Expressão Regular (Regex)' : 'Padrão / Texto de Busca'}
                                </label>
                                <label className="text-xs text-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={rawRegexMode}
                                        onChange={toggleRawMode}
                                    />
                                    Modo Regex Avançado
                                </label>
                            </div>
                            <input
                                type="text"
                                className="form-input"
                                placeholder={rawRegexMode ? "Ex: uber|99.*pop" : "Ex: ifd vogue (busca por palavras contidas)"}
                                value={userPatternText}
                                onChange={(e) => handlePatternChange(e.target.value)}
                            />
                            {!rawRegexMode && form.regex && (
                                <div className="mt-1 flex gap-1" style={{ alignItems: 'center' }}>
                                    <span className="text-xs text-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <Code size={12} color="var(--accent-primary)" /> Regex compilado: <code>{form.regex}</code>
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="form-row mb-3">
                            <div className="form-group">
                                <label className="form-label">Campo alvo</label>
                                <select className="form-select"
                                    value={form.campo_alvo}
                                    onChange={(e) => setForm((f) => ({ ...f, campo_alvo: e.target.value }))}
                                >
                                    <option value="ambos">Ambos</option>
                                    <option value="titulo">Título</option>
                                    <option value="descricao">Descrição</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Banco</label>
                                <select className="form-select"
                                    value={form.banco_escopo}
                                    onChange={(e) => setForm((f) => ({ ...f, banco_escopo: e.target.value }))}
                                >
                                    <option value="qualquer">Qualquer</option>
                                    <option value="C6">C6</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Sinal</label>
                                <select className="form-select"
                                    value={form.sinal_escopo}
                                    onChange={(e) => setForm((f) => ({ ...f, sinal_escopo: e.target.value }))}
                                >
                                    <option value="qualquer">Qualquer</option>
                                    <option value="entrada">Entrada</option>
                                    <option value="saida">Saída</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-row mb-3">
                            <div className="form-group">
                                <label className="form-label">Categoria *</label>
                                <input type="text" className="form-input"
                                    placeholder="Ex: Transporte"
                                    value={form.categoria}
                                    onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value, subcategoria: '' }))}
                                    list="rules-cat-list"
                                />
                                <datalist id="rules-cat-list">
                                    {allCategories.map(c => <option key={c.id} value={c.nome} />)}
                                </datalist>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Subcategoria</label>
                                <input type="text" className="form-input"
                                    placeholder="Ex: Uber"
                                    value={form.subcategoria}
                                    onChange={(e) => setForm((f) => ({ ...f, subcategoria: e.target.value }))}
                                    list="rules-subcat-list"
                                />
                                <datalist id="rules-subcat-list">
                                    {getSubcategoryOptions(form.categoria).map(s => <option key={s.id} value={s.nome} />)}
                                </datalist>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Prioridade</label>
                                <input type="number" className="form-input"
                                    value={form.priority}
                                    onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 100 }))}
                                />
                            </div>
                        </div>

                        <div className="form-group mb-3">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={form.enabled}
                                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                                />
                                Regra Ativada
                            </label>
                        </div>

                        {/* Test area */}
                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                            <label className="form-label">Testar Padrão em um texto de exemplo</label>
                            <div className="flex gap-2">
                                <input type="text" className="form-input"
                                    placeholder="Digite um texto de transação para testar..."
                                    value={testText}
                                    onChange={(e) => setTestText(e.target.value)}
                                />
                                <button className="btn btn-secondary btn-sm" onClick={handleTest} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Check size={14} /> Testar
                                </button>
                            </div>
                            {testResult && (
                                <div className={`mt-3 badge ${testResult.matches ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                                    {testResult.matches ? '✓ Casou com o texto!' : '✕ Não casou'}
                                    {testResult.error && ` — ${testResult.error}`}
                                </div>
                            )}
                        </div>

                        <div className="modal-footer mt-4">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={saveRule} disabled={!form.regex || !form.categoria}>
                                {editingRule ? 'Salvar Regra' : 'Criar Regra'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
