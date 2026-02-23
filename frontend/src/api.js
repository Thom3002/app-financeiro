const API_BASE = '/api';

async function request(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
        headers: {
            ...(options.body && !(options.body instanceof FormData)
                ? { 'Content-Type': 'application/json' }
                : {}),
        },
        ...options,
        body:
            options.body instanceof FormData
                ? options.body
                : options.body
                    ? JSON.stringify(options.body)
                    : undefined,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `Erro ${res.status}`);
    }
    return res.json();
}

export const api = {
    // Import
    getBanks: () => request('/import/banks'),
    importPreview: (banco, file) => {
        const fd = new FormData();
        fd.append('file', file);
        return request(`/import/preview?banco=${banco}`, { method: 'POST', body: fd });
    },
    importExecute: (banco, file) => {
        const fd = new FormData();
        fd.append('file', file);
        return request(`/import/execute?banco=${banco}`, { method: 'POST', body: fd });
    },
    getImportHistory: () => request('/import/history'),

    // Transactions
    getTransactions: (params = {}) => {
        const qs = new URLSearchParams(
            Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null),
        ).toString();
        return request(`/transactions${qs ? '?' + qs : ''}`);
    },
    updateTransactionCategory: (id, data) =>
        request(`/transactions/${id}`, { method: 'PATCH', body: data }),
    getDistinctCategories: () => request('/transactions/categories'),
    getDistinctBanks: () => request('/transactions/banks'),

    // Rules
    getRules: () => request('/rules'),
    getRule: (id) => request(`/rules/${id}`),
    createRule: (data) => request('/rules', { method: 'POST', body: data }),
    updateRule: (id, data) => request(`/rules/${id}`, { method: 'PUT', body: data }),
    deleteRule: (id) => request(`/rules/${id}`, { method: 'DELETE' }),
    testRule: (data) => request('/rules/test', { method: 'POST', body: data }),
    simulateRules: (data) => request('/rules/simulate', { method: 'POST', body: data }),
    reprocessRules: (data) => request('/rules/reprocess', { method: 'POST', body: data }),
    importRules: (rules) => request('/rules/import', { method: 'POST', body: { rules } }),
    exportRules: () => request('/rules/export'),

    // Categories
    getCategories: () => request('/categories'),
    getCategoriesFlat: () => request('/categories/flat'),
    createCategory: (data) => request('/categories', { method: 'POST', body: data }),
    updateCategory: (id, data) => request(`/categories/${id}`, { method: 'PUT', body: data }),
    deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

    // Dashboard
    getDashboardSummary: (params = {}) => {
        const qs = new URLSearchParams(
            Object.entries(params).filter(([, v]) => v),
        ).toString();
        return request(`/dashboard/summary${qs ? '?' + qs : ''}`);
    },
    getDashboardTimeline: (params = {}) => {
        const qs = new URLSearchParams(
            Object.entries(params).filter(([, v]) => v),
        ).toString();
        return request(`/dashboard/timeline${qs ? '?' + qs : ''}`);
    },
    getDashboardDrilldown: (categoria, params = {}) => {
        const qs = new URLSearchParams(
            Object.entries(params).filter(([, v]) => v),
        ).toString();
        return request(`/dashboard/drilldown/${encodeURIComponent(categoria)}${qs ? '?' + qs : ''}`);
    },

    // Classification
    getClassificationSuggestions: () => request('/classification/suggestions'),
    previewKeyword: (data) => request('/classification/preview-keyword', { method: 'POST', body: data }),
    applyClassification: (data) => request('/classification/apply', { method: 'POST', body: data }),
    reorderRules: (ruleIds) => request('/classification/reorder', { method: 'POST', body: { ruleIds } }),
};
