import * as GpuUtil from './GpuUtil';

export function createScreenRectRenderer(
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
        pass.draw(4);
      }
    );
  };
}
