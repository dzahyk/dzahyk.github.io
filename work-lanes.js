/* Role lanes in Selected work: three case studies to read first for each role.
   Without this script every lane is listed in full under its own heading (see index.html).
   With it, the lanes become an ARIA tab set: arrow keys, Home and End move between roles.
   ?role=ba | data | ai in the URL opens that lane, so a link can be sent for one role. */
/* On phones the smaller-projects list scrolls sideways: give it a keyboard stop only while it actually scrolls. */
(() => {
  const row = document.querySelector('.more-grid');
  if (!row) return;
  row.setAttribute('aria-label', 'Smaller projects');
  const sync = () => {
    if (row.scrollWidth > row.clientWidth + 1) row.tabIndex = 0; else row.removeAttribute('tabindex');
  };
  addEventListener('resize', sync, { passive: true });
  sync();
})();
(() => {
  const lanes = document.querySelector('[data-role-lanes]');
  if (!lanes) return;
  const tabs = [...lanes.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  if (!tabs.length || panels.some(panel => !panel)) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  lanes.classList.add('is-tabbed');

  function select(index, { focus = false, animate = true } = {}) {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
      panels[i].classList.remove('is-entering');
    });
    lanes.style.setProperty('--lane', index);
    if (focus) tabs[index].focus();
    if (animate && !reduced.matches) {
      const panel = panels[index];
      // Restart the entrance on every switch; the class is removed once it has played.
      void panel.offsetWidth;
      panel.classList.add('is-entering');
      setTimeout(() => panel.classList.remove('is-entering'), 620);
    }
  }

  // Lane keys come from the tab ids (laneTab-ba, laneTab-ai, …), so adding a lane needs no change here.
  const keys = tabs.map(tab => tab.id.replace('laneTab-', ''));
  const requested = keys.indexOf(new URLSearchParams(location.search).get('role'));
  select(requested >= 0 ? requested : 0, { animate: false });
  // On phones the tab row scrolls sideways: bring a linked lane's tab into view without moving the page.
  if (requested > 0) tabs[requested].parentElement.scrollLeft = tabs[requested].offsetLeft - 8;
  const tabRow = tabs[0].parentElement;
  const edge = () => tabRow.classList.toggle('at-end', tabRow.scrollLeft + tabRow.clientWidth >= tabRow.scrollWidth - 2);
  tabRow.addEventListener('scroll', edge, { passive: true });
  addEventListener('resize', edge, { passive: true });
  edge();
  tabs.forEach(tab => tab.addEventListener('click', () => {
    const row = tab.parentElement;
    if (row.scrollWidth > row.clientWidth) row.scrollTo({ left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2, behavior: reduced.matches ? 'auto' : 'smooth' });
  }));

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      const last = tabs.length - 1;
      const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(next, { focus: true });
    });
  });
})();
/* Project screenshots follow a fine pointer: --pan-x/--pan-y (-1 to 1) drive a small translate in
   work-lanes.css while the card is hovered. One rAF per frame at most; nothing runs on touch or with
   reduced motion, and the variables are cleared when the pointer leaves. */
(() => {
  const arts = document.querySelectorAll('#work .project-card .project-art');
  if (!arts.length) return;
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  arts.forEach(art => {
    let frame = 0;
    let x = 0;
    let y = 0;
    art.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || !fine.matches || reduced.matches) return;
      const box = art.getBoundingClientRect();
      if (!box.width || !box.height) return;
      x = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1));
      y = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1));
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        art.style.setProperty('--pan-x', x.toFixed(3));
        art.style.setProperty('--pan-y', y.toFixed(3));
      });
    }, { passive: true });
    art.addEventListener('pointerleave', () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      art.style.removeProperty('--pan-x');
      art.style.removeProperty('--pan-y');
    });
  });
})();
