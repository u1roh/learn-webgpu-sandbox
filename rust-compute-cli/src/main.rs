#[tokio::main]
async fn main() {
    // The instance is a handle to our GPU
    // Backends::all => Vulkan + Metal + DX12 + Browser WebGPU
    let instance = wgpu::Instance::new(wgpu::Backends::all());

    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions::default())
        .await
        .unwrap();

    let (device, queue) = adapter
        .request_device(
            &wgpu::DeviceDescriptor {
                // features: wgpu::Features::empty(),
                features: wgpu::Features::all_webgpu_mask(),
                limits: wgpu::Limits::default(),
                label: None,
            },
            None,
        )
        .await
        .unwrap();

    // create rendering pipeline
    let compute_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("shake"),
        source: wgpu::ShaderSource::Wgsl(include_str!("compute.wgsl").into()),
    });

    let compute_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("ikura"),
        layout: None,
        module: &compute_shader,
        entry_point: "main",
    });

    let compute_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("maguro"),
        size: BUFFER_SIZE,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });

    let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("saba"),
        size: BUFFER_SIZE,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("piyo"),
        layout: &compute_pipeline.get_bind_group_layout(0),
        entries: &[wgpu::BindGroupEntry {
            binding: 1,
            resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                buffer: &compute_buffer,
                offset: 0,
                size: None,
            }),
        }],
    });

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());

    {
        let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor::default());
        compute_pass.set_pipeline(&compute_pipeline);
        compute_pass.set_bind_group(0, &bind_group, &[]);
        compute_pass.dispatch_workgroups(BUFFER_SIZE as u32 / 64, 1, 1);
    }

    encoder.copy_buffer_to_buffer(&compute_buffer, 0, &staging_buffer, 0, BUFFER_SIZE);

    queue.submit(std::iter::once(encoder.finish()));

    {
        let buffer_slice = staging_buffer.slice(..);
        buffer_slice.map_async(wgpu::MapMode::Read, |_| {});
        device.poll(wgpu::Maintain::Wait);

        let data = buffer_slice.get_mapped_range();
        println!("data.len() = {}", data.len());
        for i in 0..10 {
            println!("data[{}] = {}", i, data[i]);
        }
        println!();
    }
    staging_buffer.unmap();
}

const BUFFER_SIZE: u64 = 640;
