import React, { useMemo } from 'react';

/**
 * Componente de Seletor de Categoria Hierárquico com <optgroup>
 * Organiza categorias pai como agrupadores (<optgroup>) e subcategorias como filhas (└ Subcategoria).
 */
export default function CategorySelectFilter({
    categories = [], // pode ser lista hierárquica [{id, nome, children:[]}] ou lista plana
    value = '',
    onChange,
    placeholder = 'Todas as categorias',
    className = 'form-select',
    style = {}
}) {
    // Processa a estrutura hierárquica garantindo agrupamento correto por Categoria Pai
    const hierarchicalCategories = useMemo(() => {
        if (!categories || categories.length === 0) return [];

        // Se já for uma estrutura com children
        if (categories[0] && Array.isArray(categories[0].children)) {
            return categories;
        }

        // Se for uma lista de strings simples ou objetos sem children
        const parentMap = new Map();
        categories.forEach(item => {
            const name = typeof item === 'string' ? item : item.nome || item.name;
            if (!name) return;

            if (typeof item === 'object' && item.parent_id) {
                // É subcategoria em formato plano
                return;
            }

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

    return (
        <select
            className={className}
            style={style}
            value={value}
            onChange={onChange}
        >
            <option value="">{placeholder}</option>
            {hierarchicalCategories.map((parent) => {
                const hasChildren = parent.children && parent.children.length > 0;

                if (!hasChildren) {
                    return (
                        <option key={parent.id || parent.nome} value={parent.nome}>
                            {parent.nome}
                        </option>
                    );
                }

                return (
                    <optgroup key={parent.id || parent.nome} label={`📂 ${parent.nome}`}>
                        <option value={parent.nome}>{parent.nome} (Toda a Categoria)</option>
                        {parent.children.map((sub) => (
                            <option key={sub.id || sub.nome} value={sub.nome}>
                                &nbsp;&nbsp;└ {sub.nome}
                            </option>
                        ))}
                    </optgroup>
                );
            })}
        </select>
    );
}
