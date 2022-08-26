
export async function helloComputePipeline(device: GPUDevice): Promise<Float32Array> {
  const shader = device.createShaderModule({
    code: `
      @group(0) @binding(1)
      var<storage, read_write> output: array<f32>;

      @compute @workgroup_size(16)
      fn main(
        @builtin(global_invocation_id) global_id: vec3<u32>,
        @builtin(local_invocation_id) local_id: vec3<u32>
      ) {
        // output[local_id.x] = f32(global_id.x) * 1000. + f32(local_id.x);
        output[global_id.x] = f32(local_id.x);
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

  const BUFFER_SIZE = 256;

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
  pass.dispatchWorkgroups(Math.ceil(BUFFER_SIZE / 16));
  pass.end();
  encoder.copyBufferToBuffer(outputBuf, 0, stagingBuf, 0, BUFFER_SIZE);
  device.queue.submit([encoder.finish()]);

  await stagingBuf.mapAsync(GPUMapMode.READ, 0, BUFFER_SIZE);
  return new Float32Array(stagingBuf.getMappedRange(0, BUFFER_SIZE).slice(0));
}