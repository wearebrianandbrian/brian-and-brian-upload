(function () {
  const campaigns = window.CAMPAIGNS.filter(Boolean);
  const live = campaigns.filter((c) => !c.comingSoon);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = matchMedia('(hover: hover)').matches;

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const posterFor = (src) => src.replace(/\.mp4$/, '.poster.jpg');
  const asItem = (x) => (typeof x === 'string' ? { src: x } : x);

  /* ---------- Homepage grid ---------- */
  const grid = $('#grid');
  grid.innerHTML = campaigns.map((c) => c.comingSoon
    ? `<div class="tile is-empty reveal" aria-label="${esc(c.title)}: coming soon"><span>${esc(c.title)} · coming soon</span></div>`
    : `<a class="tile reveal" href="#${c.slug}" data-slug="${c.slug}">
        <img src="${c.cover}" alt="" loading="lazy" style="${c.coverPos ? `object-position:${esc(c.coverPos)};` : ''}${c.coverZoom ? `scale:${+c.coverZoom};` : ''}">
        ${c.preview ? `<video muted loop playsinline preload="none" src="${c.preview}" aria-hidden="true"></video>` : ''}
        <span class="tile-label">
          <span><span class="tile-title">${esc(c.title)}</span><span class="tile-client">${esc(c.client)}</span></span>
          <span class="tile-cta" aria-hidden="true">View campaign</span>
        </span>
      </a>`).join('');

  // Hover previews (desktop) / in-view previews (touch). Never autoplay with reduced motion.
  if (!reduceMotion) {
    const play = (tile) => {
      const v = tile.querySelector('video');
      if (!v) return;
      v.play().then(() => tile.classList.add('is-playing')).catch(() => {});
    };
    const stop = (tile) => {
      const v = tile.querySelector('video');
      if (!v) return;
      v.pause();
      tile.classList.remove('is-playing');
    };
    grid.querySelectorAll('a.tile').forEach((tile) => {
      if (canHover) {
        tile.addEventListener('pointerenter', () => play(tile));
        tile.addEventListener('pointerleave', () => stop(tile));
        tile.addEventListener('focus', () => play(tile));
        tile.addEventListener('blur', () => stop(tile));
      }
    });
    if (!canHover) {
      const io = new IntersectionObserver((entries) => entries.forEach((e) => (e.intersectionRatio > 0.6 ? play(e.target) : stop(e.target))), { threshold: [0, 0.6] });
      grid.querySelectorAll('a.tile').forEach((t) => io.observe(t));
    }
  }

  /* ---------- Overlay ---------- */
  const overlay = $('#overlay');
  const caseEl = $('#case');
  const countEl = $('#overlay-count');
  let lastFocus = null;

  // Intro copy: a string, a list of paragraphs, or TODO() for a placeholder.
  const introHTML = (v) => {
    if (v && v.todo) return `<p><span class="placeholder">${esc(v.todo)}</span></p>`;
    return [].concat(v || []).map((para) => `<p>${esc(para)}</p>`).join('');
  };

  // Campaign videos never autoplay: they show their poster frame until the viewer presses play.
  function videoEl(item) {
    const poster = item.poster || posterFor(item.src);
    return `<video controls playsinline preload="none" poster="${poster}" src="${item.src}"${item.loop ? ' loop' : ''}></video>`;
  }
  // Width ÷ height of a piece: a number, or a string like '4 / 5'.
  const arOf = (m, fallback) => {
    if (!m.ratio) return fallback;
    if (typeof m.ratio === 'number') return m.ratio;
    const [w, h] = String(m.ratio).split('/').map(Number);
    return h ? w / h : fallback;
  };

  function section(title, cls, items, render, attrs = '') {
    if (!items || !items.length) return '';
    return `<section class="case-section">
      <h3 class="eyebrow">${title}</h3>
      <div class="media-grid ${cls}"${attrs}>${items.map(asItem).map(render).join('')}</div>
    </section>`;
  }

  /* ---------- Flow layout ----------
     Every piece sits in one centred column. Landscape pieces (wider than 1.35:1) run the full column width,
     one per row. Portrait and square pieces sit side by side in balanced rows of the same height, capped
     so a short row never balloons. layoutFlows() works out the sizes for the current width. */
  const WIDE = 1.35;
  const MAX_ROW_H = 620;
  const MIN_ROW_H = 300;
  const SMALL_ROW_H = 380;

  function flowSection(title, list, kind, fallbackAr, altFor, oneRow = false, perRow = 0) {
    const items = (list || []).map(asItem);
    if (!items.length) return '';
    const figs = items.map((m) => {
      const ar = arOf(m, fallbackAr);
      const inner = kind === 'video'
        ? videoEl(m)
        : `<img src="${m.src}" alt="${esc(altFor(m))}" loading="lazy">`;
      // small: true caps a piece's height at SMALL_ROW_H; small: 280 sets a specific cap in px.
      // group: 'name' keeps neighbouring pieces with the same name on one row, whatever their shape.
      return `<figure class="media" data-ar="${ar}"${m.small ? ` data-maxh="${typeof m.small === 'number' ? m.small : SMALL_ROW_H}"` : ''}${m.group ? ` data-group="${esc(m.group)}"` : ''} style="--ar:${ar}">${inner}</figure>`;
    }).join('');
    return `<section class="case-section"><h3 class="eyebrow">${title}</h3><div class="flow"${oneRow ? ' data-one-row' : ''}${perRow ? ` data-per-row="${+perRow}"` : ''}>${figs}</div></section>`;
  }

  function layoutFlows() {
    caseEl.querySelectorAll('.flow').forEach((flow) => {
      const figs = [...flow.querySelectorAll('.media')];
      flow.querySelectorAll('.flow-row').forEach((r) => r.replaceWith(...r.childNodes));
      const W = flow.clientWidth;
      if (!W) return;
      const gap = parseFloat(getComputedStyle(flow).rowGap) || 16;
      const mobile = W < 700;
      const cap = mobile ? innerHeight * 0.7 : MAX_ROW_H;
      const fit = (row) => (W - gap * (row.length - 1)) / row.reduce((s, f) => s + +f.dataset.ar, 0);
      const rows = []; // [{ figs, h }]
      let run = [];
      const flushRun = () => {
        if (!run.length) return;
        let groups;
        const runCap = Math.min(cap, ...run.map((f) => +f.dataset.maxh || Infinity));
        const perRow = +flow.dataset.perRow;
        if (!mobile && perRow) {
          groups = []; // a fixed number per row, e.g. a grid of GIFs
          for (let i = 0; i < run.length; i += perRow) groups.push(run.slice(i, i + perRow));
        } else if (!mobile && (flow.hasAttribute('data-one-row') || fit(run) >= MIN_ROW_H)) {
          groups = [run]; // a small set fits on one row at a decent size
        } else {
          const avg = run.reduce((s, f) => s + +f.dataset.ar, 0) / run.length;
          let k = 1;
          while (!mobile && k < run.length && (W - gap * (k - 1)) / (k * avg) > cap) k++;
          const r = Math.ceil(run.length / k);
          const base = Math.floor(run.length / r), extra = run.length % r;
          groups = []; let i = 0;
          for (let n = 0; n < r; n++) { const size = base + (n < extra ? 1 : 0); groups.push(run.slice(i, i + size)); i += size; }
        }
        const h = Math.min(mobile ? cap : runCap, ...groups.map(fit)); // one height for the whole set
        groups.forEach((g) => rows.push({ figs: g, h }));
        run = [];
      };
      let group = [];
      const flushGroup = () => {
        if (!group.length) return;
        const groupCap = Math.min(cap, ...group.map((f) => +f.dataset.maxh || Infinity));
        if (mobile) group.forEach((f) => rows.push({ figs: [f], h: Math.min(cap, W / +f.dataset.ar) }));
        else rows.push({ figs: group, h: Math.min(groupCap, fit(group)) });
        group = [];
      };
      figs.forEach((f) => {
        if (f.dataset.group) {
          if (group.length && group[0].dataset.group !== f.dataset.group) flushGroup();
          flushRun(); group.push(f); return;
        }
        flushGroup();
        if (+f.dataset.ar >= WIDE) { flushRun(); rows.push({ figs: [f], h: W / +f.dataset.ar }); } else run.push(f);
      });
      flushGroup();
      flushRun();
      rows.forEach(({ figs: row, h }) => {
        const div = document.createElement('div');
        div.className = 'flow-row';
        row.forEach((f) => { f.style.width = `${Math.floor(+f.dataset.ar * h)}px`; div.appendChild(f); });
        flow.appendChild(div);
      });
    });
  }
  let layoutQueued = false;
  addEventListener('resize', () => { if (!layoutQueued) { layoutQueued = true; requestAnimationFrame(() => { layoutQueued = false; layoutFlows(); }); } });

  const DEFAULT_ORDER = ['films', 'teasers', 'social', 'carousel', 'stills', 'audio', 'bts'];
  const sections = {
    // Optional per-campaign headings: filmsLabel, teasersLabel, carouselLabel, socialLabel, stillsLabel.
    films: (c) => flowSection(esc(c.filmsLabel || 'Films'), c.films, 'video', 16 / 9),
    teasers: (c) => flowSection(esc(c.teasersLabel || 'Teasers'), c.teasers, 'video', 16 / 9),
    carousel: (c) => flowSection(esc(c.carouselLabel || 'Carousel'), c.carousel, 'video', 16 / 9),
    // socialOneRow: true keeps every social piece on a single row.
    social: (c) => flowSection(esc(c.socialLabel || 'Social'), c.social, 'video', 9 / 16, undefined, !!c.socialOneRow),
    // stillsPerRow: a fixed number of portrait/square pieces per row (e.g. 4 for a grid).
    stills: (c) => flowSection(c.stillsLabel ? esc(c.stillsLabel) : 'Print &amp; out of home', c.stills, 'image', 1, (m) => m.alt || `${c.title} artwork`, false, c.stillsPerRow),
    bts: (c) => flowSection('BTS', c.bts, 'image', 1, (m) => m.alt || `Behind the scenes on ${c.title}`),
    audio: (c) => section('Audio', 'landscape', c.audio, (m) => `<figure class="media audio-card"><strong>${esc(m.label || 'Audio')}</strong><audio controls preload="none" src="${m.src}"></audio></figure>`),
  };

  function render(c) {
    const i = live.indexOf(c);
    const next = live[(i + 1) % live.length];
    countEl.textContent = `${String(i + 1).padStart(2, '0')} / ${String(live.length).padStart(2, '0')}`;
    caseEl.innerHTML = `
      <header class="case-head">
        <div>
          <p class="eyebrow">${esc(c.client)}</p>
          <h2 id="case-title">${esc(c.title)}</h2>
        </div>
        <div class="case-intro">${introHTML(c.intro)}</div>
      </header>
      ${c.hero ? `<div class="case-hero">${videoEl({ src: c.hero })}</div>` : ''}
      ${(c.order || DEFAULT_ORDER).map((key) => sections[key](c)).join('')}
      <nav class="case-next" aria-label="Next campaign">
        <button type="button" data-goto="${next.slug}">
          <span><span class="label">Next campaign</span><span class="title">${esc(next.title)}</span></span>
          <span class="arrow" aria-hidden="true">→</span>
        </button>
      </nav>`;
    caseEl.querySelector('[data-goto]').addEventListener('click', () => { location.hash = next.slug; });
    layoutFlows();
  }

  // Only one thing plays at a time: starting a video or audio pauses the others.
  caseEl.addEventListener('play', (e) => {
    caseEl.querySelectorAll('video, audio').forEach((m) => { if (m !== e.target) m.pause(); });
  }, true);

  function open(slug) {
    const c = live.find((x) => x.slug === slug);
    if (!c) return close();
    const wasOpen = overlay.classList.contains('is-open');
    if (!wasOpen) lastFocus = document.activeElement;
    render(c);
    overlay.hidden = false;
    layoutFlows(); // sizes need the panel visible to measure its width
    overlay.scrollTop = 0;
    document.body.classList.add('is-locked');
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    document.title = `${c.title} · Brian & Brian`;
    $('#close').focus({ preventScroll: true });
  }

  function close() {
    if (!overlay.classList.contains('is-open')) return;
    caseEl.querySelectorAll('video, audio').forEach((m) => m.pause());
    overlay.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    document.title = 'Brian & Brian';
    setTimeout(() => { if (!overlay.classList.contains('is-open')) { overlay.hidden = true; caseEl.innerHTML = ''; } }, 350);
    lastFocus?.focus?.({ preventScroll: true });
  }

  const route = () => {
    const slug = decodeURIComponent(location.hash.slice(1));
    if (live.some((c) => c.slug === slug)) open(slug); else close();
  };
  addEventListener('hashchange', route);
  route();

  $('#close').addEventListener('click', () => {
    // Use Back when we came from the grid so the browser history stays tidy.
    if (history.state?.fromGrid) history.back();
    else history.pushState(null, '', location.pathname + location.search), close();
  });
  grid.addEventListener('click', (e) => {
    const tile = e.target.closest('a.tile');
    if (!tile) return;
    e.preventDefault();
    history.pushState({ fromGrid: true }, '', `#${tile.dataset.slug}`);
    route();
  });
  addEventListener('popstate', route);

  // Keyboard: Esc closes, Tab stays inside the overlay.
  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); $('#close').click(); }
    if (e.key === 'Tab') {
      const f = [...overlay.querySelectorAll('button, a[href], video[controls], audio[controls]')].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Sticky header + reveals ---------- */
  const topbar = $('#topbar');
  const hero = $('.hero-logo');
  new IntersectionObserver(([e]) => {
    topbar.classList.toggle('is-stuck', !e.isIntersecting);
    topbar.querySelector('.topbar-logo').tabIndex = e.isIntersecting ? -1 : 0;
  }, { rootMargin: '-64px 0px 0px 0px' }).observe(hero);

  const revealIO = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const delay = [...e.target.parentElement.children].indexOf(e.target) % 2 * 70;
    e.target.style.transitionDelay = `${delay}ms`;
    e.target.classList.add('is-in');
    revealIO.unobserve(e.target);
  }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => revealIO.observe(el));

  // Pause hover previews when the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.querySelectorAll('video').forEach((v) => v.pause());
  });
  /* ---------- Contact form (Netlify Forms) ---------- */
  const form = $('.contact-form');
  if (form) {
    const status = form.querySelector('.form-status');
    const btn = form.querySelector('button[type="submit"]');
    const fields = [
      { el: $('#cf-name'), msg: 'Please add your name.' },
      { el: $('#cf-email'), msg: 'Please add an email address we can reply to, like name@example.com.' },
      { el: $('#cf-message'), msg: 'Please add a message.' },
    ];
    const check = (f) => {
      const ok = f.el.value.trim() !== '' && f.el.checkValidity();
      f.el.setAttribute('aria-invalid', ok ? 'false' : 'true');
      document.getElementById(f.el.getAttribute('aria-describedby')).textContent = ok ? '' : f.msg;
      return ok;
    };
    fields.forEach((f) => f.el.addEventListener('blur', () => { if (f.el.value) check(f); }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bad = fields.filter((f) => !check(f));
      if (bad.length) { bad[0].el.focus(); return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      status.className = 'form-status'; status.textContent = '';
      try {
        const res = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(form)).toString(),
        });
        if (!res.ok) throw new Error(res.status);
        form.reset();
        status.textContent = 'Thanks, your message has been sent. We’ll be in touch soon.';
      } catch {
        status.classList.add('is-error');
        status.innerHTML = 'Sorry, that didn\'t send. Please try again, or email us at <a href="mailto:wearebrianandbrian@gmail.com">wearebrianandbrian@gmail.com</a>.';
      } finally {
        btn.disabled = false; btn.textContent = 'Send message';
      }
    });
  }
})();
