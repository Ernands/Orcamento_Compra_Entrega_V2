import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import { GlobalErrorBoundary } from './app/global-error-boundary';
import './styles.css';
import './pending-adjustments.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Elemento raiz da aplicacao nao encontrado.');
}

createRoot(root).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
);
