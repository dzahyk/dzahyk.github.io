(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Nav border once the page scrolls
  const nav = document.querySelector("[data-nav]");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Reveal on scroll, staggered within a parent
  const reveals = $$("[data-reveal]");
  reveals.forEach((el) => {
    const sibs = $$(":scope > [data-reveal]", el.parentElement);
    el.style.setProperty("--d", Math.min(sibs.indexOf(el), 6) * 0.08 + "s");
  });
  const show = (el) => el.classList.add("is-in");
  if (reduce || !("IntersectionObserver" in window)) {
    reveals.forEach(show);
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    reveals.forEach((el) => io.observe(el));
  }

  // Count-up numbers (the text is already correct without JavaScript)
  const fmt = (n) => n.toLocaleString("en-US");
  const countUp = (el) => {
    if (reduce) return;
    const end = Number(el.dataset.count);
    const pre = el.dataset.prefix || "";
    const suf = el.dataset.suffix || "";
    const t0 = performance.now();
    const dur = 1100;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = pre + fmt(Math.round(end * eased)) + suf;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const cio = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { countUp(e.target); cio.unobserve(e.target); }
  }), { threshold: 0.6 });
  $$("[data-count]").forEach((el) => cio.observe(el));

  // Problem: highlight the brief one issue at a time
  const brief = document.querySelector("[data-brief]");
  if (brief) {
    const steps = [0, 1, 2, 3];
    const light = (i) => $$('[data-step="' + i + '"]', brief).forEach((el) => el.classList.add("is-on"));
    if (reduce) {
      steps.forEach(light);
    } else {
      const bio = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        steps.forEach((i) => setTimeout(() => light(i), 350 + i * 750));
        bio.disconnect();
      }, { threshold: 0.45 });
      bio.observe(brief);
    }
  }

  // How it works: the step in the middle of the screen drives the sticky visual
  const labels = ["Requirements & evidence", "Feasibility & pricing", "Approval review", "Execution run", "Evaluation lab"];
  // For each step: the area of the screenshot to highlight (percent of the image) and what it is for.
  const focus = [
    { x: 2.3, y: 72.6, w: 57.2, h: 8.6, title: "This is the evidence check", text: "for flagging gaps: Geography is missing, not guessed." },
    { x: 51.6, y: 37, w: 46.4, h: 52, title: "This is the calculation", text: "for a margin anyone can trace: Rp117,000,000 cost, 22% margin." },
    { x: 2.3, y: 28.5, w: 57.6, h: 16.4, title: "This is two-person approval", text: "for high-risk deals: one has signed, a different person must sign next." },
    { x: 36.3, y: 53.8, w: 60.4, h: 26.4, title: "This is the recovery panel", text: "for unknown outcomes: check the target system before any retry." },
    { x: 2.3, y: 16.2, w: 72, h: 19.6, title: "This is the release gate", text: "for blocking a model that passed 1 of 36 unseen cases." },
  ];
  const howSteps = $$(".how-step");
  const screens = $$("[data-screen]");
  const label = document.querySelector("[data-frame-label]");
  const stage = document.querySelector("[data-stage]");
  const spot = document.querySelector("[data-spot]");
  const callout = document.querySelector("[data-callout]");
  const progress = document.querySelector(".how-progress");
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  let current = -1;

  const showFocus = (f) => {
    // Zoom so the area fills most of the frame, keep the image covering the frame.
    const z = clamp(Math.min(86 / f.w, 80 / f.h), 1, 1.9);
    const cx = (f.x + f.w / 2) / 100;
    const cy = (f.y + f.h / 2) / 100;
    const tx = clamp(0.5 - cx * z, 1 - z, 0);
    const ty = clamp(0.5 - cy * z, 1 - z, 0);
    stage.style.transform = "translate(" + tx * 100 + "%, " + ty * 100 + "%) scale(" + z + ")";
    const pad = 0.8;
    const left = (f.x - pad) * z + tx * 100;
    const top = (f.y - pad) * z + ty * 100;
    const width = (f.w + pad * 2) * z;
    const height = (f.h + pad * 2) * z;
    Object.assign(spot.style, { left: left + "%", top: top + "%", width: width + "%", height: height + "%" });
    placeCallout(left, top, height);
  };

  // Callout under the area if it fits, else above it, else inside the area's bottom edge.
  // On small screens the callout sits under the frame (CSS), so only place it when it floats.
  const screensBox = document.querySelector(".frame-screens");
  const placeCallout = (left, top, height) => {
    if (getComputedStyle(callout).position !== "absolute") {
      callout.style.left = callout.style.top = "";
      return;
    }
    const W = screensBox.offsetWidth || 1;
    const H = screensBox.offsetHeight || 1;
    const callH = (callout.offsetHeight / H) * 100;
    const gap = 3;
    let y;
    if (top + height + gap + callH <= 97) y = top + height + gap;
    else if (top - gap - callH >= 3) y = top - gap - callH;
    else y = Math.min(top + height, 97) - callH - gap;
    y = clamp(y, 3, 97 - callH);
    const x = clamp(left + 2, 3, 40);
    callout.style.left = screensBox.offsetLeft + (x / 100) * W + "px";
    callout.style.top = screensBox.offsetTop + (y / 100) * H + "px";
  };

  const activate = (i) => {
    if (i === current) return;
    current = i;
    howSteps.forEach((s, k) => s.classList.toggle("is-active", k === i));
    screens.forEach((s, k) => s.classList.toggle("is-active", k === i));
    if (label) label.textContent = labels[i];
    if (progress) progress.style.setProperty("--p", ((i + 1) / howSteps.length) * 100 + "%");
    if (!stage || !spot || !callout) return;
    const f = focus[i];
    callout.classList.add("is-swap");
    setTimeout(() => {
      callout.firstElementChild.textContent = f.title;
      callout.lastElementChild.textContent = f.text;
      showFocus(f);
      callout.classList.remove("is-swap");
    }, reduce ? 0 : 250);
  };
  window.addEventListener("resize", () => { if (current >= 0 && stage) showFocus(focus[current]); }, { passive: true });
  if (howSteps.length) {
    activate(0);
    const hio = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) activate(Number(e.target.dataset.index));
    }), { rootMargin: "-45% 0px -45% 0px" });
    howSteps.forEach((s) => hio.observe(s));
  }

  // Hero: the panels drift slightly with the pointer
  const art = document.querySelector("[data-parallax]");
  if (art && !reduce && window.matchMedia("(pointer: fine)").matches) {
    let raf = 0;
    art.style.transition = "transform .6s cubic-bezier(.2,.8,.2,1)";
    window.addEventListener("pointermove", (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = e.clientX / innerWidth - 0.5;
        const y = e.clientY / innerHeight - 0.5;
        art.style.transform = "translate3d(" + x * -14 + "px, " + y * -10 + "px, 0)";
      });
    }, { passive: true });
  }
})();
