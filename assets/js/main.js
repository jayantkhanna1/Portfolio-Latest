import { soundOn, setSound, soundRunning } from "./sound.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;

/* ---------- Header: solid past the hero, hides on the way down ---------- */
const header = $("[data-header]");
const menuBtn = $("[data-menu]");
const navPanel = $("[data-nav-panel]");
const navLinks = $$("[data-nav]");
const navMark = $("[data-nav-mark]");
const narrow = matchMedia("(max-width: 899px)");
let menuOpen = false, lenis = null;

function setMenu(open) {
  if (open !== menuOpen) fx(open ? "open" : "close");
  menuOpen = open;
  if (open) lenis?.stop(); else lenis?.start();
  header.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  $(".menu-label", menuBtn).textContent = open ? "Close" : "Menu";
  for (const el of [$("main"), $(".footer"), $(".skip")]) el.inert = open;
}
menuBtn.addEventListener("click", () => setMenu(!menuOpen));
navPanel.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menuOpen) { setMenu(false); menuBtn.focus(); }
});
narrow.addEventListener("change", () => setMenu(false));

/* ---------- Active section and the sliding nav marker ---------- */
let active = null;
function moveMark() {
  const link = navLinks.find((a) => a.dataset.nav === active);
  if (!link || narrow.matches) { navMark.style.opacity = 0; return; }
  navMark.style.opacity = 1;
  navMark.style.width = link.offsetWidth + "px";
  navMark.style.transform = `translateX(${link.offsetLeft}px)`;
}
function setActive(id) {
  if (id === active) return;
  active = id;
  for (const a of navLinks) {
    if (a.dataset.nav === id) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  }
  moveMark();
}
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
}, { rootMargin: "-45% 0px -54% 0px" });
$$("main > section[id], main > .stage").forEach((s) => spy.observe(s));
addEventListener("resize", moveMark, { passive: true });
document.fonts?.ready.then(moveMark);

/* ---------- Scroll work, at most once per frame ---------- */
const quote = $(".rows-quote");
const rowsSection = $("[data-rows]");
const fx = (name, rest) => document.dispatchEvent(new CustomEvent("fx", { detail: { name, ...rest } }));
const clamp = (v) => Math.min(1, Math.max(0, v));
let lastY = scrollY, ticking = false;
function onScroll() {
  ticking = false;
  const y = scrollY, vh = innerHeight;
  header.classList.toggle("is-solid", y > 40);
  if (Math.abs(y - lastY) > 6) {
    header.classList.toggle("is-hidden", y > lastY && y > vh * 0.6 && !menuOpen);
    lastY = y;
  }
  if (reduced) return;
  const r = rowsSection.getBoundingClientRect();
  if (r.top < vh && r.bottom > 0) {
    quote.style.setProperty("--a", clamp((vh * 0.3 - r.top) / (vh * 0.16)).toFixed(3));
    quote.style.setProperty("--b", clamp((vh * 0.13 - r.top) / (vh * 0.15)).toFixed(3));
  }
}
addEventListener("scroll", () => {
  if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
}, { passive: true });
onScroll();

/* ---------- Inertial scrolling (wheel only; touch keeps native physics) ---------- */
function scrollToHash(hash, immediate) {
  const el = hash === "#top" ? document.body : document.getElementById(hash.slice(1));
  if (!el) return false;
  const y = hash === "#top" ? 0 : el.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
  if (lenis) lenis.scrollTo(y, { immediate, duration: 1.5 });
  else scrollTo({ top: y, behavior: immediate || reduced ? "auto" : "smooth" });
  return true;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const hash = a.getAttribute("href");
  if (hash === "#main" || !scrollToHash(hash)) return;
  e.preventDefault();
  fx("whoosh");
  history.pushState(null, "", hash === "#top" ? location.pathname : hash);
  // Keep keyboard and screen-reader position in step with the view.
  const target = hash === "#top" ? $("#main") : $(hash);
  if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
  target.focus({ preventScroll: true });
});
addEventListener("popstate", () => scrollToHash(location.hash || "#top", true));
if (!reduced && canHover) {
  import("./vendor/lenis.js").then(({ default: Lenis }) => {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, autoRaf: true });
    if (menuOpen) lenis.stop();
  }).catch(() => {});
}

