shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

// 四层 PBR：L0 雪 / L1 裂纹岩 / L2 冻土 / L3 枯草地（Texture2DArray，Muse 提供）。
// 未提供贴图时 use_textures=false，以 spec 规定的基色 fallback，不代表成品外观。
uniform bool use_textures = false;
uniform sampler2DArray albedo_array : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2DArray normal_array : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2DArray rough_array : filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D splat_map : filter_linear_mipmap, repeat_disable;
uniform float snow_amount = 1.0;
uniform float detail_scale = 0.4;
uniform float macro_scale = 0.025;
uniform bool debug_snowmask = false;

varying vec3 world_pos;
varying vec3 world_normal;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec4 splat = texture(splat_map, UV);
	float n_macro = vnoise(world_pos.xz * macro_scale);
	float n_detail = vnoise(world_pos.xz * detail_scale);
	float slope = smoothstep(0.72, 0.86, world_normal.y);
	float wet = smoothstep(0.6, 0.9, splat.b) * (1.0 - slope);
	float snow = clamp(smoothstep(0.35, 0.65, n_macro + 0.25 * n_detail) * slope * (1.0 - wet) * splat.r * snow_amount, 0.0, 1.0);
	vec3 c_snow = vec3(0.74, 0.76, 0.80);
	vec3 c_rock = vec3(0.21, 0.22, 0.24);
	vec3 c_dirt = vec3(0.24, 0.20, 0.16);
	vec3 c_grass = vec3(0.30, 0.29, 0.18);
	vec3 col = c_rock * splat.g + c_dirt * splat.b + c_grass * splat.a;
	col = mix(col, c_snow, snow);
	if (use_textures) {
		vec3 uv3 = vec3(world_pos.xz * 0.4, 0.0);
		vec3 snow_t = texture(albedo_array, vec3(uv3.xy, 0.0)).rgb;
		vec3 rock_t = texture(albedo_array, vec3(uv3.xy, 1.0)).rgb;
		vec3 dirt_t = texture(albedo_array, vec3(uv3.xy, 2.0)).rgb;
		vec3 grass_t = texture(albedo_array, vec3(uv3.xy, 3.0)).rgb;
		vec3 layered = rock_t * splat.g + dirt_t * splat.b + grass_t * splat.a;
		col = mix(layered, snow_t, snow);
		NORMAL_MAP = texture(normal_array, vec3(uv3.xy, 1.0)).rgb;
		ROUGHNESS = texture(rough_array, vec3(uv3.xy, 0.0)).r;
	} else {
		ROUGHNESS = mix(0.85, 0.6, snow);
	}
	if (debug_snowmask) {
		ALBEDO = vec3(snow);
	} else {
		ALBEDO = col;
	}
}
