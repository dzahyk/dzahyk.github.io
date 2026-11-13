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
