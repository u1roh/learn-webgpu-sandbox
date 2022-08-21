import React from 'react';
import * as GpuUtil from './GpuUtil';
import { createMandelbrotTexture } from './createMandelbrotTexture';
import { createScreenRectRenderer } from './createScreenRectRenderer';

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

  const render = createScreenRectRenderer(device, context, shaderCodeF, [
      { binding: 0, resource: sampler },
      { binding: 1, resource: mandelbrot.texture.createView() }
  ]);

  return (scale: number, x: number, y: number) => {
    mandelbrot.render(scale, x, y);
    render()
  };
}

function useMandelbrotRenderer(device: GPUDevice | undefined, context: GPUCanvasContext | undefined) {
  const [renderer, setRenderer] = React.useState<{ f: (scale:number, x:number, y:number) => void }>({ f: () => {} });
  React.useEffect(() => {
    if(context && device) {
      setRenderer({ f: createMandelbrotRenderer(device, context) });
    } else {
      setRenderer({ f: () => {} });
    }
  }, [device, context]);
  return renderer.f;
}

export function GpuMandelbrotCanvas() {
  const device = GpuUtil.useGPUDevice();

  const [context, canvasRef] = GpuUtil.useGPUCanvasContext(device);
  const renderMandelbrot = useMandelbrotRenderer(device, context);

  type Pos = { x: number, y: number }

  const [scale, setScale] = React.useState(3.0);
  const [xy, setXy] = React.useState<Pos>({ x: 0.0, y: 0.0 });

  const callback = React.useCallback(() => {
    renderMandelbrot(scale, xy.x, xy.y);
  }, [scale, xy, renderMandelbrot]);

  GpuUtil.useAnimationFrame(callback);

  const [mouseDown, setMouseDown] = React.useState<[Pos, Pos]>();

  return (
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
      />);
}
