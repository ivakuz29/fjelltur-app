(function () {
  const state = {
    turer: [],
    aktivTurId: null,
    lightboxBilder: [],
    lightboxIndex: 0
  };

  const elements = {
    navBruker: document.getElementById('nav-bruker'),
    turForm: document.getElementById('tur-form'),
    redigerId: document.getElementById('rediger-id'),
    fjell: document.getElementById('fjell'),
    dato: document.getElementById('dato'),
    distanse: document.getElementById('distanse'),
    hoyde: document.getElementById('hoyde'),
    notat: document.getElementById('notat'),
    skjemaTittel: document.getElementById('skjema-tittel'),
    lagreBtn: document.getElementById('lagre-btn'),
    avbrytBtn: document.getElementById('avbryt-btn'),
    skjemaMelding: document.getElementById('skjema-melding'),
    bildeSeksjon: document.getElementById('bilde-seksjon'),
    eksisterendeBilder: document.getElementById('eksisterende-bilder'),
    bildeInput: document.getElementById('bilde-input'),
    lastOppBtn: document.getElementById('last-opp-btn'),
    dropZone: document.getElementById('drop-zone'),
    dropCount: document.getElementById('drop-count'),
    turListe: document.getElementById('tur-liste'),
    turCount: document.getElementById('tur-count'),
    lightbox: document.getElementById('lightbox'),
    lightboxBilde: document.getElementById('lightbox-bilde'),
    lightboxPrev: document.getElementById('lightbox-prev'),
    lightboxNext: document.getElementById('lightbox-next'),
    lightboxCounter: document.getElementById('lightbox-counter'),
    logoutBtn: document.getElementById('logout-btn')
  };

  if (!elements.turForm) {
    return;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fjellSvg(hoyde) {
    const t = hoyde ? Math.min(1, hoyde / 2469) : 0.35;
    const topY = Math.round(170 - t * 148);
    const span = 240 - topY;
    const s1 = Math.round(topY + span * 0.42);
    const s2 = Math.round(topY + span * 0.32);
    const r1 = Math.round(topY + span * 0.58);
    const r2 = Math.round(topY + span * 0.48);
    const r3 = Math.round(topY + span * 0.37);

    return `<svg viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">` +
      `<rect width="400" height="240" fill="#e4eef9"/>` +
      `<polygon points="0,240 80,${s1} 155,${r1} 235,${topY} 315,${s2} 365,${r2} 400,${r3} 400,240" fill="#c8d8ec" opacity="0.8"/>` +
      `<polygon points="210,240 235,${topY} 315,${s2} 365,${r2} 400,${r3} 400,240" fill="#bed0e8" opacity="0.55"/>` +
      `<polygon points="0,240 80,${s1} 160,240" fill="#d4e4f4" opacity="0.45"/>` +
      `</svg>`;
  }

  function getTurById(id) {
    return state.turer.find((tur) => Number(tur.id) === Number(id));
  }

  function getCurrentFormData() {
    return {
      fjell: elements.fjell.value,
      dato: elements.dato.value,
      distanse: elements.distanse.value,
      hoyde: elements.hoyde.value,
      notat: elements.notat.value
    };
  }

  function setEditMode(tur) {
    state.aktivTurId = tur.id;
    elements.redigerId.value = tur.id;
    elements.fjell.value = tur.fjell;
    elements.dato.value = tur.dato;
    elements.distanse.value = tur.distanse || '';
    elements.hoyde.value = tur.hoyde || '';
    elements.notat.value = tur.notat || '';
    elements.skjemaTittel.textContent = 'Rediger tur';
    elements.lagreBtn.textContent = 'Oppdater';
    elements.avbrytBtn.style.display = 'inline-block';
    oppdaterBildeSeksjon(tur.bilder || []);
  }

  function resetForm() {
    state.aktivTurId = null;
    elements.turForm.reset();
    elements.redigerId.value = '';
    elements.skjemaTittel.textContent = 'Ny tur';
    elements.lagreBtn.textContent = 'Lagre';
    elements.avbrytBtn.style.display = 'none';
    elements.hoyde.value = '';
    elements.bildeInput.value = '';
    elements.eksisterendeBilder.innerHTML = '';
    oppdaterDropCount(0);
  }

  function visMelding(tekst, type) {
    elements.skjemaMelding.textContent = tekst;
    elements.skjemaMelding.className = `skjema-melding ${type}`;
    window.clearTimeout(elements.skjemaMelding._timer);
    elements.skjemaMelding._timer = window.setTimeout(() => {
      elements.skjemaMelding.textContent = '';
      elements.skjemaMelding.className = 'skjema-melding';
    }, 3000);
  }

  function oppdaterDropCount(count) {
    elements.dropCount.textContent = count > 0
      ? `${count}${count === 1 ? ' bilde valgt' : ' bilder valgt'}`
      : '';
  }

  function oppdaterBildeSeksjon(bilder) {
    elements.bildeSeksjon.style.display = 'block';

    if (!bilder.length) {
      elements.eksisterendeBilder.innerHTML = '<p class="ingen-bilder">Ingen bilder enn&#229;</p>';
      return;
    }

    elements.eksisterendeBilder.innerHTML = bilder.map((bilde) => `
      <div class="bilde-thumbnail">
        <img
          src="/uploads/${bilde.filnavn}"
          alt="Bilde"
          data-action="open-image"
          data-src="/uploads/${bilde.filnavn}"
        >
        <button
          type="button"
          class="bilde-slett"
          data-action="delete-image"
          data-bilde-id="${bilde.id}"
          title="Slett bilde"
        >&#215;</button>
      </div>
    `).join('');
  }

  function renderTrips() {
    if (!state.turer.length) {
      elements.turCount.textContent = '';
      elements.turListe.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">&#8743;</span>
          <p>Ingen turer registrert enda</p>
        </div>
      `;
      return;
    }

    elements.turCount.textContent = `${state.turer.length} ${state.turer.length === 1 ? 'tur' : 'turer'}`;

    elements.turListe.innerHTML = state.turer.map((tur, index) => {
      const nr = String(state.turer.length - index).padStart(3, '0');
      const bilder = tur.bilder || [];
      const cover = bilder[0];
      const extra = bilder.length - 1;
      const hoydeTag = tur.hoyde ? `<span class="tur-hero-hoyde">&#9650; ${tur.hoyde} moh</span>` : '';
      const countBadge = extra > 0 ? `<span class="tur-img-count">+${extra}</span>` : '';
      const hero = cover
        ? `
          <button type="button" class="tur-hero" data-action="open-trip-images" data-tur-id="${tur.id}">
            <img src="/uploads/${cover.filnavn}" alt="${escapeHtml(tur.fjell)}">
            <div class="tur-hero-overlay">
              <span class="tur-hero-num">#${nr}</span>
              <div class="tur-hero-right">${hoydeTag}${countBadge}</div>
            </div>
          </button>
        `
        : `
          <div class="tur-hero">
            ${fjellSvg(tur.hoyde)}
            <div class="tur-hero-overlay">
              <span class="tur-hero-num">#${nr}</span>
              <div class="tur-hero-right">${hoydeTag}${countBadge}</div>
            </div>
          </div>
        `;

      return `
        <div class="tur-entry">
          ${hero}
          <div class="tur-body">
            <div class="tur-entry-top">
              <span class="tur-date">${escapeHtml(tur.dato)}</span>
            </div>
            <h3 class="tur-name">${escapeHtml(tur.fjell)}</h3>
            <div class="tur-meta">
              ${tur.distanse ? `<span class="tur-distance">${escapeHtml(tur.distanse)} km</span>` : ''}
              ${tur.hoyde ? `<span class="tur-hoyde">${escapeHtml(tur.hoyde)} moh</span>` : ''}
            </div>
            ${tur.notat ? `<p class="tur-note">${escapeHtml(tur.notat)}</p>` : ''}
            <div class="tur-actions">
              <button type="button" class="btn btn-edit" data-action="edit-trip" data-tur-id="${tur.id}">Rediger</button>
              <button type="button" class="btn btn-danger" data-action="delete-trip" data-tur-id="${tur.id}">Slett</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async function lastTurer() {
    const svar = await fetch('/api/turer');
    state.turer = await svar.json();
    renderTrips();

    if (state.aktivTurId !== null) {
      const tur = getTurById(state.aktivTurId);
      if (tur) {
        oppdaterBildeSeksjon(tur.bilder || []);
      }
    }
  }

  async function lagreTur(event) {
    event.preventDefault();

    const id = elements.redigerId.value;
    const url = id ? `/api/turer/${id}` : '/api/turer';
    const method = id ? 'PUT' : 'POST';
    const svar = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getCurrentFormData())
    });

    const result = await svar.json();
    if (!result.ok) {
      visMelding(result.melding || 'Noe gikk galt.', 'feil');
      return;
    }

    if (!id) {
      state.aktivTurId = result.id;

      if (elements.bildeInput.files.length) {
        const formData = new FormData();
        Array.from(elements.bildeInput.files).forEach((fil) => {
          formData.append('bilder', fil);
        });

        await fetch(`/api/turer/${state.aktivTurId}/bilder`, {
          method: 'POST',
          body: formData
        });

        elements.bildeInput.value = '';
      }

      await lastTurer();
      const tur = getTurById(result.id);
      if (tur) {
        setEditMode(tur);
      }

      return;
    }

    await lastTurer();
    visMelding('Lagret', 'ok');
  }

  async function lastOppBilder() {
    if (!state.aktivTurId || !elements.bildeInput.files.length) {
      return;
    }

    const formData = new FormData();
    Array.from(elements.bildeInput.files).forEach((fil) => {
      formData.append('bilder', fil);
    });

    elements.lastOppBtn.disabled = true;
    elements.lastOppBtn.textContent = 'Laster opp...';

    await fetch(`/api/turer/${state.aktivTurId}/bilder`, {
      method: 'POST',
      body: formData
    });

    elements.bildeInput.value = '';
    elements.lastOppBtn.disabled = false;
    elements.lastOppBtn.textContent = 'Last opp';
    oppdaterDropCount(0);

    await lastTurer();
  }

  async function slettBilde(bildeId) {
    if (!state.aktivTurId || !window.confirm('Slett dette bildet?')) {
      return;
    }

    await fetch(`/api/turer/${state.aktivTurId}/bilder/${bildeId}`, {
      method: 'DELETE'
    });

    await lastTurer();
  }

  async function slettTur(id) {
    if (!window.confirm('Slett denne turen?')) {
      return;
    }

    const svar = await fetch(`/api/turer/${id}`, { method: 'DELETE' });
    const data = await svar.json();
    if (!data.ok) {
      return;
    }

    if (Number(state.aktivTurId) === Number(id)) {
      resetForm();
    }

    await lastTurer();
  }

  function aapneLightbox(bilder, index) {
    state.lightboxBilder = Array.isArray(bilder) ? bilder : [bilder];
    state.lightboxIndex = index || 0;
    visLightboxBilde();
    elements.lightbox.style.display = 'flex';
  }

  function visLightboxBilde() {
    if (!state.lightboxBilder.length) {
      return;
    }

    elements.lightboxBilde.src = state.lightboxBilder[state.lightboxIndex];
    const multi = state.lightboxBilder.length > 1;
    elements.lightboxPrev.style.display = multi ? 'flex' : 'none';
    elements.lightboxNext.style.display = multi ? 'flex' : 'none';
    elements.lightboxCounter.textContent = multi
      ? `${state.lightboxIndex + 1} / ${state.lightboxBilder.length}`
      : '';
  }

  function lightboxNav(direction) {
    if (!state.lightboxBilder.length) {
      return;
    }

    state.lightboxIndex = (state.lightboxIndex + direction + state.lightboxBilder.length) % state.lightboxBilder.length;
    visLightboxBilde();
  }

  function lukkLightbox() {
    elements.lightbox.style.display = 'none';
    elements.lightboxBilde.src = '';
    state.lightboxBilder = [];
    state.lightboxIndex = 0;
  }

  async function loggUt() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  }

  function handleTripListClick(event) {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) {
      return;
    }

    const { action, turId } = actionEl.dataset;
    if (action === 'edit-trip') {
      const tur = getTurById(turId);
      if (!tur) {
        return;
      }

      setEditMode(tur);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (action === 'delete-trip') {
      slettTur(turId);
      return;
    }

    if (action === 'open-trip-images') {
      const tur = getTurById(turId);
      if (!tur) {
        return;
      }

      aapneLightbox((tur.bilder || []).map((bilde) => `/uploads/${bilde.filnavn}`), 0);
    }
  }

  function handleImageGridClick(event) {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) {
      return;
    }

    const { action, src, bildeId } = actionEl.dataset;
    if (action === 'open-image' && src) {
      aapneLightbox(src, 0);
      return;
    }

    if (action === 'delete-image') {
      slettBilde(bildeId);
    }
  }

  function setupDragAndDrop() {
    elements.dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      elements.dropZone.classList.add('drag-over');
    });

    elements.dropZone.addEventListener('dragleave', (event) => {
      if (!elements.dropZone.contains(event.relatedTarget)) {
        elements.dropZone.classList.remove('drag-over');
      }
    });

    elements.dropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove('drag-over');

      const transfer = new DataTransfer();
      Array.from(event.dataTransfer.files).forEach((file) => {
        if (file.type.startsWith('image/')) {
          transfer.items.add(file);
        }
      });

      elements.bildeInput.files = transfer.files;
      oppdaterDropCount(transfer.files.length);
    });

    elements.bildeInput.addEventListener('change', () => {
      oppdaterDropCount(elements.bildeInput.files.length);
    });
  }

  function setupEventListeners() {
    elements.turForm.addEventListener('submit', lagreTur);
    elements.avbrytBtn.addEventListener('click', resetForm);
    elements.lastOppBtn.addEventListener('click', lastOppBilder);
    elements.logoutBtn.addEventListener('click', loggUt);
    elements.turListe.addEventListener('click', handleTripListClick);
    elements.eksisterendeBilder.addEventListener('click', handleImageGridClick);
    elements.lightbox.addEventListener('click', lukkLightbox);
    elements.lightboxPrev.addEventListener('click', (event) => {
      event.stopPropagation();
      lightboxNav(-1);
    });
    elements.lightboxNext.addEventListener('click', (event) => {
      event.stopPropagation();
      lightboxNav(1);
    });
    document.addEventListener('keydown', (event) => {
      if (elements.lightbox.style.display !== 'flex') {
        return;
      }

      if (event.key === 'Escape') {
        lukkLightbox();
      } else if (event.key === 'ArrowRight') {
        lightboxNav(1);
      } else if (event.key === 'ArrowLeft') {
        lightboxNav(-1);
      }
    });

    setupDragAndDrop();
  }

  async function init() {
    const svar = await fetch('/api/meg');
    const data = await svar.json();

    if (!data.ok) {
      window.location.href = '/';
      return;
    }

    elements.navBruker.textContent = data.bruker.brukernavn;
    setupEventListeners();
    await lastTurer();
  }

  init();
}());
