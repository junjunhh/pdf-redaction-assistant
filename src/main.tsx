import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { getInitialTheme } from './lib/useTheme';
import './tailwind.css';
import './styles.css';
import './theme.css';

// Apply the persisted/system theme before first paint so the landing page
// (rendered before the workspace mounts) matches the user's preference.
document.documentElement.dataset.theme = getInitialTheme();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
