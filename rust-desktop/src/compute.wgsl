@group(0) @binding(1)
var<storage, read_write> output: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>, @builtin(local_invocation_id) local_id: vec3<u32>) {
    // output[global_id.x] = f32(global_id.x) * 1000. + f32(local_id.x);
    output[global_id.x] = f32(local_id.x);
    // output[local_id.x] = 1234.;
    // output[0] = 1234.;
    // output[1] = 5678.;
    // output[2] = 1111.;
    // output[3] = 2222.;
}
