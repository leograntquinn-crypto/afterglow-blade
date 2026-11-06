// WebGL 后处理：泛光、扭曲（冲击波）、色差、调色、暗角、颗粒
//
// 为什么还要一层 WebGL：Canvas 2D 只能「整张图叠加」，做不了逐像素的事 ——
//   冲击波把背景往外推的折射、色差（红蓝通道错开）、高质量的高斯泛光，都需要着色器。
// 做法：世界照常画在 2D 画布上；画 HUD 之前，把这一帧（和发光层）交给 WebGL 处理，结果画回 2D 画布，再在上面画 HUD。
//   这样 HUD 永远清晰、不被扭曲；WebGL 不可用 / 着色器编译失败 / 上下文丢失时，直接退回原来的 Canvas 后处理。
//
// 画质：2 = 两级泛光 + 扭曲 + 色差 + 颗粒；1 = 一级泛光 + 扭曲；0 = 不用 WebGL（退回 Canvas）

import { lightTex } from './fx_art.js';
import { GRAIN_GAIN } from './post.js';

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// 降采样 + 提取亮部：发光层全部保留，场景里特别亮的地方（白热的火花、闪光）也带一点
const FS_PRE = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uGlow, uScene;
uniform vec2 uTexel;
vec3 pick(vec2 uv) {
  vec3 g = texture2D(uGlow, uv).rgb;
  vec3 s = texture2D(uScene, uv).rgb;
  float l = max(s.r, max(s.g, s.b));
  return g + s * smoothstep(0.85, 1.0, l) * 0.2;
}
void main() {
  vec2 o = uTexel * 0.5;
  vec3 c = pick(vUv + vec2(-o.x, -o.y)) + pick(vUv + vec2(o.x, -o.y)) + pick(vUv + vec2(-o.x, o.y)) + pick(vUv + vec2(o.x, o.y));
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

// 9 抽头高斯模糊（利用线性采样，5 次取样）
const FS_BLUR = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb * 0.2270270;
  c += texture2D(uTex, vUv + uDir * 1.3846154).rgb * 0.3162162;
  c += texture2D(uTex, vUv - uDir * 1.3846154).rgb * 0.3162162;
  c += texture2D(uTex, vUv + uDir * 3.2307692).rgb * 0.0702703;
  c += texture2D(uTex, vUv - uDir * 3.2307692).rgb * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const FS_DOWN = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec2 o = uTexel * 0.5;
  vec3 c = texture2D(uTex, vUv + vec2(-o.x, -o.y)).rgb + texture2D(uTex, vUv + vec2(o.x, -o.y)).rgb
         + texture2D(uTex, vUv + vec2(-o.x, o.y)).rgb + texture2D(uTex, vUv + vec2(o.x, o.y)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

// 合成：扭曲 → 色差 → 泛光 → 调色（柔光叠主题色 + 一点 S 曲线和饱和度）→ 暗角 → 颗粒（暗角、颗粒是光照包的贴图）
const NS = 6; // 同时最多几道冲击波
const FS_FINAL = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uScene, uB1, uB2, uVigT, uGrainT;
uniform vec2 uGrainK, uGrainO;
uniform float uAspect, uChroma, uBloom1, uBloom2, uGradeAmt, uSat, uContrast, uVig, uGrain;
uniform vec3 uGrade;
uniform vec4 uShock[${NS}]; // x, y（0～1，左上为原点）, 半径, 强度（0 = 无）
uniform float uShockW[${NS}];
uniform vec2 uChromaC;
vec3 softLight(vec3 b, vec3 s) {
  return mix(2.0 * b * s + b * b * (1.0 - 2.0 * s), sqrt(b) * (2.0 * s - 1.0) + 2.0 * b * (1.0 - s), step(0.5, s));
}
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  // 冲击波：环附近的像素沿径向被推开（像透过一圈气浪看背景）
  vec2 off = vec2(0.0);
  for (int i = 0; i < ${NS}; i++) {
    vec4 s = uShock[i];
    if (s.w <= 0.0) continue;
    vec2 d = (uv - s.xy) * vec2(uAspect, 1.0);
    float dist = length(d);
    float k = (dist - s.z) / uShockW[i];
    float f = s.w * k * exp(-k * k * 2.0);
    off -= d / max(dist, 1e-4) * f * vec2(1.0 / uAspect, 1.0);
  }
  uv += off;
  vec3 col;
  if (uChroma > 0.0) {
    vec2 cd = (uv - uChromaC) * uChroma;
    col = vec3(texture2D(uScene, uv + cd).r, texture2D(uScene, uv).g, texture2D(uScene, uv - cd).b);
  } else col = texture2D(uScene, uv).rgb;
  // 泛光缓冲和场景贴图的方向一致（都是第一行 = 画面顶部），用同一个坐标取
  col += texture2D(uB1, uv).rgb * uBloom1 + texture2D(uB2, uv).rgb * uBloom2;
  // 高光肩部：0.6 以上平滑压缩，叠加发光的地方不会一片死白、还能看出层次
  vec3 hi = max(col - 0.6, 0.0);
  col = min(col, 0.6) + 0.4 * (1.0 - exp(-hi / 0.4));
  col = mix(col, softLight(clamp(col, 0.0, 1.0), uGrade), uGradeAmt);
  col = clamp(col, 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  // 暗角、颗粒：光照包的 vignette / grain 贴图（没载好时 uVig、uGrain 为 0）
  col *= 1.0 - uVig * texture2D(uVigT, uv).a;
  col += (texture2D(uGrainT, uv * uGrainK + uGrainO).r - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

function hexRGB(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class GLPost {
  constructor() {
    this.ok = false;
    this.failed = false;
    if (/[?&]nogl\b/.test(location.search)) { this.failed = true; return; } // 调试：强制走 Canvas 后处理
    try {
      this.canvas = document.createElement('canvas');
      const opt = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
      const gl = this.canvas.getContext('webgl', opt) || this.canvas.getContext('experimental-webgl', opt);
      if (!gl) throw new Error('no webgl');
      this.gl = gl;
      // 软件渲染（没有显卡加速时浏览器用 CPU 模拟 WebGL）：全屏着色器在 CPU 上非常慢，不如直接用 Canvas 后处理。
      // 地址加 ?gl=force 可以强制打开（测试用）
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      this.renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      if (/swiftshader|llvmpipe|software|basic render/i.test(this.renderer) && !/[?&]gl=force\b/.test(location.search)) throw new Error('software webgl');
      this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; this.failed = true; });
      this.build();
      this.ok = true;
    } catch (e) {
      this.failed = true;
      this.ok = false;
    }
  }

  build() {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VS);
    const prog = (fs) => {
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
        u[name] = gl.getUniformLocation(p, name);
      }
      return { p, u };
    };
    this.P = { pre: prog(FS_PRE), blur: prog(FS_BLUR), down: prog(FS_DOWN), fin: prog(FS_FINAL) };
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.scene = this.tex();
    this.glow = this.tex();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.fb = {};
    this.shock = new Float32Array(NS * 4);
    this.shockW = new Float32Array(NS);
  }

  tex() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  // 光照包的暗角、颗粒贴图：载好后上传一次（颗粒 256 / 手机 128，是 2 的幂，可以重复平铺）
  artTex() {
    if (this.art) return this.art;
    const vig = lightTex('vignette'), grain = lightTex('grain');
    if (!vig || !grain) return null;
    const gl = this.gl, up = (img, wrap) => {
      const t = this.tex();
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      return t;
    };
    return (this.art = { vig: up(vig, gl.CLAMP_TO_EDGE), grain: up(grain, gl.REPEAT), gw: grain.width });
  }
  // 离屏缓冲（泛光用的 1/4、1/8 分辨率），尺寸变了才重建
  target(name, w, h) {
    const gl = this.gl;
    let f = this.fb[name];
    if (f && f.w === w && f.h === h) return f;
    if (!f) f = this.fb[name] = { t: this.tex(), f: gl.createFramebuffer() };
    gl.bindTexture(gl.TEXTURE_2D, f.t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.t, 0);
    f.w = w;
    f.h = h;
    return f;
  }
  pass(prog, out, w, h, setup) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.f : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.p);
    setup(prog.u);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  bind(unit, t, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(loc, unit);
  }

  // src：已经画好世界的 2D 画布；glow：发光层画布；o：本帧参数
  //   o.quality、o.grade（主题色）、o.shocks [{x, y（屏幕 0～1）, r, s, w}]、o.chroma、o.chromaC [x, y]、o.time
  // 处理完把结果画回 src 的 2D 上下文
  apply(ctx, src, glow, o) {
    if (!this.ok) return false;
    const gl = this.gl, W = src.width, H = src.height;
    try {
      if (this.canvas.width !== W || this.canvas.height !== H) {
        this.canvas.width = W;
        this.canvas.height = H;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.scene);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.bindTexture(gl.TEXTURE_2D, this.glow);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glow);
      // 泛光：1/4 分辨率提取 + 模糊；高画质再做一级 1/8
      const w4 = Math.max(1, (W / 4) | 0), h4 = Math.max(1, (H / 4) | 0);
      const A = this.target('a', w4, h4), B = this.target('b', w4, h4);
      this.pass(this.P.pre, A, w4, h4, (u) => {
        this.bind(0, this.glow, u.uGlow);
        this.bind(1, this.scene, u.uScene);
        gl.uniform2f(u.uTexel, 1 / w4, 1 / h4);
      });
      const blur = (from, to, w, h, dx, dy) => this.pass(this.P.blur, to, w, h, (u) => { this.bind(0, from.t, u.uTex); gl.uniform2f(u.uDir, dx / w, dy / h); });
      blur(A, B, w4, h4, 1, 0);
      blur(B, A, w4, h4, 0, 1);
      let C = A;
      if (o.quality > 1) {
        const w8 = Math.max(1, (w4 / 2) | 0), h8 = Math.max(1, (h4 / 2) | 0);
        C = this.target('c', w8, h8);
        const D = this.target('d', w8, h8);
        this.pass(this.P.down, C, w8, h8, (u) => { this.bind(0, A.t, u.uTex); gl.uniform2f(u.uTexel, 1 / w4, 1 / h4); });
        blur(C, D, w8, h8, 1, 0);
        blur(D, C, w8, h8, 0, 1);
      }
      // 冲击波参数
      this.shock.fill(0);
      this.shockW.fill(1);
      (o.shocks || []).slice(0, NS).forEach((s, i) => {
        this.shock.set([s.x, s.y, s.r, s.s], i * 4);
        this.shockW[i] = s.w;
      });
      const g = hexRGB(o.grade || '#808080');
      this.pass(this.P.fin, null, W, H, (u) => {
        this.bind(0, this.scene, u.uScene);
        this.bind(1, A.t, u.uB1);
        this.bind(2, C.t, u.uB2);
        gl.uniform1f(u.uAspect, W / H);
        gl.uniform1f(u.uChroma, o.quality > 1 ? o.chroma || 0 : 0);
        gl.uniform2f(u.uChromaC, ...(o.chromaC || [0.5, 0.5]));
        gl.uniform1f(u.uBloom1, 0.55);
        gl.uniform1f(u.uBloom2, o.quality > 1 ? 0.6 : 0);
        gl.uniform3f(u.uGrade, ...g);
        gl.uniform1f(u.uGradeAmt, 0.32);
        gl.uniform1f(u.uSat, 1.06);
        gl.uniform1f(u.uContrast, 0.12);
        const art = this.artTex();
        this.bind(3, art ? art.vig : this.scene, u.uVigT);
        this.bind(4, art ? art.grain : this.scene, u.uGrainT);
        gl.uniform1f(u.uVig, art ? 1 : 0);
        // 颗粒：贴图按 1:1 像素平铺、每帧换个偏移；强度按原来的随机噪点换算（GRAIN_GAIN，见 post.js）
        gl.uniform1f(u.uGrain, art && o.quality > 1 ? 0.045 * GRAIN_GAIN : 0);
        if (art) {
          gl.uniform2f(u.uGrainK, W / art.gw, H / art.gw);
          gl.uniform2f(u.uGrainO, ((o.time * 73) % art.gw) / art.gw, ((o.time * 151) % art.gw) / art.gw);
        }
        gl.uniform4fv(u.uShock, this.shock);
        gl.uniform1fv(u.uShockW, this.shockW);
      });
      if (gl.isContextLost()) throw new Error('lost');
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(this.canvas, 0, 0);
      ctx.restore();
      return true;
    } catch (e) {
      this.ok = false;
      this.failed = true;
      return false;
    }
  }
}
