/* One water palette for every page: sunlit turquoise near the surface, teal, open blue, then navy.
   window.waterDepth.grade(depth 0–1) returns the tint used by body::before (see depth-ambient.css).
   The homepage drives depth from chapter-scroll.js. Case-study pages are driven here:
   a shallow swim while the story (dark text on open water) is read, then a quick descent
   once the last light panel (.case-check) rises, so the dark footer lands on the sea floor. */
(() => {
  const STOPS = [
    [0, 26, 132, 164, 0],
    [.22, 20, 116, 148, .14],
    [.45, 14, 82, 116, .36],
    [.68, 9, 48, 78, .62],
    [.85, 6, 30, 54, .8],
    [1, 4, 20, 40, .9]
  ];
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = t => t * t * (3 - 2 * t);
  function grade(depth) {
    let index = 1;
    while (index < STOPS.length - 1 && depth > STOPS[index][0]) index++;
    const from = STOPS[index - 1], to = STOPS[index];
    const ease = smooth(clamp((depth - from[0]) / (to[0] - from[0])));
    const mix = channel => from[channel] + (to[channel] - from[channel]) * ease;
    return `rgba(${Math.round(mix(1))},${Math.round(mix(2))},${Math.round(mix(3))},${mix(4).toFixed(3)})`;
  }
  window.waterDepth = { grade };

  const page = document.body;
  if (!page || !page.classList.contains('case-page')) return;
  const check = document.querySelector('.case-check') || document.querySelector('.case-bottom');
  const SHALLOW = .3; // keeps dark story text on light water (tint stays under ~.22 alpha)
  const FLOOR = .92;
  let frame = 0;
  function update() {
    frame = 0;
    const viewport = innerHeight || 1;
    const scrolled = window.scrollY || 0;
    let depth;
    if (check) {
      const checkTop = check.getBoundingClientRect().top;
      // The swim ends exactly where the descent begins: the panel's top at 60% of the viewport.
      const storyEnd = Math.max(1, checkTop + scrolled - viewport * .6);
      const swim = clamp(scrolled / storyEnd);
      const descent = clamp((viewport * .6 - checkTop) / (viewport * .55));
      depth = SHALLOW * smooth(swim) + (FLOOR - SHALLOW) * smooth(descent);
    } else {
      depth = SHALLOW * clamp(scrolled / Math.max(1, document.documentElement.scrollHeight - viewport));
    }
    page.style.setProperty('--water-depth', depth.toFixed(3));
    page.style.setProperty('--water-depth-tint', grade(depth));
    page.style.setProperty('--water-light', (1 - .76 * depth ** 1.65).toFixed(3));
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  document.fonts?.ready.then(schedule);
  update();
})();
