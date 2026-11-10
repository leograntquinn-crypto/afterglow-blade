shader_type canvas_item;
// 受击闪白：flash=1 时整图变纯白，0 时原样。与网页版 enemy.js 的 flash=4 帧对应。
uniform float flash : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec4 tex = texture(TEXTURE, UV);
	COLOR = vec4(mix(tex.rgb, vec3(1.0), flash), tex.a);
}
