/* The visible capsule has its own grab surface; links remain the keyboard path. */
(() => {
  const nav = document.querySelector('.site-nav');
  const glass = nav?.querySelector('.nav-section-glass');
  const grab = nav?.querySelector('.nav-glass-grab');
  if (!nav || !glass || !grab) return;
  const links = [...nav.querySelectorAll('a[href="#work"],a[href="#skills"],a[href="#experience"]')];
  if (links.length !== 3) return;
  const sections = [...document.querySelectorAll('#work,#skills,#experience,#process,#contact')];
  const desktop = matchMedia('(min-width:900px)');
  const fine = matchMedia('(hover:hover) and (pointer:fine)');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  const reducedTransparency = matchMedia('(prefers-reduced-transparency:reduce)');
  const forcedColors = matchMedia('(forced-colors:active)');
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const state = { x: 0, width: 0, stretch: 1, vx: 0, vw: 0, vs: 0, tx: 0, tw: 0, ts: 1,
    lightX: .35, lightY: .18, vlx: 0, vly: 0, tlx: .35, tly: .18, pressure: 0, vp: 0, tp: 0,
    bend: 0, vb: 0, tb: 0, magnet: 0 };
  let frame = 0, readingFrame = 0, previous = 0, visible = false, drag = null;
  let pending = null, pendingTimer = 0;
  let arrival = null, sweepAnimation = null;
  nav.classList.add('has-glass-indicator');
  const supportsMask = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' &&
    (CSS.supports('mask-image', 'linear-gradient(black,transparent)') || CSS.supports('-webkit-mask-image', 'linear-gradient(black,transparent)'));
  // Only three decorative labels are sampled. Semantic links, their focus
  // outlines and hit areas remain the real navigation; no page capture is used.
  const optics = document.createElement('span'); optics.className = 'nav-glass-optics';
  optics.setAttribute('aria-hidden', 'true');
  const opticalScene = document.createElement('span'); opticalScene.className = 'nav-optic-scene';
  optics.append(opticalScene); glass.prepend(optics);
  const rim = document.createElement('span'); rim.className = 'nav-glass-rim'; rim.setAttribute('aria-hidden','true'); glass.append(rim);
  const sweep = document.createElement('span'); sweep.className = 'nav-glass-arrival'; sweep.setAttribute('aria-hidden','true'); glass.append(sweep);
  const samples = links.map(link => {
    let label = link.querySelector('.nav-label');
    if (!label) { label = document.createElement('span'); label.className = 'nav-glass-label'; label.textContent = link.textContent; link.replaceChildren(label); }
    label.classList.add('nav-optic-source');
    const word = document.createElement('span'); word.className = 'nav-optic-word'; opticalScene.append(word);
    return { link, label, word, labelX: 0, labelWidth: 0, box: null };
  });
  const opticalEnabled = () => supportsMask && desktop.matches && !reduced.matches && !reducedTransparency.matches && !forcedColors.matches;

  const box = link => ({ x: link.offsetLeft, y: link.offsetTop, width: link.offsetWidth, height: link.offsetHeight });
  function measureOptics() {
    const navLeft = nav.getBoundingClientRect().left;
    for (const sample of samples) {
      const bounds = box(sample.link), label = sample.label.getBoundingClientRect(), font = getComputedStyle(sample.link);
      sample.box = bounds; sample.labelX = label.left - navLeft; sample.labelWidth = label.width;
      sample.word.textContent = sample.link.getAttribute('aria-label') || sample.label.querySelector('span')?.textContent || sample.label.textContent;
      Object.assign(sample.word.style, { left: `${bounds.x}px`, top: '0px', width: `${bounds.width}px`, height: `${bounds.height}px`,
        fontFamily: font.fontFamily, fontSize: font.fontSize, fontWeight: font.fontWeight, letterSpacing: font.letterSpacing, lineHeight: '1.2' });
    }
    opticalScene.style.width = `${nav.offsetWidth || nav.getBoundingClientRect().width}px`;
  }
  function paintOptics() {
    const enabled = opticalEnabled() && visible;
    nav.classList.toggle('has-refractive-optics', enabled);
    if (!enabled) return;
    const zoom = 1.015 + .095 * state.pressure + clamp(Math.abs(state.vx) * .003, 0, .035);
    // The sample plane remains anchored to the actual nav while the lens moves.
    // Magnification applies only inside its capsule, with no doubled base text.
    const left = state.x + state.width * (1 - state.stretch) / 2 + Math.min(0, state.bend);
    const right = state.x + state.width * (1 + state.stretch) / 2 + Math.max(0, state.bend);
    const visualX = state.x + state.bend / 2;
    opticalScene.style.transformOrigin = `${visualX + state.width / 2}px ${(parseFloat(glass.style.height) || 42) / 2}px`;
    opticalScene.style.transform = `translate3d(${(-visualX - 1).toFixed(2)}px,-1px,0) scale(${zoom.toFixed(4)})`;
    for (const sample of samples) {
      const low = clamp(left - sample.labelX, 0, sample.labelWidth);
      const high = clamp(right - sample.labelX, low, sample.labelWidth);
      sample.label.style.setProperty('--glass-cut-left', `${low.toFixed(2)}px`);
      sample.label.style.setProperty('--glass-cut-right', `${high.toFixed(2)}px`);
    }
    glass.style.setProperty('--glass-zoom', zoom.toFixed(4));
  }
  function paint() {
    const width = `${Math.max(0, state.width).toFixed(2)}px`;
    // Advance the leading edge only. The trailing edge follows via the spring;
    // sampling and the grab surface share exactly the same deformed bounds.
    const scale = state.stretch + Math.abs(state.bend) / Math.max(1, state.width);
    const transform = `translate3d(${(state.x + state.bend / 2).toFixed(2)}px,0,0) scaleX(${scale.toFixed(3)})`;
    glass.style.width = grab.style.width = width;
    glass.style.transform = grab.style.transform = transform;
    glass.style.setProperty('--glass-refraction-x', `${clamp(state.vx * 1.6, -7, 7).toFixed(2)}px`);
    glass.style.setProperty('--glass-light-x', `${(state.lightX * 100).toFixed(2)}%`);
    glass.style.setProperty('--glass-light-y', `${(state.lightY * 100).toFixed(2)}%`);
    glass.style.setProperty('--glass-pressure', state.pressure.toFixed(4));
    glass.style.setProperty('--glass-bend', state.bend.toFixed(3));
    glass.style.setProperty('--glass-magnet', state.magnet.toFixed(3));
    const radius = (parseFloat(glass.style.height) || 42) / 2;
    nav.style.setProperty('--glass-cap-left', `${(radius - state.bend * .45).toFixed(2)}px`);
    nav.style.setProperty('--glass-cap-right', `${(radius + state.bend * .45).toFixed(2)}px`);
    glass.style.setProperty('--glass-rim-angle', `${(140 + (state.lightX - .5) * 65 + clamp(state.vx * 2.5, -24, 24)).toFixed(2)}deg`);
    paintOptics();
  }
  function settle() {
    Object.assign(state, { x: state.tx, width: state.tw, stretch: state.ts, vx: 0, vw: 0, vs: 0,
      lightX: state.tlx, lightY: state.tly, vlx: 0, vly: 0, pressure: state.tp, vp: 0, bend: state.tb, vb: 0 });
  }
  function stop() { cancelAnimationFrame(frame); frame = 0; previous = 0; }
  function tick(time) {
    frame = 0;
    if (!desktop.matches || document.hidden) { stop(); return; }
    const dt = previous ? clamp((time - previous) / 16.67, .25, 2) : 1;
    previous = time;
    for (const [value, velocity, target, strength, damping] of [
      ['x', 'vx', 'tx', drag?.moving ? .26 : .19, .72],
      ['width', 'vw', 'tw', .18, .74],
      ['stretch', 'vs', 'ts', .23, .69],
      ['bend', 'vb', 'tb', .15, .72],
      ['lightX', 'vlx', 'tlx', .12, .74], ['lightY', 'vly', 'tly', .12, .74], ['pressure', 'vp', 'tp', .23, .69]
    ]) {
      if (value === 'stretch' && drag?.moving) state.ts = 1 + clamp(Math.abs(state.vx) * .004, 0, .045);
      if (value === 'bend') state.tb = drag?.moving ? clamp(state.vx * .55, -5, 5) : 0;
      state[velocity] = (state[velocity] + (state[target] - state[value]) * strength * dt) * Math.pow(damping, dt);
      state[value] += state[velocity] * dt;
    }
    paint();
    const moving = Math.abs(state.x - state.tx) > .08 || Math.abs(state.vx) > .04 ||
      Math.abs(state.width - state.tw) > .08 || Math.abs(state.vw) > .04 ||
      Math.abs(state.stretch - state.ts) > .001 || Math.abs(state.vs) > .001 ||
      Math.abs(state.bend - state.tb) > .025 || Math.abs(state.vb) > .015 ||
      Math.abs(state.lightX - state.tlx) > .002 || Math.abs(state.vlx) > .001 ||
      Math.abs(state.lightY - state.tly) > .002 || Math.abs(state.vly) > .001 ||
      Math.abs(state.pressure - state.tp) > .002 || Math.abs(state.vp) > .001;
    if (moving) frame = requestAnimationFrame(tick);
    else { settle(); paint(); previous = 0; maybeArrive(); }
  }
  function wake() {
    if (reduced.matches) {
      stop(); settle(); paint(); maybeArrive(); return;
    }
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function positionAt(link, immediate = false) {
    const target = box(link);
    if (!desktop.matches || !target.width) {
      glass.classList.remove('is-visible'); grab.classList.remove('is-visible'); visible = false; paintOptics(); return;
    }
    glass.style.top = grab.style.top = `${target.y}px`;
    glass.style.height = grab.style.height = `${target.height}px`;
    state.tx = target.x; state.tw = target.width; state.ts = 1; state.tb = 0; state.magnet = 0;
    if (immediate || !visible) {
      stop(); Object.assign(state, { x: state.tx, width: state.tw, stretch: 1, vx: 0, vw: 0, vs: 0, bend: 0, vb: 0 }); paint();
    } else wake();
    visible = true;
    glass.classList.add('is-visible');
    grab.classList.add('is-visible');
    paintOptics();
    scheduleProgress();
  }
  function activeLink() { return links.find(link => link.getAttribute('aria-current') === 'location'); }
  function paintProgress() {
    readingFrame = 0;
    if (!desktop.matches || document.hidden || !visible) return;
    const link = pending || activeLink();
    const index = sections.findIndex(section => `#${section.id}` === link?.getAttribute('href'));
    let progress = 0;
    if (index >= 0 && !drag) {
      const bounds = sections[index].getBoundingClientRect();
      const next = sections[index + 1];
      const distance = next ? next.getBoundingClientRect().top - bounds.top : bounds.height - innerHeight * .66;
      // Match motion.js's section-selection line; include the space before the next section.
      progress = clamp((innerHeight * .34 - bounds.top) / Math.max(1, distance), 0, 1);
    }
    const value = progress.toFixed(4);
    if (glass.style.getPropertyValue('--section-progress') !== value) glass.style.setProperty('--section-progress', value);
  }
  function scheduleProgress() {
    if (desktop.matches && !document.hidden && !readingFrame) readingFrame = requestAnimationFrame(paintProgress);
  }
  function sync() {
    if (drag || pending) return;
    measureOptics();
    const active = activeLink();
    if (active) positionAt(active);
    else { glass.classList.remove('is-visible'); grab.classList.remove('is-visible'); visible = false; stop(); paintOptics(); }
  }
  function nearest(clientX) {
    const left = nav.getBoundingClientRect().left;
    return links.reduce((best, link) => {
      const size = box(link);
      const distance = Math.abs(clientX - (left + size.x + size.width / 2));
      return !best || distance < best.distance ? { link, size, distance } : best;
    }, null);
  }
  function clearPreview() { links.forEach(link => link.classList.remove('is-glass-preview')); }
  function stopSweep() { sweepAnimation?.cancel(); sweepAnimation = null; }
  function maybeArrive() {
    if (!arrival?.ready || drag || document.hidden || !visible) return;
    if (!opticalEnabled()) { arrival = null; return; }
    if (activeLink() !== arrival.link) return;
    const target = box(arrival.link);
    if (Math.abs(state.x - target.x) > .15 || Math.abs(state.width - target.width) > .15 ||
        Math.abs(state.vx) > .04 || Math.abs(state.vw) > .04 ||
        Math.abs(state.stretch - 1) > .001 || Math.abs(state.vs) > .001 ||
        Math.abs(state.bend) > .05 || Math.abs(state.vb) > .015 ||
        Math.abs(state.pressure) > .015 || Math.abs(state.vp) > .002) return;
    arrival = null;
    if (typeof sweep.animate !== 'function') return;
    stopSweep();
    sweepAnimation = sweep.animate([
      { backgroundPosition: '100% 50%', opacity: 0 },
      { backgroundPosition: '65% 50%', opacity: .72, offset: .35 },
      { backgroundPosition: '0% 50%', opacity: 0 }
    ], { duration: 270, easing: 'cubic-bezier(.22,1,.36,1)' });
    const current = sweepAnimation;
    current.onfinish = () => { if (sweepAnimation === current) sweepAnimation = null; };
  }
  function releasePending() {
    clearTimeout(pendingTimer); pendingTimer = 0; pending = null;
    if (arrival && activeLink() === arrival.link) arrival.ready = true;
    else arrival = null;
    sync(); maybeArrive();
  }
  function lockTo(link) {
    stopSweep();
    arrival = link !== activeLink() ? { link, ready: false } : null;
    pending = link;
    positionAt(link);
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(releasePending, 1200);
  }
  function cancelDrag() {
    if (!drag) return;
    drag = null; state.tb = 0; state.magnet = 0; arrival = null;
    resetLight(); nav.classList.remove('is-dragging', 'is-grabbing', 'is-grab-hover'); clearPreview(); sync();
  }
  function resetLight() { state.tlx = .35; state.tly = .18; state.tp = 0; wake(); }
  function followLight(event) {
    if (!opticalEnabled() || !fine.matches) return;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    const bounds = grab.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    state.tlx = clamp((event.clientX - bounds.left) / bounds.width, .05, .95);
    state.tly = clamp((event.clientY - bounds.top) / bounds.height, .05, .85);
    wake();
  }
  const observer = new MutationObserver(sync);
  links.forEach(link => observer.observe(link, { attributes: true, attributeFilter: ['aria-current'] }));
  grab.addEventListener('pointerenter', event => { nav.classList.add('is-grab-hover'); followLight(event); });
  grab.addEventListener('pointerleave', () => { if (!drag) { nav.classList.remove('is-grab-hover'); resetLight(); } });
  grab.addEventListener('pointermove', event => { if (!drag) followLight(event); });
  grab.addEventListener('pointerdown', event => {
    const active = activeLink();
    if (!desktop.matches || !fine.matches || event.button !== 0 || !active ||
        document.documentElement.classList.contains('entry-running') ||
        document.documentElement.classList.contains('nav-intro-running')) return;
    event.preventDefault();
    clearTimeout(pendingTimer); pendingTimer = 0; pending = null; arrival = null; stopSweep();
    grab.setPointerCapture?.(event.pointerId);
    drag = { origin: active, id: event.pointerId, startX: event.clientX, moving: false,
      offset: event.clientX - nav.getBoundingClientRect().left - (state.x + state.width / 2 + state.bend / 2) };
    nav.classList.add('is-grabbing');
    if (opticalEnabled()) { state.tp = 1; followLight(event); }
    if (!reduced.matches) { state.ts = .955; wake(); }
  });
  addEventListener('pointermove', event => {
    if (!drag || (event.pointerId !== undefined && drag.id !== undefined && event.pointerId !== drag.id)) return;
    const distance = event.clientX - drag.startX;
    followLight(event);
    if (!drag.moving && Math.abs(distance) < 6) return;
    if (!drag.moving) { drag.moving = true; nav.classList.add('is-dragging'); }
    event.preventDefault();
    const first = box(links[0]), last = box(links[links.length - 1]);
    const navLeft = nav.getBoundingClientRect().left;
    const rawCenter = clamp(event.clientX - navLeft - drag.offset,
      first.x + first.width / 2, last.x + last.width / 2);
    const preview = nearest(navLeft + rawCenter);
    clearPreview(); preview.link.classList.add('is-glass-preview');
    const targetCenter = preview.size.x + preview.size.width / 2;
    const error = targetCenter - rawCenter;
    const radius = Math.min(14, preview.size.width * .2);
    const field = clamp(1 - (error / radius) ** 2, 0, 1);
    // A bounded attraction (at most ~1.9px) creates a detent, not an early snap.
    const center = rawCenter + error * .34 * field;
    state.tw = preview.size.width;
    state.tx = center - state.tw / 2;
    state.magnet = field;
    if (reduced.matches) { state.ts = 1; state.tb = 0; }
    wake();
  }, { passive: false });
  addEventListener('pointerup', event => {
    if (!drag || (event.pointerId !== undefined && drag.id !== undefined && event.pointerId !== drag.id)) return;
    const { moving, origin, offset } = drag;
    drag = null; state.tb = 0; state.magnet = 0; resetLight(); nav.classList.remove('is-dragging', 'is-grabbing', 'is-grab-hover'); clearPreview();
    if (!moving) { origin.click(); return; }
    const selected = nearest(event.clientX - offset).link;
    lockTo(selected);
    if (!reduced.matches) { state.vs = clamp(state.vs - .042, -.075, .075); wake(); }
    const hash = selected.getAttribute('href');
    const section = document.querySelector(hash);
    if (section) {
      if (location.hash !== hash) history.pushState(history.state, '', hash);
      section.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' });
    }
  });
  addEventListener('pointercancel', cancelDrag);
  addEventListener('blur', cancelDrag);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { arrival = null; stopSweep(); cancelDrag(); stop(); cancelAnimationFrame(readingFrame); readingFrame = 0; }
    else sync();
  });
  nav.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    if (link && links.includes(link)) lockTo(link);
  });
  addEventListener('scrollend', () => { if (pending) releasePending(); });
  addEventListener('scroll', scheduleProgress, { passive: true });
  addEventListener('resize', () => { arrival = null; stopSweep(); cancelDrag(); sync(); }, { passive: true });
  desktop.addEventListener('change', () => { arrival = null; stopSweep(); cancelDrag(); sync(); });
  function preferenceChange() { arrival = null; stopSweep(); cancelDrag(); state.tp = 0; state.tb = 0; stop(); settle(); paint(); sync(); }
  reduced.addEventListener('change', preferenceChange);
  reducedTransparency.addEventListener('change', preferenceChange);
  forcedColors.addEventListener('change', preferenceChange);
  document.fonts?.ready.then(sync);
  sync();
})();
