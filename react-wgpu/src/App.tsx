import React from 'react';
import './App.css';

async function compute() {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!adapter || !device) return;

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
      @group(0) @binding(0)
      var<uniform> counter: f32;

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
  const pipeline = buildRenderingPipeline(device, context.getCurrentTexture().format, shaderCodeV, shaderCodeF, "triangle-list");

  const uniformBuf = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  let counter = 0;

  const bindGroupLayout = pipeline.getBindGroupLayout(0);
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
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


function WebGPURenderCanvas(props: {
  createRenderer: (device: GPUDevice, context: GPUCanvasContext) => (() => void)
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  // const [init, setInit] = React.useState(false);

  const [device, setDevice] = React.useState<GPUDevice>();
  React.useEffect(() => {
    (async () => {
      const adapter = await navigator.gpu.requestAdapter();
      const device = await adapter?.requestDevice();
      setDevice(device);
    })();
  }, []);

  React.useEffect(() => {
    // if(canvasRef.current && !init && device) {
    //   setInit(true);
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
  React.useEffect(() => {
    compute();
  }, []);

  return (
    <div className="App">
      <WebGPURenderCanvas createRenderer={createRotatingTriangleRenderer}/>
    </div>
  );
}

export default App;
