// Brian & Brian logo: injects the SVG into any [data-logo] element and makes the eyes follow the pointer.
(function () {
  const HEADS = `
    <g class="bb-heads">
      <g class="bb-head">
        <rect x="58" y="60" width="34" height="44" rx="17" />
        <path d="M0 78 A75 70 0 0 1 150 78 Z" />
      </g>
      <g class="bb-head">
        <rect x="200" y="60" width="34" height="44" rx="17" />
        <path d="M142 78 A75 70 0 0 1 292 78 Z" />
      </g>
      ${[ [57.5, 44], [92.5, 44], [199.5, 44], [234.5, 44] ].map(([x, y]) => `
        <g class="bb-eye" data-cx="${x}" data-cy="${y}">
          <circle class="bb-eye-white" cx="${x}" cy="${y}" r="11.5" />
          <circle class="bb-pupil" cx="${x}" cy="${y}" r="6.5" />
        </g>`).join('')}
    </g>`;

  // Wordmark is drawn as live text so it stays crisp; textLength pins its width so the heads always line up.
  const SVG = (title) => `
    <svg class="bb-logo" viewBox="0 0 830 222" role="img" aria-label="${title}">
      <title>${title}</title>
      <g transform="translate(372 0)">${HEADS}</g>
      <text x="2" y="216" textLength="826" lengthAdjust="spacing" class="bb-wordmark">Brian&amp;Brian</text>
    </svg>`;

  document.querySelectorAll('[data-logo]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', SVG(el.dataset.logo || 'Brian & Brian'));
  });

  const eyes = [...document.querySelectorAll('.bb-eye')].map((g) => ({
    g,
    white: g.querySelector('.bb-eye-white'),
    pupil: g.querySelector('.bb-pupil'),
  }));
  if (!eyes.length) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX = 4; // how far a pupil can travel inside the eye, in SVG units (stays inside the white)
  let target = null;
  let lastMove = 0;
  let queued = false;

  function render() {
    queued = false;
    for (const e of eyes) {
      if (!target) { e.pupil.setAttribute('transform', ''); continue; }
      const r = e.white.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const dx = target.x - (r.left + r.width / 2);
      const dy = target.y - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, dist / 160) * MAX;
      e.pupil.setAttribute('transform', `translate(${(dx / dist) * k} ${(dy / dist) * k})`);
    }
  }
  function lookAt(x, y) {
    target = { x, y };
    lastMove = performance.now();
    if (!queued) { queued = true; requestAnimationFrame(render); }
  }

  addEventListener('pointermove', (ev) => lookAt(ev.clientX, ev.clientY), { passive: true });
  addEventListener('pointerdown', (ev) => lookAt(ev.clientX, ev.clientY), { passive: true });
  addEventListener('scroll', () => { if (target) lookAt(target.x, target.y); }, { passive: true });
  document.addEventListener('focusin', (ev) => {
    const r = ev.target.getBoundingClientRect?.();
    if (r && r.width) lookAt(r.left + r.width / 2, r.top + r.height / 2);
  });

  if (reduceMotion) return;

  // With no pointer (touch, or idle), glance around so the logo still feels alive.
  setInterval(() => {
    if (document.hidden || performance.now() - lastMove < 4000) return;
    const x = innerWidth * (0.15 + Math.random() * 0.7);
    const y = innerHeight * (0.1 + Math.random() * 0.8);
    target = { x, y };
    render();
  }, 2200);
})();
