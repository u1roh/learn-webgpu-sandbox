import React from 'react';
import { text } from 'stream/consumers';
import './App.css';
import { helloComputePipeline } from './helloComputePipeline';

function createMandelbrotTextureRenerer(device: GPUDevice): [GPUTexture, (scale:number, x:number, y:number) => void] {
  const mandelbrotShader = device.createShaderModule({
    code: `
      @group(0) @binding(1) var output: texture_storage_2d<rgba8unorm, write>;
      @group(0) @binding(2) var<uniform> scale: f32;
      @group(0) @binding(3) var<uniform> trans: vec2<f32>;

      fn mandelbrot(z: vec2<f32>, c: vec2<f32>) -> vec2<f32> {
        return vec2<f32>(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
      }

      @compute @workgroup_size(16, 16)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let dims = textureDimensions(output);
        if i32(global_id.x) >= dims.x || i32(global_id.y) >= dims.y {
          return;
        }

        let xy = vec2<f32>(global_id.xy) / vec2<f32>(dims);

        let c = scale * (xy - vec2<f32>(0.5, 0.5)) + trans;

        const MAX_LOOP_COUNT: i32 = 100;

        var z = vec2<f32>(0.0, 0.0);
        var count: i32 = 0;
        for (;count < MAX_LOOP_COUNT; count++) {
          z = mandelbrot(z, c);
          // if length(z) > scale { break; }
          if length(z) > 3.0 { break; }
        }

        var color = vec4(0.0, 0.0, 0.0, 1.0);
        if count == MAX_LOOP_COUNT {
        } else if count % 3 == 0 {
          color.r = 1.0;
        } else if count % 3 == 1 {
          color.g = 1.0;
        } else {
          color.b = 1.0;
        }

        textureStore(
          output,
          vec2<i32>(global_id.xy),
          color
        );
      }
    `
  });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: mandelbrotShader,
      entryPoint: "main"
    }
  });

  const scaleUniformBuf = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const transUniformBuf = device.createBuffer({
    size: 4 * 2,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const IMAGE_SIZE = 512;

  const texture = device.createTexture({
    format: "rgba8unorm",
    size: [IMAGE_SIZE, IMAGE_SIZE],
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: { buffer: scaleUniformBuf } },
      { binding: 3, resource: { buffer: transUniformBuf } },
    ]
  });

  const renderer = (scale: number, transX: number, transY: number) => {
    device.queue.writeBuffer(scaleUniformBuf, 0, new Float32Array([scale]).buffer);
    device.queue.writeBuffer(transUniformBuf, 0, new Float32Array([transX, transY]).buffer);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(IMAGE_SIZE / 16), Math.ceil(IMAGE_SIZE / 16));
    pass.end();
    device.queue.submit([encoder.finish()]);
  };

  return [texture, renderer]
}

function buildRenderingPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  shaderCodeV: string,
  shaderCodeF: string,
  topology: GPUPrimitiveTopology
) {
  return device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({ code: shaderCodeV }),
      entryPoint: "main"
    },
    fragment:{
      module: device.createShaderModule({ code: shaderCodeF }),
      entryPoint: "main",
      targets: [{ format }]
    },
    primitive: {
      topology,
    }
  });
}

function submitRenderPass(ctx: GPUCanvasContext, device: GPUDevice, clearColor: GPUColor, renderPass: (pass: GPURenderPassEncoder) => void) {
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: ctx.getCurrentTexture().createView(),
      clearValue: clearColor,
      loadOp: "clear",
      storeOp: "store"
    } as GPURenderPassColorAttachment]
  });
  renderPass(pass);
  pass.end();
  device.queue.submit([encoder.finish()]);
}

