import { useState, useEffect } from 'react';
import { api } from '../api';

export default function RulesPage() {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [form, setForm] = useState(getEmptyForm());
    const [testResult, setTestResult] = useState(null);
    const [testText, setTestText] = useState('');
    const [showSimulate, setShowSimulate] = useState(false);
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

    useEffect(() => {
        loadRules();
    }, []);

    const loadRules = async () => {
        setLoading(true);
        try {
            const data = await api.getRules();
            setRules(data);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const openNew = () => {
        setEditingRule(null);
        setForm(getEmptyForm());
        setTestResult(null);
        setTestText('');
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
        setTestResult(null);
        setTestText('');
        setShowModal(true);
    };

    const saveRule = async () => {
        try {
            if (editingRule) {
                await api.updateRule(editingRule.id, form);
            } else {
                await api.createRule(form);
            }
            setShowModal(false);
            loadRules();
        } catch (e) {
            alert(e.message);
        }
    };

    const deleteRule = async (id) => {
        if (!confirm('Excluir esta regra?')) return;
        try {
            await api.deleteRule(id);
            loadRules();
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
        try {
            const result = await api.reprocessRules(simForm);
            setSimResult(result);
            alert(`Reprocessamento concluído: ${result.totalChanged} transações alteradas.`);
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

    return (
        <div>
            <div className="page-header flex-between">
                <div>
                    <h2>⚙️ Regras de Classificação</h2>
                    <p>{rules.length} regra(s) configurada(s)</p>
                </div>
                <div className="btn-group">
                    <button className="btn btn-secondary" onClick={handleImport}>📥 Importar</button>
                    <button className="btn btn-secondary" onClick={handleExport}>📤 Exportar</button>
                    <button className="btn btn-secondary" onClick={() => setShowSimulate(!showSimulate)}>
                        🔍 Simular
                    </button>
                    <button className="btn btn-primary" onClick={openNew}>+ Nova Regra</button>
                </div>
            </div>

            {/* Simulate Panel */}
            {showSimulate && (
                <div className="card mb-6">
                    <div className="card-header">
                        <h3 className="card-title">Simular / Reprocessar</h3>
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
                        <button className="btn btn-secondary" onClick={handleSimulate}>🔍 Simular (Dry-run)</button>
                        <button className="btn btn-primary" onClick={handleReprocess}>▶ Reprocessar</button>
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
                    <div className="empty-icon">⚙️</div>
                    <h3>Nenhuma regra cadastrada</h3>
                    <p>Crie regras para classificar automaticamente suas transações</p>
                </div>
            ) : (
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Prior.</th>
                                <th>Regex</th>
                                <th>Campo</th>
                                <th>Banco</th>
                                <th>Sinal</th>
                                <th>Categoria</th>
                                <th>Subcategoria</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.map((r) => (
                                <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.5 }}>
                                    <td>{r.priority}</td>
                                    <td><code style={{ fontSize: '0.75rem', color: 'var(--accent-primary-hover)' }}>{r.regex}</code></td>
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
                                    <td>
                                        <div className="btn-group">
                                            <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r)}>✏️</button>
                                            <button className="btn btn-sm btn-danger" onClick={() => deleteRule(r.id)}>🗑</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingRule ? 'Editar Regra' : 'Nova Regra'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Regex</label>
                            <input type="text" className="form-input"
                                placeholder="uber|99.*pop"
                                value={form.regex}
                                onChange={(e) => setForm((f) => ({ ...f, regex: e.target.value }))}
                            />
                        </div>
                        <div className="form-row">
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
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Categoria *</label>
                                <input type="text" className="form-input"
                                    placeholder="Transporte"
                                    value={form.categoria}
                                    onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Subcategoria</label>
                                <input type="text" className="form-input"
                                    placeholder="Uber"
                                    value={form.subcategoria}
                                    onChange={(e) => setForm((f) => ({ ...f, subcategoria: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Prioridade</label>
                                <input type="number" className="form-input"
                                    value={form.priority}
                                    onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 100 }))}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={form.enabled}
                                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                                />
                                Ativada
                            </label>
                        </div>

                        {/* Test area */}
                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                            <label className="form-label">Testar regex</label>
                            <div className="flex gap-2">
                                <input type="text" className="form-input"
                                    placeholder="Texto para testar..."
                                    value={testText}
                                    onChange={(e) => setTestText(e.target.value)}
                                />
                                <button className="btn btn-secondary btn-sm" onClick={handleTest}>Testar</button>
                            </div>
                            {testResult && (
                                <div className={`mt-4 badge ${testResult.matches ? 'badge-success' : 'badge-danger'}`}>
                                    {testResult.matches ? '✅ Match!' : '❌ Não casou'}
                                    {testResult.error && ` — ${testResult.error}`}
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={saveRule} disabled={!form.regex || !form.categoria}>
                                {editingRule ? 'Salvar' : 'Criar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
