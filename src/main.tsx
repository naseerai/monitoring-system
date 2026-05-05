import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { NodesProvider } from './context/NodesContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <NodesProvider>
        <App />
      </NodesProvider>
    </AuthProvider>
  </StrictMode>,
);
