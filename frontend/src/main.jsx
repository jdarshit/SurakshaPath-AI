import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';
import 'leaflet/dist/leaflet.css';
import { AuthProvider } from './context/AuthContext';
import { IncidentsProvider } from './context/IncidentsContext';
import { NavigationSettingsProvider } from './context/NavigationSettingsContext';
import ErrorBoundary from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <IncidentsProvider>
          <NavigationSettingsProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <App />
            </BrowserRouter>
          </NavigationSettingsProvider>
        </IncidentsProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);