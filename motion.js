/* Motion enhances a readable page; native scrolling and controls stay in charge. */
(() => {
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function readingProgress(top, height, viewport) {
    return clamp((viewport * .78 - top) / Math.max(height * .6, viewport * .28), 0, 1);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { readingProgress };
  if (typeof document === 'undefined') return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('.site-header');
  const navLinks = [...document.querySelectorAll('.site-nav a[href^="#"],.mobile-menu a[href^="#"]')];
  const sections = [...document.querySelectorAll('#work,#skills,#experience,#process,#contact')];
  const aboutSection = document.getElementById('about');
  // The long-form About controller owns its ink and scene together. Retain the
  // legacy ink only on pages without that narrative, including static fallback.
  const aboutStoryOwned = aboutSection?.hasAttribute('data-scroll-story');
  const aboutHeading = aboutSection?.querySelector('.section-heading');
  const readingTitle = document.querySelector('.statement h3');
  const aboutDescription = document.querySelector('.about .statement p');
  const readWords = [];
  let frame = 0, currentSection = null, scrollBlurTimer = 0, previousScrollY = scrollY;
  let scrollDrift = 0, lastScrollAt = 0;
  let revealScrollSpeed = 0, revealScrollTime = 0;

  // The gate hands off to one continuous center-to-navbar shell animation.
  let navIntroTimer = 0;
  const finishNavIntro = () => {
    clearTimeout(navIntroTimer); navIntroTimer = 0;
    document.documentElement.classList.remove('nav-intro-running', 'nav-intro-compact', 'nav-seed-wait');
    header?.style.removeProperty('--nav-origin-y');
    header?.style.removeProperty('--nav-seed-half');
  };
  const prepareNavSeed = () => {
    if (!header || reduced.matches || document.hidden || scrollY > 80) return;
    // Measure the dock without its staged transform, including after a resize.
    document.documentElement.classList.remove('nav-seed-wait');
    const bounds = header.getBoundingClientRect();
    header.style.setProperty('--nav-origin-y', `${Math.max(0, innerHeight / 2 - bounds.top - bounds.height / 2)}px`);
    header.style.setProperty('--nav-seed-half', `${bounds.height / 2 || 34}px`);
    document.documentElement.classList.add('nav-seed-wait');
  };
  const startNavIntro = (compact = false) => {
    if (reduced.matches || document.hidden || scrollY > 80) return;
    if (compact && !document.documentElement.classList.contains('nav-seed-wait')) prepareNavSeed();
    document.documentElement.classList.add('nav-intro-running');
    document.documentElement.classList.toggle('nav-intro-compact', compact);
    document.documentElement.classList.remove('nav-seed-wait');
    clearTimeout(navIntroTimer);
    if (!compact) navIntroTimer = setTimeout(finishNavIntro, 2900);
    else navIntroTimer = setTimeout(finishNavIntro, 3200);
  };
  header?.addEventListener('focusin', finishNavIntro);
  header?.addEventListener('pointerdown', finishNavIntro, { passive: true });
  document.addEventListener('pointerdown', () => {
    if (document.documentElement.classList.contains('nav-intro-running')) finishNavIntro();
  }, { passive: true });
  document.addEventListener('keydown', event => { if (event.key === 'Tab') finishNavIntro(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) finishNavIntro(); });
  reduced.addEventListener('change', () => { if (reduced.matches) finishNavIntro(); });
  addEventListener('scroll', () => { if (scrollY > 80) finishNavIntro(); }, { passive: true });
  document.addEventListener('portfolio:nav-seed-prepare', prepareNavSeed);
  document.addEventListener('portfolio:nav-intro-start', () => startNavIntro(true));
  document.addEventListener('portfolio:nav-intro-cancel', finishNavIntro);
  addEventListener('resize', () => {
    if (document.documentElement.classList.contains('nav-seed-wait')) prepareNavSeed();
    else if (document.documentElement.classList.contains('nav-intro-compact')) finishNavIntro();
  }, { passive: true });
  if (document.documentElement.classList.contains('nav-intro-running')) startNavIntro();

  // Duplicate only the visual label; each link keeps one stable accessible name.
  document.querySelectorAll('.site-nav a').forEach(link => {
    const label = link.textContent.trim();
    if (!label || link.querySelector('.nav-label')) return;
    link.setAttribute('aria-label', label);
    const mask = document.createElement('span');
    mask.className = 'nav-label'; mask.setAttribute('aria-hidden', 'true');
    for (let copy = 0; copy < 2; copy++) {
      const text = document.createElement('span'); text.textContent = label; mask.append(text);
    }
    link.replaceChildren(mask);
  });

  // Explicit line breaks define the reveal; ordinary text still wraps naturally.
  document.querySelectorAll('.section-heading h2').forEach(heading => {
    if (heading.closest('.about[data-scroll-story]')) return;
    if (heading.querySelector('.heading-line')) return;
    const spoken = heading.cloneNode(true);
    spoken.querySelectorAll('br').forEach(br => br.replaceWith(' '));
    heading.setAttribute('aria-label', spoken.textContent.replace(/\s+/g, ' ').trim());
    const nodes = [...heading.childNodes];
    let lineNodes = [], order = 0;
    const appendLine = () => {
      if (!lineNodes.length) return;
      const mask = document.createElement('span');
      mask.className = 'heading-line'; mask.setAttribute('aria-hidden', 'true');
      mask.style.setProperty('--line-order', order);
      mask.style.setProperty('--about-line-delay', `${order * 95}ms`);
      order++;
      const content = document.createElement('span');
      content.append(...lineNodes); mask.append(content); heading.append(mask); lineNodes = [];
    };
    heading.replaceChildren();
    nodes.forEach(node => { if (node.nodeName === 'BR') appendLine(); else lineNodes.push(node); });
    appendLine();
  });

  // Keep semantic text nodes and inline emphasis; only visual ink follows scroll.
  const inkGroups = (aboutStoryOwned ? [] : [aboutHeading?.querySelector('h2'), readingTitle, aboutDescription]).map((element, groupIndex) => {
    if (!element) return [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const words = [];
    nodes.forEach(node => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(text => {
        if (!text.trim()) { fragment.append(text); return; }
        const word = document.createElement('span');
        word.className = 'about-ink-word';
        word.textContent = text;
        if (groupIndex === 1) { word.classList.add('read-word'); readWords.push(word); }
        words.push(word); fragment.append(word);
      });
      node.replaceWith(fragment);
    });
    const total = words.reduce((sum, word) => sum + word.textContent.length, 0);
    let offset = 0;
    return words.map(word => {
      const start = offset / total;
      offset += word.textContent.length;
      return { word, start, length: word.textContent.length / total };
    });
  });
  function paintAboutInk(progressByGroup) {
    inkGroups.forEach((words, index) => {
      const local = progressByGroup[index];
      words.forEach(({ word, start: wordStart, length }) => {
        const fill = clamp((local - wordStart) / length, 0, 1);
        const value = `${(fill * 100).toFixed(2)}%`;
        if (word.style.getPropertyValue('--ink-progress') !== value) word.style.setProperty('--ink-progress', value);
      });
    });
  }

  function updateScroll() {
    frame = 0;
    // Read positions together before changing styles or accessibility attributes.
    const positions = sections.map(section => ({ id: section.id, top: section.getBoundingClientRect().top }));
    const aboutBounds = !aboutStoryOwned && aboutHeading?.getBoundingClientRect();
    const descriptionBounds = !aboutStoryOwned && aboutDescription?.getBoundingClientRect();
    let current = 'top';
    for (const section of positions) {
      if (section.top <= innerHeight * .34) current = section.id;
    }
    if (scrollY + innerHeight >= document.documentElement.scrollHeight - 4 && scrollY > 0) {
      current = positions.some(section => section.id === 'contact') ? 'contact' : current;
    }
    header?.classList.toggle('is-scrolled', scrollY > 24);
    if (current !== currentSection) {
      navLinks.forEach(link => {
        if (link.getAttribute('href') === `#${current}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      currentSection = current;
    }
    if (aboutBounds && descriptionBounds) {
      // Each beat follows its own reading position. The longer paragraph gets
      // more scroll distance so its ink remains visible as the reader moves.
      const progress = reduced.matches ? [1, 1, 1] : [
        clamp((innerHeight * .8 - aboutBounds.top) / (innerHeight * .18), 0, 1),
        clamp((innerHeight * .62 - aboutBounds.top) / (innerHeight * .28), 0, 1),
        clamp((innerHeight * .65 - descriptionBounds.top) / (innerHeight * .55), 0, 1),
      ];
      paintAboutInk(progress);
    }
  }
  function scheduleScroll() { if (!frame) frame = requestAnimationFrame(updateScroll); }
  function handleScroll() {
    scheduleScroll();
    const distance = Math.abs(scrollY - previousScrollY);
    previousScrollY = scrollY;
    const now = performance.now();
    const elapsed = now - revealScrollTime;
    revealScrollSpeed = elapsed > 160 ? distance / 16.67 : revealScrollSpeed * .55 + distance / Math.max(16, elapsed) * .45;
    revealScrollTime = now;
    if (!header || reduced.matches || document.hidden) return;
    // Accumulate small trackpad steps, but discard an isolated nudge.
    scrollDrift = now - lastScrollAt > 140 ? distance : scrollDrift + distance;
    lastScrollAt = now;
    if (distance < .25 || (!header.classList.contains('is-scrolling') && scrollDrift < 3)) return;
    scrollDrift = 0;
    header.classList.add('is-scrolling');
    clearTimeout(scrollBlurTimer);
    scrollBlurTimer = setTimeout(() => {
      header.classList.remove('is-scrolling');
      scrollBlurTimer = 0;
    }, 260);
  }
  addEventListener('scroll', handleScroll, { passive: true });
  addEventListener('resize', scheduleScroll);
  document.fonts?.ready.then(scheduleScroll);
  document.addEventListener('visibilitychange', () => {
    previousScrollY = scrollY;
    scrollDrift = 0;
    lastScrollAt = 0;
    revealScrollSpeed = revealScrollTime = 0;
    if (!document.hidden) { scheduleScroll(); return; }
    clearTimeout(scrollBlurTimer);
    scrollBlurTimer = 0;
    header?.classList.remove('is-scrolling');
  });

  const reveals = [...document.querySelectorAll('.reveal')];
  const artworks = [...document.querySelectorAll('.project-card .project-art')];
  const pendingArtwork = new WeakSet();
  let observer;
  function revealArtwork(card, immediate) {
    const art = card.querySelector('.project-art');
    if (!art || art.classList.contains('is-seen')) return;
    const image = art.querySelector('img');
    const finish = () => { pendingArtwork.delete(art); art.classList.add('is-seen'); };
    if (immediate || !image) { finish(); return; }
    if (pendingArtwork.has(art)) return;
    pendingArtwork.add(art);
    const decode = () => {
      if (typeof image.decode === 'function' && image.naturalWidth) image.decode().catch(() => {}).then(finish);
      else finish();
    };
    // A lazy image sharpens when pixels are ready, rather than revealing an
    // empty surface and popping into place later. Errors still expose its alt.
    if (image.complete) decode();
    else {
      image.addEventListener('load', decode, { once: true });
      image.addEventListener('error', finish, { once: true });
    }
  }
  function revealElement(element, immediate = false) {
    if (immediate) element.classList.add('reveal-instant');
    element.classList.add('visible');
    if (element.classList.contains('project-card')) revealArtwork(element, immediate);
    observer?.unobserve(element);
  }
  function showAll() {
    observer?.disconnect();
    paintAboutInk([1, 1, 1]);
    reveals.forEach(element => revealElement(element, true));
    artworks.forEach(element => element.classList.add('is-seen'));
  }
  if (!reduced.matches && 'IntersectionObserver' in window) {
    // A positive bottom margin starts the entrance just before the element
    // scrolls in, so a fast scroll never lands on an empty, still-hidden card.
    observer = new IntersectionObserver(entries => {
      const fastScroll = performance.now() - revealScrollTime < 180 && revealScrollSpeed > 1.4;
      const rows = new Map();
      entries.filter(entry => entry.isIntersecting && !entry.target.classList.contains('visible'))
        .sort((a, b) => {
          const vertical = (a.boundingClientRect?.top ?? innerHeight) - (b.boundingClientRect?.top ?? innerHeight);
          const horizontal = (a.boundingClientRect?.left ?? 0) - (b.boundingClientRect?.left ?? 0);
          return vertical || horizontal || ((a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
        })
        .forEach(entry => {
          const element = entry.target;
          const top = entry.boundingClientRect?.top ?? innerHeight;
          const catchup = fastScroll || top < innerHeight * .6;
          const group = element.closest('.project-grid,.service-list,.process-list');
          let delay = element.matches('.section-heading,.marquee-heading') ? 0 : 40;
          if (group) {
            let row = rows.get(group);
            if (!row || Math.abs(row.top - top) > 48) { row = { top, index: 0 }; rows.set(group, row); }
            delay = Math.min(160, row.index++ * 70);
          }
          element.style.setProperty('--reveal-delay', `${catchup ? 0 : delay}ms`);
          if (catchup) element.classList.add('reveal-catchup');
          revealElement(element, top < 0);
        });
    }, { threshold: 0, rootMargin: '0px 0px 14% 0px' });
    reveals.forEach(element => observer.observe(element));
  } else showAll();

  // Jumping past content (anchor links, fast flicks, restored scroll) never
  // crosses an observer threshold, so anything already above the viewport is
  // shown at once instead of fading in behind the reader on the way back up.
  let sweepFrame = 0;
  function sweepPassedReveals() {
    sweepFrame = 0;
    if (!observer) return;
    for (const element of reveals) {
      if (element.classList.contains('visible')) continue;
      if (element.getBoundingClientRect().bottom < 0) revealElement(element, true);
    }
  }
  const scheduleSweep = () => { if (observer && !sweepFrame) sweepFrame = requestAnimationFrame(sweepPassedReveals); };
  addEventListener('scroll', scheduleSweep, { passive: true });
  addEventListener('hashchange', scheduleSweep);
  addEventListener('pageshow', scheduleSweep);

  // Images start loading a few screens ahead of the reader, not at the edge of
  // the viewport. While a picture is still on its way its frame shows a quiet
  // placeholder sheen rather than an empty box.
  const frameOf = image => image.closest('.media-frame,.project-art,.timeline-photo') || image.parentElement;
  const lazyImages = [...document.querySelectorAll('main img[loading="lazy"]')];
  lazyImages.forEach(image => {
    if (image.complete && image.naturalWidth) return;
    const frame = frameOf(image);
    if (!frame) return;
    frame.classList.add('img-pending');
    const done = () => frame.classList.remove('img-pending');
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
    setTimeout(done, 8000);
  });
  const saveData = navigator.connection?.saveData;
  if (!saveData && 'IntersectionObserver' in window && lazyImages.length) {
    const ahead = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        // Pictures in the same list come too: on phones a list can be a sideways
        // scroller whose off-screen cards never cross the observer on their own.
        const group = entry.target.closest('ul,ol');
        (group ? group.querySelectorAll('img[loading="lazy"]') : [entry.target]).forEach(image => {
          image.loading = 'eager';
          ahead.unobserve(image);
        });
      });
    }, { rootMargin: '0px 0px 250% 0px' });
    lazyImages.forEach(image => ahead.observe(image));
  }
  reveals.forEach(element => element.addEventListener('focusin', () => revealElement(element, true)));
  // Content is never hidden by the stylesheet until enhancement is installed.
  document.documentElement.classList.add('motion-ready');
  updateScroll();

  const questions = [...document.querySelectorAll('.faq details')];
  const faqList = document.querySelector('.faq-list');
  const faqState = new WeakMap();
  questions.forEach(item => {
    faqState.set(item, { frame: 0, timer: 0, pending: false, closing: false });
    item.classList.toggle('is-expanded', item.open);
    syncQuestion(item, item.open);
  });
  if (faqList && questions.length) faqList.classList.add('faq-motion');

  function syncQuestion(item, expanded) {
    item.querySelector('summary')?.setAttribute('aria-expanded', String(expanded));
    const answer = item.querySelector('.faq-answer');
    answer?.setAttribute('aria-hidden', String(!expanded));
    answer?.toggleAttribute('inert', !expanded);
  }
  function finishQuestionClose(item) {
    const state = faqState.get(item);
    if (!state.closing) return;
    clearTimeout(state.timer); state.timer = 0;
    item.open = false; state.closing = false;
    item.classList.remove('is-closing');
    syncQuestion(item, false);
  }
  function closeQuestion(item, immediate = false) {
    const state = faqState.get(item);
    cancelAnimationFrame(state.frame); state.frame = 0; state.pending = false;
    clearTimeout(state.timer); state.timer = 0;
    if (item.querySelector('.faq-answer')?.contains(document.activeElement)) {
      item.querySelector('summary')?.focus({ preventScroll: true });
    }
    syncQuestion(item, false);
    if (!item.open) { item.classList.remove('is-closing'); state.closing = false; return; }
    state.closing = true;
    const wasExpanded = item.classList.contains('is-expanded');
    item.classList.remove('is-expanded');
    if (immediate || reduced.matches || !wasExpanded) {
      finishQuestionClose(item);
    } else {
      // Keep native details content present until its grid row has collapsed.
      item.classList.add('is-closing');
      const duration = getComputedStyle(faqList).getPropertyValue('--faq-close-time').trim();
      const milliseconds = parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
      // transitionend is primary; the timer covers a hidden tab or cancelled CSS transition.
      state.timer = setTimeout(() => finishQuestionClose(item), (milliseconds || 320) + 40);
    }
  }
  function openQuestion(item) {
    const state = faqState.get(item);
    cancelAnimationFrame(state.frame); state.frame = 0; state.pending = false;
    clearTimeout(state.timer); state.timer = 0; state.closing = false;
    item.classList.remove('is-closing');
    // Move focus out of an answer before making the previous panel inert.
    if (questions.some(other => other !== item && other.querySelector('.faq-answer')?.contains(document.activeElement))) {
      item.querySelector('summary')?.focus({ preventScroll: true });
    }
    questions.forEach(other => { if (other !== item) closeQuestion(other); });
    const wasMounted = item.open;
    item.open = true;
    syncQuestion(item, true);
    if (reduced.matches) { item.classList.add('is-expanded'); return; }
    // Commit the collapsed row once when native details first makes it visible.
    // A reversal keeps the currently interpolated geometry instead of restarting.
    if (!wasMounted) item.querySelector('.faq-answer')?.getBoundingClientRect();
    state.pending = true;
    state.frame = requestAnimationFrame(() => {
      state.frame = 0; state.pending = false;
      if (item.open && !state.closing) item.classList.add('is-expanded');
    });
  }
  questions.forEach((item, index) => {
    const summary = item.querySelector('summary');
    const answer = item.querySelector('.faq-answer');
    summary?.addEventListener('click', event => {
      event.preventDefault();
      const state = faqState.get(item);
      if (item.open && !state.closing) closeQuestion(item);
      else openQuestion(item);
    });
    summary?.addEventListener('keydown', event => {
      if (event.target !== summary) return;
      const destination = {
        ArrowDown: Math.min(questions.length - 1, index + 1),
        ArrowUp: Math.max(0, index - 1),
        Home: 0,
        End: questions.length - 1
      }[event.key];
      if (destination === undefined) return;
      event.preventDefault();
      questions[destination].querySelector('summary')?.focus({ preventScroll: true });
    });
    answer?.addEventListener('transitionend', event => {
      if (event.target === answer && event.propertyName === 'grid-template-rows') finishQuestionClose(item);
    });
    item.addEventListener('toggle', () => {
      const state = faqState.get(item);
      if (!item.open) {
        cancelAnimationFrame(state.frame); state.frame = 0; state.pending = false;
        clearTimeout(state.timer); state.timer = 0; state.closing = false;
        item.classList.remove('is-expanded', 'is-closing');
        syncQuestion(item, false);
      } else if (!state.pending && !state.closing) {
        item.classList.add('is-expanded');
        syncQuestion(item, true);
        questions.forEach(other => { if (other !== item && other.open) closeQuestion(other); });
      }
    });
  });

  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      showAll(); clearTimeout(scrollBlurTimer);
      scrollBlurTimer = 0; scrollDrift = 0; header?.classList.remove('is-scrolling');
      questions.forEach(item => {
        const state = faqState.get(item);
        cancelAnimationFrame(state.frame); state.frame = 0; state.pending = false;
        clearTimeout(state.timer); state.timer = 0;
        if (state.closing) item.open = false;
        state.closing = false;
        item.classList.remove('is-closing');
        item.classList.toggle('is-expanded', item.open);
        syncQuestion(item, item.open);
      });
    }
    scheduleScroll();
  });
})();
