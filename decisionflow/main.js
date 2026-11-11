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
  const chips = [
    "Source: “to be determined” → Missing",
    "Rate card RC-3 · Rp117,000,000 · 22.00%",
    "Snapshot sha256 · 1 of 2 approvals",
    "Unknown outcome → check target system",
    "Held-out 1/36 · release gate failed",
  ];
  const howSteps = $$(".how-step");
  const screens = $$("[data-screen]");
  const label = document.querySelector("[data-frame-label]");
  const chip = document.querySelector("[data-chip]");
  const progress = document.querySelector(".how-progress");
  let current = -1;
  const activate = (i) => {
    if (i === current) return;
    current = i;
    howSteps.forEach((s, k) => s.classList.toggle("is-active", k === i));
    screens.forEach((s, k) => s.classList.toggle("is-active", k === i));
    if (label) label.textContent = labels[i];
    if (progress) progress.style.setProperty("--p", ((i + 1) / howSteps.length) * 100 + "%");
    if (!chip) return;
    chip.classList.add("is-swap");
    setTimeout(() => { chip.textContent = chips[i]; chip.classList.remove("is-swap"); }, reduce ? 0 : 220);
  };
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
