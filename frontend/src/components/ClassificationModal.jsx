import { useState } from 'react';
import {
    X,
    Tag,
    FolderPlus,
    Pin,
    EyeOff,
    Zap,
    Info,
    Check,
    Lightbulb,
    Code,
    TrendingUp
} from 'lucide-react';

function extractKeywordFromTx(tx) {
    if (!tx) return '';
    const text = (tx.descricao || tx.titulo || '').toLowerCase();
    const noise = /\b(debito de cartao|rever par deb cartao|pix recebido de|pix enviado para|transf enviada pix|bra)\b/gi;
    let cleaned = text.replace(noise, '').replace(/\s+/g, ' ').trim();
    const words = cleaned.split(' ').filter(w => w.length > 2).slice(0, 3);
    return words.join(' ').toUpperCase();
}

function friendlyToRegex(text) {
    if (!text) return '';
    const parts = text
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
        .map((k) => {
            let cleaned = k.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
            if (!cleaned) cleaned = k;
            return cleaned
                .replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '.' ? '\\.?' : '\\' + m))
                .replace(/\s+/g, '.*');
        });
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return `(?:${parts.join('|')})`;
}

const fmtCurrency = (v) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function ClassificationModal({ tx, allCategories = [], onSave, onClose, isVisible = true }) {
    if (!tx) return null;

    const fullText = ((tx.titulo || '') + ' ' + (tx.descricao || '')).toUpperCase();
    const isFatura = fullText.includes('FATURA') || fullText.includes('PAGTO FATURA') || fullText.includes('PAGAMENTO FATURA');
    const isUnclassified = !tx.categoria || tx.categoria === 'Não classificado';

    // Tabs: 'existing' | 'new'
    const [activeTab, setActiveTab] = useState('existing');

    const [selectedCat, setSelectedCat] = useState(tx.categoria && tx.categoria !== 'Não classificado' ? tx.categoria : '');
    const [newCatInput, setNewCatInput] = useState('');

    const [selectedSub, setSelectedSub] = useState(tx.subcategoria || '');
    const [newSubInput, setNewSubInput] = useState('');

    const [isCustoFixo, setIsCustoFixo] = useState(!!tx.is_custo_fixo);
    const [ignorarDashboard, setIgnorarDashboard] = useState(!!tx.ignorar_dashboard);

    const [saveRule, setSaveRule] = useState(false);
    const [friendlyRuleText, setFriendlyRuleText] = useState(extractKeywordFromTx(tx));

    const [saving, setSaving] = useState(false);

    const subcategoryOptions = (() => {
        const catName = activeTab === 'existing' ? selectedCat : newCatInput;
        const cat = allCategories.find((c) => c.nome === catName);
        return cat?.children || [];
    })();

    const handleFormSubmit = async (e) => {
        if (e) e.preventDefault();
        const categoryToSave = (activeTab === 'existing' ? selectedCat : newCatInput).trim();
        if (!categoryToSave) {
            alert('Por favor, selecione ou informe uma categoria.');
            return;
        }

        const subcategoryToSave = (activeTab === 'existing'
            ? (selectedSub === '__new__' ? newSubInput : selectedSub)
            : newSubInput
        ).trim();

        setSaving(true);
        try {
            const compiledRegex = saveRule ? friendlyToRegex(friendlyRuleText) : undefined;
            await onSave({
                categoria: categoryToSave,
                subcategoria: subcategoryToSave || null,
                is_custo_fixo: isCustoFixo,
                ignorar_dashboard: ignorarDashboard,
                saveRule,
                createRulePattern: compiledRegex,
                rulePattern: compiledRegex,
                is_manual: true,
            });
        } catch (err) {
            console.error(err);
            alert('Erro ao salvar classificação: ' + (err.message || err));
        }
        setSaving(false);
    };

    const compiledRegexPreview = friendlyToRegex(friendlyRuleText);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in" style={{ zIndex: 1100 }}>
            <div className="modal-card-container" style={{
                maxWidth: '520px',
                width: '100%',
                backgroundColor: 'var(--bg-secondary, #111827)',
                border: '1px solid var(--border-light, rgba(255, 255, 255, 0.12))',
                borderRadius: '16px',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.02)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            padding: '8px',
                            borderRadius: '10px',
                            backgroundColor: isUnclassified ? 'rgba(99, 102, 241, 0.15)' : 'rgba(52, 211, 153, 0.15)',
                            color: isUnclassified ? 'var(--accent-primary, #6366f1)' : 'var(--success, #34d399)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Tag size={20} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                                {isUnclassified ? 'Classificar Transação' : 'Editar Classificação'}
                            </h3>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                {tx.data} • {tx.banco ? tx.banco : 'Lançamento manual'}
                            </span>
                        </div>
                    </div>
                    <button
                        className="btn-icon"
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '8px',
                            display: 'inline-flex',
                            alignItems: 'center'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: '20px', overflowY: 'auto', maxHeight: '80vh' }}>
                    {/* Transaction Card Banner */}
                    <div style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border-subtle)',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                    }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }} title={tx.descricao || tx.titulo}>
                                {tx.descricao || tx.titulo}
                            </div>
                            {tx.titulo && tx.descricao && tx.titulo !== tx.descricao && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {tx.titulo}
                                </div>
                            )}
                        </div>
                        <div style={{
                            fontSize: '1rem',
                            fontWeight: 700,
                            color: tx.valor >= 0 ? 'var(--green, #34d399)' : 'var(--red, #f87171)',
                            whiteSpace: 'nowrap'
                        }}>
                            {isVisible ? fmtCurrency(tx.valor) : '*****'}
                        </div>
                    </div>

                    {/* Fatura Intelligent Banner */}
                    {isFatura && (
                        <div style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            borderRadius: '10px',
                            padding: '12px',
                            marginBottom: '16px',
                            display: 'flex',
                            gap: '10px',
                            alignItems: 'flex-start'
                        }}>
                            <Lightbulb size={18} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ color: '#fbbf24', fontWeight: 600, fontSize: '0.85rem', marginBottom: '2px' }}>
                                    Pagamento de Fatura Detectado
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                    Recomendamos ignorar este lançamento do Dashboard para evitar contagem dupla de despesas.
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIgnorarDashboard(!ignorarDashboard)}
                                    style={{
                                        border: 'none',
                                        background: ignorarDashboard ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.15)',
                                        color: '#fbbf24',
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontSize: '0.78rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <EyeOff size={14} />
                                    {ignorarDashboard ? '✓ Ignorando do Dashboard' : 'Ignorar do Dashboard'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* IHC Segmented Control Tabs */}
                    <div style={{
                        display: 'flex',
                        background: 'rgba(0,0,0,0.25)',
                        padding: '4px',
                        borderRadius: '10px',
                        marginBottom: '16px',
                        gap: '4px'
                    }}>
                        <button
                            type="button"
                            onClick={() => setActiveTab('existing')}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                border: 'none',
                                borderRadius: '7px',
                                fontSize: '0.83rem',
                                fontWeight: activeTab === 'existing' ? 600 : 500,
                                background: activeTab === 'existing' ? 'var(--bg-secondary, #1e293b)' : 'transparent',
                                color: activeTab === 'existing' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                boxShadow: activeTab === 'existing' ? '0 2px 6px rgba(0,0,0,0.3)' : 'none'
                            }}
                        >
                            <Tag size={15} /> Categorias Existentes
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('new')}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                border: 'none',
                                borderRadius: '7px',
                                fontSize: '0.83rem',
                                fontWeight: activeTab === 'new' ? 600 : 500,
                                background: activeTab === 'new' ? 'var(--bg-secondary, #1e293b)' : 'transparent',
                                color: activeTab === 'new' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                boxShadow: activeTab === 'new' ? '0 2px 6px rgba(0,0,0,0.3)' : 'none'
                            }}
                        >
                            <FolderPlus size={15} /> Criar Nova Categoria
                        </button>
                    </div>

                    {/* Tab 1: Categoria Existente */}
                    {activeTab === 'existing' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                            <div>
                                <label className="form-label text-xs mb-1" style={{ color: 'var(--text-secondary)', display: 'block' }}>
                                    Categoria Principal
                                </label>
                                <select
                                    className="form-select"
                                    value={selectedCat}
                                    onChange={(e) => {
                                        setSelectedCat(e.target.value);
                                        setSelectedSub('');
                                    }}
                                    style={{ width: '100%' }}
                                >
                                    <option value="">Selecione uma categoria existente...</option>
                                    {allCategories.map((c) => (
                                        <option key={c.id || c.nome} value={c.nome}>
                                            {c.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedCat && (
                                <div>
                                    <label className="form-label text-xs mb-1" style={{ color: 'var(--text-secondary)', display: 'block' }}>
                                        Subcategoria (Opcional)
                                    </label>
                                    <select
                                        className="form-select"
                                        value={selectedSub}
                                        onChange={(e) => setSelectedSub(e.target.value)}
                                        style={{ width: '100%' }}
                                    >
                                        <option value="">Nenhuma subcategoria</option>
                                        {subcategoryOptions.map((s) => (
                                            <option key={s.id || s.nome} value={s.nome}>
                                                {s.nome}
                                            </option>
                                        ))}
                                        <option value="__new__">+ Digitar nova subcategoria...</option>
                                    </select>

                                    {selectedSub === '__new__' && (
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Nome da nova subcategoria..."
                                            value={newSubInput}
                                            onChange={(e) => setNewSubInput(e.target.value)}
                                            style={{ marginTop: '8px', fontSize: '0.85rem' }}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 2: Criar Nova Categoria */}
                    {activeTab === 'new' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                            <div>
                                <label className="form-label text-xs mb-1" style={{ color: 'var(--text-secondary)', display: 'block' }}>
                                    Nome da Nova Categoria
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Ex: Assinaturas & Streaming"
                                    value={newCatInput}
                                    onChange={(e) => setNewCatInput(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="form-label text-xs mb-1" style={{ color: 'var(--text-secondary)', display: 'block' }}>
                                    Subcategoria Inicial (Opcional)
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Ex: Netflix / Spotify"
                                    value={newSubInput}
                                    onChange={(e) => setNewSubInput(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Checkbox Options Panel */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        padding: '12px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-subtle)'
                    }}>
                        {/* Option 1: Custo Fixo / Receita Recorrente */}
                        <label className="modal-checkbox-compact" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={isCustoFixo}
                                onChange={(e) => setIsCustoFixo(e.target.checked)}
                            />
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                {tx.valor >= 0 ? <TrendingUp size={15} color="var(--green)" /> : <Pin size={15} color="var(--accent-primary)" />}
                                {tx.valor >= 0 ? 'Receita Recorrente / Renda Fixa' : 'Custo Fixo / Despesa Recorrente'}
                            </span>
                            <span className="info-tooltip-wrapper" style={{ marginLeft: 'auto' }}>
                                <Info size={14} style={{ color: 'var(--text-secondary)' }} />
                                <span className="info-tooltip-content">
                                    {tx.valor >= 0
                                        ? 'Entradas esperadas periodicamente como salário ou pro-labore.'
                                        : 'Despesas recorrentes mensais como aluguel, luz ou assinaturas.'}
                                </span>
                            </span>
                        </label>

                        {/* Option 2: Ignorar do Dashboard */}
                        <label className="modal-checkbox-compact" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={ignorarDashboard}
                                onChange={(e) => setIgnorarDashboard(e.target.checked)}
                            />
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                <EyeOff size={15} color="var(--warning)" /> Ignorar do Dashboard
                            </span>
                            <span className="info-tooltip-wrapper" style={{ marginLeft: 'auto' }}>
                                <Info size={14} style={{ color: 'var(--text-secondary)' }} />
                                <span className="info-tooltip-content">
                                    Oculta esta transação dos gráficos e saldo do Dashboard (ex: transferências próprias ou pagamentos de fatura).
                                </span>
                            </span>
                        </label>

                        {/* Option 3: Criar regra de auto-classificação */}
                        <label className="modal-checkbox-compact" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={saveRule}
                                onChange={(e) => setSaveRule(e.target.checked)}
                            />
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                <Zap size={15} color="#eab308" /> Criar regra de auto-classificação para o futuro
                            </span>
                            <span className="info-tooltip-wrapper" style={{ marginLeft: 'auto' }}>
                                <Info size={14} style={{ color: 'var(--text-secondary)' }} />
                                <span className="info-tooltip-content">
                                    Cria uma regra automática baseada na expressão desta transação para reclassificar automaticamente lançamentos futuros.
                                </span>
                            </span>
                        </label>

                        {/* Rule pattern input when saveRule is checked */}
                        {saveRule && (
                            <div style={{
                                marginTop: '6px',
                                padding: '10px 12px',
                                background: 'rgba(99, 102, 241, 0.08)',
                                borderRadius: '8px',
                                border: '1px dashed var(--accent-primary)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-primary-hover)' }}>
                                        Texto de busca da regra:
                                    </label>
                                    <span className="info-tooltip-wrapper">
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <Code size={12} /> Regex interno
                                        </span>
                                        <span className="info-tooltip-content">
                                            Regex gerado: <code>{compiledRegexPreview || '(vazio)'}</code>
                                        </span>
                                    </span>
                                </div>
                                <input
                                    type="text"
                                    className="form-input text-xs"
                                    value={friendlyRuleText}
                                    onChange={(e) => setFriendlyRuleText(e.target.value)}
                                    placeholder="Ex: GAMMA.APP SAN FRANCISCO"
                                />
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                                    Próximos lançamentos contendo este texto herdarão a categoria salva.
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '14px 20px',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justify: 'flex-end',
                    gap: '10px',
                    background: 'rgba(0,0,0,0.15)'
                }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                        Cancelar
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleFormSubmit}
                        disabled={saving}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Check size={16} /> {saving ? 'Salvando...' : 'Salvar Transação'}
                    </button>
                </div>
            </div>
        </div>
    );
}
