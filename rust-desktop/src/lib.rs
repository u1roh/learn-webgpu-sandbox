use winit::{
    event::*,
    event_loop::{ControlFlow, EventLoop},
    window::{Window, WindowBuilder},
};

#[cfg_attr(target_arc = "wasm32", wasm_bindgen)]
pub fn hello() {
    log::info!("hello")
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen(start))]
pub async fn run() {
    cfg_if::cfg_if! {
        if #[cfg(target_arch = "wasm32")] {
            std::panic::set_hook(Box::new(console_error_panic_hook::hook));
            console_log::init_with_level(log::Level::Warn).expect("Couldn't initialize logger");
        } else {
            env_logger::init();
        }
    }
    let event_loop = EventLoop::new();
    let window = WindowBuilder::new().build(&event_loop).unwrap();

    let mut state = State::new(&window).await;

    event_loop.run(move |event, _, control_flow| match event {
        Event::WindowEvent { window_id, event } if window_id == window.id() => {
            if !state.input(&event) {
                match event {
                    WindowEvent::CloseRequested => *control_flow = ControlFlow::Exit,
                    WindowEvent::Resized(physical_size) => state.resize(physical_size),
                    WindowEvent::ScaleFactorChanged { new_inner_size, .. } => {
                        state.resize(*new_inner_size)
                    }
                    _ => {}
                }
            }
        }
        Event::RedrawRequested(window_id) if window_id == window.id() => {
            state.update();
            match state.render() {
                Ok(_) => {}
                Err(wgpu::SurfaceError::Lost) => state.resize(state.size),
                Err(wgpu::SurfaceError::OutOfMemory) => *control_flow = ControlFlow::Exit,
                Err(e) => eprintln!("{:?}", e),
            }
        }
        Event::MainEventsCleared => {
            window.request_redraw();
        }
        _ => {}
    });
}

struct State {
    surface: wgpu::Surface,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    size: winit::dpi::PhysicalSize<u32>,
    color: wgpu::Color,

    render_pipeline: wgpu::RenderPipeline,

    vertex_buffer: wgpu::Buffer,
    vertex_count: u32,

    compute_pipeline: wgpu::ComputePipeline,
    bind_group: wgpu::BindGroup,

    compute_buffer: wgpu::Buffer,
    staging_buffer: wgpu::Buffer,
}

