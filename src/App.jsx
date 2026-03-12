import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import React from 'react'


const App = () => {
  const [_, setExcalidrawRef] = React.useState(null)
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Excalidraw />
    </div>
  );
};

export default App;
