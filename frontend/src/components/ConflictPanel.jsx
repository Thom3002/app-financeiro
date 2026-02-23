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
        <div className="card conflict-panel" style={{ marginBottom: 24, border: '1px solid var(--accent-primary)' }}>
            <div className="card-header">
                <h3 className="card-title">⚠️ Conflitos detectados</h3>
                <p className="text-muted text-sm">
                    Estas regras podem classificar as mesmas transações. Ordene-as por prioridade
                    (a primeira que casar vence).
                </p>
            </div>
            <div className="conflict-list">
                {order.map((c, idx) => (
                    <div key={c.rule.id} className={`conflict-item ${c.isNew ? 'conflict-item-new' : ''}`}>
                        <div className="conflict-order">{idx + 1}º</div>
                        <div className="conflict-info">
                            <strong>{c.rule.regex}</strong> → {c.rule.categoria}
                            {c.rule.subcategoria && ` > ${c.rule.subcategoria}`}
                            {c.isNew && (
                                <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                                    Nova Regra
                                </span>
                            )}
                        </div>
                        <div className="conflict-actions">
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => moveUp(idx)}
                                disabled={idx === 0}
                            >
                                ↑
                            </button>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => moveDown(idx)}
                                disabled={idx === order.length - 1}
                            >
                                ↓
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="conflict-actions-bar">
                <button className="btn btn-secondary" onClick={onDismiss}>
                    Ignorar
                </button>
                <button
                    className="btn btn-primary"
                    onClick={() => onReorder(order.map((c) => c.rule.id))}
                >
                    ✅ Confirmar prioridades
                </button>
            </div>
        </div>
    );
}