/* ---------- Headings: letters turn into place ---------- */
if (!reduced) {
  $$(".section-head h2, .contact-title").forEach((h) => {
    const text = h.textContent;
    h.innerHTML = `<span class="sr-only">${text}</span>`;
    const vis = document.createElement("span");
    vis.className = "letters";
    vis.ariaHidden = "true";
    let n = 0;
    for (const word of text.split(" ")) {
      const w = document.createElement("span");
      w.className = "word";
      for (const c of word) { const l = document.createElement("span"); l.textContent = c; l.style.setProperty("--n", n++); w.append(l); }
      vis.append(w, " ");
    }
    h.append(vis);
  });
}

/* ---------- Reveals, staggered among siblings ---------- */
const reveal = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting && e.boundingClientRect.top > 0) continue;
    e.target.classList.add("is-in");
    reveal.unobserve(e.target);
  }
}, { rootMargin: "0px 0px -8% 0px" });
$$("[data-reveal]").forEach((el) => {
  const sibs = [...el.parentElement.children].filter((c) => c.hasAttribute("data-reveal"));
  el.style.setProperty("--d", sibs.length > 1 ? sibs.indexOf(el) % 3 : 0);
  reveal.observe(el);
});
// Anything focused by keyboard must be visible, even mid-reveal.
document.addEventListener("focusin", (e) => e.target.closest?.("[data-reveal]")?.classList.add("is-in"));

/* ---------- Hero sculpture: loaded after first paint, skipped when data is tight ---------- */
const canvas = $("[data-sculpture]");
function loadSculpture() {
  if (navigator.connection?.saveData) return;
  import("./sculpture.js")
    .then((m) => m.mount(canvas, $("[data-stage]"), { still: reduced }))
    .catch(() => {});
}
if (document.readyState === "complete") loadSculpture();
else addEventListener("load", () => (window.requestIdleCallback || setTimeout)(loadSculpture));
if (canHover) {
  let moves = 0;
  const stop = new AbortController();
  $(".hero").addEventListener("pointermove", () => {
    if (++moves > 260) { $("[data-hint]").classList.add("is-done"); stop.abort(); }
  }, { passive: true, signal: stop.signal });
}

/* ---------- three.js scenes: fetched on the first scroll, one at a time ---------- */
function loadScenes() {
  if (navigator.connection?.saveData) return;
  const opts = { still: reduced };
  const jobs = [
    [$("[data-portrait]").parentElement, (m) => m.portrait($("[data-portrait]"), $(".portrait img"), opts)],
    [$("[data-ring]"), (m) => m.ring($("[data-ring]"), opts)],
    [$("[data-climb]"), (m) => m.climb($("[data-climb]"), opts)],
    [$("[data-balls]"), (m) => m.balls($("[data-balls]"), opts)],
    [$("[data-tunnel]"), (m) => { m.tunnel($("[data-tunnel]"), opts); onFlight(); }],
    [$("[data-cover]"), (m) => m.cover($("[data-cover]"), opts)],
    [document.body, (m) => m.swarm($("[data-swarm]"), $("[data-form]"), opts)],
  ];
  for (const [el, run] of jobs) {
    new IntersectionObserver(([e], o) => {
      if (!e.isIntersecting) return;
      o.disconnect();
      import("./scenes.js").then(run).catch(() => {});
    }, { rootMargin: "120% 0px" }).observe(el);
  }
}
addEventListener("scroll", loadScenes, { once: true, passive: true });

/* ---------- Sound ---------- */
const soundBtn = $("[data-sound]");
const paintSound = () => soundBtn.setAttribute("aria-pressed", String(soundOn()));
paintSound();
soundBtn.addEventListener("click", () => {
  setSound(!soundOn());
  paintSound();
  prompt.hidden = true;
  fx("gather");
});
// Browsers keep audio locked until a click or key press, so ask for one.
const prompt = $("[data-sound-prompt]");
if (soundOn()) setTimeout(() => { if (!soundRunning() && scrollY < innerHeight * 0.35) prompt.hidden = false; }, 2600);
prompt.addEventListener("click", () => { prompt.hidden = true; fx("gather"); });
setTimeout(() => { prompt.hidden = true; }, 14000);
addEventListener("scroll", () => { if (scrollY > innerHeight * 0.35) prompt.hidden = true; }, { passive: true });
document.addEventListener("soundstart", () => setTimeout(() => { prompt.hidden = true; }, 200));
document.addEventListener("click", (e) => {
  if (e.target.closest(".btn, .round, .filters button, .feature a, .cover, .story a, .quote-more, .socials a") && !e.target.closest("[data-submit]")) fx("click");
});

