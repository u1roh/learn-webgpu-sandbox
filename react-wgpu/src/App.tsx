import React from 'react';
import logo from './logo.svg';
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
  pass?.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass?.dispatchWorkgroups(Math.ceil(BUFFER_SIZE / 64));
  pass?.end();
  encoder.copyBufferToBuffer(outputBuf, 0, stagingBuf, 0, BUFFER_SIZE);
  device?.queue.submit([encoder.finish()]);

  await stagingBuf.mapAsync(GPUMapMode.READ, 0, BUFFER_SIZE);
  const copied = new Float32Array(stagingBuf.getMappedRange(0, BUFFER_SIZE).slice(0));
  console.log(copied);
  console.log("end computation");
}

async function createRenderer(canvas: HTMLCanvasElement) {

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!adapter || !device) return;

  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: "opaque"
  });

  const shaderV = device.createShaderModule({
    code: `
      @group(0) @binding(1)
      var<uniform> counter: f32;

      @vertex
      fn main(@builtin(vertex_index) i : u32) -> @builtin(position) vec4<f32> {
        let pos = array<vec2<f32>, 3>(
          vec2<f32>(0.0, 0.5),
          vec2<f32>(-0.5, -0.5),
          vec2<f32>(0.5, -0.5),
        );
        return vec4<f32>(pos[i], 0.0, 1.0);
        // let theta = counter * 3.14 / 18.0;
        // let x = cos(theta) * pos[i].x - sin(theta) * pos[i].y;
        // let y = sin(theta) * pos[i].x + cos(theta) * pos[i].y;
        // return vec4<f32>(x, y, 0.0, 1.0);
      }
    `
  });
  const shaderF = device.createShaderModule({
    code: `
      @fragment
      fn main() -> @location(0) vec4<f32> {
        return vec4<f32>(1.0, 0.0, 0.0, 1.0);
      }
    `
  });
  const pipeline = shaderV && device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderV,
      entryPoint: "main"
    },
    fragment:{
      module: shaderF,
      entryPoint: "main",
      targets: [{ format: presentationFormat }]
    },
    primitive: {
      topology: "triangle-list"
    }
  });

  // const uniformBuf = device.createBuffer({
  //   size: 1,
  //   usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  // });

  let counter = 0;

  // const bindGroupLayout = pipeline.getBindGroupLayout(0);
  // const bindGroup = device.createBindGroup({
  //   layout: bindGroupLayout,
  //   entries: [{ binding: 1, resource: { buffer: uniformBuf } }]
  // });

  function render() {
    if(!device) return;
    // device.queue.writeBuffer(uniformBuf, 0, new Float32Array([counter++]).buffer);

    // console.log("render");
    const view = context.getCurrentTexture().createView();

    const encoder = device.createCommandEncoder();
    const colorAttachment: GPURenderPassColorAttachment = {
      view,
      clearValue: { r: 0.2, g: 0.2, b: 0.3, a: 1.0 },
      loadOp: "clear",
      storeOp: "store"
    };
    const pass = encoder.beginRenderPass({
      colorAttachments: [colorAttachment],
    });
    pass.setPipeline(pipeline);
    // pass.setBindGroup(0, bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();

    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(render);
  }

  return render
}

function App() {
  React.useEffect(() => {
    compute();
  }, []);


  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [init, setInit] = React.useState(false);
  React.useEffect(() => {
    if(canvasRef.current && !init) {
      setInit(true);
      // createRenderer(canvasRef.current).then(renderer => setRender(renderer));
      createRenderer(canvasRef.current).then(renderer => {
        // if (renderer) setInterval(renderer, 100);
        if (renderer) requestAnimationFrame(renderer)
      });
    }
  }, [canvasRef, init]);

  return (
    <div className="App">
      <canvas ref={canvasRef} width={800} height={600}/>
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
