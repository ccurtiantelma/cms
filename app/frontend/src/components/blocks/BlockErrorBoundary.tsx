/**
 * Error Boundary dedicato a un singolo nodo dell'albero dei blocchi: un
 * crash di rendering resta contenuto al nodo, senza abbattere la pagina
 * (PLAN-F02-blocchi.md T8). Unica class component ammessa in questa
 * cartella: React non offre un equivalente a hook per gli Error Boundary.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './BlockErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class BlockErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('BlockErrorBoundary caught an error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <div className={styles.fallback}>Blocco non renderizzabile</div>;
    }

    return this.props.children;
  }
}

export default BlockErrorBoundary;
