import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import ImportPage from './pages/ImportPage';
import TransactionsPage from './pages/TransactionsPage';
import RulesPage from './pages/RulesPage';
import CategoriesPage from './pages/CategoriesPage';
import DashboardPage from './pages/DashboardPage';
import ClassifyPage from './pages/ClassifyPage';
import SettingsPage from './pages/SettingsPage';
import { api } from './api';
import { useVisibility } from './contexts/VisibilityContext';

const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/import', label: 'Importar', icon: '📥' },
    { path: '/classify', label: 'Classificar', icon: '🏷️', hasBadge: true },
    { path: '/transactions', label: 'Transações', icon: '💳' },
    { path: '/rules', label: 'Regras', icon: '📋' },
    { path: '/categories', label: 'Categorias', icon: '🗂️' },
    { path: '/settings', label: 'Configurações', icon: '⚙️', hasUpdateBadge: true },
];

export default function App() {
    const [unclassifiedCount, setUnclassifiedCount] = useState(0);
    const { isVisible, toggleVisibility } = useVisibility();
    const [appVersion, setAppVersion] = useState('');
    const [updateInfo, setUpdateInfo] = useState(null); // { version, ready }
    const location = useLocation();

    const isElectron = !!window.electronAPI;

    const fetchUnclassifiedCount = () => {
        api.getClassificationSuggestions()
            .then((data) => setUnclassifiedCount(data.totalUnclassified || 0))
            .catch(() => { });
    };

    useEffect(() => {
        fetchUnclassifiedCount();
    }, [location]);

    useEffect(() => {
        const handleCountChanged = () => {
            fetchUnclassifiedCount();
        };
        window.addEventListener('unclassified-count-changed', handleCountChanged);
        return () => {
            window.removeEventListener('unclassified-count-changed', handleCountChanged);
        };
    }, []);

    useEffect(() => {
        if (isElectron) {
            // Busca versão do app
            window.electronAPI.getVersion().then(setAppVersion).catch(console.error);

            // Escuta eventos de atualização para notificar o usuário na tela principal
            const removeUpdateListener = window.electronAPI.onUpdateEvent((evt) => {
                if (evt.status === 'available') {
                    setUpdateInfo({ version: evt.version });
                } else if (evt.status === 'downloaded') {
                    setUpdateInfo({ version: evt.version, ready: true });
                }
            });

            return () => removeUpdateListener();
        }
    }, [isElectron]);

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
                            {item.hasUpdateBadge && updateInfo?.ready && (
                                <span className="nav-badge" style={{ backgroundColor: '#22c55e', color: 'white', padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>↓</span>
                            )}
                        </NavLink>
                    ))}
                </nav>
                <div className="sidebar-footer" style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {appVersion && (
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontFamily: 'monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            Versão: v{appVersion}
                            {updateInfo?.ready && (
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        window.electronAPI.quitAndInstall();
                                    }}
                                    style={{
                                        background: '#22c55e',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        fontSize: '9px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Reiniciar
                                </button>
                            )}
                        </div>
                    )}
                    <button
                        onClick={toggleVisibility}
                        style={{
                            width: '100%',
                            padding: '10px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: '#f8fafc',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    >
                        {isVisible ? '🙈 Ocultar Valores' : '👁️ Mostrar Valores'}
                    </button>
                </div>
            </aside>

            <main className="main-content" style={{ position: 'relative' }}>
                <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/import" element={<ImportPage />} />
                    <Route path="/classify" element={<ClassifyPage />} />
                    <Route path="/transactions" element={<TransactionsPage />} />
                    <Route path="/rules" element={<RulesPage />} />
                    <Route path="/categories" element={<CategoriesPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                </Routes>
            </main>
        </div>
    );
}