impl State {
    async fn new(window: &Window) -> Self {
        let size = window.inner_size();

        // The instance is a handle to our GPU
        // Backends::all => Vulkan + Metal + DX12 + Browser WebGPU
        let instance = wgpu::Instance::new(wgpu::Backends::all());
        let surface = unsafe { instance.create_surface(window) };
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::default(),
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .unwrap();
        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    features: wgpu::Features::empty(),
                    limits: if cfg!(target_arch = "wasm32") {
                        wgpu::Limits::downlevel_webgl2_defaults()
                    } else {
                        wgpu::Limits::default()
                    },
                    label: None,
                },
                None,
            )
            .await
            .unwrap();
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface.get_supported_formats(&adapter)[0],
            width: size.width,
            height: size.height,
            present_mode: wgpu::PresentMode::Fifo,
        };

        // create rendering pipeline
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
        });
        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Render Pipeline"),
            layout: None,
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: "vs_main",
                buffers: &[Vertex::desc()], // vertex buffer の設定
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: Some(wgpu::Face::Back),
                polygon_mode: wgpu::PolygonMode::Fill,
                unclipped_depth: false,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState {
                count: 1,
                mask: !0,
                alpha_to_coverage_enabled: false,
            },
            multiview: None,
        });

        // create vertex buffer
        use wgpu::util::DeviceExt;
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Vertex Buffer"),
            contents: bytemuck::cast_slice(VERTICES),
            usage: wgpu::BufferUsages::VERTEX,
        });

        // create rendering pipeline
        let compute_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("compute.wgsl").into()),
        });
        // let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        //     /// Debug label of the bind group layout. This will show up in graphics debuggers for easy identification.
        //     label: Some("bind group layout"),

        //     /// Array of entries in this BindGroupLayout
        //     entries: &[wgpu::BindGroupLayoutEntry {
        //         /// Binding index. Must match shader index and be unique inside a BindGroupLayout. A binding
        //         /// of index 1, would be described as `layout(set = 0, binding = 1) uniform` in shaders.
        //         binding: 1,
        //         /// Which shader stages can see this binding.
        //         visibility: wgpu::ShaderStages::COMPUTE,
        //         /// The type of the binding
        //         ty: wgpu::BindingType::Buffer {
        //             ty: wgpu::BufferBindingType::Storage { read_only: false },
        //             has_dynamic_offset: false,
        //             min_binding_size: Some(std::num::NonZeroU64::new(100).unwrap()),
        //             // min_binding_size: None,
        //         },
        //         count: None,
        //     }],
        // });
        // let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        //     /// Debug label of the pipeline layout. This will show up in graphics debuggers for easy identification.
        //     label: Some("pipeline layout"),
        //     /// Bind groups that this pipeline uses. The first entry will provide all the bindings for
        //     /// "set = 0", second entry will provide all the bindings for "set = 1" etc.
        //     bind_group_layouts: &[&bind_group_layout],
        //     /// Set of push constant ranges this pipeline uses. Each shader stage that uses push constants
        //     /// must define the range in push constant memory that corresponds to its single `layout(push_constant)`
        //     /// uniform block.
        //     ///
        //     /// If this array is non-empty, the [`Features::PUSH_CONSTANTS`] must be enabled.
        //     push_constant_ranges: &[], // &'a [PushConstantRange],
        // });
        let compute_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            /// Debug label of the pipeline. This will show up in graphics debuggers for easy identification.
            label: Some("hoge"),
            /// The layout of bind groups for this pipeline.
            layout: None, // Option<&'a PipelineLayout>,
            // layout: Some(&pipeline_layout), // Option<&'a PipelineLayout>,
            /// The compiled shader module for this stage.
            module: &compute_shader, // &'a ShaderModule,
            /// The name of the entry point in the compiled shader. There must be a function that returns
            /// void with this name in the shader.
            entry_point: "main", // &'a str,
        });

        let compute_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            /// Debug label of a buffer. This will show up in graphics debuggers for easy identification.
            label: Some("maguro"),
            /// Size of a buffer.
            size: BUFFER_SIZE,
            /// Usages of a buffer. If the buffer is used in any way that isn't specified here, the operation
            /// will panic.
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            /// Allows a buffer to be mapped immediately after they are made. It does not have to be [`BufferUsages::MAP_READ`] or
            /// [`BufferUsages::MAP_WRITE`], all buffers are allowed to be mapped at creation.
            mapped_at_creation: true,
        });
        {
            let mut buf = compute_buffer.slice(..).get_mapped_range_mut();
            buf[0] = 0xff;
            buf[1] = 0xfe;
            buf[2] = 0xfd;
        }
        compute_buffer.unmap();

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            /// Debug label of the bind group. This will show up in graphics debuggers for easy identification.
            label: Some("piyo"),
            /// The [`BindGroupLayout`] that corresponds to this bind group.
            // layout: &bind_group_layout, // &'a BindGroupLayout,
            layout: &compute_pipeline.get_bind_group_layout(0), // &'a BindGroupLayout,
            /// The resources to bind to this bind group.
            // entries: &'a [BindGroupEntry<'a>],
            entries: &[wgpu::BindGroupEntry {
                /// Slot for which binding provides resource. Corresponds to an entry of the same
                /// binding index in the [`BindGroupLayoutDescriptor`].
                binding: 1,
                /// Resource to attach to the binding
                resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                    /// The buffer to bind.
                    buffer: &compute_buffer,
                    /// Base offset of the buffer. For bindings with `dynamic == true`, this offset
                    /// will be added to the dynamic offset provided in [`RenderPass::set_bind_group`].
                    ///
                    /// The offset has to be aligned to [`Limits::min_uniform_buffer_offset_alignment`]
                    /// or [`Limits::min_storage_buffer_offset_alignment`] appropriately.
                    offset: 0,
                    /// Size of the binding, or `None` for using the rest of the buffer.
                    // size: Some(std::num::NonZeroU64::new(200).unwrap()),
                    size: None
                })
            }]
        });

        let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            /// Debug label of a buffer. This will show up in graphics debuggers for easy identification.
            label: Some("saba"),
            /// Size of a buffer.
            size: BUFFER_SIZE,
            /// Usages of a buffer. If the buffer is used in any way that isn't specified here, the operation
            /// will panic.
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            /// Allows a buffer to be mapped immediately after they are made. It does not have to be [`BufferUsages::MAP_READ`] or
            /// [`BufferUsages::MAP_WRITE`], all buffers are allowed to be mapped at creation.
            mapped_at_creation: true,
        });
        {
            let mut buf = staging_buffer.slice(..).get_mapped_range_mut();
            buf[0] = 0xff;
            buf[1] = 0xfe;
            buf[2] = 0xfd;
        }
        staging_buffer.unmap();

        Self {
            surface,
            device,
            queue,
            config,
            size,
            color: wgpu::Color {
                r: 0.1,
                g: 0.2,
                b: 0.3,
                a: 1.0,
            },

            render_pipeline,

            // vertex buffer
            vertex_buffer,
            vertex_count: VERTICES.len() as u32,

            compute_pipeline,
            bind_group,

            compute_buffer,
            staging_buffer,
        }
    }

    fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
        if new_size.width > 0 && new_size.height > 0 {
            self.size = new_size;
            self.config.width = new_size.width;
            self.config.height = new_size.height;
            self.surface.configure(&self.device, &self.config);
        }
    }

    fn input(&mut self, event: &WindowEvent) -> bool {
        match event {
            WindowEvent::CursorMoved { position, .. } => {
                let x = position.x / self.size.width as f64;
                let y = position.y / self.size.height as f64;
                self.color.r = x;
                self.color.g = y;
                true
            }
            _ => false,
        }
    }

    fn update(&mut self) {}

    fn render(&mut self) -> Result<(), wgpu::SurfaceError> {
        let output = self.surface.get_current_texture()?;
        let view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Render Encoder"),
            });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(self.color),
                        store: true,
                    },
                })],
                depth_stencil_attachment: None,
            });

            render_pass.set_pipeline(&self.render_pipeline);
            render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            render_pass.draw(0..self.vertex_count, 0..1);
        }

        // {
        //     let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
        //         label: Some("Compute Pass"),
        //     });
        //     compute_pass.set_pipeline(&self.compute_pipeline);
        //     compute_pass.set_bind_group(0, &self.bind_group, &[]);
        //     // compute_pass.dispatch_workgroups(1, 1, 1);
        //     compute_pass.dispatch_workgroups(BUFFER_SIZE as u32 / 64, 1, 1);
        // }

        // encoder.copy_buffer_to_buffer(
        //     &self.compute_buffer,
        //     0,
        //     &self.staging_buffer,
        //     0,
        //     BUFFER_SIZE,
        // );

        self.queue.submit(std::iter::once(encoder.finish()));

        // {
        //     let buffer_slice = self.staging_buffer.slice(..);
        //     let (tx, rx) = futures_intrusive::channel::shared::oneshot_channel();
        //     buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
        //         tx.send(result).unwrap();
        //     });
        //     self.device.poll(wgpu::Maintain::Wait);
        //     pollster::block_on(rx.receive()).unwrap().unwrap();

        //     let data = buffer_slice.get_mapped_range();
        //     println!("data.len() = {}", data.len());
        //     for i in 0..10 {
        //         println!("data[{}] = {}", i, data[i]);
        //     }
        //     println!();
        // }
        // self.staging_buffer.unmap();

        output.present();
        Ok(())
    }
}