/* ---------- Magnetic buttons ---------- */
if (canHover && !reduced) {
  $$(".btn, .ring .round, .socials a").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.translate = `${((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1)}px ${((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1)}px`;
    });
    el.addEventListener("pointerleave", () => { el.style.translate = ""; });
  });
}

/* ---------- Numbers count up once ---------- */
if (!reduced) {
  const counter = new IntersectionObserver((entries) => {
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting) continue;
      counter.unobserve(target);
      const end = +target.dataset.n, t0 = performance.now(), len = target.dataset.n.length;
      let shown = -1;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 1300), n = Math.round(end * (1 - Math.pow(1 - k, 4)));
        if (n !== shown) { shown = n; target.textContent = String(n).padStart(len, "0"); }
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.6 });
  $$(".num").forEach((el) => { el.dataset.n = el.textContent; counter.observe(el); });
}

/* ---------- Pointer tilt ---------- */
if (canHover && !reduced) {
  $$("[data-tilt]").forEach((el) => {
    let frame = 0, box = null;
    el.addEventListener("pointerenter", () => { box = el.getBoundingClientRect(); });
    el.addEventListener("pointermove", (e) => {
      if (frame || !box) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const x = (e.clientX - box.left) / box.width - 0.5, y = (e.clientY - box.top) / box.height - 0.5;
        el.style.transform = `perspective(1400px) rotateX(${(-y * 3.4).toFixed(2)}deg) rotateY(${(x * 4.4).toFixed(2)}deg)`;
      });
    });
    el.addEventListener("pointerleave", () => { cancelAnimationFrame(frame); frame = 0; el.style.transform = ""; });
    addEventListener("scroll", () => { box = null; }, { passive: true });
  });
}

/* ---------- Resume: chapters, in step with the 3D climb ---------- */
const steps = $$(".steps [role=tab]"), chapters = $$(".chapter");
function selectStep(i, focus) {
  steps.forEach((b, n) => {
    b.setAttribute("aria-selected", String(n === i));
    b.tabIndex = n === i ? 0 : -1;
    chapters[n].classList.toggle("is-active", n === i);
  });
  if (focus) steps[i].focus({ preventScroll: true });
  fx("layer", { n: i });
  document.dispatchEvent(new CustomEvent("step", { detail: i }));
}
steps.forEach((b, i) => {
  b.addEventListener("click", () => selectStep(i));
  b.addEventListener("keydown", (e) => {
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    const to = d ? (i + d + steps.length) % steps.length : e.key === "Home" ? 0 : e.key === "End" ? steps.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    selectStep(to, true);
  });
});
document.addEventListener("pickstep", (e) => selectStep(e.detail));

/* ---------- Skills: highlight a group (the 3D scene listens) ---------- */
const groupBtns = $$("[data-group]");
let group = -1;
function setGroup(i) {
  group = i === group ? -1 : i;
  groupBtns.forEach((b, n) => b.setAttribute("aria-pressed", String(n === group)));
  $$(".skill-list > div").forEach((d, n) => d.classList.toggle("is-on", n === group));
  $("[data-group-status]").textContent = group < 0 ? "All skills" : $$(".skill-list > div")[group].innerText.replace(/\n+/g, ", ");
  fx("layer", { n: group < 0 ? 0 : 6 - group });
  document.dispatchEvent(new CustomEvent("group", { detail: group }));
}
groupBtns.forEach((b, i) => b.addEventListener("click", () => setGroup(i)));
document.addEventListener("pickgroup", (e) => setGroup(e.detail));

