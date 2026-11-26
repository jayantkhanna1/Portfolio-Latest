/*
 * The three.js scenes further down the page. This file and three.js itself are
 * only downloaded once the visitor scrolls. Each scene pauses when off screen.
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, InstancedMesh, PlaneGeometry, BoxGeometry,
  InstancedBufferGeometry, InstancedBufferAttribute, ShaderMaterial, MeshStandardMaterial,
  HemisphereLight, DirectionalLight, TextureLoader, Object3D, Color, Vector2, Vector3, Raycaster, LinearFilter, DoubleSide,
  ExtrudeGeometry, Shape, TubeGeometry, CatmullRomCurve3, CanvasTexture, SphereGeometry, SRGBColorSpace,
} from "./vendor/three.js";

const fx = (name, rest) => document.dispatchEvent(new CustomEvent("fx", { detail: { name, ...rest } }));
const mobile = matchMedia("(max-width: 760px)").matches;
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

/* Renderer, sizing, visibility and the frame loop shared by every scene. */
function base(canvas, fov, { still }) {
  let renderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" }); }
  catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
  const scene = new Scene();
  const camera = new PerspectiveCamera(fov, 1, 0.1, 100);
  const s = { renderer, scene, camera, w: 1, h: 1, onResize: () => {}, onFrame: () => {} };
  let visible = false, raf = 0, prev = 0, clock = 0;
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    clock += dt;
    s.onFrame(dt, clock);
    renderer.render(scene, camera);
    s.queue();
  };
  s.queue = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };
  const wake = () => { prev = performance.now(); s.queue(); };
  new ResizeObserver(() => {
    s.w = canvas.clientWidth || 1; s.h = canvas.clientHeight || 1;
    renderer.setSize(s.w, s.h, false);
    camera.aspect = s.w / s.h;
    s.onResize();
    camera.updateProjectionMatrix();
    wake();
  }).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }).observe(canvas);
  document.addEventListener("visibilitychange", wake);
  canvas.addEventListener("webglcontextlost", () => { visible = false; canvas.classList.remove("is-live"); canvas.parentElement.classList.remove("has-live"); });
  s.still = still;
  return s;
}

function live(canvas) {
  canvas.classList.add("is-live");
  canvas.parentElement.classList.add("has-live");
}