function createRotatingTriangleRenderer(device: GPUDevice, context: GPUCanvasContext) {
  const shaderCodeV = `
      @group(0) @binding(0) var<uniform> counter: f32;

      @vertex
      fn main(@builtin(vertex_index) i : u32) -> @builtin(position) vec4<f32> {
        let pos = array<vec2<f32>, 3>(
          vec2<f32>(0.0, 0.5),
          vec2<f32>(-0.5, -0.5),
          vec2<f32>(0.5, -0.5),
        );
        // return vec4<f32>(pos[i], 0.0, 1.0);
        let theta = counter * 3.14 / 72.0;
        let x = cos(theta) * pos[i].x - sin(theta) * pos[i].y;
        let y = sin(theta) * pos[i].x + cos(theta) * pos[i].y;
        return vec4<f32>(x, y, 0.0, 1.0);
      }
    `;
  const shaderCodeF = `
      @fragment
      fn main() -> @location(0) vec4<f32> {
        return vec4<f32>(1.0, 0.5, 0.0, 1.0);
      }
    `
  const pipeline = buildRenderingPipeline(
    device, context.getCurrentTexture().format, shaderCodeV, shaderCodeF, "triangle-list");

  const uniformBuf = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  let counter = 0;

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuf } }]
  });

  function render() {
    device.queue.writeBuffer(uniformBuf, 0, new Float32Array([counter++]).buffer);
    submitRenderPass(
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

function createRectangleRenderer(device: GPUDevice, context: GPUCanvasContext) {
  const shaderCodeV = `
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      }

      @vertex
      fn main(@builtin(vertex_index) i : u32) -> VertexOutput {
        let pos = array<vec2<f32>, 4>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(1.0, -1.0),
          vec2<f32>(-1.0, 1.0),
          vec2<f32>(1.0, 1.0),
        );
        let uv = array<vec2<f32>, 4>(
          vec2<f32>(0.0, 0.0),
          vec2<f32>(1.0, 0.0),
          vec2<f32>(0.0, 1.0),
          vec2<f32>(1.0, 1.0),
        );
        var output: VertexOutput;
        output.position = vec4<f32>(pos[i], 0.0, 1.0); 
        output.uv = uv[i];
        return output;
      }
    `;
  const shaderCodeF = `
      @group(0) @binding(0) var mySampler: sampler;
      @group(0) @binding(1) var myTexture: texture_2d<f32>;

      @fragment
      fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
        // return vec4<f32>(uv.x, uv.y, 0.0, 1.0);
        return textureSample(myTexture, mySampler, uv);
      }
    `
  const pipeline = buildRenderingPipeline(
    device, context.getCurrentTexture().format, shaderCodeV, shaderCodeF, "triangle-strip");

  const [texture, renderMandelbrot] = createMandelbrotTextureRenerer(device);
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: texture.createView() }
    ]
  });

  return (scale: number, x: number, y: number) => {
    renderMandelbrot(scale, x, y);
    submitRenderPass(
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

function useGPUDevice() {
  const [device, setDevice] = React.useState<GPUDevice>();
  React.useEffect(() => {
    (async () => {
      const adapter = await navigator.gpu.requestAdapter();
      const device = await adapter?.requestDevice();
      setDevice(device);
    })();
  }, []);
  return device;
}

function WebGPURenderCanvas(props: {
  createRenderer: (device: GPUDevice, context: GPUCanvasContext) => (() => void)
  onWheel?: React.WheelEventHandler<HTMLCanvasElement>
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const device = useGPUDevice();

  React.useEffect(() => {
    if(canvasRef.current && device) {
      const context = canvasRef.current.getContext('webgpu') as GPUCanvasContext;
      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format: presentationFormat,
        alphaMode: "opaque"
      });

      const renderer = props.createRenderer(device, context);
      const id = setInterval(renderer, 20);
      return () => clearInterval(id);
      // requestAnimationFrame() を使うと何故か uniform buffer を使ったときに描画できなくなった
      // requestAnimationFrame(renderer)
    }
  }, [canvasRef, props, device]);

  return <canvas ref={canvasRef} width={600} height={600} onWheel={props.onWheel}/>
}

function App() {
  const device = useGPUDevice();
  React.useEffect(() => {
    if (device) helloComputePipeline(device).then(array => console.log(array));
  }, [device]);

  // React.useEffect(() => {
  //   if (device) genTexture(device);
  // }, [device]);

  // ---------------

  // const [scale, setScale] = React.useState(3.0);

  // const createMandelbrotRenderer = React.useCallback((device: GPUDevice, context: GPUCanvasContext) => {
  //   const render = createRectangleRenderer(device, context);
  //   return () => render(scale);
  // }, [scale])

  // return (
  //   <div className="App">
  //     {/* <WebGPURenderCanvas createRenderer={createRotatingTriangleRenderer}/> */}
  //     <WebGPURenderCanvas createRenderer={createMandelbrotRenderer}
  //       onWheel={e => {
  //         if (e.deltaY > 0) {
  //           setScale(scale * 1.1);
  //         } else {
  //           setScale(scale / 1.1);
  //         }
  //       }}/>
  //   </div>
  // );

  // ---------------

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  // const device = useGPUDevice();
  const context = React.useMemo(() => {
    if(canvasRef.current && device) {
      // const context = canvasRef.current.getContext('webgpu') as GPUCanvasContext;
      const context = canvasRef.current.getContext('webgpu');
      context?.configure({
        device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: "opaque"
      });
      return context;
    }
  }, [canvasRef, device]);

  const [renderer, setRenderer] = React.useState<(scale:number, x:number, y:number) => void>();
  React.useEffect(() => {
    if(context && device) {
      setRenderer(() => createRectangleRenderer(device, context));
    }
  }, [device, context]);
 
  type Pos = { x: number, y: number }

  const [scale, setScale] = React.useState(3.0);
  const [xy, setXy] = React.useState<Pos>({ x: 0.0, y: 0.0 });
  React.useEffect(() => {
    if (renderer) {
      const id = setInterval(() => renderer(scale, xy.x, xy.y), 20);
      return () => clearInterval(id);
    }
  }, [scale, xy, renderer])

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
      {/* <WebGPURenderCanvas createRenderer={createRotatingTriangleRenderer}/> */}
    </div>);
}

export default App;