/* ---------- Parallax: every layer of the page at its own depth ---------- */
const layers = [];
let pageVh = innerHeight;
if (!reduced) {
  const depth = innerWidth < 760 ? 0.45 : 1;
  // selector -> how far (in viewport heights) it lags, sideways drift (in vw), or a list to alternate through
  // Neighbours always share a direction, so nothing is pushed into the text beside it.
  const plan = [
    [".section-head h2", [0.05], -1.2], [".section-head p", [0.05]],
    [".portrait", [0.05]], [".about-intro", [0.02]], [".about-body > div", [0.02, 0.05]], [".stats li", [0.01, 0.03, 0.05]],
    [".feature-2", [0.02]], [".feature-3", [0.08]], [".rail-head", [0.02]], [".contact-title", [0.04], -1.2], [".contact-side", [0.04]],
  ];
  for (const [sel, speeds, x = 0] of plan) $$(sel).forEach((el, i) => layers.push({ el, y: speeds[i % speeds.length] * depth, x: x * depth, top: 0, h: 0, now: null }));
}
function measureLayers() {
  pageVh = innerHeight;
  for (const l of layers) l.el.style.translate = "";
  for (const l of layers) { const r = l.el.getBoundingClientRect(); l.top = r.top + scrollY; l.h = r.height; l.now = null; }
  moveLayers();
}
function moveLayers() {
  if (!layersOn) return;
  const mid = scrollY + pageVh / 2;
  for (const l of layers) {
    const p = (l.top + l.h / 2 - mid) / pageVh;
    if (Math.abs(p) > 1.3 + l.h / pageVh / 2) continue;
    const k = Math.max(-1, Math.min(1, p));
    const next = `${(l.x * k).toFixed(2)}vw ${(l.y * k * pageVh).toFixed(1)}px`;
    if (next !== l.now) { l.now = next; l.el.style.translate = next; }
  }
}
// Set up on the first scroll or once idle, so it never delays the first paint.
let layersOn = false;
function startLayers() {
  if (layersOn || !layers.length) return;
  layersOn = true;
  let timer = 0;
  new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(measureLayers, 120); }).observe(document.body);
  measureLayers();
}
addEventListener("scroll", startLayers, { once: true, passive: true });
addEventListener("load", () => setTimeout(startLayers, 2500));

