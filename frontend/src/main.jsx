import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { VisibilityProvider } from './contexts/VisibilityContext';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <VisibilityProvider>
                <App />
            </VisibilityProvider>
        </BrowserRouter>
    </React.StrictMode>,
);
