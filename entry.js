/* A cooperative opening scene; each door responds to its own crew member. */
(() => {
  function entryPhaseAt(ms) {
    if (ms < 450) return 'ready';
    if (ms < 1150) return 'strain';
    if (ms < 1530) return 'recoil';
    if (ms < 2070) return 'call';
    if (ms < 2770) return 'help';
    if (ms < 3130) return 'reach';
    if (ms < 3350) return 'grip';
    if (ms < 3650) return 'brace';
    if (ms < 4210) return 'together';
    return 'reveal';
  }
  const smooth = value => {
    const p = Math.min(1, Math.max(0, value));
    return p * p * (3 - 2 * p);
  };
  function helperRopeAt(ms) {
    // Contact occurs at the end of reaching, before the wrist lifts the rope.
    return { attachment: smooth((ms - 3030) / 100), load: smooth((ms - 3350) / 300) };
  }
  function helperActivityAt(ms) {
    if (ms < 1530) return 'phone';
    if (ms < 1700) return 'look';
    if (ms < 1890) return 'pocket';
    if (ms < 2070) return 'turn';
    return 'active';
  }
  function ropePath(anchor, end, sag) {
    return `M${anchor.x.toFixed(2)},${anchor.y.toFixed(2)} Q${((anchor.x + end.x) / 2).toFixed(2)},${((anchor.y + end.y) / 2 + sag).toFixed(2)} ${end.x.toFixed(2)},${end.y.toFixed(2)}`;
  }
  function advancePeel(state, target, elapsed) {
    // Small substeps keep damping consistent on 60/120Hz displays and slow frames.
    let remaining = Math.min(Math.max(elapsed, 0), 64) / (1000 / 60);
    let { x, v } = state;
    while (remaining > 0) {
      const dt = Math.min(remaining, .5);
      v = (v + (target - x) * .041 * dt) * Math.pow(.81, dt);
      x += v * dt;
      remaining -= dt;
    }
    return { x, v };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { entryPhaseAt, advancePeel, helperRopeAt, helperActivityAt, ropePath };
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const screen = document.getElementById('entryScreen');
  if (!screen || !root.classList.contains('entry-running')) return;
  screen.dataset.helper = helperActivityAt(0);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pageParts = [...document.body.children]
    .filter(node => node !== screen && node.tagName !== 'SCRIPT')
    .map(node => ({ node, inert: Boolean(node.inert) }));
  pageParts.forEach(({ node }) => { node.inert = true; });
  const events = new AbortController();
  let done = false, released = false, navStarted = false, assisted = false;
  let start = null, previous = null, offset = 0, elapsed = 0, frame = 0;
  let leftSpring = { x: 0, v: 0 }, rightSpring = { x: 0, v: 0 };
  const ropes = [...screen.querySelectorAll('.entry-film')].map(film => ({
    svg: film.querySelector('.entry-tether'),
    anchor: film.querySelector('.entry-grip'),
    contact: film.querySelector('.crew-rope-contact'),
    paths: [...film.querySelectorAll('.entry-tether path')],
    helper: film.classList.contains('entry-film--right')
  }));
  const safetyTimer = setTimeout(() => finish(true), 8000);
  const allowPage = () => pageParts.forEach(({ node, inert }) => { node.inert = inert; });

  function finish(skip = false, focusBrand = false) {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    clearTimeout(safetyTimer);
    events.abort();
    const heldFocus = screen.contains(document.activeElement);
    root.classList.remove('entry-running', 'entry-revealing');
    if (skip) {
      root.classList.remove('nav-intro-running', 'nav-intro-compact');
      document.dispatchEvent(new Event('portfolio:nav-intro-cancel'));
    }
    allowPage();
    if (focusBrand || heldFocus) {
      // Finishing the gate must not focus the header and cancel its ongoing journey.
      // A keyboard skip lands on "Skip to content", so the very next Enter reaches the page.
      const target = focusBrand === 'skip-link' ? '.skip-link' : skip || focusBrand ? '.site-brand' : '#mainContent';
      document.querySelector(target)?.focus({ preventScroll: true });
    }
  }

  function updateRopes(phase) {
    const small = innerWidth <= 700;
    const { attachment, load } = helperRopeAt(elapsed);
    // Screen-space rectangles account for CSS mirroring and animated SVG joints.
    // A tiny marker inside the palm keeps the round rope cap inside the fingers.
    const shapes = ropes.map(({ svg, anchor, contact, paths, helper }) => {
      if (!svg || !anchor || !contact || !paths.length) return null;
      const box = svg.getBoundingClientRect(), grip = anchor.getBoundingClientRect(), hand = contact.getBoundingClientRect();
      const a = { x: grip.left + grip.width / 2 - box.left, y: grip.top + grip.height / 2 - box.top };
      const palm = { x: hand.left + hand.width / 2 - box.left, y: hand.top + hand.height / 2 - box.top };
      const rest = { x: small ? 64 : 111, y: a.y + (small ? 12 : 21) };
      const end = helper ? { x: rest.x + (palm.x - rest.x) * attachment, y: rest.y + (palm.y - rest.y) * attachment } : palm;
      const sag = helper ? (small ? 18 : 29) * (1 - load) + 2 : ['strain', 'together', 'reveal'].includes(phase) ? 2 : small ? 7 : 12;
      return { paths, d: ropePath(a, end, sag) };
    });
    // Write after all measurements to avoid repeated layout work within the frame.
    shapes.forEach(shape => shape?.paths.forEach(path => path.setAttribute('d', shape.d)));
  }

  function tick(now) {
    if (done) return;
    if (reduced.matches || document.hidden) { finish(true); return; }
    if (start === null) start = now;
    const dt = previous === null ? 0 : now - previous;
    previous = now;
    elapsed = now - start + offset;
    const phase = entryPhaseAt(elapsed);
    if (screen.dataset.phase !== phase) screen.dataset.phase = phase;
    const helper = helperActivityAt(elapsed);
    if (screen.dataset.helper !== helper) screen.dataset.helper = helper;
    if (phase === 'reveal' && !released) {
      released = true;
      root.classList.add('entry-revealing');
    }
    // Ease the destination itself: the film gains momentum instead of snapping toward a distant target.
    const progress = Math.min(1, Math.max(0, (elapsed - 4210) / 1000));
    const release = progress ** 3 * (progress * (progress * 6 - 15) + 10);
    const sharedTarget = released ? 15 + (innerWidth * .56 + 50 - 15) * release
      : phase === 'together' ? 20 : 0;
    leftSpring = advancePeel(leftSpring, phase === 'strain' ? 12 : sharedTarget, dt);
    rightSpring = advancePeel(rightSpring, sharedTarget, dt);
    const leftOpening = Math.max(0, leftSpring.x), rightOpening = Math.max(0, rightSpring.x);
    screen.style.setProperty('--entry-peel-left', `${leftOpening.toFixed(2)}px`);
    screen.style.setProperty('--entry-peel-right', `${rightOpening.toFixed(2)}px`);
    updateRopes(phase);
    // Begin inside a substantial opening; the opaque doors occlude the rest.
    const opening = Math.min(leftOpening, rightOpening);
    if (released && opening >= innerWidth * .24 && !navStarted) {
      navStarted = true;
      document.dispatchEvent(new Event('portfolio:nav-intro-start'));
    }
    // Never remove a door while it still covers part of the viewport.
    if (navStarted && elapsed >= 5810 && opening >= innerWidth / 2 + 2) { finish(); return; }
    frame = requestAnimationFrame(tick);
  }

  const listen = (target, type, listener, options = {}) => target?.addEventListener(type, listener, { ...options, signal: events.signal });
  listen(document.getElementById('entrySkip'), 'click', () => finish(true, true));
  // Quick links in the masthead: end the intro, then let the link do its normal navigation.
  screen.querySelectorAll('.entry-quick a').forEach(link => listen(link, 'click', () => finish(true)));
  listen(document.getElementById('entryAssist'), 'click', () => {
    if (released || done || assisted) return;
    assisted = true;
    screen.dataset.assisted = 'true';
    // Help is optional: acknowledge the gesture and bring the teammate in sooner.
    if (elapsed < 1530) { offset += 1530 - elapsed; elapsed = 1530; }
    leftSpring.v += 1.8;
    screen.dataset.phase = entryPhaseAt(elapsed);
    screen.dataset.helper = helperActivityAt(elapsed);
  });
  listen(document, 'keydown', event => {
    if (event.key !== 'Tab' && event.key !== 'Escape') return;
    if (event.key === 'Tab') event.preventDefault();
    finish(true, event.key === 'Tab' ? 'skip-link' : false);
  }, { capture: true });
  listen(window, 'wheel', () => finish(true), { passive: true });
  listen(window, 'scroll', () => { if (scrollY > 20) finish(true); }, { passive: true });
  listen(document, 'visibilitychange', () => { if (document.hidden) finish(true); });
  listen(window, 'pageshow', event => { if (event.persisted) finish(true); });
  listen(reduced, 'change', () => { if (reduced.matches) finish(true); });
  // The same header already exists behind the closed doors before any pulling begins.
  document.dispatchEvent(new Event('portfolio:nav-seed-prepare'));
  frame = requestAnimationFrame(tick);
})();
