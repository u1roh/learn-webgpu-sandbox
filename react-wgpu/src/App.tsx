import React from 'react';
import { text } from 'stream/consumers';
import './App.css';

async function compute(device: GPUDevice) {
  const shader = device.createShaderModule({
    code: `
      @group(0) @binding(1)
      var<storage, read_write> output: array<f32>;

      @compute @workgroup_size(64)
      fn main(
        @builtin(global_invocation_id) global_id: vec3<u32>,
        @builtin(local_invocation_id) local_id: vec3<u32>
      ) {
        output[local_id.x] = f32(global_id.x) * 1000. + f32(local_id.x);
      }
    `
  });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: shader,
      entryPoint: "main"
    }
  });

  const BUFFER_SIZE = 1000;

  const outputBuf = device.createBuffer({
    size: BUFFER_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });
  const stagingBuf = device.createBuffer({
    size: BUFFER_SIZE,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  })

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 1, resource: { buffer: outputBuf } }]
  });

  console.log("start computation");

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(BUFFER_SIZE / 64));
  pass.end();
  encoder.copyBufferToBuffer(outputBuf, 0, stagingBuf, 0, BUFFER_SIZE);
  device?.queue.submit([encoder.finish()]);

  await stagingBuf.mapAsync(GPUMapMode.READ, 0, BUFFER_SIZE);
  const copied = new Float32Array(stagingBuf.getMappedRange(0, BUFFER_SIZE).slice(0));
  console.log(copied);
  console.log("end computation");
}

function genTexture(device: GPUDevice) {
  const shader = device.createShaderModule({
    code: `
      @group(0) @binding(1) var output: texture_storage_2d<rgba8unorm, write>;

      @compute @workgroup_size(16, 16)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let dims = textureDimensions(output);
        textureStore(
          output,
          vec2<i32>(global_id.xy),
          vec4<f32>(vec2<f32>(global_id.xy) / vec2<f32>(dims), 0.0, 1.0)
        );
      }
    `
  });
  const mandelbrotShader = device.createShaderModule({
    code: `
      @group(0) @binding(1) var output: texture_storage_2d<rgba8unorm, write>;

      fn mandelbrot(z: vec2<f32>, c: vec2<f32>) -> vec2<f32> {
        return vec2<f32>(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
      }

      @compute @workgroup_size(16, 16)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let dims = textureDimensions(output);
        let xy = vec2<f32>(global_id.xy) / vec2<f32>(dims);

        let scale = 2.0;
        let c = scale * (xy - vec2<f32>(0.5, 0.5));

        const MAX_LOOP_COUNT: i32 = 100;

        var z = vec2<f32>(0.0, 0.0);
        var count: i32 = 0;
        for (;count < MAX_LOOP_COUNT; count++) {
          z = mandelbrot(z, c);
          if length(z) > scale { break; }
        }

        var color = vec4(0.0, 0.0, 0.0, 1.0);
        if count == MAX_LOOP_COUNT {
          color.r = 1.0;
        } else {
          color.g = f32(count) / f32(MAX_LOOP_COUNT);
          color.b = f32(count) / f32(MAX_LOOP_COUNT);
        }

        textureStore(
          output,
          vec2<i32>(global_id.xy),
          // vec4<f32>(c, 0.0, 1.0)
          color
        );
      }
    `
  });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      // module: shader,
      module: mandelbrotShader,
      entryPoint: "main"
    }
  });

  const IMAGE_SIZE = 512;

  const texture = device.createTexture({
    format: "rgba8unorm",
    // format: "rgba32float",
    size: [IMAGE_SIZE, IMAGE_SIZE],
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 1, resource: texture.createView() }]
  });

  console.log("start computation");

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(IMAGE_SIZE / 16), Math.ceil(IMAGE_SIZE / 16));
  pass.end();
  device.queue.submit([encoder.finish()]);

  console.log("end computation");
  return texture;
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

  const texture = genTexture(device);
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: texture.createView() }
    ]
  });

  return () => {
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
      setInterval(renderer, 20);
      // requestAnimationFrame() を使うと何故か uniform buffer を使ったときに描画できなくなった
      // requestAnimationFrame(renderer)
    }
  }, [canvasRef, props, device]);

  return <canvas ref={canvasRef} width={600} height={600}/>
}

function App() {
  const device = useGPUDevice();
  // React.useEffect(() => {
  //   if (device) compute(device);
  // }, [device]);

  // React.useEffect(() => {
  //   if (device) genTexture(device);
  // }, [device]);

  return (
    <div className="App">
      {/* <WebGPURenderCanvas createRenderer={createRotatingTriangleRenderer}/> */}
      <WebGPURenderCanvas createRenderer={createRectangleRenderer}/>
    </div>
  );
}

export default App;
