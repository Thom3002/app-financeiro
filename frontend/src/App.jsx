import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import ImportPage from './pages/ImportPage';
import TransactionsPage from './pages/TransactionsPage';
import RulesPage from './pages/RulesPage';
import CategoriesPage from './pages/CategoriesPage';
import DashboardPage from './pages/DashboardPage';
import ClassifyPage from './pages/ClassifyPage';
import { api } from './api';

const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/import', label: 'Importar', icon: '📥' },
    { path: '/classify', label: 'Classificar', icon: '🏷️', hasBadge: true },
    { path: '/transactions', label: 'Transações', icon: '💳' },
    { path: '/rules', label: 'Regras', icon: '⚙️' },
    { path: '/categories', label: 'Categorias', icon: '🗂️' },
];

export default function App() {
    const [unclassifiedCount, setUnclassifiedCount] = useState(0);

    useEffect(() => {
        api.getClassificationSuggestions()
            .then((data) => setUnclassifiedCount(data.totalUnclassified || 0))
            .catch(() => { });
    }, []);

    return (
        <div className="app-layout">
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <h1>💰 Financeiro</h1>
                    <span>Gestão de gastos</span>
                </div>
                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                `nav-link ${isActive ? 'active' : ''}`
                            }
                        >
                            <span className="nav-icon">{item.icon}</span>
                            {item.label}
                            {item.hasBadge && unclassifiedCount > 0 && (
                                <span className="nav-badge">{unclassifiedCount}</span>
                            )}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            <main className="main-content">
                <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/import" element={<ImportPage />} />
                    <Route path="/classify" element={<ClassifyPage />} />
                    <Route path="/transactions" element={<TransactionsPage />} />
                    <Route path="/rules" element={<RulesPage />} />
                    <Route path="/categories" element={<CategoriesPage />} />
                </Routes>
            </main>
        </div>
    );
}
