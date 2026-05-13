import * as ExcalidrawLib from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { prepareDesktopApi } from './desktopApi.js'

// Expose ExcalidrawLib globally if needed
window.ExcalidrawLib = ExcalidrawLib;

const root = ReactDOM.createRoot(document.getElementById('root'))

function mountApp() {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

console.log('[excalidraw-x] index: preparing desktop API before mount...')
void prepareDesktopApi()
  .then(() => console.log('[excalidraw-x] index: prepareDesktopApi SUCCESS, mounting app'))
  .catch((err) => {
    console.error('[excalidraw-x] index: prepareDesktopApi FAILED:', err)
  })
  .finally(() => {
    mountApp()
  })
