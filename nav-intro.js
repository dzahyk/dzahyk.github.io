/* Normalize explicit home/replay visits before styles paint. Ordinary deep links keep their destination. */
(() => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const navigation = performance.getEntriesByType?.('navigation')[0];
  const reloaded = navigation?.type === 'reload';
  const homeUrl = root.getAttribute('data-home-url');
  // A refreshed secondary page returns to the landing document, without adding a history entry.
  if (homeUrl) {
    if (reloaded) location.replace(new URL(homeUrl, location.href).href);
    return;
  }

  const url = new URL(location.href);
  const replayEntry = url.searchParams.get('intro') === '1';
  const resetToTop = reloaded || replayEntry;
  if (resetToTop) {
    const previousRestoration = history.scrollRestoration || 'auto';
    history.scrollRestoration = 'manual';
    url.hash = '';
    // Consume replay so every subsequent logo click is a fresh document navigation.
    if (replayEntry) url.searchParams.delete('intro');
    try { history.replaceState(history.state, '', url.href); } catch (_) {}
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    addEventListener('pageshow', () => { history.scrollRestoration = previousRestoration; }, { once: true });
  }
  const atTop = resetToTop || ((window.scrollY || 0) < 80 && (!location.hash || location.hash === '#top'));
  if (atTop && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // The full opening plays once; a visitor who comes back within 30 days gets the short header intro.
    // The logo (index.html?intro=1) replays it on request.
    const REMEMBER = 30 * 24 * 60 * 60 * 1000;
    let seenEntry = false;
    try { seenEntry = sessionStorage.getItem('sky-entry-seen') === '1'; } catch (_) {}
    try { seenEntry = seenEntry || Date.now() - Number(localStorage.getItem('sky-entry-seen-at') || 0) < REMEMBER; } catch (_) {}
    if (root.hasAttribute('data-entry-preloader') && (!seenEntry || replayEntry)) {
      root.classList.add('entry-running');
      try { sessionStorage.setItem('sky-entry-seen', '1'); } catch (_) {}
      try { localStorage.setItem('sky-entry-seen-at', String(Date.now())); } catch (_) {}
    } else {
      root.classList.add('nav-intro-running');
    }
  }
})();
