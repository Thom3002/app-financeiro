import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import ImportPage from './pages/ImportPage';
import TransactionsPage from './pages/TransactionsPage';
import RulesPage from './pages/RulesPage';
import CategoriesPage from './pages/CategoriesPage';
import DashboardPage from './pages/DashboardPage';

const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/import', label: 'Importar', icon: '📥' },
    { path: '/transactions', label: 'Transações', icon: '💳' },
    { path: '/rules', label: 'Regras', icon: '⚙️' },
    { path: '/categories', label: 'Categorias', icon: '🏷️' },
];

export default function App() {
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
                        </NavLink>
                    ))}
                </nav>
            </aside>

            <main className="main-content">
                <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/import" element={<ImportPage />} />
                    <Route path="/transactions" element={<TransactionsPage />} />
                    <Route path="/rules" element={<RulesPage />} />
                    <Route path="/categories" element={<CategoriesPage />} />
                </Routes>
            </main>
        </div>
    );
}
