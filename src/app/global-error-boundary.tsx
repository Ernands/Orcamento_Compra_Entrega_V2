import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // Production observability can be attached here without logging sensitive payloads.
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="fatal-state">
        <div className="fatal-state__icon" aria-hidden="true">
          <AlertTriangle size={28} />
        </div>
        <h1>Nao foi possivel abrir o sistema</h1>
        <p>Recarregue a pagina. Se o problema continuar, informe o suporte.</p>
        <button className="button button--primary" onClick={() => window.location.reload()}>
          <RotateCcw size={18} />
          Recarregar
        </button>
      </main>
    );
  }
}
