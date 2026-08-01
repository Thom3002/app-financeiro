import { useState } from 'react';

export default function ConflictPanel({ conflicts, onReorder, onDismiss }) {
    const [order, setOrder] = useState(conflicts);

    const moveUp = (idx) => {
        if (idx === 0) return;
        const newOrder = [...order];
        [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
        setOrder(newOrder);
    };

    const moveDown = (idx) => {
        if (idx === order.length - 1) return;
        const newOrder = [...order];
        [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
        setOrder(newOrder);
    };

    return (
        <div
            className="card conflict-panel"
            style={{
                marginBottom: 24,
                border: '1px solid #f59e0b',
                background: 'rgba(245, 158, 11, 0.08)',
                padding: '20px 24px',
            }}
        >
            <div className="card-header" style={{ marginBottom: 12 }}>
                <h3 className="card-title" style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 8 }}>
                    ⚠️ Conflito de Regras Detectado
                </h3>
                <p className="text-muted text-sm" style={{ marginTop: 4, lineHeight: '1.4' }}>
                    Algumas regras cadastradas podem corresponder às mesmas transações.
                    <br />
                    <strong>💡 Regra do topo (1º lugar) tem prioridade máxima:</strong> se uma transação casar com duas regras, ela receberá a categoria da regra que estiver mais acima. Use as setas (↑ / ↓) para reordenar.
                </p>
            </div>

            <div className="conflict-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {order.map((c, idx) => (
                    <div
                        key={c.rule.id}
                        className={`conflict-item ${c.isNew ? 'conflict-item-new' : ''}`}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 14px',
                            borderRadius: 8,
                            background: idx === 0 ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-card-secondary, #1f2937)',
                            border: idx === 0 ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.08)',
                        }}
                    >
                        <div
                            style={{
                                fontWeight: 'bold',
                                fontSize: '0.9rem',
                                color: idx === 0 ? '#818cf8' : 'var(--text-muted)',
                                minWidth: 32,
                            }}
                        >
                            {idx + 1}º {idx === 0 ? '👑' : ''}
                        </div>

                        <div className="conflict-info" style={{ flex: 1, fontSize: '0.88rem' }}>
                            <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4, color: '#fcd34d' }}>
                                {c.rule.regex}
                            </code>
                            <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>→</span>
                            <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{c.rule.categoria}</span>
                            {c.rule.subcategoria && (
                                <span className="text-muted" style={{ fontSize: '0.8rem', marginLeft: 4 }}>
                                    ({c.rule.subcategoria})
                                </span>
                            )}
                            {c.isNew && (
                                <span className="badge badge-warning" style={{ marginLeft: 8, fontSize: '0.72rem' }}>
                                    Nova Regra
                                </span>
                            )}
                        </div>

                        <div className="conflict-actions" style={{ display: 'flex', gap: 4 }}>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => moveUp(idx)}
                                disabled={idx === 0}
                                title="Mover para cima (maior prioridade)"
                                style={{ padding: '2px 8px' }}
                            >
                                ↑
                            </button>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => moveDown(idx)}
                                disabled={idx === order.length - 1}
                                title="Mover para baixo (menor prioridade)"
                                style={{ padding: '2px 8px' }}
                            >
                                ↓
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="conflict-actions-bar" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-secondary" onClick={onDismiss}>
                    Ignorar por enquanto
                </button>
                <button
                    className="btn btn-primary"
                    onClick={() => onReorder(order.map((c) => c.rule.id))}
                >
                    ✅ Salvar Ordem e Aplicar Regras
                </button>
            </div>
        </div>
    );
}
