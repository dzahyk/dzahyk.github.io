/* Skills ledger. Adds, in order of reading:
   1. a tally of proof levels counted from the badges already in the table (no new claims);
   2. a column key that is ruled, then labelled, as it scrolls in;
   3. rows that reveal claim → where → proof and then stamp their level, driven by scroll position;
   4. on fine pointers, a preview of the case study behind each project link.
   Everything is enhancement: without this script the table renders as written in index.html. */
(() => {
  const section = document.getElementById('skills');
  if (!section) return;
  const list = section.querySelector('.skill-list');
  const key = section.querySelector('.skill-key');
  const heading = section.querySelector('.section-heading');
  const rows = [...section.querySelectorAll('.skill-row')];
  if (!list || !rows.length) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.max(0, Math.min(1, value));
  const range = (top, start, end) => clamp((start - top) / Math.max(1, start - end));

  /* 1. Tally ------------------------------------------------------------------------------- */
  const LEVELS = ['built', 'proto', 'paper', 'work'];
  const tally = document.createElement('ul');
  tally.className = 'skill-tally';
  tally.setAttribute('role', 'list');
  tally.setAttribute('aria-label', 'Proof levels across these skills');
  const counters = [];
  LEVELS.forEach((level, index) => {
    const badges = [...list.querySelectorAll(`.level--${level}`)];
    if (!badges.length) return;
    const labels = [...new Set(badges.map(badge => badge.textContent.trim()))];
    const item = document.createElement('li');
    item.className = `tally--${level}`;
    item.style.setProperty('--n', index);
    const count = document.createElement('b');
    count.textContent = String(badges.length);
    const label = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.setAttribute('aria-hidden', 'true');
    label.append(swatch, document.createTextNode(labels.join(' / ')));
    item.append(count, label);
    tally.append(item);
    counters.push({ node: count, target: badges.length });
  });
  (heading || key || list).after(tally);

  function countUp() {
    tally.classList.add('is-counted');
    const started = performance.now();
    const DURATION = 950;
    const step = () => {
      const t = clamp((performance.now() - started) / DURATION);
      const eased = 1 - (1 - t) ** 3;
      counters.forEach(({ node, target }) => { node.textContent = String(Math.round(target * eased)); });
      if (t < 1) setTimeout(step, 32);
    };
    step();
  }
  if (!reduced.matches && 'IntersectionObserver' in window) {
    tally.classList.add('is-armed');
    counters.forEach(({ node }) => { node.textContent = '0'; });
    const watch = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      watch.disconnect();
      countUp();
    }, { threshold: .6 });
    watch.observe(tally);
  }

  /* 2 + 3. Ruled key and staged rows --------------------------------------------------------- */
  function stamp(row) { row.classList.add('is-stamped'); }
  if (!reduced.matches) {
    section.classList.add('is-staged');
    // The ledger replaces the generic fade for these elements.
    key?.classList.remove('reveal');
    rows.forEach(row => row.classList.remove('reveal'));
  } else {
    rows.forEach(stamp);
  }
  let frame = 0, active = false;
  function update() {
    frame = 0;
    if (!section.classList.contains('is-staged')) return;
    const viewport = innerHeight || 1;
    if (key) key.style.setProperty('--ledger', range(key.getBoundingClientRect().top, viewport * .92, viewport * .6).toFixed(3));
    rows.forEach(row => {
      const progress = range(row.getBoundingClientRect().top, viewport * .96, viewport * .5);
      row.style.setProperty('--p', progress.toFixed(3));
      if (progress > .8 && !row.classList.contains('is-stamped')) stamp(row);
    });
  }
  const schedule = () => { if (active && !frame) frame = requestAnimationFrame(update); };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      active = entries.some(entry => entry.isIntersecting);
      if (active) schedule();
    }, { rootMargin: '20% 0px 20% 0px' }).observe(section);
  } else { active = true; }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  section.addEventListener('focusin', event => { const row = event.target.closest('.skill-row'); if (row) stamp(row); });
  reduced.addEventListener('change', () => {
    if (reduced.matches) { section.classList.remove('is-staged'); rows.forEach(stamp); }
  });
  update();

  /* 4. Case-study preview on project links (fine pointers only) ------------------------------- */
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const projects = window.portfolioProjects || [];
  function previewFor(href) {
    const project = projects.find(item => item.caseUrl === href);
    const card = project && document.querySelector(`.project-card[data-project="${project.id}"] img`);
    if (card?.getAttribute('src')) return { src: card.getAttribute('src'), name: project.name };
    const slug = href.replace(/^case-|\.html$/g, '');
    return { src: `assets/projects/${slug}.webp`, name: project?.name || slug };
  }
  const peek = document.createElement('figure');
  peek.className = 'skill-peek';
  peek.setAttribute('aria-hidden', 'true');
  const peekImage = document.createElement('img');
  peekImage.alt = '';
  peekImage.decoding = 'async';
  const peekCaption = document.createElement('figcaption');
  peek.append(peekImage, peekCaption);
  let peekMounted = false;
  function place(x, y) {
    const width = 260, height = 163, gap = 22;
    let left = x + gap, top = y - height - gap;
    if (left + width > innerWidth - 12) left = x - width - gap;
    if (top < 76) top = y + gap;
    peek.style.setProperty('--peek-x', `${Math.round(left)}px`);
    peek.style.setProperty('--peek-y', `${Math.round(top)}px`);
  }
  function show(link, x, y) {
    if (!peekMounted) { document.body.append(peek); peekMounted = true; }
    const { src, name } = previewFor(link.getAttribute('href'));
    if (peekImage.getAttribute('src') !== src) peekImage.src = src;
    peekCaption.textContent = `${name} case study`;
    place(x, y);
    peek.classList.add('is-on');
  }
  const hide = () => peek.classList.remove('is-on');
  const peekLinks = [...section.querySelectorAll('.skill-where a[href^="case-"]')];
  // Warm the thumbnails once the pointer enters the section, so a preview never opens empty.
  section.addEventListener('pointerenter', () => {
    if (!finePointer.matches) return;
    new Set(peekLinks.map(link => previewFor(link.getAttribute('href')).src)).forEach(src => { const image = new Image(); image.decoding = 'async'; image.src = src; });
  }, { once: true });
  peekLinks.forEach(link => {
    link.addEventListener('pointerenter', event => { if (finePointer.matches && event.pointerType === 'mouse') show(link, event.clientX, event.clientY); });
    link.addEventListener('pointermove', event => { if (peek.classList.contains('is-on')) place(event.clientX, event.clientY); });
    link.addEventListener('pointerleave', hide);
    link.addEventListener('focus', () => {
      if (!finePointer.matches) return;
      const box = link.getBoundingClientRect();
      show(link, box.right, box.top);
    });
    link.addEventListener('blur', hide);
  });
  addEventListener('scroll', hide, { passive: true });
})();
