import React from 'react';
import * as GpuUtil from './GpuUtil';

function createRotatingTriangleRenderer(device: GPUDevice, context: GPUCanvasContext) {
  const shaderCodeV = `
      const POS = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 0.5),
        vec2<f32>(-0.5, -0.5),
        vec2<f32>(0.5, -0.5),
      );

      @group(0) @binding(0) var<uniform> theta: f32;

      @vertex
      fn main(@builtin(vertex_index) i : u32) -> @builtin(position) vec4<f32> {
        let x = cos(theta) * POS[i].x - sin(theta) * POS[i].y;
        let y = sin(theta) * POS[i].x + cos(theta) * POS[i].y;
        return vec4<f32>(x, y, 0.0, 1.0);
      }
    `;
  const shaderCodeF = `
      @fragment
      fn main() -> @location(0) vec4<f32> {
        return vec4<f32>(1.0, 0.5, 0.0, 1.0);
      }
    `
  const pipeline = GpuUtil.buildRenderPipeline(
    device, context.getCurrentTexture().format, shaderCodeV, shaderCodeF, "triangle-list");

  const uniformBuf = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const delta = 5.0 * Math.PI / 180.0;
  const theta = new Float32Array([0.0]);
  theta[0] = 1.0;

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuf } }]
  });

  function render() {
    theta[0] += delta;
    device.queue.writeBuffer(uniformBuf, 0, theta.buffer);
    GpuUtil.submitRenderPass(
      context,
      device, 
      { r: 0.2, g: 0.2, b: 0.2, a: 1.0 },
      (pass) => {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3, 1, 0, 0);
      }
    );
  }

  return render
}


function useRotatingTriangleRenderer(device: GPUDevice | undefined, context: GPUCanvasContext | undefined) {
  const [renderer, setRenderer] = React.useState<(scale:number, x:number, y:number) => void>();
  React.useEffect(() => {
    if(context && device) {
      setRenderer(() => createRotatingTriangleRenderer(device, context));
    }
  }, [device, context]);
  return renderer;
}

export function GpuTriangleCanvas() {
  const device = GpuUtil.useGPUDevice();
  const [context, canvasRef] = GpuUtil.useGPUCanvasContext(device);
  const render = useRotatingTriangleRenderer(device, context);

  React.useEffect(() => {
    if (render) {
      const id = setInterval(render, 20);
      return () => clearInterval(id);
    }
  }, [render]);

  return <canvas ref={canvasRef} width={600} height={600}/>;
}
