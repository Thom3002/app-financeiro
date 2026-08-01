import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function PluggyConnectModal({ isOpen, onClose, onSuccessSync }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    let pluggyWidgetInstance = null;

    async function launchPluggyWidget() {
      try {
        setLoading(true);
        setError(null);

        // 1. Obter connectToken do backend
        const { connectToken } = await api.getPluggyConnectToken();

        if (!isMounted) return;

        if (!connectToken) {
          throw new Error('Não foi possível obter o token de conexão do servidor.');
        }

        // 2. Garantir que o script da SDK do Pluggy está no documento
        const loadScript = () => {
          return new Promise((resolve, reject) => {
            if (window.PluggyConnect) {
              return resolve();
            }
            const existingScript = document.getElementById('pluggy-connect-sdk');
            if (existingScript) {
              existingScript.onload = () => resolve();
              existingScript.onerror = () => reject(new Error('Falha ao carregar a SDK do Pluggy.'));
              return;
            }
            const script = document.createElement('script');
            script.id = 'pluggy-connect-sdk';
            script.src = 'https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js';
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Falha ao carregar a SDK do Pluggy Connect.'));
            document.body.appendChild(script);
          });
        };

        await loadScript();

        if (!isMounted) return;

        // 3. Inicializar a SDK do Pluggy Connect
        setLoading(false);
        pluggyWidgetInstance = new window.PluggyConnect({
          connectToken,
          countries: ['BR'],
          includeSandbox: false,
          forceOauthInBrowser: true,
          onSuccess: async (data) => {
            const itemId = data?.item?.id || data?.itemId;
            setLoading(true);
            try {
              if (itemId) {
                await api.syncPluggy(itemId);
              } else {
                await api.syncPluggy();
              }
              if (onSuccessSync) onSuccessSync();
            } catch (syncErr) {
              console.error('Erro na sincronização pós-conexão:', syncErr);
            } finally {
              if (isMounted) {
                setLoading(false);
                onClose();
              }
            }
          },
          onError: async (errData) => {
            console.error('Erro no Pluggy Connect:', errData);
            const msgStr = typeof errData === 'string' ? errData : (errData?.message || JSON.stringify(errData || {}));

            // Se a conta/item já existir no Pluggy, sincroniza a conta pré-existente sem exibir erro
            if (msgStr.includes('ITEM_USER_ALREADY_EXISTS') || msgStr.includes('ALREADY_EXISTS')) {
              setLoading(true);
              try {
                const itemId = errData?.data?.item?.id || errData?.data?.id || errData?.itemId;
                if (itemId) {
                  await api.syncPluggy(itemId);
                } else {
                  await api.syncPluggy();
                }
                if (onSuccessSync) onSuccessSync();
              } catch (syncErr) {
                console.error('Erro ao sincronizar item existente:', syncErr);
              } finally {
                if (isMounted) {
                  setLoading(false);
                  onClose();
                }
              }
              return;
            }

            if (isMounted) {
              setError(errData?.message || 'A conexão com o banco foi cancelada ou encontrou um erro.');
            }
          },
          onClose: () => {
            if (isMounted) {
              onClose();
            }
          },
        });

        pluggyWidgetInstance.init();
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Erro ao inicializar o Pluggy Connect.');
          setLoading(false);
        }
      }
    }

    launchPluggyWidget();

    return () => {
      isMounted = false;
      // Caso a instância possua método destroy/close
      if (pluggyWidgetInstance && typeof pluggyWidgetInstance.destroy === 'function') {
        try { pluggyWidgetInstance.destroy(); } catch (e) { }
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(4px)',
      padding: '16px',
    }}>
      <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        maxWidth: '480px',
        width: '100%',
        padding: '24px',
        color: '#f8fafc',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
            Conectar Banco (Open Finance)
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.2rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div className="loading-spinner" style={{
              width: '32px',
              height: '32px',
              border: '3px solid #3b82f6',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
              Carregando janela de conexão segura...
            </p>
          </div>
        ) : error ? (
          <div>
            <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
              {error}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: 0 }}>
            A janela do Pluggy Connect foi aberta. Conclua o login na instituição bancária para finalizar a sincronização.
          </p>
        )}
      </div>
    </div>
  );
}
