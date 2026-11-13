(() => {
  const config = window.portfolioConfig;
  document.querySelectorAll('[data-brand]').forEach(element => { element.textContent = config.brand; });
  document.querySelectorAll('[data-year]').forEach(element => { element.textContent = new Date().getFullYear(); });
  // Position ("02 / 04") and the next link come from projects.js, matched by this page's file name.
  // Only projects with a case page take part, so the chain never points at a missing page.
  const pages = (window.portfolioProjects || []).filter(project => project.caseUrl);
  const file = location.pathname.split('/').pop() || '';
  const index = pages.findIndex(project => project.caseUrl === file);
  if (index >= 0) {
    const pad = value => String(value).padStart(2, '0');
    document.querySelectorAll('[data-case-position]').forEach(element => { element.textContent = `${pad(index + 1)} / ${pad(pages.length)}`; });
    let next = pages[(index + 1) % pages.length];
    // Arrived from a role lane (?role=ba|data|ai): the next link stays inside that lane and keeps the role.
    const roleKey = new URLSearchParams(location.search).get('role');
    const lane = roleKey && window.portfolioLanes?.[roleKey];
    const laneIds = lane ? lane.projects.filter(id => pages.some(project => project.id === id)) : [];
    const laneIndex = laneIds.indexOf(pages[index].id);
    let suffix = '';
    if (laneIndex >= 0 && laneIds.length > 1) {
      const nextId = laneIds[(laneIndex + 1) % laneIds.length];
      next = pages.find(project => project.id === nextId);
      suffix = `?role=${roleKey}`;
      document.querySelectorAll('.case-next-index').forEach(label => {
        label.textContent = `Next in ${lane.name} · ${(laneIndex + 1) % laneIds.length + 1} of ${laneIds.length}`;
      });
    }
    document.querySelectorAll('[data-case-next]').forEach(link => {
      if (pages.length < 2) { link.closest('.case-bottom-next')?.setAttribute('hidden', ''); return; }
      link.href = `${next.caseUrl}${suffix}`;
      link.textContent = `${next.name} ↗`;
      // case-focus.js turns this link into a picture card and picks the thumbnail by project id.
      link.dataset.caseId = next.id;
    });
  }
  const title = document.querySelector('h1')?.textContent.trim();
  if (title) document.title = `${title} — Case study | ${config.name}`;
})();