/* ---------- Reviews: fly through the cards ---------- */
const flight = $("[data-flight]"), cardsEls = $$(".flycard");
const N = cardsEls.length;
let flyPos = 0, flyGoal = 0, flyRaf = 0, flyPrev = 0, flyNear = -1;
function paintFlight() {
  const side = innerWidth < 760 ? 0 : Math.min(15, innerWidth / 90);
  cardsEls.forEach((c, n) => {
    const d = n - flyPos;
    // Parked cards stay in the tab order, so they are faded rather than hidden.
    if (d < -0.45 || d > 3.2) { if (c.style.opacity !== "0") { c.style.opacity = "0"; c.style.pointerEvents = "none"; c.style.transform = "translate(-50%, -50%) scale(.01)"; } return; }
    const z = d < 0 ? -d * 160 : -d * 1150, dir = n % 2 ? 1 : -1;
    // Each card arrives from its own side, pauses in focus, then passes by.
    const x = dir * side * (d > 0 ? 0.55 + d * 0.75 : 0.55), y = d > 0 ? d * 2 : -d * 260;
    c.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(2)}vw, ${y.toFixed(2)}vh, ${z.toFixed(0)}px) rotateY(${(-dir * Math.min(1, Math.abs(d)) * 16).toFixed(2)}deg)`;
    c.style.opacity = d < 0 ? 1 : Math.min(1, (3.2 - d) / 1.6).toFixed(3);
    // Cards waiting behind are blank, so their words never collide with the one being read.
    c.style.setProperty("--ink-on", Math.min(1, Math.max(0, (0.85 - d) / 0.2)).toFixed(2));
    c.style.zIndex = 20 - Math.round(d * 4);
    c.style.pointerEvents = Math.abs(d) < 0.45 ? "auto" : "none";
  });
  const near = Math.max(0, Math.min(N - 1, Math.round(flyPos)));
  if (near !== flyNear) { if (flyNear >= 0) fx("tick", { n: near + 2 }); flyNear = near; }
  $("[data-flight-bar]").style.transform = `scaleX(${((flyPos + 1) / N).toFixed(3)})`;
}
function flyTick(now) {
  const dt = Math.min(0.05, (now - flyPrev) / 1000);
  flyPrev = now;
  flyPos += (flyGoal - flyPos) * (1 - Math.exp(-9 * dt));
  if (Math.abs(flyGoal - flyPos) < 0.001) flyPos = flyGoal;
  paintFlight();
  flyRaf = flyPos === flyGoal ? 0 : requestAnimationFrame(flyTick);
}
function onFlight() {
  if (reduced) return;
  const r = flight.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
  // Linger on each card: ease within every step.
  const raw = p * (N - 1), step = Math.floor(raw), f = raw - step;
  flyGoal = step + f * f * f * (f * (f * 6 - 15) + 10);
  document.dispatchEvent(new CustomEvent("fly", { detail: raw }));
  if (!flyRaf && flyGoal !== flyPos) { flyPrev = performance.now(); flyRaf = requestAnimationFrame(flyTick); }
}
if (!reduced) {
  flight.classList.add("is-flying");
  addEventListener("scroll", onFlight, { passive: true });
  addEventListener("resize", () => { onFlight(); paintFlight(); }, { passive: true });
  requestAnimationFrame(() => { onFlight(); flyPos = flyGoal; paintFlight(); });
  // Keyboard users land on a card: bring the flight to it.
  cardsEls.forEach((c, n) => c.addEventListener("focusin", () => {
    if (Math.abs(flyGoal - n) < 0.3) return;
    const y = flight.getBoundingClientRect().top + scrollY + (n / (N - 1)) * (flight.offsetHeight - innerHeight);
    if (lenis) lenis.scrollTo(y, { duration: 0.8 }); else scrollTo(0, y);
  }));
}
addEventListener("scroll", moveLayers, { passive: true });

const dialog = $("[data-review-dialog]");
let opener = null;
$$(".quote-more").forEach((b) => b.addEventListener("click", () => {
  const card = b.closest(".flycard");
  opener = b;
  $("[data-review-body]").innerHTML = $(".quote-full", card).innerHTML;
  $("[data-review-name]").textContent = $("strong", card).textContent;
  $("[data-review-role]").textContent = $(".quote-by span", card).textContent;
  dialog.style.setProperty("--c", card.dataset.tint);
  dialog.showModal();
  dialog.scrollTop = 0;
  lenis?.stop();
}));
$("[data-review-close]").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
dialog.addEventListener("close", () => { lenis?.start(); opener?.focus({ preventScroll: true }); fx("close"); });

/* ---------- Blog rail ---------- */
const railList = $("[data-rail-list]");
$$("[data-rail]").forEach((b) => b.addEventListener("click", () => {
  fx("tick", { n: +b.dataset.rail > 0 ? 5 : 3 });
  railList.scrollBy({ left: +b.dataset.rail * $(".story", railList).offsetWidth * 1.05, behavior: reduced ? "auto" : "smooth" });
}));

/* ---------- Contact form: posts to Formspree in place ---------- */
const form = $("[data-form]");
const status = $("[data-form-status]");
const submit = $("[data-submit]");
const fields = $$("input[required], textarea[required]", form);
form.noValidate = true;

function check(field) {
  const ok = field.checkValidity();
  field.setAttribute("aria-invalid", String(!ok));
  $("[data-error]", field.closest(".field")).textContent = ok ? ""
    : field.validity.typeMismatch ? "That doesn't look like an email address."
    : { fullname: "Please add your name.", email: "Please add your email so I can reply.", message: "Please finish the sentence." }[field.name];
  return ok;
}
fields.forEach((f) => f.addEventListener("input", () => { if (f.hasAttribute("aria-invalid")) check(f); }));

let sending = false;
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (sending) return;
  const bad = fields.filter((f) => !check(f));
  if (bad.length) { fx("error"); bad[0].focus(); return; }
  sending = true;
  submit.setAttribute("aria-disabled", "true");
  status.classList.remove("is-error");
  status.textContent = "Sending…";
  try {
    const res = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(res.status);
    form.reset();
    form.dispatchEvent(new Event("sent"));
    fx("success");
    fields.forEach((f) => f.removeAttribute("aria-invalid"));
    status.textContent = "Message sent. I'll reply by email.";
  } catch {
    status.classList.add("is-error");
    fx("error");
    status.textContent = "That didn't send. Try again, or email jayantkhanna3105@gmail.com.";
  }
  sending = false;
  submit.removeAttribute("aria-disabled");
});
