import * as ExcalidrawLib from '@excalidraw/excalidraw';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Expose ExcalidrawLib globally if needed
window.ExcalidrawLib = ExcalidrawLib;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
