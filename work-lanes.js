/* Role lanes in Selected work: three case studies to read first for each role.
   Without this script every lane is listed in full under its own heading (see index.html).
   With it, the lanes become an ARIA tab set: arrow keys, Home and End move between roles.
   ?role=ba | data | ai in the URL opens that lane, so a link can be sent for one role. */
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

  const keys = { ba: 0, data: 1, ai: 2 };
  const requested = new URLSearchParams(location.search).get('role');
  select(requested in keys ? keys[requested] : 0, { animate: false });

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
