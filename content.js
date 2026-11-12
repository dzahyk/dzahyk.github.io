/* Homepage interactions. Identity lives in config.js; the project list lives in projects.js. */
const siteConfig = window.portfolioConfig;
const projects = window.portfolioProjects || [];
for (const key of ['name', 'brand', 'role', 'location', 'availability']) {
  document.querySelectorAll(`[data-${key}]`).forEach(element => { element.textContent = siteConfig[key]; });
}
// Email and profile links come from config.js; an empty link (e.g. GitHub) is simply not shown.
if (siteConfig.email) {
  document.querySelectorAll('[data-email]').forEach(link => { link.href = `mailto:${siteConfig.email}`; link.textContent = siteConfig.email; });
}
const profileLinks = siteConfig.links || {};
const profileLabels = { linkedin: 'LinkedIn', github: 'GitHub', instagram: 'Instagram', tiktok: 'TikTok' };
document.querySelectorAll('[data-profile-links]').forEach(list => {
  list.replaceChildren(...Object.entries(profileLabels).filter(([key]) => profileLinks[key]).map(([key, label]) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = profileLinks[key];
    link.rel = 'me noopener';
    link.textContent = `${label} ↗`;
    item.append(link);
    return item;
  }));
});
document.querySelectorAll('[data-profile-link]').forEach(link => {
  const url = profileLinks[link.dataset.profileLink];
  if (url) link.href = url; else link.replaceWith(document.createTextNode(link.textContent));
});
// Project totals come from the list, so adding a project never leaves a stale "03".
document.querySelectorAll('[data-cv-link]').forEach(link => {
  if (!siteConfig.cvUrl) return;
  link.href = siteConfig.cvUrl;
  link.setAttribute('download', '');
  link.hidden = false;
});
document.querySelectorAll('[data-paper-link]').forEach(link => {
  if (!siteConfig.paperUrl) return;
  link.href = siteConfig.paperUrl;
  link.rel = 'noopener';
  link.hidden = false;
});
document.querySelectorAll('[data-project-total]').forEach(element => { element.textContent = String(projects.length).padStart(2, '0'); });
document.title = siteConfig.siteTitle || siteConfig.name;
document.getElementById('year').textContent = new Date().getFullYear();
document.getElementById('backTop').addEventListener('click', () => {
  scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  document.querySelector('.site-brand').focus({ preventScroll: true });
});
const menuToggle = document.getElementById('menuToggle');
const mobileMenu = document.getElementById('mobileMenu');
function closeMenu(returnFocus = false) {
  mobileMenu.classList.remove('open'); menuToggle.setAttribute('aria-expanded', 'false');
  if (returnFocus) menuToggle.focus();
}
menuToggle.addEventListener('click', () => {
  const open = mobileMenu.classList.toggle('open'); menuToggle.setAttribute('aria-expanded', String(open));
});
mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  closeMenu();
  const href = link.getAttribute('href');
  const target = href.startsWith('#') ? document.querySelector(href) : null;
  if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
}));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && mobileMenu.classList.contains('open')) closeMenu(true); });
document.addEventListener('pointerdown', event => { if (!mobileMenu.contains(event.target) && !menuToggle.contains(event.target)) closeMenu(); });
matchMedia('(min-width:701px)').addEventListener('change', event => { if (event.matches) closeMenu(); });