/* ---------- 1. Portrait: the photo as a wall of tiles that scatters and reassembles ---------- */
export function portrait(canvas, img, opts) {
  const s = base(canvas, 30, opts);
  if (!s) return;
  const CX = 20, CY = 25, n = CX * CY;
  const geo = new InstancedBufferGeometry();
  const box = new BoxGeometry(1, 1, 1);
  geo.index = box.index;
  geo.attributes.position = box.attributes.position;
  geo.attributes.normal = box.attributes.normal;
  geo.attributes.uv = box.attributes.uv;
  const cell = new Float32Array(n * 2), rnd = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    cell.set([i % CX, Math.floor(i / CX)], i * 2);
    rnd.set([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random()], i * 3);
  }
  geo.setAttribute("aCell", new InstancedBufferAttribute(cell, 2));
  geo.setAttribute("aRnd", new InstancedBufferAttribute(rnd, 3));
  geo.instanceCount = n;
  const mat = new ShaderMaterial({
    uniforms: { uMap: { value: null }, uMouse: { value: new Vector2(9, 9) }, uHover: { value: 0 }, uBurst: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `
      attribute vec2 aCell; attribute vec3 aRnd;
      uniform vec2 uMouse; uniform float uHover, uBurst, uTime;
      varying vec2 vUv; varying vec3 vN; varying float vLift;
      mat3 rot(vec3 a){ vec3 s=sin(a), c=cos(a);
        return mat3(1.,0.,0., 0.,c.x,s.x, 0.,-s.x,c.x) * mat3(c.y,0.,-s.y, 0.,1.,0., s.y,0.,c.y) * mat3(c.z,s.z,0., -s.z,c.z,0., 0.,0.,1.); }
      void main(){
        vec2 grid = vec2(${CX}., ${CY}.);
        vec2 id = (aCell + .5) / grid;
        vec2 center = (id - .5) * vec2(4., 5.);
        float d = distance(center, uMouse);
        float near = exp(-d*d*1.5) * uHover;
        float ripple = sin(d*4. - uTime*4.) * exp(-d*.9) * .06 * uHover;
        float k = clamp(uBurst * 1.6 - aRnd.z * .6, 0., 1.); k = k*k*(3.-2.*k);
        vec3 a = vec3(aRnd.y, aRnd.x, aRnd.x) * (near * .22 + k * 5.);
        mat3 m = rot(a);
        vec3 p = m * (position * vec3(.2, .2, .08) * (1. - k*.35));
        vec2 push = normalize(center - uMouse + .001) * near * .03;
        p += vec3(center + push, near * .55 + ripple * 1.6);
        p += vec3(aRnd.x * .3 + center.x * .06, aRnd.y * .35 + center.y * .05, (aRnd.z - .35) * 1.) * k;
        vN = m * normal;
        vLift = near;
        vec2 uv = (aCell + (position.xy + .5)) / grid;
        vUv = vec2(.1 + uv.x * .8, uv.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec2 vUv; varying vec3 vN; varying float vLift;
      void main(){
        vec3 n = normalize(vN);
        float front = abs(n.z);
        vec3 c = texture2D(uMap, vUv).rgb;
        vec3 side = mix(vec3(.42,.29,1.), vec3(.78,.96,.24), max(n.y, 0.));
        float f = smoothstep(.25, .75, front);
        vec3 col = mix(side, c, f) * mix(1., .72 + .28 * dot(n, normalize(vec3(-.3,.5,1.))) + .16, min(1., vLift*3. + (1.-front)*3.));
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  s.scene.add(mesh);
  // The photo occupies the middle of a canvas 1.24x its frame, leaving room for tiles to fly.
  s.onResize = () => { s.camera.position.z = (5 * 1.24) / (2 * Math.tan((30 * Math.PI) / 360)); };
  let burst = opts.still ? 0 : 1, target = opts.still ? 0 : 1, hover = 0, over = false, seen = false, tx = 0, ty = 0;
  const mouse = mat.uniforms.uMouse.value;
  s.onFrame = (dt, t) => {
    burst += Math.sign(target - burst) * Math.min(Math.abs(target - burst), dt * (target ? 2.6 : 0.75));
    hover = damp(hover, over && !opts.still ? 1 : 0, 6, dt);
    mesh.rotation.y = damp(mesh.rotation.y, over ? tx * 0.12 : 0, 5, dt);
    mesh.rotation.x = damp(mesh.rotation.x, over ? -ty * 0.1 : 0, 5, dt);
    mat.uniforms.uBurst.value = burst;
    mat.uniforms.uHover.value = hover;
    mat.uniforms.uTime.value = t;
    if (target === 1 && burst === 1 && seen) target = 0;
  };
  const host = canvas.parentElement;
  host.addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    ty = 1 - ((e.clientY - r.top) / r.height) * 2;
    const x = tx * 2, y = ty * 2.5;
    if (!over) mouse.set(x, y); else mouse.lerp(new Vector2(x, y), 0.5);
    over = true;
  });
  host.addEventListener("pointerleave", () => { over = false; });
  host.addEventListener("click", () => {
    if (opts.still || target) return;
    target = 1;
    fx("shatter");
    setTimeout(() => fx("gather"), 750);
  });
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { seen = true; o.disconnect(); } }, { threshold: 0.35 }).observe(host);
  new TextureLoader().load(img.currentSrc || img.src, (tex) => {
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
    mat.uniforms.uMap.value = tex;
    live(canvas);
    s.queue();
  });
}

/* ---------- 2. Ring: projects on a carousel you can throw ---------- */
export function ring(root, opts) {
  const canvas = root.querySelector("canvas");
  const s = base(canvas, 32, opts);
  if (!s) return;
  const all = JSON.parse(root.querySelector("script").textContent);
  const link = root.querySelector("[data-ring-link]"), title = root.querySelector("[data-ring-title]"), text = root.querySelector("[data-ring-text]");
  let items = all;
  // Twelve cards cover the ring; their pictures change while they are round the back.
  const SLOTS = 12, STEP = (Math.PI * 2) / SLOTS, R = 5.6, W = 2.6, H = W * (458 / 720);
  const geo = new PlaneGeometry(W, H, 32, 12);
  const group = new Group();
  s.scene.add(group);
  const loader = new TextureLoader();
  const shared = { uVel: { value: 0 }, uTime: { value: 0 } };
  const textures = new Map();
  const picture = (src) => {
    if (!textures.has(src)) textures.set(src, new Promise((ok) => loader.load(src, ok, undefined, () => ok(null))));
    return textures.get(src);
  };
  const cards = Array.from({ length: SLOTS }, (_, i) => {
    const mat = new ShaderMaterial({
      side: DoubleSide, transparent: true,
      uniforms: { ...shared, uMap: { value: null }, uOn: { value: 0 }, uFront: { value: 0 } },
      vertexShader: `
        uniform float uVel, uTime, uFront; varying vec2 vUv; varying float vDepth;
        void main(){
          vUv = uv;
          float a = position.x / ${R.toFixed(2)};
          vec3 p = vec3(sin(a) * ${R.toFixed(2)}, position.y, cos(a) * ${R.toFixed(2)} - ${R.toFixed(2)});
          p.xy *= 1. + uFront * .1;
          p.y += sin(uv.x * 3.1416 + uTime * .8) * .05 + (uv.x - .5) * uVel * .35;
          p.z += sin(uv.y * 3.1416) * abs(uVel) * .5;
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uOn, uFront, uVel; varying vec2 vUv; varying float vDepth;
        void main(){
          vec2 q = abs(vUv - .5) * vec2(${W.toFixed(2)}, ${H.toFixed(2)}) - vec2(${(W / 2 - 0.09).toFixed(3)}, ${(H / 2 - 0.09).toFixed(3)});
          float d = length(max(q, 0.)) - .09;
          float alpha = 1. - smoothstep(-.008, .008, d);
          float sh = uVel * .006;
          vec3 c = vec3(texture2D(uMap, vUv + vec2(sh, 0.)).r, texture2D(uMap, vUv).g, texture2D(uMap, vUv - vec2(sh, 0.)).b);
          c = mix(vec3(.05,.26,.2), c, uOn);
          if (!gl_FrontFacing) c = mix(vec3(.78,.96,.24), vec3(.07,.63,.44), vUv.y) * .55;
          else c *= mix(.5, 1., uFront);
          c = mix(c, vec3(.024,.157,.122), smoothstep(8., 20., vDepth) * .8);
          if (alpha < .01) discard;
          gl_FragColor = vec4(c, alpha);
        }`,
    });
    const holder = new Group(), mesh = new Mesh(geo, mat);
    holder.rotation.y = i * STEP;
    mesh.position.z = R;
    mesh.userData.i = i;
    holder.add(mesh);
    group.add(holder);
    return mesh;
  });
  const mod = (a, n) => ((a % n) + n) % n;
  const loops = () => items.length >= SLOTS;
  function assign(c, g) {
    const it = loops() ? items[mod(g, items.length)] : items[g];
    if (c.userData.it === it) return;
    c.userData.it = it;
    c.visible = !!it;
    c.material.userData.ready = false;
    c.material.uniforms.uOn.value = 0;
    if (it) picture(it.img).then((tex) => { if (c.userData.it === it && tex) { c.material.uniforms.uMap.value = tex; c.material.userData.ready = true; s.queue(); } });
  }

  let angle = 0, vel = 0, drag = null, goal = null, front = -1, px = 0, py = 0, entered = opts.still ? 1 : 0;
  s.onResize = () => {
    const wide = s.w > 800;
    s.camera.position.set(0, wide ? 1.15 : 0.9, R + (wide ? 5.5 : Math.max(6, 6.4 / Math.max(0.3, s.camera.aspect))));
    s.camera.lookAt(0, wide ? -0.15 : -0.05, 0);
  };
  const setFront = (i) => {
    if (i === front) return;
    if (front >= 0) fx("tick", { n: i });
    front = i;
    const it = items[mod(i, items.length)];
    title.textContent = it.t;
    text.textContent = it.d;
    link.href = it.url;
    link.querySelector("span").textContent = `Open ${it.t}`;
  };
  s.onFrame = (dt, t) => {
    entered = Math.min(1, entered + dt * 0.7);
    const e = 1 - Math.pow(1 - entered, 4);
    if (!drag) {
      if (goal !== null) {
        const was = angle;
        angle = opts.still ? goal : damp(angle, goal, 5, dt);
        vel = (angle - was) / Math.max(dt, 0.001);
        if (Math.abs(goal - angle) < 0.002) { angle = goal; goal = null; vel = 0; }
      } else {
        angle += vel * dt;
        vel *= Math.exp(-1.7 * dt);
        // Once it has nearly stopped, settle on the closest card.
        if (Math.abs(vel) < 0.16) angle = damp(angle, Math.round(angle / STEP) * STEP, 4, dt);
      }
    }
    group.rotation.y = angle + (1 - e) * 2.6;
    group.rotation.z = damp(group.rotation.z, -0.05 + px * 0.04, 3, dt);
    group.rotation.x = damp(group.rotation.x, py * 0.05, 3, dt);
    group.position.y = (1 - e) * -2.4;
    shared.uVel.value = damp(shared.uVel.value, Math.max(-1.6, Math.min(1.6, vel * 0.5)), 8, dt);
    shared.uTime.value = opts.still ? 0 : t;
    if (!loops() && !drag && goal === null) {
      const lo = -(items.length - 1) * STEP;
      if (angle > 0 || angle < lo) { angle = damp(angle, angle > 0 ? 0 : lo, 9, dt); vel *= 0.8; }
    }
    const raw = Math.round(-angle / STEP), i = loops() ? raw : Math.max(0, Math.min(items.length - 1, raw));
    setFront(i);
    cards.forEach((c, n) => assign(c, n + SLOTS * Math.round((raw - n) / SLOTS)));
    cards.forEach((c, n) => {
      const u = c.material.uniforms;
      u.uFront.value = damp(u.uFront.value, mod(i, SLOTS) === n ? 1 : 0, 7, dt);
      u.uOn.value = damp(u.uOn.value, c.material.userData.ready ? 1 : 0, 5, dt);
    });
  };
  const go = (d) => { let k = Math.round(-(goal ?? angle) / STEP) + d; if (!loops()) k = Math.max(0, Math.min(items.length - 1, k)); goal = -k * STEP; vel = 0; s.queue(); };
  root.querySelector("[data-ring-prev]").addEventListener("click", () => go(-1));
  root.querySelector("[data-ring-next]").addEventListener("click", () => go(1));

  const buttons = [...root.querySelectorAll("[data-filter]")];
  buttons.forEach((b) => b.addEventListener("click", () => {
    buttons.forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    items = b.dataset.filter === "all" ? all : all.filter((x) => x.c.includes(b.dataset.filter));
    cards.forEach((c) => { c.userData.it = null; });
    goal = null; vel = opts.still ? 0 : 0.01; angle = 0; front = -1;
    setFront(0);
    if (!opts.still) { entered = 0.25; }
    fx("whoosh");
    s.queue();
  }));

  const ray = new Raycaster(), ndc = new Vector2();
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, t: e.timeStamp, moved: 0 };
    goal = null; vel = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    px = ((e.clientX - r.left) / r.width) * 2 - 1;
    py = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (!drag) return;
    const dx = e.clientX - drag.x, dt = Math.max(8, e.timeStamp - drag.t) / 1000;
    const da = (dx / s.w) * (s.w > 800 ? 2.1 : 1.5);
    angle += da;
    vel = vel * 0.55 + (da / dt) * 0.45;
    drag.moved += Math.abs(dx);
    drag.x = e.clientX; drag.t = e.timeStamp;
  });
  const up = (e) => {
    if (!drag) return;
    const tapped = drag.moved < 6 && e.type === "pointerup";
    if (e.timeStamp - drag.t > 90) vel = 0;
    vel = Math.max(-7, Math.min(7, vel));
    drag = null;
    canvas.classList.remove("is-dragging");
    if (tapped) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
      ray.setFromCamera(ndc, s.camera);
      // Cards are bent in the shader, so pick by the nearest card centre instead of exact geometry.
      let best = -1, dist = 0.45;
      const v = new Vector3();
      cards.forEach((c, n) => {
        c.getWorldPosition(v);
        if (v.z < 0 || !c.visible) return;
        v.project(s.camera);
        const d = Math.hypot(v.x - ndc.x, (v.y - ndc.y) * 0.6);
        if (d < dist) { dist = d; best = n; }
      });
      if (best >= 0) {
        const at = Math.round(-angle / STEP), g2 = best + SLOTS * Math.round((at - best) / SLOTS);
        if (g2 === front) window.open(link.href, "_blank", "noopener");
        else goal = -g2 * STEP;
      }
      else if (best >= 0) { const k = -angle / STEP; let d = best - (((k % N) + N) % N); if (d > N / 2) d -= N; if (d < -N / 2) d += N; goal = Math.round(-(k + d)) * STEP; }
    }
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  if (!opts.still) new IntersectionObserver(([e], o) => { if (e.isIntersecting) { entered = 0; fx("whoosh"); o.disconnect(); } }, { threshold: 0.25 }).observe(canvas);
  live(canvas);
}

/* ---------- 3. Swarm: one flock of cubes that travels the whole page, taking a new form in each section ---------- */
export function swarm(canvas, form, opts) {
  const s = base(canvas, 35, opts);
  if (!s) return;
  const MAX = mobile ? 420 : 820;
  const draw = document.createElement("canvas");
  draw.width = draw.height = 34;
  const g = draw.getContext("2d", { willReadFrequently: true });
  // Flat drawings, sampled on a lattice and extruded. Units: roughly -1..1.
  const flat = (paint, depth = 2) => {
    g.clearRect(0, 0, 34, 34);
    g.fillStyle = g.strokeStyle = "#fff";
    g.lineCap = g.lineJoin = "round";
    paint();
    const px = g.getImageData(0, 0, 34, 34).data, pts = [];
    for (let y = 0; y < 34; y++) for (let x = 0; x < 34; x++) if (px[(y * 34 + x) * 4 + 3] > 130)
      for (let z = 0; z < depth; z++) pts.push([(x - 16.5) / 17, (16.5 - y) / 17, (z - (depth - 1) / 2) / 17]);
    return pts;
  };
  const line = (w, ...p) => { g.lineWidth = w; g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  const text = (t, size, y) => { g.font = `700 ${size}px "Mona Sans", sans-serif`; g.textAlign = "center"; g.fillText(t, 17, y); };
  const each = (n, fn) => Array.from({ length: n }, (_, i) => fn(i, i / n));
  const shapes = {
    code: flat(() => { line(3.6, [10, 9], [2.5, 17], [10, 25]); line(3.6, [24, 9], [31.5, 17], [24, 25]); line(3.6, [20, 6], [14, 28]); }, 3),
    torus: each(MAX, (i, k) => { const a = k * Math.PI * 2 * 3, b = i * 2.399963, r = 0.62 + 0.27 * Math.cos(a * (2 / 3)); return [Math.cos(a) * r + Math.cos(b) * 0.09, Math.sin(a) * r + Math.sin(b) * 0.09, 0.3 * Math.sin(a * (2 / 3)) + Math.cos(b * 1.7) * 0.09]; }),
    aa: flat(() => text("Aa", 25, 26), 3),
    ask: flat(() => text("?", 36, 30), 3),
    yes: flat(() => text("!", 36, 30), 3),
    sent: flat(() => line(6, [5, 18], [13, 26], [29, 8]), 3),
  };
  const palettes = {
    code: ["#0b6e4f", "#12a06f", "#6a4bff", "#ff7a59"], torus: ["#06281f", "#0b6e4f", "#ff7a59", "#5a39e0"],
   
    aa: ["#5a39e0", "#7b5cff", "#ff7a59", "#12a06f"],
    ask: ["#c8f43c", "#c8f43c", "#12a06f", "#c3b1ff"], yes: ["#c8f43c", "#e9ffb0", "#c8f43c", "#ff7a59"], sent: ["#c8f43c", "#e9ffb0", "#12a06f", "#c3b1ff"],
  };
  for (const k in palettes) palettes[k] = palettes[k].map((h) => new Color(h));
  for (const k in shapes) { const p = shapes[k]; for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } }

  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 }), MAX);
  mesh.frustumCulled = false;
  const sun = new DirectionalLight("#fff", 2.6), rim = new DirectionalLight("#b7a2ff", 2.2);
  sun.position.set(-3, 5, 6);
  rim.position.set(5, -3, 2);
  s.scene.add(mesh, sun, rim, new HemisphereLight("#ffffff", "#3b2f6b", 1.4));
  const D = 12;
  let unit = 1;
  s.onResize = () => { s.camera.position.z = D; unit = (2 * Math.tan((35 * Math.PI) / 360) * D) / s.h; };

  const pos = new Float32Array(MAX * 3).map(() => (Math.random() - 0.5) * 14), v = new Float32Array(MAX * 3), size = new Float32Array(MAX), col = new Float32Array(MAX * 3).fill(0.5);
  const rnd = new Float32Array(MAX).map(Math.random);
  const slots = [...document.querySelectorAll("[data-slot]")];
  const state = (el) => (el.dataset.slot === "ask" ? contact : el.dataset.slot);
  let alive = 0, home = null, lastCx = 0, lastCy = null, contact = "ask", shown = null, mx = 1e4, my = 1e4, yaw = 0, kick = 0;
  addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  document.addEventListener("pointerleave", () => { mx = my = 1e4; });

  const c = new Color();
  const q = { x: 0, y: 0, z: 0 };
  s.onFrame = (dt, t) => {
    // Find the slot closest to the middle of the screen, and how far we are toward it.
    let best = null, bestD = 1e9;
    for (const el of slots) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const d = Math.abs(r.top + r.height / 2 - s.h * 0.45);
      if (d < bestD) { bestD = d; best = { el, r }; }
    }
    if (!best) return;
    const name = state(best.el), pts = shapes[name], pal = palettes[name];
    const { r } = best;
    // Shown only while its own slot is on screen, so it never crosses the text between sections.
    const edge = Math.min(s.h - r.top, r.bottom) / Math.max(1, r.height);
    const show = Math.min(1, Math.max(0, (edge - 0.25) / 0.5));
    if (show === 0 && alive < 0.01) { if (mesh.visible) { mesh.visible = false; shown = null; } return; }
    mesh.visible = true;
    const cx = (r.left + r.width / 2 - s.w / 2) * unit, cy = (s.h / 2 - r.top - r.height / 2) * unit, R = (Math.min(r.width, r.height) / 2) * unit * 0.8;
    if (name !== shown) {
      // Same slot, new form (the contact mark): reshuffle. New slot: start gathered around its centre.
      const same = shown !== null && home === best.el;
      shown = name;
      home = best.el;
      for (let i = 0; i < MAX; i++) for (let k = 0; k < 3; k++) {
        const j = i * 3 + k, spread = (Math.random() - 0.5) * R;
        if (!same) { pos[j] = (k === 0 ? cx : k === 1 ? cy : 0) + spread; v[j] = 0; } else if (!opts.still) v[j] += spread * 5;
      }
      kick = 3;
      fx("gather");
    }
    alive = opts.still ? show : damp(alive, show, 8, dt);
    // Stay glued to the slot while the page scrolls.
    if (lastCy !== null && home === best.el) { const dy = cy - lastCy, dx2 = cx - lastCx; for (let i = 0; i < MAX; i++) { pos[i * 3] += dx2; pos[i * 3 + 1] += dy; } }
    lastCx = cx; lastCy = cy;
    const px = (mx - s.w / 2) * unit, py = (s.h / 2 - my) * unit;
    kick = damp(kick, 0, 1.6, dt);
    yaw += dt * (0.35 + kick);
    const flatShape = name !== "torus";
    const a = opts.still ? 0.35 : flatShape ? Math.sin(t * 0.8) * 0.55 + kick * 1.2 : yaw, ca = Math.cos(a), sa = Math.sin(a);
    const tilt = opts.still ? 0.1 : Math.sin(t * 0.5) * 0.16 + (flatShape ? 0 : 0.35), ct = Math.cos(tilt), st = Math.sin(tilt);
    const cube = R * (flatShape ? 1 / 17 : mobile ? 0.085 : 0.062) * 0.94 * alive;
    const near2 = (R * 0.42) ** 2;
    for (let i = 0; i < MAX; i++) {
      const j = i * 3, p = pts[i % pts.length], want = i < pts.length ? 1 : 0;
      const x1 = p[0] * ca + p[2] * sa, z1 = -p[0] * sa + p[2] * ca;
      q.x = cx + x1 * R; q.y = cy + (p[1] * ct - z1 * st) * R + (opts.still ? 0 : Math.sin(t * 1.2) * R * 0.03); q.z = (p[1] * st + z1 * ct) * R;
      const dx = pos[j] - px, dy = pos[j + 1] - py, d2 = dx * dx + dy * dy;
      const push = d2 < near2 ? ((near2 - d2) / near2) * 18 * R : 0, inv = push / Math.sqrt(d2 + 0.02);
      if (opts.still) { pos[j] = q.x; pos[j + 1] = q.y; pos[j + 2] = q.z; }
      else {
        const stiff = 26 + rnd[i] * 34, drag = Math.exp(-(6 + rnd[i] * 2.5) * dt);
        v[j] = (v[j] + ((q.x - pos[j]) * stiff + dx * inv) * dt) * drag;
        v[j + 1] = (v[j + 1] + ((q.y - pos[j + 1]) * stiff + dy * inv) * dt) * drag;
        v[j + 2] = (v[j + 2] + ((q.z - pos[j + 2]) * stiff + push * (rnd[i] - 0.2)) * dt) * drag;
        pos[j] += v[j] * dt; pos[j + 1] += v[j + 1] * dt; pos[j + 2] += v[j + 2] * dt;
      }
      const sp = Math.min(3, Math.abs(v[j]) + Math.abs(v[j + 1]) + Math.abs(v[j + 2])) * 0.35;
      size[i] = damp(size[i], want, 6, dt);
      place(mesh, i, pos[j], pos[j + 1], pos[j + 2], Math.max(1e-4, size[i] * cube), Math.max(1e-4, size[i] * cube), Math.max(1e-4, size[i] * cube), tilt + sp * rnd[i] * 4, a + sp * 3);
      const k = pal[Math.floor(rnd[i] * pal.length)];
      col[j] = damp(col[j], k.r, 5, dt); col[j + 1] = damp(col[j + 1], k.g, 5, dt); col[j + 2] = damp(col[j + 2], k.b, 5, dt);
      mesh.setColorAt(i, c.setRGB(col[j], col[j + 1], col[j + 2]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  };
  const burst = (f) => { if (!opts.still) for (let i = 0; i < MAX * 3; i++) v[i] += (Math.random() - 0.5) * f; };
  slots.forEach((el) => el.addEventListener("click", () => { burst(9); kick = 4; fx("shatter"); setTimeout(() => fx("gather"), 600); }));
  const fields = [...form.querySelectorAll("[required]")];
  form.addEventListener("input", () => {
    contact = fields.every((f) => f.checkValidity()) ? "yes" : "ask";
    // Every keystroke shakes the sculpture a little.
    if (!opts.still) for (let n = 0; n < 60; n++) v[Math.floor(Math.random() * MAX * 3)] += (Math.random() - 0.5) * 22;
  });
  form.addEventListener("sent", () => { contact = "sent"; kick = 6; });
  live(canvas);
}

/* Lit instanced boxes, shared by the next three scenes. */
function boxes(s, count, colors) {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 }), count);
  mesh.frustumCulled = false;
  for (let i = 0; i < count; i++) mesh.setColorAt(i, colors(i));
  const sun = new DirectionalLight("#ffffff", 2.6);
  sun.position.set(-4, 8, 6);
  s.scene.add(new HemisphereLight("#d8fff0", "#04150f", 1.5), sun);
  return mesh;
}
const dummyBox = new Object3D();
function place(mesh, i, x, y, z, sx, sy, sz, rx = 0, ry = 0) {
  dummyBox.position.set(x, y, z);
  dummyBox.scale.set(sx, sy, sz);
  dummyBox.rotation.set(rx, ry, 0);
  dummyBox.updateMatrix();
  mesh.setMatrixAt(i, dummyBox.matrix);
}
/* ---------- 4. Resume: five steps up, and a ball that hops to the chosen one ---------- */
export function climb(canvas, opts) {
  const s = base(canvas, 18, opts);
  if (!s) return;
  const tabs = [...document.querySelectorAll(".steps [role=tab]")], N = tabs.length;
  const W = mobile ? 1.62 : 2.5, GAP = mobile ? 2.02 : 3.36, D = 1.5, RAD = 0.26, M = 46;
  const X = (i) => (i - (N - 1) / 2) * GAP, TOP = (i) => 0.75 + i * 0.52;
  const sh = new Shape(), hw = W / 2, hd = D / 2;
  sh.moveTo(-hw + RAD, -hd);
  for (const [x, y, qx, qy] of [[hw - RAD, -hd, 1, 0], [hw, hd - RAD, 0, 1], [-hw + RAD, hd, -1, 0], [-hw, -hd + RAD, 0, -1]]) {
    sh.lineTo(x, y);
    sh.quadraticCurveTo(x + qx * RAD, y + qy * RAD, x + (qx - qy) * RAD, y + (qy + qx) * RAD);
  }
  const group = new Group();
  s.scene.add(group);
  const bits = boxes(s, M, (i) => new Color(["#ff8f73", "#c3b1ff", "#4fd1a1", "#a9d61f", "#ffd166"][i % 5]));
  group.add(bits);
  const cols = tabs.map((el, i) => {
    const color = getComputedStyle(el).getPropertyValue("--c").trim(), h = TOP(i) + 1.4;
    const geo = new ExtrudeGeometry(sh, { depth: h - 0.12, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 4, curveSegments: 12 });
    geo.rotateX(-Math.PI / 2);
    const body = new Mesh(geo, new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.38 }));
    body.userData.i = i;
    const cv = document.createElement("canvas");
    cv.width = 512; cv.height = 256;
    const tex = new CanvasTexture(cv);
    tex.anisotropy = 8;
    const face = new Mesh(new PlaneGeometry(1.46, 0.73), new ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uMap: { value: tex } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
      fragmentShader: "uniform sampler2D uMap; varying vec2 vUv; void main(){ gl_FragColor = vec4(.04,.13,.1, texture2D(uMap, vUv).a); }",
    }));
    face.position.set(0, h - 0.62, hd + 0.07);
    const g = new Group();
    g.add(body, face);
    g.position.x = X(i);
    group.add(g);
    document.fonts.load('600 40px "Mona Sans"').catch(() => {}).then(() => {
      const t = cv.getContext("2d");
      t.textAlign = "center";
      t.font = '700 170px "Mona Sans", sans-serif';
      t.fillText(el.firstElementChild.textContent, 256, 186);
      tex.needsUpdate = true;
      s.queue();
    });
    return { g, body, press: 0 };
  });
  // The thread that ties the chapters together.
  const pts = [new Vector3(X(0) - 3.2, -0.9, 0.2)];
  for (let i = 0; i < N; i++) {
    pts.push(new Vector3(X(i), TOP(i) + 0.45 - 0, -0.5));
    if (i < N - 1) pts.push(new Vector3(X(i) + GAP / 2, TOP(i) + 1.1, -0.5));
  }
  pts.push(new Vector3(X(N - 1) + 3.4, TOP(N - 1) + 1.6, -0.5));
  const tubeGeo = new TubeGeometry(new CatmullRomCurve3(pts), 240, 0.035, 10, false);
  group.add(new Mesh(tubeGeo, new MeshStandardMaterial({ color: "#0a4d38", roughness: 0.4 })));
  const ball = new Mesh(new SphereGeometry(0.36, 40, 28), new MeshStandardMaterial({ color: "#5a39e0", roughness: 0.16, emissive: "#5a39e0", emissiveIntensity: 0.15 }));
  group.add(ball);
  const bit = Array.from({ length: M }, () => ({ x: (Math.random() - 0.5) * (mobile ? 12 : 20), y: Math.random() * 5.2 - 0.4, z: -1.6 - Math.random() * 3, r: 0.05 + Math.random() * 0.1, p: Math.random() * 9, ox: 0, oy: 0, vx: 0, vy: 0 }));

  let at = Math.max(0, tabs.findIndex((t) => t.getAttribute("aria-selected") === "true"));
  let pos = opts.still ? at : 0, from = pos, k = opts.still ? 1 : 0, hover = -1, enter = opts.still ? 1 : 0, seen = opts.still, px = 0, py = 0, landed = opts.still, squash = 1;
  document.addEventListener("step", (e) => { from = pos; at = e.detail; k = opts.still ? 1 : 0; landed = false; s.queue(); });
  s.onResize = () => {
    const tan = 2 * Math.tan((9 * Math.PI) / 180);
    const d = Math.max((GAP * N + 0.4) / (tan * s.camera.aspect), 5.7 / tan);
    s.camera.position.set(0, 1.3 + d * 0.2, d);
    s.camera.lookAt(0, 1.3, 0);
  };
  s.onFrame = (dt, t) => {
    if (seen) enter = Math.min(1, enter + dt * 0.55);
    cols.forEach((c, i) => {
      const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, enter * 2 - i * 0.16)), 4);
      c.press = damp(c.press, (i === at && landed ? -0.1 : 0) + (i === hover ? 0.12 : 0), 8, dt);
      c.g.position.y = -1.4 - (1 - e) * 5 + c.press;
      c.g.rotation.y = (1 - e) * 1.2;
      c.body.material.emissiveIntensity = damp(c.body.material.emissiveIntensity, i === at ? 0.16 : i === hover ? 0.1 : 0, 6, dt);
    });
    if (enter > 0.55 || opts.still) k = opts.still ? 1 : Math.min(1, k + dt / (0.55 + Math.abs(at - from) * 0.2));
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    pos = from + (at - from) * e;
    if (k === 1 && !landed) {
      landed = true;
      squash = 0.72;
      bit.forEach((b) => { b.vx += (Math.random() - 0.5) * 3; b.vy += Math.random() * 3; });
    }
    squash = damp(squash, 1, 9, dt);
    const lo = Math.max(0, Math.min(N - 1, Math.floor(pos))), hi = Math.min(N - 1, lo + 1), f = pos - lo;
    const idle = opts.still || k < 1 ? 0 : Math.abs(Math.sin(t * 2.2)) * 0.1;
    ball.position.set(X(0) + pos * GAP, TOP(lo) + (TOP(hi) - TOP(lo)) * f + 0.36 * squash + Math.abs(Math.sin(pos * Math.PI)) * 1.05 + cols[Math.round(pos)].press + idle + (1 - Math.min(1, enter * 2)) * 4, 0.15);
    ball.scale.set(2 - squash, squash, 2 - squash);
    tubeGeo.setDrawRange(0, Math.floor((tubeGeo.index.count * Math.min(1, Math.max(0, enter * 1.6 - 0.5))) / 3) * 3);
    bit.forEach((b, i) => {
      b.vx = (b.vx - b.ox * 5 * dt) * Math.exp(-2.4 * dt); b.vy = (b.vy - b.oy * 5 * dt) * Math.exp(-2.4 * dt);
      b.ox += b.vx * dt; b.oy += b.vy * dt;
      const r = Math.max(0.001, b.r * enter), tt = opts.still ? 0 : t;
      place(bits, i, b.x + b.ox - px * b.z * 0.12, b.y + b.oy + Math.sin(tt * 0.8 + b.p) * 0.22, b.z, r, r, r, tt * 0.4 + b.p, tt * 0.5);
    });
    bits.instanceMatrix.needsUpdate = true;
    group.rotation.y = damp(group.rotation.y, px * 0.1, 4, dt);
    group.rotation.x = damp(group.rotation.x, py * 0.03, 4, dt);
  };
  const ray = new Raycaster(), ndc = new Vector2();
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    px = ((e.clientX - r.left) / r.width) * 2 - 1;
    py = ((e.clientY - r.top) / r.height) * 2 - 1;
    ndc.set(px, -py);
    ray.setFromCamera(ndc, s.camera);
    return ray.intersectObjects(cols.map((c) => c.body))[0]?.object.userData.i ?? -1;
  };
  canvas.addEventListener("pointermove", (e) => {
    const i = pick(e);
    if (i !== hover && i >= 0) fx("pluck", { n: i * 2 });
    hover = i;
    canvas.style.cursor = i >= 0 ? "pointer" : "";
  });
  canvas.addEventListener("pointerleave", () => { hover = -1; px = py = 0; });
  canvas.addEventListener("click", (e) => { const i = pick(e); if (i >= 0) document.dispatchEvent(new CustomEvent("pickstep", { detail: i })); });
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { seen = true; o.disconnect(); } }, { threshold: 0.3 }).observe(canvas);
  live(canvas);
}

/* ---------- 5. Skills: a ball for every skill. They gather, collide, and scatter from the pointer. ---------- */
export function balls(root, opts) {
  const canvas = root.querySelector("canvas"), s = base(canvas, 12, opts);
  if (!s) return;
  const list = [...root.querySelectorAll("dl > div")].flatMap((g, gi) => [...g.querySelectorAll("dd")].map((d) => ({ t: d.textContent, sx: +d.dataset.x, sy: +d.dataset.y, g: gi, c: g.style.getPropertyValue("--c").trim() })));
  const geo = new SphereGeometry(1, 40, 28);
  const sun = new DirectionalLight("#ffffff", 2.4);
  sun.position.set(-4, 7, 8);
  s.scene.add(sun, new HemisphereLight("#ffffff", "#2b6b55", 1.5));
  const items = list.map((k, i) => {
    const cv = document.createElement("canvas");
    cv.width = 1024; cv.height = 512;
    const tex = new CanvasTexture(cv);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new Mesh(geo, new MeshStandardMaterial({ map: tex, roughness: 0.28, metalness: 0, emissive: k.c, emissiveIntensity: 0.06 }));
    mesh.userData.i = i;
    s.scene.add(mesh);
    return { ...k, cv, tex, mesh, base: k.g === 0 ? 1.28 : 0.94 - (i % 3) * 0.05, r: 0.01, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, dim: 0 };
  });
  const sprite = new Image();
  sprite.onload = async () => {
    await document.fonts.load('600 40px "Mona Sans"').catch(() => {});
    const tmp = document.createElement("canvas");
    tmp.width = tmp.height = 128;
    const tg = tmp.getContext("2d");
    for (const b of items) {
      const g = b.cv.getContext("2d"), wide = ["Nginx", "MySQL", "PySpark", "Node.js"].includes(b.t);
      g.fillStyle = b.c;
      g.fillRect(0, 0, 1024, 512);
      tg.globalCompositeOperation = "source-over";
      tg.clearRect(0, 0, 128, 128);
      tg.drawImage(sprite, (sprite.width / 8) * b.sx, (sprite.width / 8) * b.sy, sprite.width / 8, sprite.width / 8, 0, 0, 128, 128);
      tg.globalCompositeOperation = "source-in";
      tg.fillStyle = "#0a2119";
      tg.fillRect(0, 0, 128, 128);
      // u = .25 is the point of the sphere that faces the camera.
      const size = wide ? 172 : 138;
      g.drawImage(tmp, 256 - size / 2, 222 - size / 2, size, size);
      g.fillStyle = "#0a2119";
      g.textAlign = "center";
      g.font = `600 ${b.t.length > 9 ? 31 : b.t.length > 6 ? 36 : 42}px "Mona Sans", sans-serif`;
      g.fillText(b.t, 256, 338);
      b.tex.needsUpdate = true;
    }
    s.queue();
  };
  sprite.src = new URL("../images/skills-sprite.webp", import.meta.url).href;

  let W = 10, H = 6, K = 1, group = -1, seen = opts.still, mx = 1e3, my = 1e3, moved = 0;
  const D = 56;
  const scatter = () => items.forEach((b, i) => { b.x = (Math.random() - 0.5) * W * 1.1; b.y = opts.still ? (Math.random() - 0.5) * H : H * 0.8 + i * 0.22; b.z = (Math.random() - 0.5) * 2; });
  s.onResize = () => {
    s.camera.position.z = D;
    H = 2 * Math.tan((6 * Math.PI) / 180) * D;
    W = H * s.camera.aspect;
    K = Math.sqrt((W * H * (mobile ? 0.4 : 0.48)) / items.reduce((a, b) => a + Math.PI * b.base * b.base, 0));
  };
  let placed = false;
  const step = (dt, t) => {
    const ax = Math.min(1, H / W);
    for (const b of items) {
      const on = group < 0 ? 1 : b.g === group ? 1.42 : 0.66;
      b.r = damp(b.r, b.base * K * on, 5, dt);
      const pull = group < 0 ? 1 : b.g === group ? 2.6 : 0.55;
      b.vx += (-b.x * 2.4 * ax * ax * pull + Math.sin(t * 0.6 + b.y) * 0.5) * dt;
      b.vy += (-b.y * 2.4 * pull + Math.cos(t * 0.5 + b.x) * 0.5) * dt;
      b.z *= Math.exp(-14 * dt);
      const dx = b.x - mx, dy = b.y - my, d = Math.hypot(dx, dy) + 0.01, reach = b.r + 1.5 * K;
      if (d < reach) { const f = (reach - d) * 46 * dt; b.vx += (dx / d) * f; b.vy += (dy / d) * f; }
      // Soft walls
      const lx = W / 2 - b.r, ly = H / 2 - b.r;
      if (Math.abs(b.x) > lx) b.vx -= (b.x - Math.sign(b.x) * lx) * 60 * dt;
      if (Math.abs(b.y) > ly) b.vy -= (b.y - Math.sign(b.y) * ly) * 30 * dt;
      const drag = Math.exp(-2.6 * dt);
      b.vx *= drag; b.vy *= drag; b.vz *= drag;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j], dx = b.x - a.x, dy = b.y - a.y, dz = 0, min = (a.r + b.r) * 1.03, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01, o = ((min - d) / d) * 0.5, nx = dx * o, ny = dy * o, nz = dz * o;
      const wa = (b.r * b.r) / (a.r * a.r + b.r * b.r), wb = 1 - wa;
      a.x -= nx * wa * 0.6; a.y -= ny * wa * 0.6; a.z -= nz * wa * 0.3;
      b.x += nx * wb * 0.6; b.y += ny * wb * 0.6; b.z += nz * wb * 0.3;
      const k = 5;
      a.vx -= nx * wa * k; a.vy -= ny * wa * k;
      b.vx += nx * wb * k; b.vy += ny * wb * k;
    }
  };
  s.onFrame = (dt, t) => {
    if (!placed) { placed = true; scatter(); if (opts.still) for (let n = 0; n < 300; n++) step(0.016, 0); }
    if (seen && !opts.still) { const n = 2; for (let i = 0; i < n; i++) step(dt / n, t); }
    else if (opts.still) for (let n = 0; n < 40; n++) step(0.016, 0);
    for (const b of items) {
      b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.scale.setScalar(Math.max(0.001, b.r));
      b.rx = damp(b.rx, Math.max(-0.6, Math.min(0.6, -b.vy * 0.09)), 6, dt);
      b.ry = damp(b.ry, Math.max(-0.6, Math.min(0.6, b.vx * 0.09)), 6, dt);
      b.mesh.rotation.set(b.rx, b.ry, -b.vx * 0.02);
      b.dim = damp(b.dim, group >= 0 && b.g !== group ? 1 : 0, 6, dt);
      b.mesh.material.color.setScalar(1 - b.dim * 0.45);
    }
  };
  document.addEventListener("group", (e) => { group = e.detail; s.queue(); });
  const ray = new Raycaster(), ndc = new Vector2();
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    ray.setFromCamera(ndc, s.camera);
    return ray.intersectObjects(items.map((b) => b.mesh))[0]?.object.userData.i ?? -1;
  };
  canvas.addEventListener("pointermove", (e) => {
    const i = at(e);
    mx = (ndc.x * W) / 2; my = (ndc.y * H) / 2;
    if (i >= 0 && i !== moved) { moved = i; fx("pluck", { n: i }); }
  });
  for (const t of ["pointerleave", "pointercancel"]) canvas.addEventListener(t, () => { mx = my = 1e3; });
  canvas.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") mx = my = 1e3; });
  canvas.addEventListener("click", (e) => { const i = at(e); if (i >= 0) document.dispatchEvent(new CustomEvent("pickgroup", { detail: items[i].g })); });
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { seen = true; o.disconnect(); } }, { threshold: 0.2 }).observe(canvas);
  live(canvas);
}

/* ---------- 6. Reviews: a tunnel of cubes the visitor flies through ---------- */
export function tunnel(canvas, opts) {
  const s = base(canvas, 60, opts);
  if (!s) return;
  const n = mobile ? 170 : 420, LEN = 46;
  const tones = ["#0b6e4f", "#0b6e4f", "#12a06f", "#12a06f", "#c8f43c", "#c3b1ff", "#ff8f73", "#0e4a38"].map((c) => new Color(c));
  const list = Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2, r = 3.6 + Math.random() ** 1.5 * 9;
    return { a, r, z: -Math.random() * LEN, s: 0.12 + Math.random() ** 3 * 0.75, l: 1 + Math.random() * 3.5, c: tones[Math.floor(Math.random() * tones.length)], spin: Math.random() * 6 };
  });
  const mesh = boxes(s, n, (i) => list[i].c);
  s.scene.add(mesh);
  const fade = new Color("#06281f"), c = new Color();
  let at = 0, last = 0, rush = 0, px = 0, py = 0, tx = 0, ty = 0;
  document.addEventListener("fly", (e) => { at = e.detail; s.queue(); });
  addEventListener("pointermove", (e) => { tx = (e.clientX / innerWidth) * 2 - 1; ty = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  let pos = 0;
  s.onFrame = (dt, t) => {
    pos = opts.still ? at : damp(pos, at, 6, dt);
    rush = damp(rush, Math.min(1, Math.abs(pos - last) / Math.max(dt, 0.001) / 3), 5, dt);
    last = pos;
    px = damp(px, tx, 3, dt); py = damp(py, ty, 3, dt);
    s.camera.position.set(px * 0.9, -py * 0.6, 0);
    s.camera.rotation.set(py * 0.03, -px * 0.05, Math.sin(pos * 0.7) * 0.05);
    const drift = opts.still ? 0 : t * 0.35;
    list.forEach((b, i) => {
      const z = ((((b.z + pos * 7 + drift) % LEN) + LEN) % LEN) - LEN + 2;
      const a = b.a + z * 0.012 + pos * 0.06;
      // Cubes stretch into streaks with speed.
      place(mesh, i, Math.cos(a) * b.r, Math.sin(a) * b.r, z, b.s, b.s, b.s * (1 + rush * b.l * 2.4), opts.still ? b.spin : b.spin + t * 0.15 * (1 - rush), b.spin * (1 - rush));
      mesh.setColorAt(i, c.copy(b.c).lerp(fade, Math.min(1, Math.max(0, (-z - 12) / 30))));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  };
  live(canvas);
}

/* ---------- 7. Blog: the cover image behaves like water under the pointer ---------- */
export function cover(root, opts) {
  const canvas = root.querySelector("canvas"), img = root.querySelector("img"), s = base(canvas, 30, opts);
  if (!s || opts.still) return;
  const mat = new ShaderMaterial({
    uniforms: { uMap: { value: null }, uM: { value: new Vector2(0.5, 0.5) }, uAmt: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uFit: { value: new Vector2(1, 1) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
    fragmentShader: `uniform sampler2D uMap; uniform vec2 uM, uFit; uniform float uAmt, uTime, uAspect; varying vec2 vUv;
      void main(){ vec2 d = (vUv - uM) * vec2(uAspect, 1.); float r = length(d);
        float near = exp(-r * r * 7.) * uAmt;
        float w = sin(r * 34. - uTime * 5.) * exp(-r * 4.) * uAmt;
        float idle = sin(vUv.y * 7. + uTime * .9) * .0022 + sin(vUv.x * 6. - uTime * .7) * .0022;
        vec2 off = normalize(d + .0001) * (w * .014 - near * .03) + idle;
        vec2 uv = (vUv - .5) * uFit * .95 + .5;
        vec3 c = vec3(texture2D(uMap, uv + off * 1.25).r, texture2D(uMap, uv + off).g, texture2D(uMap, uv + off * .75).b);
        gl_FragColor = vec4(c + max(w, 0.) * .07, 1.); }`,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  s.scene.add(quad);
  let want = 0, tx = 0.5, ty = 0.5;
  s.onResize = () => { const a = s.camera.aspect, ia = 640 / 426; mat.uniforms.uAspect.value = a; mat.uniforms.uFit.value.set(a < ia ? a / ia : 1, a > ia ? ia / a : 1); };
  s.onFrame = (dt, t) => {
    const u = mat.uniforms;
    u.uTime.value = t;
    u.uAmt.value = damp(u.uAmt.value, want, 4, dt);
    u.uM.value.set(damp(u.uM.value.x, tx, 8, dt), damp(u.uM.value.y, ty, 8, dt));
  };
  root.addEventListener("pointermove", (e) => { const r = root.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width; ty = 1 - (e.clientY - r.top) / r.height; want = 1; });
  root.addEventListener("pointerleave", () => { want = 0; });
  new TextureLoader().load(img.currentSrc || img.src, (tex) => { tex.minFilter = LinearFilter; tex.generateMipmaps = false; mat.uniforms.uMap.value = tex; live(canvas); s.queue(); });
}
