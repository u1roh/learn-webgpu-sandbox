import React from 'react';

export function buildRenderPipeline(
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
    fragment: {
      module: device.createShaderModule({ code: shaderCodeF }),
      entryPoint: "main",
      targets: [{ format }]
    },
    primitive: {
      topology,
    }
  });
}

export function submitRenderPass(
  ctx: GPUCanvasContext,
  device: GPUDevice,
  clearColor: GPUColor,
  renderPass: (pass: GPURenderPassEncoder) => void
) {
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

export function useGPUDevice() {
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

export function useGPUCanvasContext(device: GPUDevice | undefined): [GPUCanvasContext | undefined, React.RefObject<HTMLCanvasElement>] {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const context = React.useMemo(() => {
    if (canvasRef.current && device) {
      const context = canvasRef.current.getContext('webgpu');
      if (context) {
        context.configure({
          device,
          format: navigator.gpu.getPreferredCanvasFormat(),
          alphaMode: "opaque"
        });
        return context;
      }
    }
  }, [canvasRef, device]);
  return [context, canvasRef];
}

export function useAnimationFrame(callback: () => void) {
  const requestRef = React.useRef<ReturnType<typeof requestAnimationFrame>>();

  // callback関数に変更があった場合のみanimateを再生成する
  const animation = React.useCallback(() => {
    callback();
    requestRef.current = requestAnimationFrame(animation);
  }, [callback]);

  // callback関数に変更があった場合は一度破棄して再度呼び出す
  React.useEffect(() => {
    requestRef.current = requestAnimationFrame(animation);
    return () => {
      if (requestRef.current) {
        return cancelAnimationFrame(requestRef.current);
      }
    };
  }, [animation]);
};
