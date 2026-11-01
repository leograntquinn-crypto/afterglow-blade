shader_type canvas_item;
// 后期：泛光（Bloom）+ 调色 + 暗角 + 胶片颗粒
// 泛光原理：读取屏幕的低分辨率版本（mipmap），只保留比阈值亮的部分，叠加回去 —— 亮的东西会「晕开」

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float bloom_strength = 0.9;
uniform float bloom_threshold = 0.55;
uniform vec4 grade : source_color = vec4(0.42, 0.24, 0.55, 1.0);
uniform float grade_amount = 0.18;
uniform float vignette = 0.55;
uniform float grain = 0.045;

void fragment() {
	vec3 col = texture(screen_tex, SCREEN_UV).rgb;
	vec3 bloom = vec3(0.0);
	float w = 0.0;
	for (float lod = 1.0; lod <= 5.0; lod += 1.0) {
		vec3 b = textureLod(screen_tex, SCREEN_UV, lod).rgb;
		bloom += max(b - bloom_threshold, 0.0) * (lod * 0.6);
		w += lod * 0.6;
	}
	col += bloom / w * bloom_strength * 3.0;
	// 柔光调色：暗部偏主题色
	vec3 tint = mix(col * (grade.rgb * 2.0), 1.0 - 2.0 * (1.0 - col) * (1.0 - grade.rgb), step(0.5, col));
	col = mix(col, tint, grade_amount);
	vec2 d = SCREEN_UV - 0.5;
	col *= 1.0 - dot(d, d) * vignette * 2.2;
	float n = fract(sin(dot(SCREEN_UV * 800.0 + vec2(TIME * 37.0, TIME * 91.0), vec2(12.9898, 78.233))) * 43758.5453);
	col += (n - 0.5) * grain;
	COLOR = vec4(col, 1.0);
}
