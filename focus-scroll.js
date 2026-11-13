/* Homepage scroll focus: spotlight, count-up, reveal safety.
   1. Spotlight: in each section on screen, the item being read gets .is-focus: the one most
      visible between the sticky header and 85% of the viewport, with its centre nearest a
      reading line at 45%. Its neighbours in that section are gently de-emphasised
      (focus-scroll.css, wide screens with a mouse only). body.has-focus is set while any
      item is in focus. A deliberate mouse move or a keyboard focus takes over the spotlight
      until the reader scrolls on.
   2. Count-up: elements with [data-countup] count their numbers up from 0 once, when they
      come into view. The HTML already holds the final text and stays in the accessibility
      tree; the moving digits are an aria-hidden overlay that is removed when it lands.
   Everything here is enhancement. Without this script, or with reduced motion, the page
   shows every item at full strength and every number as written. */
(() => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;
  if (!body) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hasIO = 'IntersectionObserver' in window;

  /* 1. Spotlight ---------------------------------------------------------------------------- */
  const TARGETS = '.project-card,.more-card,.skill-row,.timeline-row,.cred-card,.process-list>li';
  const FOCUS_LINE = .45;      // reading line, as a share of the viewport height
  const BAND_END = .85;        // the reading band runs from under the sticky header to here
  const MIN_SHOWN = .35;       // an item needs this share of its height inside the band to count
  const HEAD_GONE = .75;       // an item whose top has slid under the header is on its way out
  const LINE_WEIGHT = .6;      // how much the distance of its centre from the line costs
  const ROW_TOLERANCE = 4;     // items whose tops are this close sit in one grid row
  const SCORE_TOLERANCE = .02; // ...and share the focus when their scores are this close

  let groups = new Map();      // section -> [targets]
  let allTargets = [];
  let liveSections = new Set();
  let sectionWatch = null;
  let frame = 0, dirty = false, running = false;
  let pointerTarget = null, pointerAnchorY = 0, keyTarget = null;
  const focused = new Set();
  const dimmed = new Set();

  function sectionOf(element) { return element.closest('section') || element.closest('main') || body; }

  function collect() {
    dirty = false;
    allTargets = [...document.querySelectorAll(TARGETS)];
    const next = new Map();
    allTargets.forEach(target => {
      const section = sectionOf(target);
      if (!next.has(section)) next.set(section, []);
      next.get(section).push(target);
    });
    // Drop classes from anything that left the page or the target list.
    focused.forEach(element => { if (!allTargets.includes(element)) { element.classList.remove('is-focus'); focused.delete(element); } });
    dimmed.forEach(section => { if (!next.has(section)) { section.classList.remove('fs-dim'); dimmed.delete(section); } });
    if (sectionWatch) {
      // Keep what is already known to be on screen so a re-read never flickers.
      groups.forEach((_, section) => { if (!next.has(section)) { sectionWatch.unobserve(section); liveSections.delete(section); } });
      next.forEach((_, section) => { if (!groups.has(section)) sectionWatch.observe(section); });
    } else liveSections = new Set(next.keys());
    groups = next;
  }

  // The sticky header covers the top of the screen; whatever sits under it is not being read.
  const header = document.querySelector('.site-header');
  function headerBottom(viewport) {
    if (!header) return 0;
    const rect = header.getBoundingClientRect();
    if (!rect.height || rect.bottom <= 0 || rect.top > viewport * .25) return 0;
    return Math.min(rect.bottom, viewport * .25);
  }

  // How much an item is being read right now: the share of it inside the reading band
  // (an item taller than the band counts by how much of the band it fills), less a cost for
  // its centre's distance from the reading line, less a step once its top is under the header.
  function score(rect, band, line, viewport) {
    const inside = Math.min(rect.bottom, band.bottom) - Math.max(rect.top, band.top);
    if (inside <= 0) return -Infinity;
    const share = Math.max(inside / rect.height, inside / (band.bottom - band.top));
    if (share < MIN_SHOWN) return -Infinity;
    const centre = (rect.top + rect.bottom) / 2;
    const headGone = rect.top < band.top - 2 && rect.bottom < band.bottom;
    return share * (headGone ? HEAD_GONE : 1) - LINE_WEIGHT * Math.abs(centre - line) / viewport;
  }

  function pickFocus(section, items, viewport, line, band) {
    const measured = [];
    const viewportWidth = innerWidth || document.documentElement.clientWidth || 1;
    let best = -Infinity, bestTop = 0;
    for (const element of items) {
      const rect = element.getBoundingClientRect();
      if (!rect.height || rect.bottom <= 0 || rect.top >= viewport) continue;
      // Cards scrolled sideways out of a carousel (phone rows) are not on screen;
      // a card only peeking in from the edge (under half its width) does not count either.
      if (rect.right <= 0 || rect.left >= viewportWidth) continue;
      const shown = Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);
      if (rect.width && shown < rect.width * .5) continue;
      const value = score(rect, band, line, viewport);
      measured.push({ element, value, top: rect.top });
      if (value > best) { best = value; bestTop = rect.top; }
    }
    if (!measured.length) return { focus: [], count: 0 };
    const visible = measured.map(item => item.element);
    const chosen = [keyTarget, pointerTarget].find(target => target && visible.includes(target));
    if (chosen) return { focus: [chosen], count: measured.length };
    // A sticky chapter (How I work) already knows which step is current.
    // It keeps the focus only while it is still being read (not once it has gone under the header).
    const current = !section.classList.contains('is-static') && measured.find(item => item.value > -Infinity && item.element.classList.contains('is-current'))?.element;
    if (current) return { focus: [current], count: measured.length };
    // Nothing in this section is far enough on screen to be the thing being read.
    if (best === -Infinity) return { focus: [], count: measured.length };
    // Items share the focus only when they sit side by side in one row (a grid row), never
    // when one ends just above the line and the next starts just below it.
    const row = measured.filter(item => item.value >= best - SCORE_TOLERANCE && Math.abs(item.top - bestTop) <= ROW_TOLERANCE);
    return { focus: row.map(item => item.element), count: measured.length };
  }

  function update() {
    frame = 0;
    if (!running) return;
    if (dirty) collect();
    if (pointerTarget && Math.abs(scrollY - pointerAnchorY) > 80) pointerTarget = null;
    const viewport = innerHeight || 1;
    const line = viewport * FOCUS_LINE;
    const band = { top: headerBottom(viewport), bottom: viewport * BAND_END };
    const nextFocus = new Set();
    const nextDim = new Set();
    // Read every position first, then write classes once.
    liveSections.forEach(section => {
      const items = groups.get(section);
      if (!items) return;
      const { focus, count } = pickFocus(section, items, viewport, line, band);
      focus.forEach(element => nextFocus.add(element));
      if (focus.length && count > focus.length) nextDim.add(section);
    });
    focused.forEach(element => { if (!nextFocus.has(element)) { element.classList.remove('is-focus'); focused.delete(element); } });
    nextFocus.forEach(element => { if (!focused.has(element)) { element.classList.add('is-focus'); focused.add(element); } });
    dimmed.forEach(section => { if (!nextDim.has(section)) { section.classList.remove('fs-dim'); dimmed.delete(section); } });
    nextDim.forEach(section => { if (!dimmed.has(section)) { section.classList.add('fs-dim'); dimmed.add(section); } });
    body.classList.toggle('has-focus', nextFocus.size > 0);
  }
  function schedule() { if (running && !frame) frame = requestAnimationFrame(update); }

  function clearSpotlight() {
    focused.forEach(element => element.classList.remove('is-focus'));
    dimmed.forEach(section => section.classList.remove('fs-dim'));
    focused.clear(); dimmed.clear();
    body.classList.remove('has-focus', 'fs-on');
  }

  function startSpotlight() {
    if (running) return;
    running = true;
    body.classList.add('fs-on');
    if (hasIO && !sectionWatch) {
      sectionWatch = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) liveSections.add(entry.target);
          else liveSections.delete(entry.target);
        });
        schedule();
      }, { rootMargin: '10% 0px 10% 0px' });
    }
    collect();
    update();
  }
  function stopSpotlight() {
    running = false;
    cancelAnimationFrame(frame); frame = 0;
    sectionWatch?.disconnect();
    groups = new Map(); liveSections = new Set();
    clearSpotlight();
  }

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('load', () => { dirty = true; schedule(); });
  document.fonts?.ready.then(schedule);

  // Other scripts build parts of the page (lanes, ledgers); re-read the targets after they do.
  const main = document.querySelector('main');
  if (main && 'MutationObserver' in window) {
    let pending = 0;
    new MutationObserver(records => {
      const isElement = node => node.nodeType === 1 && !node.classList?.contains('countup-ghost');
      if (!records.some(record => [...record.addedNodes].some(isElement) || [...record.removedNodes].some(isElement))) return;
      clearTimeout(pending);
      pending = setTimeout(() => { dirty = true; schedule(); }, 120);
    }).observe(main, { childList: true, subtree: true });
  }

  // A deliberate mouse move puts the spotlight on the hovered item; scrolling hands it back.
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !running) return;
    const target = event.target instanceof Element ? event.target.closest(TARGETS) : null;
    pointerAnchorY = scrollY;
    if (target !== pointerTarget) { pointerTarget = target; schedule(); }
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { if (pointerTarget) { pointerTarget = null; schedule(); } });
  // Keyboard focus keeps the spotlight on the item that holds it.
  document.addEventListener('focusin', event => {
    if (!running || !(event.target instanceof Element)) return;
    const target = event.target.closest(TARGETS);
    let visible = false;
    try { visible = event.target.matches(':focus-visible'); } catch { visible = false; }
    keyTarget = target && visible ? target : null;
    schedule();
  });
  document.addEventListener('focusout', event => {
    if (keyTarget && !(event.relatedTarget instanceof Node && keyTarget.contains(event.relatedTarget))) { keyTarget = null; schedule(); }
  });

  /* 2. Count-up ------------------------------------------------------------------------------ */
  const DURATION = 900;
  const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  const counted = new WeakSet();
  const live = new Set();
  const ease = t => 1 - (1 - t) ** 3;

  // Numbers that are names, not quantities, stay still: NDCG@5, F1, AI-900, years, 3D.
  function isQuantity(text, start, end, token) {
    const before = text.slice(Math.max(0, start - 2), start);
    const after = text.charAt(end);
    if (/[A-Za-z@_#]$/.test(before) || /[A-Za-z]-$/.test(before)) return false;
    if (/[A-Za-z]/.test(after) && !/[KkMx]/.test(after)) return false;
    if (/^(19|20)\d\d$/.test(token)) return false;
    return true;
  }
  function parseToken(token) {
    const [whole, fraction = ''] = token.split('.');
    const digits = whole.replace(/,/g, '');
    return {
      raw: token,
      value: parseFloat(digits + (fraction ? `.${fraction}` : '')),
      from: 0,
      animate: true,
      decimals: fraction.length,
      grouped: whole.includes(','),
      pad: /^0\d/.test(digits) ? digits.length : 0,
    };
  }
  function format(spec, amount) {
    let text = amount.toFixed(spec.decimals);
    let [whole, fraction] = text.split('.');
    if (spec.pad) whole = whole.padStart(spec.pad, '0');
    if (spec.grouped) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return fraction !== undefined ? `${whole}.${fraction}` : whole;
  }
  // Same rules as the case pages (case-focus.js): the total after "/" stays fixed ("21 / 50"),
  // "a → b" counts from a to b with a held still, and years never move.
  function plan(container) {
    const nodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const parts = [];
    let seen = '', previous = null;
    nodes.forEach(node => {
      const text = node.data;
      const pieces = [];
      let last = 0, found = false;
      text.replace(NUMBER, (token, offset) => {
        if (!isQuantity(text, offset, offset + token.length, token)) return token;
        const spec = parseToken(token);
        const lead = (seen + text.slice(0, offset)).trimEnd();
        if (lead.endsWith('/')) spec.animate = false;
        else if ((lead.endsWith('→') || lead.endsWith('->')) && previous) {
          previous.animate = false;
          spec.from = previous.value;
        }
        pieces.push(text.slice(last, offset), spec);
        previous = spec;
        last = offset + token.length; found = true;
        return token;
      });
      seen += text;
      if (!found) return;
      pieces.push(text.slice(last));
      parts.push({ node, pieces });
    });
    return parts.some(part => part.pieces.some(piece => typeof piece !== 'string' && piece.animate)) ? parts : [];
  }

  function finish(record) {
    cancelAnimationFrame(record.frame);
    record.ghost.remove();
    record.element.classList.remove('countup-live');
    if (record.restorePosition) record.element.style.removeProperty('position');
    live.delete(record);
  }

  function countUp(element) {
    if (counted.has(element)) return;
    counted.add(element);
    if (reduced.matches) return;
    const ghost = document.createElement('span');
    ghost.className = 'countup-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    element.childNodes.forEach(child => {
      if (child.nodeType === 1 && child.classList.contains('countup-ghost')) return;
      ghost.append(child.cloneNode(true));
    });
    ghost.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    ghost.querySelectorAll('[data-countup]').forEach(node => node.removeAttribute('data-countup'));
    const parts = plan(ghost);
    if (!parts.length) return;
    const record = { element, ghost, frame: 0, restorePosition: false };
    if (getComputedStyle(element).position === 'static') {
      element.style.position = 'relative';
      record.restorePosition = true;
    }
    const paint = progress => {
      const eased = ease(progress);
      parts.forEach(({ node, pieces }) => {
        node.data = pieces.map(piece => {
          if (typeof piece === 'string') return piece;
          return piece.animate ? format(piece, piece.from + (piece.value - piece.from) * eased) : piece.raw;
        }).join('');
      });
    };
    paint(0);
    element.append(ghost);
    element.classList.add('countup-live');
    live.add(record);
    const started = performance.now();
    const step = now => {
      const progress = Math.min(1, (now - started) / DURATION);
      paint(progress);
      if (progress < 1) record.frame = requestAnimationFrame(step);
      else finish(record);
    };
    record.frame = requestAnimationFrame(step);
  }

  // The intro gate and the hero entrance hide the first screen for a moment;
  // numbers wait for it so they are not spent behind it.
  function afterIntro(callback) {
    const busy = () => root.classList.contains('entry-running') || root.classList.contains('nav-intro-running');
    if (!busy()) { callback(); return; }
    let done = false;
    const go = () => { if (done) return; done = true; watch.disconnect(); clearTimeout(timer); setTimeout(callback, 250); };
    const watch = new MutationObserver(() => { if (!busy()) go(); });
    watch.observe(root, { attributes: true, attributeFilter: ['class'] });
    const timer = setTimeout(go, 4500);
  }

  function setupCountUp() {
    const numbers = [...document.querySelectorAll('[data-countup]')];
    if (!numbers.length || !hasIO) return;
    const watch = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const tallEnough = entry.intersectionRatio >= .6 || entry.intersectionRect.height >= innerHeight * .35;
        if (!tallEnough) return;
        watch.unobserve(entry.target);
        if (reduced.matches) { counted.add(entry.target); return; }
        afterIntro(() => countUp(entry.target));
      });
    }, { threshold: [0, .6, 1], rootMargin: '0px 0px -8% 0px' });
    numbers.forEach(element => {
      // Anything the reader has already scrolled past keeps its final value.
      if (element.getBoundingClientRect().bottom < 0) { counted.add(element); return; }
      watch.observe(element);
    });
  }

  /* Mode switching -------------------------------------------------------------------------- */
  function syncMode() {
    if (reduced.matches) {
      stopSpotlight();
      live.forEach(finish);
    } else startSpotlight();
  }
  reduced.addEventListener?.('change', syncMode);
  syncMode();
  setupCountUp();
})();
