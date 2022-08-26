import React from 'react';
import './App.css';
import { helloComputePipeline } from './helloComputePipeline';
import * as GpuUtil from './GpuUtil';
import { GpuTriangleCanvas } from './GpuTriangleCanvas';
import { GpuMandelbrotCanvas } from './GpuMandelbrotCanvas';

function App() {
  const device = GpuUtil.useGPUDevice();
  React.useEffect(() => {
    if (device) helloComputePipeline(device).then(array => console.log(array));
  }, [device]);

  return (
    <div className="App">
      <GpuMandelbrotCanvas/>
      <GpuTriangleCanvas/>
    </div>);
}

export default App;
