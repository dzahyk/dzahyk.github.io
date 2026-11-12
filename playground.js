/* Pointer playground. No dependency; text comes from the two .hero-line spans. */
(() => {
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  // Alpha sampling and physics are independent of the DOM so they can be tested.
  function sampleMask(data, width, height, initialGap = 4, limit = 9000) {
    let gap = Math.max(2, initialGap), particles;
    do {
      particles = [];
      for (let row = 0, y = gap / 2; y < height; row++, y += gap) {
        for (let col = 0, x = gap / 2; x < width; col++, x += gap) {
          if (data[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] < 150) continue;
          const tone = (col * 7 + row * 11) % 10;
          particles.push({ x, y, homeX: x, homeY: y, vx: 0, vy: 0,
            mobility: (col * 3 + row * 5) % 9 === 0 ? .34 : 1,
            color: tone < 8 ? 0 : tone < 9 ? 1 : 2 });
        }
      }
      if (particles.length > limit) gap *= 1.15;
    } while (particles.length > limit);
    return { particles, gap };
  }

  function gestureRadius(base, pointer) {
    const speed = Math.hypot(pointer.vx || 0, pointer.vy || 0);
    return base * (1 + .42 * clamp(speed / 18, 0, 1) + (pointer.down ? .08 : 0));
  }

  function advanceField(particles, pointer, radius, elapsed = 1, ripples = []) {
    const step = clamp(elapsed, .25, 1.5);
    const damping = Math.pow(.79, step);
    const radiusSquared = radius * radius;
    const flowX = clamp(pointer.vx || 0, -18, 18);
    const flowY = clamp(pointer.vy || 0, -18, 18);
    const flowSpeed = Math.hypot(flowX, flowY);
    let moving = false;
    for (let index = 0; index < particles.length; index++) {
      const p = particles[index];
      let ax = (p.homeX - p.x) * .045;
      let ay = (p.homeY - p.y) * .045;
      if (pointer.active) {
        let dx = p.x - pointer.x, dy = p.y - pointer.y;
        const squared = dx * dx + dy * dy;
        if (squared < radiusSquared) {
          let distance = Math.sqrt(squared);
          if (distance < .01) {
            const angle = index * 2.39996;
            dx = Math.cos(angle); dy = Math.sin(angle); distance = 1;
          }
          const influence = 1 - distance / radius;
          const reach = influence * influence * (p.mobility ?? 1);
          const calm = 1 - clamp(flowSpeed / 8, 0, 1);
          const force = reach * (pointer.down ? 4.8 : 2.9 - calm * .7);
          ax += dx / distance * force;
          ay += dy / distance * force;
          // Slow movement bends the letter pixels as a soft, local lens.
          if (calm > 0) {
            const bend = reach * calm * .34;
            ax += -dy / distance * bend;
            ay += dx / distance * bend;
          }
          if (flowSpeed > .15) {
            // Particles behind the gesture catch more of its wake than those ahead.
            const alignment = (dx * flowX + dy * flowY) / (distance * flowSpeed);
            const wake = .25 + .75 * (1 - alignment) / 2;
            ax += flowX * reach * wake * .35;
            ay += flowY * reach * wake * .35;
            if (flowSpeed > 2) {
              // A small sideways split makes a fast swipe feel like water parting.
              const normalX = -flowY / flowSpeed, normalY = flowX / flowSpeed;
              const side = Math.sign(dx * normalX + dy * normalY);
              const lateral = side * reach * .85 * clamp(flowSpeed / 12, 0, 1);
              ax += normalX * lateral;
              ay += normalY * lateral;
            }
          }
        }
      }
      for (const ripple of ripples) {
        const dx = p.x - ripple.x, dy = p.y - ripple.y;
        const distance = Math.hypot(dx, dy);
        const band = Math.max(10, radius * .15);
        const reach = Math.max(0, 1 - Math.abs(distance - ripple.radius) / band);
        if (reach && distance > .01) {
          const impulse = reach * reach * ripple.strength * (p.mobility ?? 1);
          ax += dx / distance * impulse;
          ay += dy / distance * impulse;
        }
      }
      p.vx = clamp((p.vx + ax * step) * damping, -17, 17);
      p.vy = clamp((p.vy + ay * step) * damping, -17, 17);
      p.x += p.vx * step; p.y += p.vy * step;
      const displacement = Math.abs(p.homeX - p.x) + Math.abs(p.homeY - p.y);
      const speed = Math.abs(p.vx) + Math.abs(p.vy);
      if (!pointer.active && displacement < .06 && speed < .03) {
        p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0;
      } else if (speed > .025 || (!pointer.active && displacement > .06)) {
        moving = true;
      }
    }
    return moving;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sampleMask, gestureRadius, advanceField };
  }
  if (typeof document === 'undefined') return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const canAnimate = () => fine.matches && !reduced.matches;
  // The particle heading itself also runs on touch screens; the custom cursor, hand-off and wave headings stay pointer-only.
  const canField = () => !reduced.matches;
  const root = document.getElementById('heroType');
  const canvas = document.getElementById('heroParticles');
  const ctx = canvas.getContext('2d');
  const handoffCanvas = document.getElementById('heroHandoff');
  const handoffCtx = handoffCanvas?.getContext('2d');
  const exploreLink = document.querySelector('.hero-actions a[href="#work"]');
  const firstProject = document.querySelector('.project-card--featured .project-art');
  const pointer = { x: -1000, y: -1000, vx: 0, vy: 0, active: false, down: false };
  const palette = ['#152c3e', '#a83e1d', '#2e6d9e'];
  let field = [], dotSize = 3, width = 0, height = 0;
  let frame = 0, previousTime = 0, lastPointerAt = 0, inView = true, resizeTimer;
  let ripples = [], handoffFrame = 0, handoffStart = -1, handoffDots = [];

  function activeRipples(time, radius) {
    ripples = ripples.filter(ripple => time - ripple.start < 620);
    return ripples.map(ripple => {
      const progress = clamp((time - ripple.start) / 620, 0, 1);
      return { x: ripple.x, y: ripple.y,
        radius: 8 + progress * radius * 1.6,
        strength: 3.2 * (1 - progress) * (1 - progress) };
    });
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    let lastColor = -1;
    const lensRadius = clamp(width * .105, 70, 112) * .72;
    const calm = 1 - clamp(Math.hypot(pointer.vx, pointer.vy) / 7, 0, 1);
    for (const dot of field) {
      if (dot.color !== lastColor) {
        ctx.fillStyle = palette[dot.color]; lastColor = dot.color;
      }
      const distance = pointer.active ? Math.hypot(dot.x - pointer.x, dot.y - pointer.y) : Infinity;
      const lens = calm * Math.pow(Math.max(0, 1 - distance / lensRadius), 2);
      const size = dotSize * (1 + lens * .2);
      ctx.fillRect(dot.x - size / 2, dot.y - size / 2, size, size);
    }
    // A sparse, short-lived echo reads as water flow without doubling the field.
    ctx.globalAlpha = .36;
    for (let index = 0; index < field.length; index += 13) {
      const dot = field[index];
      if (Math.abs(dot.vx) + Math.abs(dot.vy) < 1.8) continue;
      ctx.fillStyle = dot.color === 0 ? palette[2] : palette[dot.color];
      ctx.fillRect(dot.x - dot.vx * 1.7, dot.y - dot.vy * 1.7, dotSize * .5, dotSize * .5);
    }
    ctx.globalAlpha = 1;
  }
  function stop() {
    cancelAnimationFrame(frame); frame = 0; previousTime = 0;
  }
  function tick(time) {
    frame = 0;
    if (!canField() || !inView || document.hidden || !field.length) return;
    const elapsed = previousTime ? (time - previousTime) / (1000 / 60) : 1;
    previousTime = time;
    const radius = gestureRadius(clamp(width * .105, 70, 112), pointer);
    const waves = activeRipples(time, radius);
    const moving = advanceField(field, pointer, radius, elapsed, waves);
    pointer.vx *= Math.pow(.68, clamp(elapsed, .25, 1.5));
    pointer.vy *= Math.pow(.68, clamp(elapsed, .25, 1.5));
    draw();
    if (moving || ripples.length) frame = requestAnimationFrame(tick);
    else previousTime = 0;
  }
  function wake() {
    if (canField() && inView && !document.hidden && field.length && !frame) {
      frame = requestAnimationFrame(tick);
    }
  }
  // Touch screens: say how to play, and send one ripple through the letters once so the field reads as interactive.
  let touchHinted = false;
  function hintTouch() {
    const hint = root.querySelector('.type-hint');
    if (hint) hint.textContent = 'TAP THE LETTERS ↗';
    if (touchHinted) return;
    touchHinted = true;
    const delay = document.documentElement.classList.contains('nav-intro-running') ? 3200 : 1200;
    setTimeout(() => {
      if (!canField() || !inView || !field.length) return;
      ripples.push({ x: width * .32, y: height * .5, start: performance.now() });
      wake();
    }, delay);
  }
  function resetPointer() {
    pointer.active = false; pointer.down = false; pointer.vx = 0; pointer.vy = 0; lastPointerAt = 0; wake();
  }

  function stopHandoff() {
    cancelAnimationFrame(handoffFrame); handoffFrame = 0;
    handoffDots = []; handoffStart = -1;
    handoffCanvas?.classList.remove('is-active');
    if (handoffCtx) handoffCtx.clearRect(0, 0, innerWidth, innerHeight);
  }

  function paintHandoff(time) {
    handoffFrame = 0;
    if (!canAnimate() || document.hidden || !handoffDots.length) { stopHandoff(); return; }
    if (handoffStart < 0) handoffStart = time;
    const progress = clamp((time - handoffStart) / 1050, 0, 1);
    const destination = firstProject.getBoundingClientRect();
    const targetX = destination.left + destination.width * .5;
    const targetY = destination.top + Math.min(destination.height * .28, 130);
    handoffCtx.clearRect(0, 0, innerWidth, innerHeight);
    for (const dot of handoffDots) {
      const local = clamp((progress - dot.delay) / (1 - dot.delay), 0, 1);
      if (!local || local >= 1) continue;
      const eased = 1 - Math.pow(1 - local, 4);
      const spread = (dot.index % 13 - 6) * 4;
      const x = dot.x + (targetX + spread - dot.x) * eased;
      const y = dot.y + (targetY + (dot.index % 7 - 3) * 4 - dot.y) * eased
        - Math.sin(Math.PI * local) * (24 + dot.index % 5 * 5);
      handoffCtx.globalAlpha = Math.min(1, local * 8) * (1 - Math.pow(local, 3));
      handoffCtx.fillStyle = palette[dot.color];
      handoffCtx.fillRect(x, y, dotSize * .85, dotSize * .85);
    }
    handoffCtx.globalAlpha = 1;
    if (progress < 1) handoffFrame = requestAnimationFrame(paintHandoff);
    else stopHandoff();
  }

  function startHandoff(event) {
    // Keep the native link and hash navigation; the pixels are only a visual bridge.
    if (event.detail === 0 || !canAnimate() || !inView || !handoffCtx || !firstProject ||
        !field.length || document.documentElement.classList.contains('nav-intro-running')) return;
    stopHandoff();
    const density = Math.min(devicePixelRatio || 1, 2);
    handoffCanvas.width = Math.round(innerWidth * density);
    handoffCanvas.height = Math.round(innerHeight * density);
    handoffCtx.setTransform(density, 0, 0, density, 0, 0);
    const bounds = root.getBoundingClientRect();
    const stride = Math.max(1, Math.floor(field.length / 88));
    handoffDots = field.filter((_, index) => index % stride === 0).slice(0, 88)
      .map((dot, index) => ({ x: bounds.left + dot.x, y: bounds.top + dot.y,
        color: dot.color, index, delay: index % 9 * .012 }));
    if (!handoffDots.length) return;
    handoffCanvas.classList.add('is-active');
    handoffFrame = requestAnimationFrame(paintHandoff);
  }

  function rebuild() {
    stop();
    ripples = [];
    root.classList.remove('is-particle-ready');
    if (!ctx || !canField()) { field = []; return; }
    width = Math.round(root.clientWidth); height = Math.round(root.clientHeight);
    if (width < 1 || height < 1) return;
    const density = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    ctx.setTransform(density, 0, 0, density, 0, 0);

    const mask = document.createElement('canvas');
    mask.width = width; mask.height = height;
    const ink = mask.getContext('2d', { willReadFrequently: true });
    if (!ink) return;
    const lines = [...root.querySelectorAll('.hero-line')].map(el => el.textContent.trim());
    if (!lines.some(Boolean)) return;
    const family = getComputedStyle(root.querySelector('h1')).fontFamily;
    ink.font = `400 100px ${family}`;
    const longest = Math.max(1, ...lines.map(line => ink.measureText(line).width));
    const fontSize = Math.min((width - 34) / longest * 100, (height - 20) / (lines.length * .98));
    ink.font = `400 ${fontSize}px ${family}`;
    ink.fillStyle = '#000'; ink.textAlign = 'left'; ink.textBaseline = 'alphabetic';
    const metrics = ink.measureText('Hgj');
    const ascent = metrics.actualBoundingBoxAscent || fontSize * .78;
    const descent = metrics.actualBoundingBoxDescent || fontSize * .18;
    const lineHeight = fontSize * .98;
    const blockHeight = ascent + descent + lineHeight * (lines.length - 1);
    const firstBaseline = (height - blockHeight) / 2 + ascent;
    lines.forEach((line, index) => ink.fillText(line, 4, firstBaseline + index * lineHeight));

    const gap = Math.max(3.3, Math.sqrt(width * height / 23500));
    const sampled = sampleMask(ink.getImageData(0, 0, width, height).data, width, height, gap);
    field = sampled.particles.sort((a, b) => a.color - b.color);
    dotSize = sampled.gap * .74;
    pointer.active = false; pointer.down = false; pointer.vx = 0; pointer.vy = 0; lastPointerAt = 0;
    if (!field.length) return;
    draw();
    // Only replace the visual heading once the first complete canvas is ready.
    root.classList.add('is-particle-ready');
    if (!fine.matches) hintTouch();
    wake();
  }

  root.addEventListener('pointermove', event => {
    // A finger only steers the dots while it is down; a vertical swipe still scrolls (touch-action: pan-y).
    if (!canField() || document.documentElement.classList.contains('nav-intro-running') || (event.pointerType === 'touch' && !pointer.down)) return;
    const bounds = root.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const now = performance.now();
    if (pointer.active && lastPointerAt) {
      const interval = clamp((now - lastPointerAt) / (1000 / 60), .5, 4);
      pointer.vx = clamp(pointer.vx * .3 + (x - pointer.x) / interval * .7, -18, 18);
      pointer.vy = clamp(pointer.vy * .3 + (y - pointer.y) / interval * .7, -18, 18);
    }
    pointer.x = x; pointer.y = y; lastPointerAt = now;
    pointer.active = true; wake();
  }, { passive: true });
  root.addEventListener('pointerdown', event => {
    if (!canField() || !ctx || document.documentElement.classList.contains('nav-intro-running')) return;
    const bounds = root.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    pointer.active = true;
    pointer.down = true;
    ripples.push({ x: pointer.x, y: pointer.y, start: performance.now() });
    if (ripples.length > 2) ripples.shift();
    wake();
  }, { passive: true });
  root.addEventListener('pointerleave', resetPointer);
  root.addEventListener('pointercancel', resetPointer);
  addEventListener('pointerup', event => { pointer.down = false; if (event.pointerType === 'touch') resetPointer(); else wake(); }, { passive: true });
  addEventListener('blur', resetPointer);
  // Stop painting offscreen and while the tab is hidden; restart only when needed.
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    if (inView) wake(); else { resetPointer(); stop(); }
  }, { threshold: 0 }).observe(root);
  document.addEventListener('visibilitychange', () => {
    resetPointer();
    if (document.hidden) { stop(); stopHandoff(); } else wake();
  });
  new ResizeObserver(() => {
    clearTimeout(resizeTimer); resizeTimer = setTimeout(rebuild, 100);
  }).observe(root);
  reduced.addEventListener('change', () => { stopHandoff(); rebuild(); });
  fine.addEventListener('change', () => { stopHandoff(); rebuild(); });
  addEventListener('resize', stopHandoff);
  exploreLink?.addEventListener('click', startHandoff);
  rebuild();
  // Font loading only refines the particle mask; it never controls entrance timing.
  if (document.fonts) document.fonts.ready.then(rebuild).catch(() => {});

  // Native blue SVG pointer + a contextual label, updated only after pointer input.
  const tag = document.getElementById('pointerCursor');
  let cursorFrame = 0, cursorX = 0, cursorY = 0, cursorState = 'You', pressed = false;
  function hideTag() {
    cancelAnimationFrame(cursorFrame); cursorFrame = 0;
    tag.classList.remove('is-visible');
  }
  function setCursorMode() {
    document.documentElement.classList.toggle('canvas-cursor', canAnimate());
    if (!canAnimate()) hideTag();
  }
  function paintTag() {
    cursorFrame = 0;
    const estimatedWidth = Math.max(42, cursorState.length * 8 + 18);
    const x = Math.min(cursorX + 16, innerWidth - estimatedWidth - 6);
    const y = Math.min(cursorY + 21, innerHeight - 31);
    tag.style.transform = `translate3d(${Math.max(4, x)}px,${Math.max(4, y)}px,0)`;
    tag.textContent = cursorState; tag.dataset.state = cursorState;
    tag.classList.add('is-visible');
  }
  function updateTag(event) {
    if (!canAnimate() || event.pointerType === 'touch') return;
    cursorX = event.clientX; cursorY = event.clientY;
    const target = event.target instanceof Element ? event.target : null;
    const action = target?.closest('a,button,summary');
    const context = target?.closest('[data-cursor]');
    cursorState = action ? action.dataset.cursor || 'Click' : context?.dataset.cursor || 'You';
    if (cursorState === 'Drag' && pressed) cursorState = 'Dragging';
    if (!cursorFrame) cursorFrame = requestAnimationFrame(paintTag);
  }
  addEventListener('pointermove', updateTag, { passive: true });
  addEventListener('pointerdown', event => { pressed = true; updateTag(event); }, { passive: true });
  addEventListener('pointerup', event => { pressed = false; updateTag(event); }, { passive: true });
  document.addEventListener('pointerleave', hideTag);
  addEventListener('blur', () => { pressed = false; hideTag(); });
  document.addEventListener('keydown', event => { if (event.key === 'Tab') hideTag(); });
  fine.addEventListener('change', setCursorMode);
  reduced.addEventListener('change', setCursorMode);
  setCursorMode();

  // Lift nearby letters in the footer wordmark.
  function attachLetterWave(heading) {
    const visual = document.createElement('span');
    visual.className = 'wave-visual'; visual.setAttribute('aria-hidden', 'true');
    while (heading.firstChild) visual.append(heading.firstChild);
    const spoken = visual.cloneNode(true);
    spoken.querySelectorAll('br').forEach(lineBreak => lineBreak.replaceWith(' '));
    if (!heading.hasAttribute('aria-hidden')) heading.setAttribute('aria-label', spoken.textContent.trim());
    heading.append(visual); heading.classList.add('wave-heading');
    const walker = document.createTreeWalker(visual, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(node => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(word => {
        if (!word.trim()) { fragment.append(document.createTextNode(word)); return; }
        const wrap = document.createElement('span'); wrap.className = 'wave-word';
        Array.from(word).forEach(letter => {
          const span = document.createElement('span'); span.className = 'wave-letter';
          span.textContent = letter; wrap.append(span);
        });
        fragment.append(wrap);
      });
      node.replaceWith(fragment);
    });
    const letters = [...visual.querySelectorAll('.wave-letter')];
    let bases = [], pending = 0, mx = 0, my = 0;
    const reset = () => {
      cancelAnimationFrame(pending); pending = 0; bases = [];
      letters.forEach(letter => { letter.style.transform = ''; });
    };
    heading.addEventListener('pointermove', event => {
      if (!canAnimate()) return;
      if (!bases.length) bases = letters.map(letter => letter.getBoundingClientRect());
      mx = event.clientX; my = event.clientY;
      if (!pending) pending = requestAnimationFrame(() => {
        pending = 0;
        const size = parseFloat(getComputedStyle(heading).fontSize);
        const radius = Math.min(230, size * 1.7), lift = Math.min(24, size * .18);
        letters.forEach((letter, index) => {
          const bounds = bases[index];
          const dx = mx - (bounds.left + bounds.width / 2);
          const dy = my - (bounds.top + bounds.height / 2);
          const amount = Math.pow(Math.max(0, 1 - Math.hypot(dx, dy) / radius), 2);
          letter.style.transform = `translateY(${-amount * lift}px) rotate(${amount * (dx < 0 ? 3 : -3)}deg)`;
        });
      });
    }, { passive: true });
    heading.addEventListener('pointerleave', reset);
    addEventListener('scroll', reset, { passive: true });
    addEventListener('resize', reset);
    reduced.addEventListener('change', reset);
    fine.addEventListener('change', reset);
  }
  document.querySelectorAll('.giant-word').forEach(attachLetterWave);
})();
