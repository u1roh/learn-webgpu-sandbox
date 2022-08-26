
export type Mandelbrot = {
  texture: GPUTexture
  render: (scale: number, x: number, y: number) => void
}

export function createMandelbrotTexture(device: GPUDevice): Mandelbrot {
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

        const MAX_LOOP_COUNT: i32 = 1000;
        const DIVERGENT_DISTANCE: f32 = 3.0;

        var z = vec2<f32>(0.0, 0.0);
        var diverge_count: i32 = 0;
        for (;diverge_count < MAX_LOOP_COUNT; diverge_count++) {
          z = mandelbrot(z, c);
          if length(z) > DIVERGENT_DISTANCE { break; }
        }

        var color = vec4(0.0, 0.0, 0.0, 1.0);
        if diverge_count != MAX_LOOP_COUNT {
          switch diverge_count % 3 {
            case 0: { color.r = 1.0; }
            case 1: { color.g = 1.0; }
            case 2: { color.b = 1.0; }
            default: {}
          }
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

  const render = (scale: number, transX: number, transY: number) => {
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

  return { texture, render }
}