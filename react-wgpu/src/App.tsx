import React from 'react';
import './App.css';
import { createMandelbrotTexture } from './createMandelbrotTexture';
import { helloComputePipeline } from './helloComputePipeline';
import * as GpuUtil from './GpuUtil';
import { GpuTriangleCanvas } from './GpuTriangleCanvas';

function createRectangleRenderer(
  device: GPUDevice,
  context: GPUCanvasContext,
  fragShader: string,
  bindGroupEntries: GPUBindGroupEntry[],
) {
  const shaderCodeV = `
      const POS = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(1.0, 1.0),
      );

      const UV = array<vec2<f32>, 4>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0),
      );

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      }

      @vertex
      fn main(@builtin(vertex_index) i : u32) -> VertexOutput {
        var output: VertexOutput;
        output.position = vec4<f32>(POS[i], 0.0, 1.0); 
        output.uv = UV[i];
        return output;
      }
    `;
  const pipeline = GpuUtil.buildRenderPipeline(
    device, context.getCurrentTexture().format, shaderCodeV, fragShader, "triangle-strip");

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: bindGroupEntries
  });

  return () => {
    GpuUtil.submitRenderPass(
      context,
      device, 
      { r: 0.2, g: 0.2, b: 0.2, a: 1.0 },
      (pass) => {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(4, 1, 0, 0);
      }
    );
  };
}

function createMandelbrotRenderer(device: GPUDevice, context: GPUCanvasContext) {
  const shaderCodeF = `
      @group(0) @binding(0) var mySampler: sampler;
      @group(0) @binding(1) var myTexture: texture_2d<f32>;

      @fragment
      fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
        return textureSample(myTexture, mySampler, uv);
      }
    `
  const mandelbrot = createMandelbrotTexture(device);
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

  const render = createRectangleRenderer(device, context, shaderCodeF, [
      { binding: 0, resource: sampler },
      { binding: 1, resource: mandelbrot.texture.createView() }
  ]);

  return (scale: number, x: number, y: number) => {
    mandelbrot.render(scale, x, y);
    render()
  };
}

function useMandelbrotRenderer(device: GPUDevice | undefined, context: GPUCanvasContext | undefined) {
  const [renderer, setRenderer] = React.useState<(scale:number, x:number, y:number) => void>();
  React.useEffect(() => {
    if(context && device) {
      setRenderer(() => createMandelbrotRenderer(device, context));
    }
  }, [device, context]);
  return renderer;
}

function App() {
  const device = GpuUtil.useGPUDevice();
  React.useEffect(() => {
    if (device) helloComputePipeline(device).then(array => console.log(array));
  }, [device]);

  const [context, canvasRef] = GpuUtil.useGPUCanvasContext(device);
  const renderMandelbrot = useMandelbrotRenderer(device, context);

  type Pos = { x: number, y: number }

  const [scale, setScale] = React.useState(3.0);
  const [xy, setXy] = React.useState<Pos>({ x: 0.0, y: 0.0 });
  React.useEffect(() => {
    if (renderMandelbrot) {
      const id = setInterval(() => renderMandelbrot(scale, xy.x, xy.y), 20);
      return () => clearInterval(id);
    }
  }, [scale, xy, renderMandelbrot])

  const [mouseDown, setMouseDown] = React.useState<[Pos, Pos]>();

  return (
    <div>
      <canvas ref={canvasRef} width={600} height={600}
        onWheel={e => {
          if (e.deltaY > 0) {
            setScale(scale * 1.1);
          } else {
            setScale(scale / 1.1);
          }
          console.log({ scale });
        }}
        onMouseDown={e => setMouseDown([{ x: e.clientX, y: e.clientY}, xy])}
        onMouseUp={e => setMouseDown(undefined)}
        onMouseMove={e => {
          if (mouseDown) {
            const dx = (e.clientX - mouseDown[0].x) * 2 * scale / 600;
            const dy = (e.clientY - mouseDown[0].y) * 2 * scale / 600;
            const xy0 = mouseDown[1];
            setXy({ x: xy0.x - dx, y: xy0.y + dy })
          }
        }}
      />
      <GpuTriangleCanvas/>
    </div>);
}

export default App;
