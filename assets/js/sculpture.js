/*
 * The hero sculpture. Raw WebGL2, no library.
 *
 * Every tile of the "JK" mark is a frustum placed somewhere along the ray that
 * runs from the home camera through its cell. From the home position the tiles
 * line up exactly; from anywhere else they fall apart. As the page scrolls, the
 * same tiles drop into an endless field of rows (the "40 billion rows" line).
 */

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aCorner;   // x,y,z in -.5..5
layout(location=1) in vec4 aCell;     // x, y, size, depth factor
layout(location=2) in vec4 aRow;      // x, z, width, seed
layout(location=3) in vec4 aColor;    // rgb, 1 when part of the mark
uniform mat4 uProj, uView;
uniform vec3 uHome;
uniform vec2 uOffset, uMouse;
uniform vec2 uBurstAt;
uniform float uBurst, uScale, uMorph, uTime, uIntro, uFlow, uAspect;
out vec3 vColor; out vec3 vWorld; out float vFog; out float vSide;

float ease(float x){ return x*x*(3.-2.*x); }

void main(){
  float seed = aRow.w;

  // Arrangement A: along the home camera's rays.
  float spread = mix(1.9, 1., uIntro);
  float t = 1. + (aCell.w - 1.) * spread;
  float len = .035 + seed * .13;
  // corner.z +.5 faces the camera, so it must be the near end of the frustum
  float tt = t - aCorner.z * len;
  vec3 flat0 = vec3(aCell.xy + aCorner.xy * aCell.z * .96, 0.);
  vec3 a = uHome + (flat0 - uHome) * tt;
  // Click shockwave: thrown outwards from the pointer, then pulled back.
  vec2 away = aCell.xy - uBurstAt;
  float ring = uBurst * (.35 + seed) * (.5 + 1.6 / (1. + dot(away, away)));
  a += vec3(normalize(away + .001) * ring, (fract(seed * 31.) - .4) * ring * 2.2);
  a.xy += (1. - uIntro) * vec2(sin(seed*40.), cos(seed*57.)) * 2.4;

  // Arrangement B: rows running to the horizon.
  float z = mod(aRow.y + uFlow * (.6 + seed * .5), 30.) - 24.;
  float h = .03 + .05 * fract(seed * 13.);
  vec3 b = vec3(aRow.x, -1.5 + sin(z*.55 + aRow.x*.35 + uTime*.6) * .13, z)
         + aCorner * vec3(aRow.z, h, .2);

  // Rows rise under the pointer.
  vec4 bc = uProj * uView * vec4(b, 1.);
  float touch = exp(-dot(vec2((bc.x / bc.w - uMouse.x) * uAspect, bc.y / bc.w - uMouse.y), vec2((bc.x / bc.w - uMouse.x) * uAspect, bc.y / bc.w - uMouse.y)) * 16.) * step(0., bc.w);
  b.y += touch * .42 * uMorph;

  float m = ease(clamp(uMorph * 1.7 - seed * .7, 0., 1.));
  if (aColor.a < .5) { a = b; }
  vec3 p = mix(a, b, m);
  p.y += sin(m * 3.14159) * (seed - .3) * 1.2 * aColor.a;

  float grow = aColor.a < .5 ? smoothstep(.25, .95, uMorph - seed*.2) : 1.;
  p = mix(b - aCorner * vec3(aRow.z, h, .2), p, grow);

  vWorld = p;
  vec4 mv = uView * vec4(p, 1.);
  vFog = smoothstep(4., 24., -mv.z) * smoothstep(.2, .9, uMorph);
  vec4 clip = uProj * mv;
  float k = uScale;
  vec2 ndc = clip.xy / clip.w;
  float near = 1. - smoothstep(0., .42, length((ndc * k + uOffset - uMouse) * vec2(uAspect, 1.)));
  clip.xy = clip.xy * k + uOffset * clip.w;
  gl_Position = clip;

  float depthShade = mix(1.12, .5, clamp((aCell.w - .62) / .95, 0., 1.));
  vec3 col = aColor.rgb * mix(depthShade, 1., m);
  col += vec3(.04,.3,.2) * near * near * (1. - m) * .8;
  col += vec3(.06,.42,.28) * touch * m;
  vSide = aCorner.z + .5;
  vColor = col;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vColor; in vec3 vWorld; in float vFog; in float vSide;
uniform vec3 uBg; uniform float uFade;
out vec4 o;
void main(){
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 l = normalize(vec3(-.35, .75, .6));
  float d = max(dot(n, l), 0.);
  float f = abs(n.z);
  vec3 c = vColor * (.5 + .68 * d) ;
  c *= mix(mix(.25, .8, vSide), 1., smoothstep(.6, .95, f + max(n.y,0.)*.6));
  c = mix(c, uBg, vFog);
  o = vec4(mix(uBg, c, uFade), 1.);
}`;

const BG = [6 / 255, 40 / 255, 31 / 255];
const DIST = 6;

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/* Rasterise the mark on a coarse grid, then merge some 2x2 blocks so the mosaic has rhythm. */
function buildCells(rand) {
  const W = 40, H = 24;
  const inside = (x, y) => {
    // J: a stem with a hooked foot. K: stem plus two diagonals.
    const stem = 6;
    if (x >= 10 && x < 16 && y < 17) return true;
    const dx = x + 0.5 - 8, dy = y + 0.5 - 16;
    const r = Math.hypot(dx, dy);
    if (dy >= 0 && r < 8.02 && r > 1.9) return true;
    if (dy < 0 && dy > -2.2 && x < 6 && x >= 0) return true;
    if (x >= 20 && x < 20 + stem) return true;
    const kx = x + 0.5 - 26, ky = y + 0.5 - 12;
    if (kx >= 0) {
      const c = Math.abs(ky) * 0.92;
      if (kx > c - 1.6 && kx < c + 5.4 && x < 40) return true;
    }
    return false;
  };
  const used = new Uint8Array(W * H), cells = [];
  const free = (x, y) => x < W && y < H && inside(x, y) && !used[y * W + x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!free(x, y)) continue;
    let s = 1;
    for (const k of rand() < 0.16 ? [3, 2] : rand() < 0.4 ? [2] : []) {
      let ok = true;
      for (let j = 0; j < k && ok; j++) for (let i = 0; i < k; i++) if (!free(x + i, y + j)) { ok = false; break; }
      if (ok) { s = k; break; }
    }
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) used[(y + j) * W + x + i] = 1;
    cells.push([x + s / 2 - W / 2, H / 2 - (y + s / 2), s]);
  }
  return cells;
}

function perspective(fov, aspect, n, f) {
  const t = 1 / Math.tan(fov / 2);
  return new Float32Array([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]);
}

function orbit(yaw, pitch, dist) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const z = [sy * cp, sp, cy * cp], x = [cy, 0, -sy];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, 0, 0, -dist, 1]);
}

export async function mount(canvas, stage, { still = false } = {}) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "low-power" });
  if (!gl) return null;

  const small = matchMedia("(max-width: 760px)").matches;
  const rand = rng(31052002);

  const program = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    gl.attachShader(program, s);
  }
  gl.linkProgram(program);
  // Let the driver compile in the background instead of blocking the page.
  const parallel = gl.getExtension("KHR_parallel_shader_compile");
  if (parallel) while (!gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) await new Promise((r) => setTimeout(r, 30));
  if (gl.isContextLost()) return null;
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Sculpture unavailable:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);
  const U = (name) => gl.getUniformLocation(program, name);
  const u = Object.fromEntries(["uProj", "uView", "uHome", "uOffset", "uMouse", "uScale", "uMorph", "uTime", "uIntro", "uFlow", "uAspect", "uBg", "uFade", "uBurst", "uBurstAt"].map((n) => [n, U(n)]));

  // Unit cube
  const faces = [[2, 1], [2, -1], [0, 1], [0, -1], [1, 1], [1, -1]];
  const cube = [];
  for (const [axis, dir] of faces) {
    const q = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (const [p, r] of q) {
      const v = [0, 0, 0];
      v[axis] = dir / 2;
      v[(axis + 1) % 3] = (p * dir) / 2;
      v[(axis + 2) % 3] = r / 2;
      cube.push(...v);
    }
  }

  const palette = [
    [0.07, 0.63, 0.44], [0.05, 0.47, 0.34], [0.07, 0.63, 0.44], [0.78, 0.96, 0.24],
    [0.78, 0.96, 0.24], [0.76, 0.69, 1], [1, 0.48, 0.35], [0.93, 0.98, 0.94],
  ];
  const cells = buildCells(rand);
  const total = cells.length + (small ? 700 : 1700);
  const unit = 0.1;
  const data = new Float32Array(total * 12);
  for (let i = 0; i < total; i++) {
    const c = cells[i];
    const seed = rand();
    let pick = Math.floor(rand() * palette.length);
    if (pick > 4 && rand() < 0.4) pick = 1;
    const col = palette[pick];
    const lane = Math.round((rand() - 0.5) * 26);
    const width = 0.25 + rand() * rand() * 1.5;
    data.set(c ? [c[0] * unit, c[1] * unit, c[2] * unit, 0.64 + rand() * 0.85] : [0, 0, 0, 1], i * 12);
    data.set([lane * 0.62 + rand() * 0.2, Math.round(rand() * 60) / 2, width, seed], i * 12 + 4);
    const tone = 0.82 + rand() * 0.34;
    data.set([...col.map((v) => v * tone), c ? 1 : 0], i * 12 + 8);
  }

  const buffer = (arr) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
  };
  buffer(new Float32Array(cube));
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  buffer(data);
  for (let i = 1; i < 4; i++) {
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 48, (i - 1) * 16);
    gl.vertexAttribDivisor(i, 1);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(...BG, 1);
  gl.uniform3f(u.uHome, 0, 0, DIST);
  gl.uniform3f(u.uBg, ...BG);

  let w = 0, h = 0, home = { x: 0, y: 0, s: 1 };
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75);
    w = r.width; h = r.height;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    gl.viewport(0, 0, W, H);
    const aspect = w / h, fov = (42 * Math.PI) / 180;
    gl.uniformMatrix4fv(u.uProj, false, perspective(fov, aspect, 0.1, 60));
    gl.uniform1f(u.uAspect, aspect);
    // Fit the 4-unit-wide mark into its share of the viewport.
    const halfW = Math.tan(fov / 2) * DIST * aspect;
    const wide = w >= 900;
    const share = wide ? 0.42 : 0.72;
    const byWidth = (halfW * 2 * share) / 4;
    const byHeight = (Math.tan(fov / 2) * DIST * 2 * (wide ? 0.52 : 0.3)) / 2.4;
    home = { x: wide ? 0.46 : 0, y: wide ? 0.08 : 0.4, s: Math.min(byWidth, byHeight) };
  }

  let yaw = still ? 0 : -1.15, pitch = still ? 0 : 0.35;
  let targetYaw = 0, targetPitch = 0, lastMove = -1e4, mx = 9, my = 9;
  let burst = 0, burstV = 0, gathered = true, wasDown = false, lastScroll = scrollY, rush = 0, lastLane = -1;
  const fx = (name, rest) => document.dispatchEvent(new CustomEvent("fx", { detail: { name, ...rest } }));
  let intro = still ? 1 : 0, morph = 0, flow = 0, start = 0, prev = 0, raf = 0, visible = true;

  function progress() {
    const r = stage.getBoundingClientRect();
    return Math.min(1, Math.max(0, (-r.top - h * 0.16) / (h * 0.7)));
  }

  function frame(now) {
    raf = 0;
    if (!start) start = prev = now;
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const time = (now - start) / 1000;
    const p = progress();
    if (still) { morph = p > 0.5 ? 1 : 0; }
    else {
      morph += (p - morph) * (1 - Math.exp(-dt * 9));
      const k = Math.min(1, time / 2.2);
      intro = 1 - Math.pow(1 - k, 4);
      // Left alone, the view settles back to the one angle that reads.
      const idle = now - lastMove > 1400;
      const ty = idle ? Math.sin(time * 0.5) * 0.012 : targetYaw;
      const tp = idle ? Math.cos(time * 0.4) * 0.008 : targetPitch;
      const rate = 1 - Math.exp(-dt * (idle ? 2.2 : 4.5));
      yaw += (ty * (1 - morph) - yaw) * rate;
      pitch += (tp * (1 - morph) - pitch) * rate;
      const dy = Math.abs(scrollY - lastScroll);
      lastScroll = scrollY;
      rush += (Math.min(9, dy * 0.16) - rush) * (1 - Math.exp(-dt * 5));
      flow += dt * morph * (1.5 + rush);
      // Damped spring, so the tiles fly out and come home.
      burstV += (-burst * 15 - burstV * 4.2) * dt;
      burst = Math.max(-0.12, burst + burstV * dt);
      if (!gathered && burstV < 0 && burst < 0.35) { gathered = true; fx("gather"); }
      const down = morph > 0.45;
      if (down !== wasDown) { wasDown = down; fx("whoosh"); }
    }
    const e = morph * morph * (3 - 2 * morph);
    gl.uniformMatrix4fv(u.uView, false, orbit(yaw, pitch, DIST - e * 1.5));
    gl.uniform2f(u.uOffset, home.x * (1 - e), home.y * (1 - e));
    gl.uniform1f(u.uScale, home.s * (1 - e) + e);
    gl.uniform2f(u.uMouse, mx, my);
    gl.uniform1f(u.uMorph, morph);
    gl.uniform1f(u.uBurst, burst);
    gl.uniform1f(u.uTime, still ? 0 : time);
    gl.uniform1f(u.uIntro, intro);
    gl.uniform1f(u.uFlow, flow);
    gl.uniform1f(u.uFade, still ? 1 : Math.min(1, time / 0.9));
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, total);
    if (!still) queue();
  }
  function queue() {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function onPress(e) {
    if (morph > 0.3 || e.target.closest("a, button")) return;
    const k = Math.tan((21 * Math.PI) / 180) * DIST;
    const x = (e.clientX / w) * 2 - 1, y = 1 - (e.clientY / h) * 2;
    gl.uniform2f(u.uBurstAt, ((x - home.x) / home.s) * k * (w / h), ((y - home.y) / home.s) * k);
    burstV = 15;
    gathered = false;
    fx("shatter");
  }
  function onMove(e) {
    const x = (e.clientX / w) * 2 - 1, y = 1 - (e.clientY / h) * 2;
    mx = x; my = y;
    targetYaw = (x - home.x) * -0.55;
    targetPitch = (y - home.y) * -0.4;
    lastMove = performance.now();
    if (morph > 0.8 && y < 0.1) {
      const lane = Math.floor((x + 1) * 9);
      if (lane !== lastLane) { lastLane = lane; fx("pluck", { n: lane % 12 }); }
    }
  }

  resize();
  new ResizeObserver(() => { resize(); queue(); }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    prev = performance.now();
    queue();
  }).observe(stage);
  document.addEventListener("visibilitychange", () => { prev = performance.now(); queue(); });
  if (still) addEventListener("scroll", queue, { passive: true });
  else {
    stage.addEventListener("pointermove", onMove, { passive: true });
    stage.addEventListener("click", onPress);
  }
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); visible = false; canvas.classList.remove("is-live"); });
  canvas.classList.add("is-live");
  queue();
  return true;
}
