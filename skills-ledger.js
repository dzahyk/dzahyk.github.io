/* Skills grid. Adds two things on top of the cards written in index.html:
   1. a tally of proof levels, counted from the level badges already on the cards (no new claims);
      its numbers carry data-countup, so focus-scroll.js animates them with the rest of the page;
   2. on fine pointers, a preview of the case study behind each project pill.
   Everything is enhancement: without this script the cards render as written, proof collapsed in <details>. */
(() => {
  const section = document.getElementById('skills');
  if (!section) return;
  const list = section.querySelector('.skill-list');
  const heading = section.querySelector('.section-heading');
  if (!list || !list.querySelector('.skill-row')) return;

  /* 1. Tally ------------------------------------------------------------------------------- */
  const LEVELS = ['built', 'proto', 'paper', 'work'];
  // A visible caption says what is being counted: skills per proof level, not products.
  const tallyWrap = document.createElement('div');
  tallyWrap.className = 'skill-tally-wrap';
  const caption = document.createElement('p');
  caption.className = 'skill-tally-caption';
  caption.id = 'skillTallyCaption';
  caption.textContent = 'Proof badges across 10 skills';
  const tally = document.createElement('ul');
  tally.className = 'skill-tally';
  tally.setAttribute('role', 'list');
  tally.setAttribute('aria-labelledby', caption.id);
  LEVELS.forEach(level => {
    const badges = [...list.querySelectorAll(`.level--${level}`)];
    if (!badges.length) return;
    // Short labels ("Built", not "Built · tested locally"): the cards already carry the full badge.
    const labels = [...new Set(badges.map(badge => badge.textContent.split('·')[0].trim()))];
    const item = document.createElement('li');
    item.className = `tally--${level}`;
    const count = document.createElement('b');
    count.textContent = String(badges.length);
    count.setAttribute('data-countup', '');
    const label = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.setAttribute('aria-hidden', 'true');
    label.append(swatch, document.createTextNode(labels.join(' / ')));
    item.append(count, label);
    tally.append(item);
  });
  // The split heading has an empty right column: the tally sits there, beside the title.
  if (tally.children.length) {
    tallyWrap.append(caption, tally);
    if (heading) heading.append(tallyWrap); else list.before(tallyWrap);
  }

  /* 2. Case-study preview on project pills (fine pointers only) ------------------------------ */
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const projects = window.portfolioProjects || [];
  function previewFor(link) {
    const href = link.getAttribute('href');
    const project = projects.find(item => item.caseUrl === href);
    const card = project && document.querySelector(`.project-card[data-project="${project.id}"] img`);
    const src = card?.getAttribute('src') || link.querySelector('img')?.getAttribute('src')
      || `assets/projects/${href.replace(/^case-|\.html$/g, '')}.webp`;
    const name = project?.name || link.textContent.replace(/[→↓]/g, '').trim();
    return { src, name };
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
    // A link that already shows a large preview (wide card, one project) needs no floating copy.
    if ((link.querySelector('img')?.offsetWidth || 0) > 60) return;
    const { src, name } = previewFor(link);
    if (peekImage.getAttribute('src') !== src) peekImage.src = src;
    peekCaption.textContent = `${name} case study`;
    place(x, y);
    peek.classList.add('is-on');
  }
  const hide = () => peek.classList.remove('is-on');
  const peekLinks = [...section.querySelectorAll('.skill-where a[href^="case-"]')];
  peekLinks.forEach(link => {
    link.addEventListener('pointerenter', event => { if (finePointer.matches && event.pointerType === 'mouse') show(link, event.clientX, event.clientY); });
    link.addEventListener('pointermove', event => { if (peek.classList.contains('is-on')) place(event.clientX, event.clientY); });
    link.addEventListener('pointerleave', hide);
    link.addEventListener('focus', () => {
      if (!finePointer.matches || !link.matches(':focus-visible')) return;
      const box = link.getBoundingClientRect();
      show(link, box.right, box.top);
    });
    link.addEventListener('blur', hide);
  });
  addEventListener('scroll', hide, { passive: true });
})();
