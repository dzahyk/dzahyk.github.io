/* Case-study reading aids: progress, contents, stats strip, sticky steps, next card.
   Runs after case-study.js (which has already set the next-project link and the position labels).
   Progressive enhancement only: the HTML is complete without this file; it adds classes and small widgets.
   One rAF-throttled scroll handler drives the progress line, the active section, the active step and
   the phone header tuck; count-up waits for an IntersectionObserver. */
(() => {
  const body = document.body;
  if (!body || !body.classList.contains('case-page')) return;
  const root = document.documentElement;
  const main = document.getElementById('caseMain') || document.querySelector('main');
  const header = document.querySelector('.case-header');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const wide = matchMedia('(min-width: 1200px)');
  const phone = matchMedia('(max-width: 600px)');
  if (!main) return;
  body.classList.add('cf-on');

  /* ---------- 1. Reading progress (decorative: the scrollbar already tells assistive tech) ---------- */
  let progressFill = null;
  if (header) {
    const bar = document.createElement('span');
    bar.className = 'case-progress';
    bar.setAttribute('aria-hidden', 'true');
    progressFill = document.createElement('i');
    bar.append(progressFill);
    header.append(bar);
  }

  /* ---------- 2. On this page: every section with a .case-section-label and an h2[id] ---------- */
  const ACRONYMS = new Set(['AI', 'BI', 'BA', 'ML', 'KPI', 'KPIS', 'SQL', 'ETL', 'API', 'UX', 'UI', 'UAT', 'CRM', 'PO', 'POS', 'ROI', 'DW', 'PRD', 'BRD', 'PPIC', 'OIDC', 'DAX', 'CSV']);
  const sentenceCase = text => text.split(/(\s+)/).map((word, index) => {
    const bare = word.replace(/[^A-Za-z]/g, '');
    if (ACRONYMS.has(bare.toUpperCase()) && bare === bare.toUpperCase()) return word;
    const lower = word.toLowerCase().replace(/^i(?=$|')/, 'I');
    return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  }).join('');

  const sections = [];
  main.querySelectorAll('.case-section-label').forEach(label => {
    const section = label.closest('section, aside');
    if (!section || !main.contains(section) || sections.some(entry => entry.section === section)) return;
    const heading = section.querySelector('h2[id]');
    if (!heading) return;
    let name = label.textContent.replace(/^\s*\d+\s*\/\s*/, '').replace(/\s+/g, ' ').trim();
    if (!name) name = heading.textContent.trim();
    sections.push({ section, heading, label, name: sentenceCase(name) });
  });

  let toc = null, tocList = null, sentinel = null;
  const tocLinks = [];
  if (sections.length >= 2) {
    toc = document.createElement('nav');
    toc.className = 'case-toc';
    toc.setAttribute('aria-label', 'On this page');
    const inner = document.createElement('div');
    inner.className = 'case-toc-inner';
    const title = document.createElement('p');
    title.className = 'case-toc-title';
    title.setAttribute('aria-hidden', 'true');
    title.textContent = 'On this page';
    tocList = document.createElement('ol');
    sections.forEach((entry, index) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${entry.heading.id}`;
      const number = document.createElement('span');
      number.className = 'case-toc-num';
      number.setAttribute('aria-hidden', 'true');
      number.textContent = String(index + 1).padStart(2, '0');
      const text = document.createElement('span');
      text.textContent = entry.name;
      link.append(number, text);
      item.append(link);
      tocList.append(item);
      tocLinks.push(link);
    });
    inner.append(title, tocList);
    toc.append(inner);
    // In the reading order: after the 30-second brief (or the stats / hero image when there is no brief).
    const anchor = main.querySelector('.case-brief') || main.querySelector('.case-stats') || main.querySelector('.case-image');
    sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    if (anchor && anchor.parentElement === main) anchor.after(sentinel, toc);
    else sections[0].section.before(sentinel, toc);
    body.classList.add('cf-rail');
  }

  // Sticky geometry: header bottom, chip bar height, and the scroll padding that keeps headings visible.
  let headerBottom = 82, tocHeight = 0;
  function measure() {
    if (header) {
      const style = getComputedStyle(header);
      headerBottom = (parseFloat(style.top) || 0) + header.offsetHeight;
    }
    tocHeight = toc && !wide.matches ? toc.offsetHeight : 0;
    root.style.setProperty('--cf-header-bottom', `${headerBottom}px`);
    root.style.setProperty('--cf-sticky-top', `${headerBottom + 8}px`);
    const stack = headerBottom + (tocHeight ? tocHeight + 8 : 0) + 18;
    root.style.setProperty('--cf-stack', `${stack}px`);
    root.style.scrollPaddingTop = `${stack}px`;
  }

  /* ---------- 3. Count-up for [data-countup]: the HTML already holds the final text ---------- */
  const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  const counters = [];
  function planCounter(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const parts = [];
    let seen = '', previous = null, node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      const tokens = [];
      NUMBER.lastIndex = 0;
      let match;
      while ((match = NUMBER.exec(text))) {
        const raw = match[0];
        const lead = (seen + text.slice(0, match.index)).trimEnd();
        const token = {
          start: match.index, end: match.index + raw.length,
          value: parseFloat(raw.replace(/,/g, '')),
          decimals: (raw.split('.')[1] || '').length,
          grouped: raw.includes(','),
          from: 0, animate: true
        };
        if (/^(19|20)\d\d$/.test(raw)) token.animate = false;              // a year stays a year
        else if (lead.endsWith('/')) token.animate = false;                 // "21 / 50": the total is fixed
        else if ((lead.endsWith('→') || lead.endsWith('->')) && previous) { // "0.818 → 0.911": count from the old value
          previous.animate = false;
          token.from = previous.value;
        }
        tokens.push(token);
        previous = token;
      }
      if (tokens.length) parts.push({ node, text, tokens });
      seen += text;
    }
    return parts.some(part => part.tokens.some(token => token.animate)) ? { element, parts, done: false } : null;
  }
  const format = (value, token) => {
    const fixed = Math.abs(value).toFixed(token.decimals);
    const [whole, fraction] = fixed.split('.');
    const grouped = token.grouped ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole;
    return (value < 0 ? '-' : '') + (fraction ? `${grouped}.${fraction}` : grouped);
  };
  function paint(counter, progress) {
    counter.parts.forEach(part => {
      let out = '', cursor = 0;
      part.tokens.forEach(token => {
        out += part.text.slice(cursor, token.start);
        out += token.animate ? format(token.from + (token.value - token.from) * progress, token) : part.text.slice(token.start, token.end);
        cursor = token.end;
      });
      part.node.nodeValue = out + part.text.slice(cursor);
    });
  }
  function finish(counter) {
    counter.done = true;
    counter.parts.forEach(part => { part.node.nodeValue = part.text; });
    counter.element.classList.remove('is-counting');
  }
  function run(counter) {
    if (counter.done || counter.running) return;
    counter.running = true;
    counter.element.classList.add('is-counting');
    const duration = 1150;
    const start = performance.now();
    const ease = t => 1 - (1 - t) ** 4;
    const step = now => {
      if (counter.done) return;
      const t = Math.min(1, (now - start) / duration);
      if (t >= 1) { finish(counter); return; }
      paint(counter, ease(t));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // Headline numbers are sized from their length (case-focus.css reads --cf-short / --cf-long).
  // Values over 9 characters ("0.818 → 0.911") get data-long and take two columns, so they no longer
  // shrink the whole strip; every number in a strip still ends up about the same size.
  // Phones use 2 columns: a long card takes a full row, and if that leaves the short cards odd,
  // the last short card takes a full row too (data-wide).
  document.querySelectorAll('.case-stats').forEach(strip => {
    const stats = [...strip.querySelectorAll(':scope > .case-stat')];
    if (!stats.length) return;
    const lengthOf = stat => { const strong = stat.querySelector('strong'); return strong ? strong.textContent.trim().length : 0; };
    let units = 0;
    let shortChars = 5;
    let longChars = 0;
    const short = [];
    stats.forEach(stat => {
      const length = lengthOf(stat);
      const isLong = length > 9;
      stat.toggleAttribute('data-long', isLong);
      stat.removeAttribute('data-wide');
      units += isLong ? 2 : 1;
      if (isLong) longChars = Math.max(longChars, length);
      else { shortChars = Math.max(shortChars, length); short.push(stat); }
    });
    shortChars = Math.max(shortChars, Math.ceil(longChars / 2));
    if (short.length % 2 === 1) short[short.length - 1].setAttribute('data-wide', '');
    strip.style.setProperty('--cf-short', String(shortChars));
    strip.style.setProperty('--cf-long', String(shortChars * 2));
    // One row up to 5 columns; more than that wraps into two balanced rows (LARAS: 2 long + 2 short = 3 x 2).
    strip.style.setProperty('--cf-cols', String(units <= 5 ? units : Math.ceil(units / 2)));
    strip.classList.add('cf-sized');
  });
  if (!reduced.matches && 'IntersectionObserver' in window) {
    document.querySelectorAll('[data-countup]').forEach(element => {
      const counter = planCounter(element);
      if (counter) counters.push(counter);
    });
    if (counters.length) {
      const byElement = new Map(counters.map(counter => [counter.element, counter]));
      // Numbers keep their real text until they come close to the screen (so a never-scrolled capture or a
      // crawler still sees them); only then are they reset to the start value, and they count once visible.
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          run(byElement.get(entry.target));
        });
      }, { threshold: .6 });
      const armer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          armer.unobserve(entry.target);
          const counter = byElement.get(entry.target);
          if (!counter.running && !counter.done) paint(counter, 0);
        });
      }, { rootMargin: '0px 0px 35% 0px' });
      counters.forEach(counter => { armer.observe(counter.element); observer.observe(counter.element); });
      const finishAll = () => counters.forEach(counter => { if (!counter.done) finish(counter); });
      addEventListener('beforeprint', finishAll);
      reduced.addEventListener?.('change', () => { if (reduced.matches) finishAll(); });
    }
  }

  /* ---------- 4. Steps in ol.case-decisions ---------- */
  const stepLists = [...main.querySelectorAll('ol.case-decisions')].filter(list => list.children.length > 1);
  function updateSteps(viewport) {
    const focusLine = viewport * .5;
    stepLists.forEach(list => {
      const items = [...list.children];
      const listRect = list.getBoundingClientRect();
      const first = items[0].getBoundingClientRect(), second = items[1].getBoundingClientRect();
      // Only a single column of steps can follow the reader; a row of side-by-side items is left alone.
      const stacked = second.top >= first.bottom - 2;
      const inView = listRect.top < viewport * .8 && listRect.bottom > viewport * .2;
      let active = null;
      if (stacked && inView) {
        let best = Infinity;
        items.forEach(item => {
          const rect = item.getBoundingClientRect();
          const distance = Math.abs(rect.top + rect.height / 2 - focusLine);
          if (distance < best) { best = distance; active = item; }
        });
      }
      items.forEach(item => item.classList.toggle('is-active', item === active));
      list.classList.toggle('has-active', Boolean(active));
    });
  }

  /* ---------- 5. Active section: the contents link and the section spotlight ---------- */
  let current = -1;
  function updateSections(viewport) {
    if (!sections.length) return;
    const line = Math.max(viewport * .4, (parseFloat(root.style.scrollPaddingTop) || 104) + 24);
    let index = -1;
    sections.forEach((entry, i) => { if (entry.section.getBoundingClientRect().top <= line) index = i; });
    // At the very end of the page the last section counts as read even if it starts low on the screen.
    const atEnd = window.scrollY + viewport >= root.scrollHeight - 4;
    if (atEnd) {
      const last = sections[sections.length - 1].section.getBoundingClientRect();
      if (last.top < viewport) index = sections.length - 1;
    }
    // Once the section has scrolled fully away (into the footer), nothing is current.
    if (index >= 0 && sections[index].section.getBoundingClientRect().bottom < Math.min(line, viewport * .2)) index = -1;
    if (index === current) return;
    current = index;
    sections.forEach((entry, i) => entry.section.classList.toggle('is-current', i === index));
    tocLinks.forEach((link, i) => {
      if (i === index) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    // Keep the active chip visible inside the horizontal bar without moving the page.
    if (tocList && index >= 0 && !wide.matches) {
      const link = tocLinks[index];
      const target = link.offsetLeft - (tocList.clientWidth - link.offsetWidth) / 2;
      tocList.scrollTo({ left: Math.max(0, target), behavior: reduced.matches ? 'auto' : 'smooth' });
    }
  }

  /* ---------- Scroll loop ---------- */
  let frame = 0, lastY = window.scrollY || 0, tucked = false;
  function update() {
    frame = 0;
    const viewport = window.innerHeight || 1;
    const y = window.scrollY || 0;
    const max = Math.max(1, root.scrollHeight - viewport);
    const progress = Math.min(1, Math.max(0, y / max));
    if (progressFill) progressFill.style.transform = `scaleX(${progress.toFixed(4)})`;
    if (toc) toc.style.setProperty('--cf-progress', progress.toFixed(4));
    updateSections(viewport);
    updateSteps(viewport);

    if (toc) {
      if (wide.matches) {
        // The rail steps aside when the dark footer arrives.
        const away = main.getBoundingClientRect().bottom < toc.getBoundingClientRect().bottom + 24;
        toc.classList.toggle('is-away', away);
      } else toc.classList.remove('is-away');
      // Phones: tuck the header while reading down once the chip bar has stuck; bring it back on any scroll up.
      if (phone.matches && sentinel) {
        const stuck = sentinel.getBoundingClientRect().top < headerBottom + 8;
        const delta = y - lastY;
        let next = tucked;
        if (!stuck) next = false;
        else if (delta > 6) next = true;
        else if (delta < -6) next = false;
        if (next !== tucked) { tucked = next; body.classList.toggle('cf-tuck', tucked); }
      } else if (tucked) { tucked = false; body.classList.remove('cf-tuck'); }
    }
    if (Math.abs(y - lastY) > 6 || y === 0) lastY = y;
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const remeasure = () => { measure(); schedule(); };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', remeasure, { passive: true });
  addEventListener('pageshow', remeasure);
  wide.addEventListener?.('change', remeasure);
  phone.addEventListener?.('change', remeasure);
  if (header && 'ResizeObserver' in window) new ResizeObserver(remeasure).observe(header);
  document.fonts?.ready.then(remeasure);

  // A contents link moves keyboard and screen-reader focus to the section heading as well as the view.
  tocLinks.forEach(link => link.addEventListener('click', () => {
    const heading = document.getElementById(link.hash.slice(1));
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }));

  /* ---------- 7. Next case study: picture card built on the link case-study.js prepared ---------- */
  const IMAGES = {
    opsdw: 'opsdw', laras: 'laras', 'decision-hub': 'decision-hub', decisionflow: 'karsa-landing', karsa: 'karsa-landing',
    retentionos: 'retentionos', kinetix: 'kinetix', vera: 'vera', tiktory: 'tiktory', signalops: 'signalops-overview'
  };
  document.querySelectorAll('.case-bottom-next').forEach(box => {
    if (box.hidden) return;
    const link = box.querySelector('a[href]');
    if (!link || link.classList.contains('case-next-card')) return;
    let key = link.dataset.caseId || '';
    if (!key) {
      try { key = (new URL(link.getAttribute('href'), location.href).pathname.match(/case-([a-z0-9-]+)\.html$/) || [])[1] || ''; } catch { key = ''; }
    }
    const name = link.textContent.replace(/[↗→]/g, '').trim();
    if (!name) return;
    const index = box.querySelector('.case-next-index');
    let labelText = index ? index.textContent.trim() : '';
    if (!labelText || /^next project$/i.test(labelText)) labelText = 'Next case study';
    link.classList.add('case-next-card');
    link.textContent = '';
    if (IMAGES[key]) {
      const thumb = document.createElement('span');
      thumb.className = 'case-next-thumb';
      const img = document.createElement('img');
      img.src = `assets/projects/${IMAGES[key]}.webp`;
      img.alt = '';
      img.width = 1600; img.height = 1000;
      img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('error', () => thumb.remove());
      thumb.append(img);
      link.append(thumb);
    }
    const text = document.createElement('span');
    text.className = 'case-next-text';
    const label = document.createElement('span');
    label.className = 'case-next-label';
    label.textContent = labelText;
    const strong = document.createElement('strong');
    strong.className = 'case-next-name';
    strong.textContent = name;
    text.append(label, strong);
    const arrow = document.createElement('span');
    arrow.className = 'case-next-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    link.append(text, arrow);
    if (index) index.hidden = true;
  });

  /* ---------- 8. Phone tables: each row becomes a small card (CSS under 600px) ----------
     Every cell after the first gets its column header as data-label, shown above the value.
     Explicit ARIA table roles keep the table readable to screen readers once CSS sets display:block. */
  main.querySelectorAll('table.case-table').forEach(table => {
    const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    if (!heads.length) return;
    table.setAttribute('role', 'table');
    table.querySelectorAll('thead, tbody, tfoot').forEach(group => group.setAttribute('role', 'rowgroup'));
    table.querySelectorAll('tr').forEach(row => row.setAttribute('role', 'row'));
    table.querySelectorAll('thead th').forEach(th => th.setAttribute('role', 'columnheader'));
    table.querySelectorAll('tbody tr').forEach(row => {
      [...row.children].forEach((cell, i) => {
        cell.setAttribute('role', cell.tagName === 'TH' ? 'rowheader' : 'cell');
        if (heads[i] && !cell.hasAttribute('data-label')) cell.setAttribute('data-label', heads[i]);
      });
    });
    table.classList.add('cf-stack');
  });

  measure();
  update();
})();
