/* Depth ambient: sun shafts that fade as the visitor descends, and suspended motes
   that grow more present in deep water. Reads --water-depth written by chapter-scroll.js. */
(() => {
  const page = document.body;
  if (!page || !window.HTMLCanvasElement) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const mobile = matchMedia('(max-width: 700px)');

  const rays = document.createElement('div');
  rays.className = 'depth-rays';
  rays.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  canvas.className = 'depth-motes';
  canvas.setAttribute('aria-hidden', 'true');
  page.prepend(rays, canvas);
  const context = canvas.getContext('2d');
  if (!context) return;

  const FRAME_MS = 40;
  let motes = [];
  let width = 0, height = 0, ratio = 1;
  let timer = 0, lastTime = 0, lastScroll = window.scrollY || 0, lastPaintedDepth = -1;

  const readDepth = () => {
    const value = parseFloat(page.style.getPropertyValue('--water-depth'));
    return Number.isFinite(value) ? value : 0;
  };
  function seed() {
    const count = mobile.matches ? 22 : 44;
    motes = Array.from({ length: count }, () => {
      const z = .35 + Math.random() * .65;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        z,
        radius: .55 + z * 1.55,
        rise: 3 + z * 9,
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: .25 + Math.random() * .35,
        twinkle: Math.random() * Math.PI * 2
      };
    });
  }
  function resize() {
    const widthChanged = innerWidth !== width;
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Mobile toolbars change only the height while scrolling; keep the same motes then.
    if (widthChanged || !motes.length) seed();
  }
  function draw(depth, seconds) {
    context.clearRect(0, 0, width, height);
    // Near the surface the motes are faint sun-flecks; in the deep they become pale plankton.
    const presence = .3 + .5 * Math.min(1, depth * 1.25);
    const warm = Math.max(0, 1 - depth * 2);
    const r = Math.round(196 + 59 * warm), g = Math.round(236 + 14 * warm), b = Math.round(242 - 22 * warm);
    for (const mote of motes) {
      const flicker = .72 + .28 * Math.sin(seconds * .9 + mote.twinkle);
      const alpha = presence * (.35 + .65 * mote.z) * flicker;
      const x = mote.x + Math.sin(seconds * mote.swaySpeed + mote.swayPhase) * 6 * mote.z;
      if (mote.z > .82) {
        context.fillStyle = `rgba(${r},${g},${b},${(alpha * .16).toFixed(3)})`;
        context.beginPath();
        context.arc(x, mote.y, mote.radius * 3.4, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
      context.beginPath();
      context.arc(x, mote.y, mote.radius, 0, Math.PI * 2);
      context.fill();
    }
  }
  function wrap(mote) {
    if (mote.y < -12) { mote.y += height + 24; mote.x = Math.random() * width; }
    else if (mote.y > height + 12) { mote.y -= height + 24; mote.x = Math.random() * width; }
  }
  function syncRays(depth) { rays.classList.toggle('is-dormant', depth > .46); }

  function tick() {
    timer = 0;
    if (document.hidden || reduced.matches || forced.matches) return;
    const now = performance.now();
    const dt = lastTime ? Math.min(.1, (now - lastTime) / 1000) : FRAME_MS / 1000;
    lastTime = now;
    for (const mote of motes) { mote.y -= mote.rise * dt; wrap(mote); }
    const depth = readDepth();
    syncRays(depth);
    draw(depth, now / 1000);
    timer = setTimeout(tick, FRAME_MS);
  }
  function start() {
    if (timer || document.hidden || reduced.matches || forced.matches) return;
    lastTime = 0;
    timer = setTimeout(tick, FRAME_MS);
  }
  function stop() { clearTimeout(timer); timer = 0; }
  // Still frame for reduced motion: repaint only when the depth meaningfully changes.
  function paintStill() {
    const depth = readDepth();
    syncRays(depth);
    if (Math.abs(depth - lastPaintedDepth) < .04) return;
    lastPaintedDepth = depth;
    draw(depth, 0);
  }

  addEventListener('scroll', () => {
    const now = window.scrollY || 0;
    const delta = Math.max(-160, Math.min(160, now - lastScroll));
    lastScroll = now;
    if (reduced.matches) { paintStill(); return; }
    // Parallax: nearer motes slide further against the scroll, which reads as volume.
    for (const mote of motes) { mote.y -= delta * mote.z * .14; wrap(mote); }
  }, { passive: true });
  addEventListener('resize', () => { resize(); lastPaintedDepth = -1; if (reduced.matches) paintStill(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  reduced.addEventListener('change', () => { if (reduced.matches) { stop(); lastPaintedDepth = -1; paintStill(); } else start(); });
  forced.addEventListener('change', () => { if (forced.matches) stop(); else start(); });
  mobile.addEventListener('change', seed);

  resize();
  if (reduced.matches) paintStill(); else start();
})();
