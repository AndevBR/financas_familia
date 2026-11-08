import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Se uma tela der erro, mostra um aviso no lugar dela em vez de deixar tudo em branco.
 * Os dados ficam salvos no navegador; basta tentar de novo.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string; onClose?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro na tela:', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // ao trocar de tela, tenta de novo
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { onClose } = this.props;
    if (onClose) {
      // erro dentro de uma janela: mostra o aviso como janela, com botão para fechar
      return (
        <div className="modal-backdrop">
          <div className="modal" role="alertdialog" style={{ padding: 20, textAlign: 'center' }}>
            <AlertTriangle size={30} color="var(--warning)" style={{ margin: '0 auto' }} />
            <h2 style={{ margin: '10px 0 6px' }}>Algo deu errado nesta janela</h2>
            <p className="muted small">Nada foi perdido. Feche e tente de novo.</p>
            <p className="tiny muted" style={{ wordBreak: 'break-word' }}>{this.state.error.message}</p>
            <button
              className="btn primary"
              onClick={() => {
                this.setState({ error: null });
                onClose();
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="card" role="alert" style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
        <AlertTriangle size={32} color="var(--warning)" />
        <h2 style={{ margin: '10px 0 6px' }}>Algo deu errado nesta tela</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Seus dados estão salvos. Tente de novo; se o problema continuar, anote o que estava fazendo.
        </p>
        <p className="tiny muted" style={{ wordBreak: 'break-word' }}>{this.state.error.message}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => this.setState({ error: null })}>
            Tentar de novo
          </button>
          <button className="btn" onClick={() => location.reload()}>
            Recarregar a página
          </button>
        </div>
      </div>
    );
  }
}
