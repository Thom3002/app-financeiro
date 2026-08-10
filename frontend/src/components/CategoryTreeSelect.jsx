import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    Tag,
    Search,
    ChevronDown,
    Check,
    Square,
    CheckSquare,
    MinusSquare,
    X,
    Folder
} from 'lucide-react';

/**
 * Componente Profissional de Seletor de Categorias em Árvore (CategoryTreeSelect)
 * Suporta busca rápida em tempo real, seleção de Categoria Pai (que seleciona/desmarca todas as filhas),
 * seleção fina de subcategorias recuadas e modos Multi-Seleção e Seleção Única.
 *
 * Em modo multiSeleção, as alterações de checkbox são mantidas em estado rascunho (draft)
 * e confirmadas apenas ao clicar no botão "Aplicar Filtro".
 */
export default function CategoryTreeSelect({
    categories = [], // Array de categorias [{ id, nome, children: [{ id, nome }] }]
    selectedValues, // Array de strings em multiSelect, ou String em singleSelect
    onChange, // callback fn(newValues)
    multiSelect = false,
    placeholder = 'Todas as Categorias',
    className = '',
    style = {}
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef(null);

    // Estado local rascunho (draft) para armazenar alterações antes de aplicar
    const [localValues, setLocalValues] = useState(selectedValues || (multiSelect ? [] : ''));

    // Sincroniza o rascunho local com a prop quando o popover fecha ou quando a prop muda de fora
    useEffect(() => {
        if (!isOpen) {
            setLocalValues(selectedValues || (multiSelect ? [] : ''));
        }
    }, [selectedValues, isOpen, multiSelect]);

    // Normaliza os valores aplicados externos em um Set
    const appliedSet = useMemo(() => {
        if (Array.isArray(selectedValues)) {
            return new Set(selectedValues);
        }
        if (selectedValues && typeof selectedValues === 'string') {
            return new Set([selectedValues]);
        }
        return new Set();
    }, [selectedValues]);

    // Normaliza os valores rascunho locais em um Set
    const localSet = useMemo(() => {
        if (Array.isArray(localValues)) {
            return new Set(localValues);
        }
        if (localValues && typeof localValues === 'string') {
            return new Set([localValues]);
        }
        return new Set();
    }, [localValues]);

    // Normaliza a estrutura de categorias para garantir que tenhamos a árvore [Pai -> Filhos]
    const treeData = useMemo(() => {
        if (!categories || categories.length === 0) return [];

        // Se já for estrutura com children
        if (categories[0] && Array.isArray(categories[0].children)) {
            return categories;
        }

        // Se for lista plana
        const parentMap = new Map();
        categories.forEach(item => {
            const name = typeof item === 'string' ? item : item.nome || item.name;
            if (!name) return;

            if (typeof item === 'object' && item.parent_id) return;

            if (!parentMap.has(name)) {
                parentMap.set(name, {
                    id: typeof item === 'object' ? item.id : name,
                    nome: name,
                    children: typeof item === 'object' && Array.isArray(item.children) ? item.children : []
                });
            }
        });

        return Array.from(parentMap.values());
    }, [categories]);

    // Filtra os itens com base no termo de busca digitado pelo usuário
    const filteredTree = useMemo(() => {
        if (!searchTerm.trim()) return treeData;
        const term = searchTerm.toLowerCase();

        return treeData
            .map(parent => {
                const parentMatch = parent.nome.toLowerCase().includes(term);
                const matchingChildren = (parent.children || []).filter(sub =>
                    sub.nome.toLowerCase().includes(term)
                );

                if (parentMatch) {
                    return parent; // se o pai casar, mostra o pai com todas as filhas
                }

                if (matchingChildren.length > 0) {
                    return {
                        ...parent,
                        children: matchingChildren
                    };
                }

                return null;
            })
            .filter(Boolean);
    }, [treeData, searchTerm]);

    // Listener para fechar o popover ao clicar fora e descartar rascunho não aplicado
    useEffect(() => {
        function handleClickOutside(event) {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
                setLocalValues(selectedValues || (multiSelect ? [] : ''));
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedValues, multiSelect]);

    // Listener de teclado para tecla ESC
    useEffect(() => {
        function handleKeyDown(event) {
            if (event.key === 'Escape' && isOpen) {
                setIsOpen(false);
                setLocalValues(selectedValues || (multiSelect ? [] : ''));
            }
        }
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, selectedValues, multiSelect]);

    // Alternar abertura do popover
    const handleToggleOpen = () => {
        if (!isOpen) {
            setLocalValues(selectedValues || (multiSelect ? [] : ''));
        }
        setIsOpen(!isOpen);
    };

    // Determina o texto de exibição no gatilho do botão
    const triggerLabel = useMemo(() => {
        const targetSet = isOpen ? localSet : appliedSet;
        if (multiSelect) {
            const count = targetSet.size;
            if (count === 0) return placeholder;
            if (count === 1) {
                const firstVal = Array.from(targetSet)[0];
                return firstVal;
            }
            return `${count} selecionadas`;
        } else {
            if (targetSet.size === 0) return placeholder;
            return Array.from(targetSet)[0] || placeholder;
        }
    }, [multiSelect, appliedSet, localSet, placeholder, isOpen]);

    // Handler para alternar item em modo SingleSelect
    const handleSingleSelect = (val) => {
        const newVal = localSet.has(val) ? '' : val;
        setLocalValues(newVal);
        if (onChange) onChange(newVal);
        setIsOpen(false);
    };

    // Handler para alternar categoria Pai em MultiSelect (atualiza apenas o rascunho local)
    const handleToggleParent = (parent) => {
        const nextSet = new Set(localSet);
        const childrenNames = (parent.children || []).map(c => c.nome);
        const allTargetNames = [parent.nome, ...childrenNames];

        const allSelected = allTargetNames.every(name => nextSet.has(name));

        if (allSelected) {
            allTargetNames.forEach(name => nextSet.delete(name));
        } else {
            allTargetNames.forEach(name => nextSet.add(name));
        }

        setLocalValues(Array.from(nextSet));
    };

    // Handler para alternar subcategoria em MultiSelect (atualiza apenas o rascunho local)
    const handleToggleChild = (childName) => {
        const nextSet = new Set(localSet);

        if (nextSet.has(childName)) {
            nextSet.delete(childName);
        } else {
            nextSet.add(childName);
        }

        setLocalValues(Array.from(nextSet));
    };

    // Auxiliar para obter status do checkbox da Categoria Pai baseado no rascunho local
    const getParentState = (parent) => {
        const childrenNames = (parent.children || []).map(c => c.nome);
        const allTargetNames = [parent.nome, ...childrenNames];

        const selectedCount = allTargetNames.filter(name => localSet.has(name)).length;

        if (selectedCount === 0) return 'none';
        if (selectedCount === allTargetNames.length) return 'all';
        return 'some';
    };

    // Limpar rascunho dentro do popover
    const handleClearLocal = (e) => {
        e.stopPropagation();
        if (multiSelect) {
            setLocalValues([]);
        } else {
            setLocalValues('');
        }
    };

    // Limpar seleção aplicada no botão externo
    const handleClearApplied = (e) => {
        e.stopPropagation();
        const emptyVal = multiSelect ? [] : '';
        setLocalValues(emptyVal);
        if (onChange) onChange(emptyVal);
    };

    // Aplicar seleção rascunho para o componente pai
    const handleApply = () => {
        if (onChange) {
            onChange(localValues);
        }
        setIsOpen(false);
    };

    return (
        <div
            ref={containerRef}
            className={`category-tree-select-container ${className}`}
            style={{ position: 'relative', display: 'inline-block', width: '100%', minWidth: '180px', ...style }}
        >
            {/* Botão Gatilho (Trigger) */}
            <button
                type="button"
                className="btn btn-secondary category-tree-trigger"
                onClick={handleToggleOpen}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    gap: '8px',
                    padding: '6px 12px',
                    fontSize: '0.85rem',
                    borderRadius: '8px',
                    background: 'var(--bg-card, #1e293b)',
                    border: isOpen ? '1px solid var(--accent-primary, #6366f1)' : '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
                    color: (isOpen ? localSet : appliedSet).size > 0 ? 'var(--text-primary, #f8fafc)' : 'var(--text-secondary, #94a3b8)',
                    boxShadow: isOpen ? '0 0 10px rgba(99, 102, 241, 0.25)' : 'none',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                    <Tag size={14} color="var(--accent-primary, #6366f1)" style={{ flexShrink: 0 }} />
                    <span style={{ truncate: true, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {triggerLabel}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {appliedSet.size > 0 && (
                        <span
                            onClick={handleClearApplied}
                            title="Limpar seleção"
                            style={{
                                padding: '2px 4px',
                                borderRadius: '4px',
                                background: 'rgba(255,255,255,0.1)',
                                color: 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                fontSize: '0.7rem'
                            }}
                        >
                            <X size={12} />
                        </span>
                    )}
                    <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
                </div>
            </button>

            {/* Menu Popover Flutuante */}
            {isOpen && (
                <div
                    className="category-tree-popover"
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        right: 0,
                        minWidth: '260px',
                        maxWidth: '340px',
                        background: '#0f172a',
                        border: '1px solid var(--border-subtle, rgba(255,255,255,0.15))',
                        borderRadius: '10px',
                        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.65)',
                        zIndex: 9999,
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        animation: 'fadeIn 0.15s ease-out'
                    }}
                >
                    {/* Campo de Busca no Topo do Popover */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 10px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '6px',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                    >
                        <Search size={14} color="var(--text-secondary, #94a3b8)" />
                        <input
                            type="text"
                            placeholder="Buscar categoria..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: '#f8fafc',
                                fontSize: '0.82rem',
                                width: '100%'
                            }}
                            autoFocus
                        />
                        {searchTerm && (
                            <X size={12} color="var(--text-secondary)" style={{ cursor: 'pointer' }} onClick={() => setSearchTerm('')} />
                        )}
                    </div>

                    {/* Cabeçalho de Ação Rápida */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Categorias & Subcategorias
                        </span>
                        {localSet.size > 0 && (
                            <button
                                type="button"
                                onClick={handleClearLocal}
                                style={{ background: 'none', border: 'none', color: 'var(--accent-primary-hover, #818cf8)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                            >
                                Limpar seleção
                            </button>
                        )}
                    </div>

                    {/* Lista em Árvore Hierárquica */}
                    <div
                        className="category-tree-scroll"
                        style={{
                            maxHeight: '230px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            paddingRight: '4px'
                        }}
                    >
                        {filteredTree.length === 0 ? (
                            <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                Nenhuma categoria encontrada
                            </div>
                        ) : (
                            filteredTree.map((parent) => {
                                const hasChildren = parent.children && parent.children.length > 0;
                                const isParentSelectedSingle = !multiSelect && localSet.has(parent.nome);

                                if (!multiSelect) {
                                    // Modo Seleção Única
                                    return (
                                        <div key={parent.id || parent.nome} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            {/* Categoria Pai em Seleção Única */}
                                            <div
                                                onClick={() => handleSingleSelect(parent.nome)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    padding: '6px 8px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    background: isParentSelectedSingle ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                                                    border: isParentSelectedSingle ? '1px solid var(--accent-primary, #6366f1)' : '1px solid transparent',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <Folder size={14} color={isParentSelectedSingle ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isParentSelectedSingle ? '#ffffff' : 'var(--text-primary)' }}>
                                                    {parent.nome}
                                                </span>
                                                {isParentSelectedSingle && <Check size={14} color="var(--accent-primary)" style={{ marginLeft: 'auto' }} />}
                                            </div>

                                            {/* Subcategorias Filhas Recuadas */}
                                            {hasChildren && (
                                                <div style={{ marginLeft: '22px', display: 'flex', flexDirection: 'column', gap: '2px', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '8px' }}>
                                                    {parent.children.map((sub) => {
                                                        const isSubSelected = localSet.has(sub.nome);
                                                        return (
                                                            <div
                                                                key={sub.id || sub.nome}
                                                                onClick={() => handleSingleSelect(sub.nome)}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '8px',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '5px',
                                                                    cursor: 'pointer',
                                                                    background: isSubSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                                                                    color: isSubSelected ? '#ffffff' : 'var(--text-secondary)'
                                                                }}
                                                            >
                                                                <span style={{ fontSize: '0.8rem', flex: 1 }}>{sub.nome}</span>
                                                                {isSubSelected && <Check size={13} color="var(--accent-primary)" />}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                // Modo Multi-Seleção (com Checkboxes)
                                const parentState = getParentState(parent);

                                return (
                                    <div key={parent.id || parent.nome} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {/* Categoria Pai com Checkbox Inteligente */}
                                        <div
                                            onClick={() => handleToggleParent(parent)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '6px 8px',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                background: parentState !== 'none' ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', color: parentState !== 'none' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                                                {parentState === 'all' && <CheckSquare size={16} color="var(--accent-primary)" />}
                                                {parentState === 'some' && <MinusSquare size={16} color="var(--accent-primary)" />}
                                                {parentState === 'none' && <Square size={16} />}
                                            </div>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: parentState !== 'none' ? '#ffffff' : 'var(--text-primary)' }}>
                                                {parent.nome}
                                            </span>
                                        </div>

                                        {/* Subcategorias Filhas Indentadas */}
                                        {hasChildren && (
                                            <div style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '2px', borderLeft: '1px dotted rgba(255,255,255,0.15)', paddingLeft: '8px' }}>
                                                {parent.children.map((sub) => {
                                                    const isSubChecked = localSet.has(sub.nome);
                                                    return (
                                                        <div
                                                            key={sub.id || sub.nome}
                                                            onClick={() => handleToggleChild(sub.nome)}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                padding: '4px 6px',
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                background: isSubChecked ? 'rgba(99, 102, 241, 0.1)' : 'transparent'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', color: isSubChecked ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                                                                {isSubChecked ? <CheckSquare size={14} color="var(--accent-primary)" /> : <Square size={14} />}
                                                            </div>
                                                            <span style={{ fontSize: '0.8rem', color: isSubChecked ? '#ffffff' : 'var(--text-secondary)' }}>
                                                                {sub.nome}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Botão de Aplicar Filtro para MultiSelect */}
                    {multiSelect && (
                        <button
                            type="button"
                            className="btn btn-primary btn-sm mt-1"
                            style={{ width: '100%', textAlign: 'center', padding: '6px 0', fontSize: '0.8rem' }}
                            onClick={handleApply}
                        >
                            Aplicar Filtro ({localSet.size})
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