#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
struct Vertex {
    position: [f32; 3],
    color: [f32; 3],
}
impl Vertex {
    const ATTRIBUTES: [wgpu::VertexAttribute; 2] =
        wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3];

    fn desc<'a>() -> wgpu::VertexBufferLayout<'a> {
        wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<Self>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            // attributes: &[
            //     wgpu::VertexAttribute {
            //         offset: 0,
            //         shader_location: 0,
            //         format: wgpu::VertexFormat::Float32x3,
            //     },
            //     wgpu::VertexAttribute {
            //         offset: std::mem::size_of::<[f32; 3]>() as wgpu::BufferAddress,
            //         shader_location: 1,
            //         format: wgpu::VertexFormat::Float32x3,
            //     },
            // ],
            attributes: &Self::ATTRIBUTES,
        }
    }
}

const VERTICES: &[Vertex] = &[
    Vertex {
        position: [0.0, 0.5, 0.0],
        color: [1.0, 0.0, 0.0],
    },
    Vertex {
        position: [-0.5, -0.5, 0.0],
        color: [0.0, 1.0, 0.0],
    },
    Vertex {
        position: [0.5, -0.5, 0.0],
        color: [0.0, 0.0, 1.0],
    },
];

const BUFFER_SIZE: u64 = 640;
