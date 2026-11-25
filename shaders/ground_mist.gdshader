shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
uniform sampler2D noise_texture : repeat_enable, filter_linear;
uniform vec4 mist_color : source_color = vec4(0.58, 0.65, 0.82, 0.18);
uniform float noise_scale = 0.12;
uniform float scroll_speed = 0.4;
uniform float soft_distance = 1.5;
uniform float time_seconds = 0.0;
varying vec3 world_pos;
void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment() {
	vec2 uv = world_pos.xz * noise_scale + vec2(time_seconds * scroll_speed, -time_seconds * scroll_speed * 0.63);
	float n = texture(noise_texture, uv).r;
	float edge = smoothstep(0.0, 0.18, UV.y) * smoothstep(0.0, 0.18, 1.0 - UV.y);
	ALBEDO = mist_color.rgb;
	ALPHA = mist_color.a * smoothstep(0.25, 0.75, n) * edge;
}
