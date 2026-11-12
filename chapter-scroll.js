/* Native scroll remains the clock. All chapter poses are derived from geometry. */
(() => {
  const page = document.body;
  const work = document.getElementById('work');
  const breath = document.getElementById('breath');
  const process = document.getElementById('process');
  const footer = document.getElementById('contact');
  if (!page || !work || !footer) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const arts = [...document.querySelectorAll('.project-card .project-art')];
  const services = [...document.querySelectorAll('.service-row')];
  const processSteps = [...document.querySelectorAll('.process-list li')];
  const processRoute = process?.querySelector('.process-route');
  const processNodes = processSteps.map(step => step.querySelector('.process-node'));
  let processThresholds = processSteps.map((_, index) => index / Math.max(1, processSteps.length - 1));
  let processVisual = null;
  const counter = document.getElementById('workCounter');
  const breathTitle = document.getElementById('breathTitle');
  const breathLine = breathTitle?.querySelector('span');
  const breathLetters = [];
  if (breathLine) {
    breathTitle.setAttribute('aria-label', breathTitle.textContent.replace(/\s+/g, ' ').trim());
    breathLine.setAttribute('aria-hidden', 'true');
    const words = breathLine.textContent.trim().split(/\s+/);
    breathLine.replaceChildren();
    words.forEach((word, wordIndex) => {
      if (wordIndex) breathLine.append(document.createTextNode(' '));
      const unit = document.createElement('span');
      unit.className = 'breath-word';
      for (const glyph of word) {
        const letter = document.createElement('span');
        letter.className = 'breath-letter';
        letter.textContent = glyph;
        unit.append(letter);
        breathLetters.push(letter);
      }
      breathLine.append(unit);
    });
  }
  const clamp = value => Math.max(0, Math.min(1, value));
  let frame = 0;
  // A dive, not a dimmer: sunlit turquoise near the surface, teal, open blue, then navy at the floor.
  const DEPTH_STOPS = [
    [0, 26, 132, 164, 0],
    [.22, 20, 116, 148, .14],
    [.45, 14, 82, 116, .36],
    [.68, 9, 48, 78, .62],
    [.85, 6, 30, 54, .8],
    [1, 4, 20, 40, .9]
  ];
  function depthGrade(depth) {
    let index = 1;
    while (index < DEPTH_STOPS.length - 1 && depth > DEPTH_STOPS[index][0]) index++;
    const from = DEPTH_STOPS[index - 1], to = DEPTH_STOPS[index];
    const t = clamp((depth - from[0]) / (to[0] - from[0]));
    const ease = t * t * (3 - 2 * t);
    const mix = channel => from[channel] + (to[channel] - from[channel]) * ease;
    return `rgba(${Math.round(mix(1))},${Math.round(mix(2))},${Math.round(mix(3))},${mix(4).toFixed(3)})`;
  }
  function range(top, start, end) { return clamp((start - top) / Math.max(1, start - end)); }
  function measureProcessRail() {
    if (!processRoute || processNodes.length < 2 || processNodes.some(node => !node)) return;
    const bounds = processRoute.getBoundingClientRect();
    const vertical = innerWidth <= 900;
    const centers = processNodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2 - bounds.left, y: rect.top + rect.height / 2 - bounds.top };
    });
    const start = vertical ? centers[0].y : centers[0].x;
    const end = vertical ? centers.at(-1).y : centers.at(-1).x;
    const length = end - start;
    if (length < 1) return;
    processRoute.style.setProperty('--rail-start', `${(vertical ? centers[0].x : start).toFixed(2)}px`);
    processRoute.style.setProperty('--rail-cross', `${(vertical ? start : centers[0].y).toFixed(2)}px`);
    processRoute.style.setProperty('--rail-length', `${length.toFixed(2)}px`);
    processThresholds = centers.map(center => clamp(((vertical ? center.y : center.x) - start) / length));
  }
  function update() {
    frame = 0;
    if (document.hidden) return;
    const viewport = innerHeight || 1;
    const workTop = work.getBoundingClientRect().top;
    const footerTop = footer.getBoundingClientRect().top;
    const passage = Math.max(viewport, (footer.offsetTop - work.offsetTop));
    const depth = clamp((viewport * .42 - workTop) / passage);
    const shade = depth ** 1.65;
    page.style.setProperty('--water-depth-tint', depthGrade(depth));
    page.style.setProperty('--water-light', (1 - .76 * shade).toFixed(3));
    page.style.setProperty('--water-depth', depth.toFixed(3));
    // The pause fills only while its sticky panel is held in the viewport.
    const pause = breath ? clamp(-breath.getBoundingClientRect().top / Math.max(1, breath.offsetHeight - viewport)) : 1;
    breath?.style.setProperty('--breath-progress', pause.toFixed(3));
    breathLetters.forEach((letter, index) => letter.classList.toggle('is-inked', reduced.matches || index < Math.ceil(pause * breathLetters.length)));
    let opened = 0;
    arts.forEach(art => {
      const top = art.getBoundingClientRect().top;
      const amount = reduced.matches ? 1 : range(top, viewport * .94, viewport * .36);
      art.style.setProperty('--art-open', amount.toFixed(3));
      if (amount > .55) opened++;
    });
    if (counter) counter.textContent = String(opened).padStart(2, '0');
    services.forEach((row, index) => {
      const top = row.getBoundingClientRect().top;
      const amount = reduced.matches ? 1 : range(top, viewport * (.91 - index * .025), viewport * .53);
      row.style.setProperty('--specialist-enter', amount.toFixed(3));
    });
    if (process) {
      const rect = process.getBoundingClientRect();
      const staticProcess = reduced.matches || (innerWidth <= 900 && viewport <= 620);
      process.classList.toggle('is-static', staticProcess);
      const passage = Math.max(1, rect.height - viewport);
      const chapter = clamp(-rect.top / passage);
      const waterStrength = staticProcess ? .5 : Math.min(1, chapter / .17, (1 - chapter) / .17);
      process.style.setProperty('--process-water-strength', waterStrength.toFixed(3));
      process.style.setProperty('--process-water-x', `${((chapter - .5) * 68).toFixed(1)}px`);
      process.style.setProperty('--process-water-y', `${((chapter - .5) * -46).toFixed(1)}px`);
      // The line travels during the held interval, with a short pause at either end.
      const target = staticProcess ? 1 : clamp((chapter - .10) / .80);
      const visible = rect.bottom > 0 && rect.top < viewport;
      if (processVisual === null || staticProcess || !visible) processVisual = target;
      else {
        processVisual += (target - processVisual) * .19;
        if (Math.abs(target - processVisual) < .001) processVisual = target;
      }
      process.style.setProperty('--process-progress', target.toFixed(4));
      process.style.setProperty('--process-visual-progress', processVisual.toFixed(4));
      process.style.setProperty('--process-bead-scale', !staticProcess && chapter > .10 && chapter < .91 ? '1' : '0');
      let active = 0;
      processThresholds.forEach((threshold, index) => {
        if (processVisual + .002 >= threshold) active = index;
      });
      processSteps.forEach((step, index) => {
        step.classList.toggle('is-current', index === active);
        step.classList.toggle('is-arrived', staticProcess || (chapter >= .10 && processVisual + .002 >= processThresholds[index]));
      });
      if (visible && !staticProcess && processVisual !== target) schedule();
    }
    footer.style.setProperty('--footer-depth', range(footerTop, viewport, viewport * .25).toFixed(3));
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', () => { measureProcessRail(); schedule(); }, { passive: true });
  addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', schedule);
  document.fonts?.ready.then(() => { measureProcessRail(); schedule(); });
  page.classList.add('chapter-scroll-active');
  measureProcessRail();
  update();
})();
