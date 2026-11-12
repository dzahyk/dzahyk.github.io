/* Names the one element that should morph during a page transition (see page-transitions.css).
   Homepage → case study: the card image of the project being opened becomes "case-hero".
   Case study → anywhere: the hero keeps its name only while it is on screen, so a "next" click from the
   bottom of the page cross-fades instead of flying a hero in from above. */
(() => {
  if (!('onpageswap' in window)) return;
  const fileOf = url => new URL(url, location.href).pathname.split('/').pop();
  // A transition cut short (a second click, a fast back) rejects its promises; that is expected, not an error.
  const quiet = transition => { transition?.ready.catch(() => {}); transition?.finished.catch(() => {}); };
  addEventListener('pagereveal', event => quiet(event.viewTransition));
  addEventListener('pageswap', event => {
    quiet(event.viewTransition);
    if (!event.viewTransition || !event.activation?.entry?.url) return;
    if (document.body.classList.contains('case-page')) {
      const hero = document.querySelector('.case-image-wrap');
      const box = hero?.getBoundingClientRect();
      if (hero && (box.bottom < 0 || box.top > innerHeight)) hero.style.viewTransitionName = 'none';
      return;
    }
    const target = fileOf(event.activation.entry.url);
    const link = [...document.querySelectorAll('.project-card .case-entry')].find(item => fileOf(item.href) === target);
    const art = link?.closest('.project-card')?.querySelector('.project-art');
    if (!art) return;
    art.style.viewTransitionName = 'case-hero';
    const clear = () => { art.style.viewTransitionName = ''; };
    event.viewTransition.finished.then(clear, clear);
  });
  // Back/forward cache restore: clear any name left on the page so the next transition starts clean.
  addEventListener('pageshow', event => {
    if (!event.persisted) return;
    document.querySelectorAll('[style*="view-transition-name"]').forEach(element => { element.style.viewTransitionName = ''; });
  });
})();
