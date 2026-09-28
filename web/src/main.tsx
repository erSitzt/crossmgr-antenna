import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './store';
import './styles.css';

import { useLive } from './live/liveClient';

if (import.meta.env.DEV) Object.assign(window, { store: useStore, live: useLive });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
