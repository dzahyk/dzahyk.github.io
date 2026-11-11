/* Scrollytelling: flowing narrative steps drive a sticky studio illustration. */
(() => {
  const section = document.querySelector('.about[data-scroll-story]');
  const composition = section?.querySelector('.about-composition');
  const atelier = section?.querySelector('.about-atelier');
  const stage = section?.querySelector('.about-atelier-stage');
  const controls = section?.querySelector('.about-scene-controls');
  const buttons = controls ? [...controls.querySelectorAll('[data-scene-index]')] : [];
  const panels = section ? [...section.querySelectorAll('.about-chapter')] : [];
  const notation = section?.querySelector('.about-scene-notation');
  const number = notation?.querySelector('.about-scene-number');
  const name = notation?.querySelector('.about-scene-name');
  const artMask = stage?.querySelector('.about-art-mask');
  const status = section?.querySelector('[role="status"]');
  const caption = section?.querySelector('#aboutAtelierCaption');
  const header = document.querySelector('.site-header');
  if (!composition || !atelier || !stage || !controls || !notation || !number || !name || !artMask || buttons.length !== 3 || panels.length !== 3) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = n => Math.max(0, Math.min(1, n));
  const between = (p, a, b) => clamp((p - a) / (b - a));
  const ease = p => p * p * (3 - 2 * p);
  const smooth = p => p * p * p * (p * (p * 6 - 15) + 10);
  const phase = (p, a, b) => smooth(between(p, a, b));
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const radians = degrees => degrees * Math.PI / 180;
  const degrees = angle => angle * 180 / Math.PI;
  const rotate = (point, pivot, angle) => {
    const c = Math.cos(radians(angle)), s = Math.sin(radians(angle));
    const x = point.x - pivot.x, y = point.y - pivot.y;
    return { x: pivot.x + x * c - y * s, y: pivot.y + x * s + y * c };
  };
  const rig = Object.fromEntries([
    'shift', 'body', 'arm--front', 'forearm--front', 'hand--front', 'arm--back',
    'forearm--back', 'hand--back', 'leg--front', 'shin--front', 'foot--front',
    'leg--back', 'shin--back', 'foot--back', 'pencil'
  ].map(part => [part, stage.querySelector(`.about-maker-${part}`)]));
  const maker = stage.querySelector('.about-maker');
  const shadow = stage.querySelector('.about-maker-shadow');
  const rigReady = maker && Object.values(rig).every(Boolean);
  // Board coordinates share the SVG's authored polylines: ink can only appear
  // where the pencil has actually travelled, including when scroll reverses.
  const writing = [...stage.querySelectorAll('.about-writing-stroke')].map(element => {
    const pairs = element.getAttribute('points').trim().split(/\s+/);
    const points = pairs.map(pair => { const [x, y] = pair.split(',').map(Number); return { x, y }; });
    const segments = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
    return { element, points, segments, length: segments.reduce((sum, length) => sum + length, 0) };
  });
  const writingLength = writing.reduce((sum, stroke) => sum + stroke.length, 0);
  let writingCursor = 0;
  writing.forEach(stroke => {
    stroke.start = writingCursor;
    // Short marks receive a readable minimum; gaps let the wrist lift and reset.
    stroke.end = stroke.start + .76 * (.6 * stroke.length / writingLength + .4 / writing.length);
    writingCursor = stroke.end + .24 / Math.max(1, writing.length - 1);
  });
  const notes = [...stage.querySelectorAll('.about-brainstorm-note')].map(element => ({
    element, x: Number(element.dataset.x), y: Number(element.dataset.y),
    goalX: Number(element.dataset.goalX), goalY: Number(element.dataset.goalY),
    last: writing.findLast(stroke => element.contains(stroke.element))
  }));
  const noteCaptions = {
    clear: 'Clear: one supplier score, with every part on screen.',
    bold: 'Bold: show the stock line before it runs out.',
    useful: 'Useful: let the manager test a split before moving an order.'
  };
  // A reading hold precedes every action. Targets sit inside reading intervals,
  // so chapter navigation doesn't skip straight to the completed illustration.
  const scenes = [
    { id: 'observe', label: 'Question', target: .15, textStart: .035, textSplit: .11, textEnd: .22 },
    { id: 'compose', label: 'Sketch', target: .50, textStart: .36, textSplit: .40, textEnd: .44 },
    { id: 'resolve', label: 'Build', target: .88, textStart: .78, textSplit: .82, textEnd: .88 }
  ];
  let pinned = false, dock = 104, readingLine = 440;
  let frame = 0, layoutDirty = false, lastPaint = -1, stepGeometry = [], anchors = [];

  function offsetAt(p) {
    const index = Math.max(1, anchors.findIndex(anchor => anchor.progress >= p));
    const right = anchors[index], left = anchors[index - 1];
    return left.offset + (right.offset - left.offset) * between(p, left.progress, right.progress);
  }

  function wrapInk(element) {
    if (!element) return { words: [], ordered: [] };
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const words = [];
    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      for (const text of node.textContent.split(/(\s+)/)) {
        if (!text.trim()) { fragment.append(text); continue; }
        const word = document.createElement('span');
        word.className = 'about-ink-word'; word.textContent = text;
        words.push(word); fragment.append(word);
      }
      node.replaceWith(fragment);
    }
    return { words, ordered: [] };
  }
  const labelInk = wrapInk(section.querySelector('.about-label h2'));
  const chapterInk = panels.map(panel => [panel.querySelector('h3'), panel.querySelector('.about-chapter-copy')].map(wrapInk));
  const inkGroups = [labelInk, ...chapterInk.flat()];

  function measureInk() {
    // Top-to-bottom lines, right-to-left words within each line. Measurement
    // happens on layout changes only, not on every scroll input.
    for (const group of inkGroups) {
      const lines = [];
      for (const word of group.words) {
        const rect = word.getBoundingClientRect();
        let line = lines.find(row => Math.abs(row.top - rect.top) < 3);
        if (!line) { line = { top: rect.top, words: [] }; lines.push(line); }
        line.words.push({ word, left: rect.left });
      }
      const ordered = lines.sort((a, b) => a.top - b.top).flatMap(line => line.words.sort((a, b) => b.left - a.left));
      const total = group.words.reduce((sum, word) => sum + word.textContent.length, 0) || 1;
      let offset = 0;
      group.ordered = ordered.map(({ word }) => {
        const start = offset / total, length = word.textContent.length / total;
        offset += word.textContent.length;
        return { word, start, length };
      });
    }
  }
  function paintInk(group, progress) {
    for (const { word, start, length } of group.ordered) {
      const value = `${(100 * clamp((progress - start) / length)).toFixed(2)}%`;
      if (word.style.getPropertyValue('--ink-progress') !== value) word.style.setProperty('--ink-progress', value);
    }
  }
  // Two rigid links keep elbows/knees and contact points connected. Angles are
  // relative to a downward SVG limb; the end is clamped to anatomical reach.
  function jointPose(origin, target, first, second, bend = 1) {
    const dx = target.x - origin.x, dy = target.y - origin.y;
    const raw = Math.hypot(dx, dy) || .001;
    const distance = Math.max(Math.abs(first - second) + .001, Math.min(first + second - .001, raw));
    const elbow = bend * Math.acos(Math.max(-1, Math.min(1, (distance * distance - first * first - second * second) / (2 * first * second))));
    const shoulder = Math.atan2(dy, dx) - Math.atan2(second * Math.sin(elbow), first + second * Math.cos(elbow));
    return { upper: degrees(shoulder) - 90, lower: degrees(elbow), end: { x: origin.x + dx * distance / raw, y: origin.y + dy * distance / raw } };
  }
  function limb(side, type, origin, target, first, second, bend, bodyAngle = 0, gesture = null) {
    const pose = jointPose(origin, target, first, second, bend);
    if (gesture?.weight) {
      const goal = jointPose(origin, gesture.target, first, second, gesture.bend);
      const turn = ((goal.upper - pose.upper + 540) % 360) - 180;
      pose.upper += turn * gesture.weight;
      // Pass through an extended elbow before folding into the raised gesture.
      pose.lower += (goal.lower - pose.lower) * gesture.weight;
      const a = radians(pose.upper), b = radians(pose.upper + pose.lower);
      pose.end = { x: origin.x - first * Math.sin(a) - second * Math.sin(b), y: origin.y + first * Math.cos(a) + second * Math.cos(b) };
    }
    const upper = type === 'arm' ? `arm--${side}` : `leg--${side}`;
    const lower = type === 'arm' ? `forearm--${side}` : `shin--${side}`;
    const tip = type === 'arm' ? `hand--${side}` : `foot--${side}`;
    rig[upper].setAttribute('transform', `translate(${origin.x.toFixed(4)} ${origin.y.toFixed(4)}) rotate(${pose.upper.toFixed(4)})`);
    rig[lower].setAttribute('transform', `translate(0 ${first}) rotate(${pose.lower.toFixed(4)})`);
    // Hands and soles stay level while their parent links rotate.
    rig[tip].setAttribute('transform', `translate(0 ${second}) rotate(${(-pose.upper - pose.lower - bodyAngle).toFixed(4)})`);
    return pose.end;
  }
  function writingPose(p) {
    const progress = between(p, .56, .71);
    let point = writing[0]?.points[0] || { x: 16, y: 65 }, lift = 0;
    // Reset every mark first; stopping at the active mark would leave future
    // strokes visible after scrolling backwards or jumping between chapters.
    for (const stroke of writing) {
      const amount = smooth(between(progress, stroke.start, stroke.end));
      stroke.element.setAttribute('stroke-dashoffset', (1 - amount).toFixed(6));
      stroke.element.setAttribute('opacity', amount > 0 ? '1' : '0');
    }
    for (let i = 0; i < writing.length; i++) {
      const stroke = writing[i], amount = smooth(between(progress, stroke.start, stroke.end));
      if (progress >= stroke.end) { point = stroke.points[stroke.points.length - 1]; continue; }
      if (progress < stroke.start) {
        const previous = writing[i - 1], travel = between(progress, previous.end, stroke.start);
        point = mix(previous.points[previous.points.length - 1], stroke.points[0], smooth(travel));
        lift = Math.sin(Math.PI * travel) ** 2;
      } else {
        let distance = stroke.length * amount;
        for (let j = 0; j < stroke.segments.length; j++) {
          const length = stroke.segments[j];
          if (distance <= length) { point = mix(stroke.points[j], stroke.points[j + 1], distance / length); break; }
          distance -= length;
        }
      }
      break;
    }
    return { point, lift, progress };
  }
  function paintCharacter(p, finish) {
    if (!rigReady) return {};
    const stride = 21.6;
    const a = between(p, .44, .49), b = between(p, .49, .54);
    const c = between(p, .795, .84), d = between(p, .84, .885);
    const frontStep = stride * (smooth(a) - smooth(d));
    const backStep = stride * (smooth(b) - smooth(c));
    const lift = t => 2.8 * Math.sin(Math.PI * t) ** 2;
    const frontLift = lift(a) + lift(d), backLift = lift(b) + lift(c);
    const focus = phase(p, .425, .555) * (1 - phase(p, .75, .865));
    const curious = 1 - phase(p, .285, .35);
    const question = phase(p, .035, .10) * (1 - phase(p, .265, .32));
    // Approval follows the completed artwork, with a short final pose hold.
    const approval = phase(p, .96, .992);
    const thumbs = phase(p, .968, .984);
    const shift = { x: (frontStep + backStep) / 2, y: 3.1 * Math.abs(frontStep - backStep) / stride + .2 * Math.max(frontLift, backLift) + .15 * focus };
    const bodyAngle = 2.6 * focus - .6 * curious - approval;
    const pivot = { x: 24, y: 49 };
    // 48×72 character, 22% of a 1.5-ratio stage; feet share the room floor.
    const scaleX = .22 / 48, scaleY = scaleX * 1.5;
    const world = point => {
      const local = rotate(point, pivot, bodyAngle);
      return { x: .27 + (local.x + shift.x) * scaleX, y: .385 + (local.y + shift.y) * scaleY };
    };
    const local = point => rotate({ x: (point.x - .27) / scaleX - shift.x, y: (point.y - .385) / scaleY - shift.y }, pivot, -bodyAngle);
    rig.shift.setAttribute('transform', `translate(${shift.x.toFixed(4)} ${shift.y.toFixed(4)})`);
    rig.body.setAttribute('transform', `rotate(${bodyAngle.toFixed(4)} 24 49)`);
    for (const [side, x, step, footLift] of [['front', 29, frontStep, frontLift], ['back', 19, backStep, backLift]]) {
      const hip = rotate({ x, y: 45.2 }, pivot, bodyAngle);
      limb(side, 'leg', hip, { x: x + step - shift.x, y: 68 - footLift - shift.y }, 11, 12, 1);
    }
    shadow?.setAttribute('transform', `translate(${(shift.x * 2.2).toFixed(3)} 0)`);

    const paperDesk = { x: .53, y: .726 }, pencilDesk = { x: .566, y: .715 };
    const ink = writingPose(p);
    const writingWeight = phase(p, .535, .56) * (1 - phase(p, .71, .745));
    const penAngle = (-25 - 8 * ink.lift) * writingWeight;
    // The 9-unit pencil tip, not the palm, touches the authored board geometry.
    // Between marks it moves left/up, off the page, before returning to contact.
    const work = {
      x: .54 + (.275 / 132) * (ink.point.x - 3 * ink.lift) - 9 * scaleX * Math.cos(radians(penAngle)),
      y: .34 + (.3625 / 116) * (ink.point.y - 4 * ink.lift) - 9 * scaleY * Math.sin(radians(penAngle))
    };
    let hand = mix(world({ x: 41, y: 51 }), world({ x: 42, y: 46 }), curious);
    hand = mix(hand, paperDesk, phase(p, .44, .51));
    hand = mix(hand, pencilDesk, phase(p, .51, .535));
    hand = mix(hand, work, phase(p, .535, .56));
    hand = mix(hand, pencilDesk, phase(p, .71, .745));
    hand = mix(hand, world({ x: 38, y: 51 }), phase(p, .75, .785));
    const grip = world(limb('front', 'arm', { x: 31, y: 32 }, local(hand), 13, 13, 1, bodyAngle,
      approval > 0 ? { target: { x: 41, y: 31 }, bend: -1, weight: approval }
        : { target: local(hand), bend: -1, weight: writingWeight }));
    const rear = mix(world({ x: 13, y: 51 }), world({ x: 28.7, y: 30 }), curious);
    const brace = phase(p, .47, .54) * (1 - phase(p, .735, .785));
    limb('back', 'arm', { x: 15, y: 32 }, local(mix(rear, { x: .455, y: .725 }, brace)), 12, 12, -1, bodyAngle,
      { target: { x: 9, y: 31 }, bend: 1, weight: approval });
    const pencil = phase(p, .518, .532) * (1 - phase(p, .737, .75));
    rig.pencil.setAttribute('transform', `rotate(${penAngle.toFixed(4)})`);
    maker.dataset.expression = finish > .5 ? 'pleased' : focus > .5 ? 'focused' : 'curious';
    maker.dataset.gesture = approval > .5 ? 'double-thumbs' : curious > .5 ? 'thinking' : p >= .56 && p <= .71 ? 'writing' : 'working';
    const blink = phase(p, .258, .264) * (1 - phase(p, .268, .276))
      + phase(p, .775, .781) * (1 - phase(p, .785, .793));
    const placed = phase(p, .48, .515);
    const sheet = p < .51 ? grip : paperDesk;
    return {
      '--body-angle': `${bodyAngle}deg`, '--head-angle': `${-4 * curious + 2.5 * focus + (ink.point.y - 76) * .08 * writingWeight - finish - approval}deg`,
      '--question-opacity': question, '--question-y': `${3 * (1 - question)}px`, '--question-scale': .9 + .1 * question,
      '--thumbs-up': thumbs,
      '--face-curious': (1 - focus) * (1 - finish), '--face-focus': focus * (1 - finish), '--face-pleased': finish,
      '--happy-eyes': phase(p, .94, .968),
      '--eye-close': Math.max(blink, .28 * focus), '--gaze-x': `${.45 * focus - .4 * finish}px`,
      '--brow-y': `${-.65 * curious + .45 * focus - .2 * finish}px`, '--brow-angle': `${-7 * focus}deg`,
      '--pencil-held': pencil,
      '--sheet-left': `${sheet.x * 100}%`, '--sheet-top': `${(sheet.y - .1) * 100}%`,
      '--sheet-angle': `${-8 * (1 - placed)}deg`, '--sheet-opacity': 1, '--sheet-flat': 1 - .84 * placed
    };
  }
  function paint(p) {
    lastPaint = p;
    const index = p < .33 ? 0 : p < .75 ? 1 : 2;
    // The prose physically passes through the viewport. Only the illustration
    // receives a light optical handover; narrative text is never hidden.
    const chapterOpacity = p < .30 ? 1 : p < .33 ? 1 - ease(between(p, .30, .33))
      : p < .36 ? ease(between(p, .33, .36)) : p < .72 ? 1
      : p < .75 ? 1 - ease(between(p, .72, .75)) : p < .78 ? ease(between(p, .75, .78)) : 1;
    const transition = 1 - chapterOpacity;
    const drawing = between(p, .56, .71);
    const finish = ease(between(p, .90, .96));
    const camera = ease(between(p, .30, .48)) * (1 - ease(between(p, .795, .98)));
    // Keep the actual written notes. They move together into the goal rather
    // than being erased and replaced by unrelated finished artwork.
    const convergence = smooth(between(p, .90, .96));
    for (const note of notes) {
      note.element.setAttribute('transform', `translate(${((note.goalX - note.x) * convergence).toFixed(4)} ${((note.goalY - note.y) * convergence).toFixed(4)})`);
    }
    const latest = notes.filter(note => note.last && drawing >= note.last.end).at(-1);
    const captionText = finish > 0 ? 'The notes become Kinetix.'
      : p >= .75 ? 'Keep the decisions. Bring them together into one usable view.'
      : latest ? noteCaptions[latest.element.dataset.note] : p >= .56 ? 'Try a direction. Write it down. Connect the ideas.'
      : p >= .33 ? 'One traceable score. A visible stock line. A way to test a split.'
      : 'Start with a question. Which supplier needs attention first?';
    if (caption && caption.textContent !== captionText) caption.textContent = captionText;
    const values = {
      '--scene-progress': p, ...paintCharacter(p, finish),
      // A supported board makes only a small settling movement; a large tilt
      // would detach its lower edge from the desk-mounted support.
      '--board-angle': `${-1.5 * (1 - phase(p, .49, .555))}deg`, '--board-y': `${2 * (1 - phase(p, .49, .555))}px`,
      '--sketch-progress': drawing, '--sketch-opacity': 1,
      '--brainstorm-links': 1 - convergence, '--brainstorm-prompt': 1 - phase(p, .50, .56),
      '--room-light': .12 + .10 * ease(p),
      // Environmental detail advances only with the story, never on a clock.
      '--outside-drift': `${6 * ease(p)}px`, '--task-light': .08 + .22 * phase(p, .45, .54),
      '--steam-opacity': .12 + .10 * ease(p), '--steam-y': `${-ease(p)}px`,
      '--scene-transition': pinned ? transition : 0, '--scene-blur': `${pinned ? transition * 2.5 : 0}px`,
      '--camera-scale': 1 + (pinned ? camera * .045 : 0),
      '--camera-x': `${pinned ? camera * -5 : 0}px`, '--camera-y': `${pinned ? camera * 2 : 0}px`
    };
    for (const [key, value] of Object.entries(values)) stage.style.setProperty(key, String(value));
    artMask.setAttribute('y', (116 * (1 - finish)).toFixed(3));
    notation.style.setProperty('--scene-progress', String(p));
    stage.dataset.scene = scenes[index].id;
    number.textContent = `0${index + 1} / 03`; name.textContent = scenes[index].label;
    panels.forEach((panel, i) => {
      panel.classList.toggle('is-current', i === index);
      const geometry = stepGeometry[i];
      const distance = geometry ? Math.abs(offsetAt(p) - geometry.top - geometry.height / 2) : 0;
      const presence = pinned && geometry ? 1 - ease(clamp(distance / (geometry.height * .75))) : 1;
      panel.style.setProperty('--step-presence', String(presence));
    });
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));

    paintInk(labelInk, pinned ? between(p, 0, .035) : 1);
    chapterInk.forEach((groups, i) => {
      const scene = scenes[i];
      paintInk(groups[0], pinned ? between(p, scene.textStart, scene.textSplit) : 1);
      paintInk(groups[1], pinned ? between(p, scene.textSplit, scene.textEnd) : 1);
    });
  }

  function refreshLayout() {
    // Only the illustration needs to fit. Long or personalized prose always
    // flows in the document instead of being trapped in a pinned composition.
    // Use the dock's layout box, not its temporary center-to-navbar intro pose.
    const headerBottom = header?.offsetHeight
      ? (parseFloat(getComputedStyle(header).top) || 18) + header.offsetHeight
      : header?.getBoundingClientRect().bottom || 84;
    dock = Math.max(20, headerBottom + 20);
    section.style.setProperty('--about-dock', `${dock}px`);
    const candidate = innerWidth >= 900 && !reduced.matches && (typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || CSS.supports('position', 'sticky'));
    section.classList.toggle('is-scrollytelling', candidate);
    controls.hidden = !candidate;
    const visualHeight = atelier.getBoundingClientRect().height;
    pinned = candidate && visualHeight > 0 && visualHeight + dock + 28 <= innerHeight;
    section.classList.toggle('is-scrollytelling', pinned);
    if (!pinned && controls.contains(document.activeElement)) {
      const heading = section.querySelector('.about-label h2');
      heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
    }
    controls.hidden = !pinned;
    const sectionTop = section.getBoundingClientRect().top;
    stepGeometry = panels.map(panel => {
      const bounds = panel.getBoundingClientRect();
      return { top: bounds.top - sectionTop, height: bounds.height };
    });
    const first = stepGeometry[0], last = stepGeometry[2];
    // Anchor each chapter to its actual reading centre, even when personalized
    // prose changes one step's height. Equal section thirds would desync it.
    anchors = [
      { offset: first.top + first.height * .2, progress: 0 },
      ...stepGeometry.map((step, i) => ({ offset: step.top + step.height / 2, progress: scenes[i].target })),
      { offset: last.top + last.height * .75, progress: 1 }
    ];
    readingLine = dock + (innerHeight - dock) * .48;
    measureInk();
    layoutDirty = false;
  }
  function readPosition() {
    if (!pinned) return 1;
    const offset = readingLine - section.getBoundingClientRect().top;
    if (offset <= anchors[0].offset) return 0;
    for (let i = 1; i < anchors.length; i++) {
      const left = anchors[i - 1], right = anchors[i];
      if (offset <= right.offset) return left.progress + (right.progress - left.progress) * between(offset, left.offset, right.offset);
    }
    return 1;
  }
  function tick() {
    frame = 0;
    if (document.hidden) return;
    const refresh = layoutDirty;
    if (refresh) refreshLayout();
    const progress = readPosition();
    // Offscreen scroll still checks geometry, but doesn't repaint a held pose.
    if (refresh || progress !== lastPaint) paint(progress);
    // No trailing spring or timeline: the visitor's scroll is the clock.
  }
  function schedule() { if (!frame && !document.hidden) frame = requestAnimationFrame(tick); }
  function scheduleLayout() { layoutDirty = true; schedule(); }
  buttons.forEach((button, index) => button.addEventListener('click', () => {
    if (layoutDirty) refreshLayout();
    if (!pinned) return;
    const top = Math.max(0, scrollY + section.getBoundingClientRect().top + offsetAt(scenes[index].target) - readingLine);
    if (status) {
      const spoken = panels[index].querySelector('h3').cloneNode(true);
      spoken.querySelectorAll('br').forEach(br => br.replaceWith(' '));
      status.textContent = spoken.textContent.replace(/\s+/g, ' ').trim();
    }
    scrollTo({ top, behavior: 'smooth' });
    // Keep keyboard focus on the chosen button. State updates from actual scroll.
  }));
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', scheduleLayout, { passive: true });
  document.fonts?.ready.then(scheduleLayout);
  document.addEventListener('load', scheduleLayout, true);
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(scheduleLayout);
    observer.observe(composition); observer.observe(document.body);
    observer.observe(atelier); panels.forEach(panel => observer.observe(panel));
    if (header) observer.observe(header);
  }
  if (typeof IntersectionObserver === 'function') new IntersectionObserver(schedule, { threshold: 0 }).observe(section);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else scheduleLayout();
  });
  reduced.addEventListener('change', scheduleLayout);
  refreshLayout(); paint(readPosition());
})();
