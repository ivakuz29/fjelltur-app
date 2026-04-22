(function () {
  const APP_VERSION = "20260422-10";
  const state = {
    turer: [],
    taggedeTurer: [],
    aktivTurId: null,
    lightboxBilder: [],
    lightboxIndex: 0,
    stagedParticipants: [],
    deltakersokTimer: null,
  };

  const elements = {
    navBruker: document.getElementById("nav-bruker"),
    turForm: document.getElementById("tur-form"),
    redigerId: document.getElementById("rediger-id"),
    fjell: document.getElementById("fjell"),
    dato: document.getElementById("dato"),
    distanse: document.getElementById("distanse"),
    hoyde: document.getElementById("hoyde"),
    notat: document.getElementById("notat"),
    skjemaTittel: document.getElementById("skjema-tittel"),
    lagreBtn: document.getElementById("lagre-btn"),
    avbrytBtn: document.getElementById("avbryt-btn"),
    skjemaMelding: document.getElementById("skjema-melding"),
    bildeSeksjon: document.getElementById("bilde-seksjon"),
    eksisterendeBilder: document.getElementById("eksisterende-bilder"),
    bildeInput: document.getElementById("bilde-input"),
    lastOppBtn: document.getElementById("last-opp-btn"),
    dropZone: document.getElementById("drop-zone"),
    dropCount: document.getElementById("drop-count"),
    turListe: document.getElementById("tur-liste"),
    turCount: document.getElementById("tur-count"),
    lightbox: document.getElementById("lightbox"),
    lightboxBilde: document.getElementById("lightbox-bilde"),
    lightboxPrev: document.getElementById("lightbox-prev"),
    lightboxNext: document.getElementById("lightbox-next"),
    lightboxCounter: document.getElementById("lightbox-counter"),
    logoutBtn: document.getElementById("logout-btn"),
    offentlig: document.getElementById("offentlig"),
    nyTurBtn: document.getElementById("ny-tur-btn"),
    sidebarCloseBtn: document.getElementById("sidebar-close-btn"),
    sidebarBackdrop: document.getElementById("sidebar-backdrop"),
    formSidebar: document.getElementById("form-sidebar"),
    stagedDeltakere: document.getElementById("staged-deltakere"),
    deltakerInput: document.getElementById("deltaker-input"),
    deltakerResultater: document.getElementById("deltaker-resultater"),
  };

  if (!elements.turForm) {
    return;
  }

  const DEBUG = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function logDebug(message, details) {
    if (!DEBUG) {
      return;
    }

    if (details === undefined) {
      console.debug("[trips]", message);
      return;
    }

    console.debug("[trips]", message, details);
  }

  function logError(message, details) {
    if (details === undefined) {
      console.error("[trips]", message);
      return;
    }

    console.error("[trips]", message, details);
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

    return (
      `<svg viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">` +
      `<rect width="400" height="240" fill="#e4eef9"/>` +
      `<polygon points="0,240 80,${s1} 155,${r1} 235,${topY} 315,${s2} 365,${r2} 400,${r3} 400,240" fill="#c8d8ec" opacity="0.8"/>` +
      `<polygon points="210,240 235,${topY} 315,${s2} 365,${r2} 400,${r3} 400,240" fill="#bed0e8" opacity="0.55"/>` +
      `<polygon points="0,240 80,${s1} 160,240" fill="#d4e4f4" opacity="0.45"/>` +
      `</svg>`
    );
  }

  function getTurById(id) {
    return state.turer.find((tur) => Number(tur.id) === Number(id));
  }

  function getTurDetaljUrl(id) {
    return `/turer/${id}`;
  }

  async function lesJson(svar) {
    const data = await svar.json().catch(() => null);
    if (!svar.ok || !data) {
      logError("Ugyldig svar fra serveren", {
        url: svar.url,
        status: svar.status,
        statusText: svar.statusText,
      });
      throw new Error("Ugyldig svar fra serveren.");
    }

    if (data.ok === false) {
      logError("API returnerte feil", {
        url: svar.url,
        status: svar.status,
        data,
      });
      throw new Error(data.melding || "Noe gikk galt.");
    }

    logDebug("API-svar mottatt", {
      url: svar.url,
      status: svar.status,
      data,
    });

    return data;
  }

  function parseOptionalTall(rawValue, feltLabel, options) {
    const raw = String(rawValue ?? "").trim();
    if (!raw) {
      if (options.required) {
        throw new Error(`${feltLabel} er påkrevd.`);
      }

      return "";
    }

    const normalized = raw.toLowerCase().replace(",", ".").replace(/\s+/g, "");

    const units = (options.units || []).map((unit) =>
      unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    const unitSuffix = units.length ? `(?:${units.join("|")})?` : "";
    const numberPattern = options.integer ? "(\\d+)" : "(\\d+(?:\\.\\d+)?)";
    const match = normalized.match(
      new RegExp(`^${numberPattern}${unitSuffix}$`),
    );

    if (!match) {
      throw new Error(
        `${feltLabel} m\u00E5 v\u00E6re et tall${options.example ? `, f.eks. ${options.example}` : ""}.`,
      );
    }

    const verdi = Number(match[1]);
    if (!Number.isFinite(verdi) || verdi < 0) {
      throw new Error(`${feltLabel} m\u00E5 v\u00E6re 0 eller mer.`);
    }

    if (options.integer && !Number.isInteger(verdi)) {
      throw new Error(`${feltLabel} m\u00E5 v\u00E6re et helt tall.`);
    }

    return String(verdi);
  }

  function getCurrentFormData() {
    return {
      fjell: elements.fjell.value,
      dato: elements.dato.value,
      distanse: parseOptionalTall(elements.distanse.value, "Distanse", {
        units: ["km"],
        example: "12,5 km",
      }),
      hoyde: parseOptionalTall(elements.hoyde.value, "H\u00F8yde", {
        required: true,
        integer: true,
        units: ["m", "moh"],
        example: "2469 moh",
      }),
      notat: elements.notat.value,
      offentlig: elements.offentlig ? elements.offentlig.checked : false,
    };
  }

  function setEditMode(tur) {
    state.aktivTurId = tur.id;
    elements.redigerId.value = tur.id;
    elements.fjell.value = tur.fjell;
    elements.dato.value = tur.dato;
    elements.distanse.value = tur.distanse || "";
    elements.hoyde.value = tur.hoyde || "";
    elements.notat.value = tur.notat || "";
    if (elements.offentlig) elements.offentlig.checked = !!tur.offentlig;
    state.stagedParticipants = [];
    renderStagedParticipants();
    elements.skjemaTittel.textContent = "Rediger tur";
    elements.lagreBtn.textContent = "Oppdater";
    elements.avbrytBtn.style.display = "inline-block";
    oppdaterBildeSeksjon(tur.bilder || []);
  }

  function resetForm() {
    state.aktivTurId = null;
    elements.turForm.reset();
    elements.redigerId.value = "";
    elements.skjemaTittel.textContent = "Ny tur";
    elements.lagreBtn.textContent = "Lagre";
    elements.avbrytBtn.style.display = "none";
    elements.hoyde.value = "";
    if (elements.offentlig) elements.offentlig.checked = false;
    state.stagedParticipants = [];
    renderStagedParticipants();
    if (elements.deltakerInput) elements.deltakerInput.value = "";
    if (elements.deltakerResultater) elements.deltakerResultater.innerHTML = "";
    elements.bildeInput.value = "";
    elements.eksisterendeBilder.innerHTML = "";
    oppdaterDropCount(0);
  }

  function visMelding(tekst, type) {
    elements.skjemaMelding.textContent = tekst;
    elements.skjemaMelding.className = `skjema-melding ${type}`;
    window.clearTimeout(elements.skjemaMelding._timer);
    elements.skjemaMelding._timer = window.setTimeout(() => {
      elements.skjemaMelding.textContent = "";
      elements.skjemaMelding.className = "skjema-melding";
    }, 3000);
  }

  function oppdaterDropCount(count) {
    elements.dropCount.textContent =
      count > 0
        ? `${count}${count === 1 ? " bilde valgt" : " bilder valgt"}`
        : "";
  }

  function oppdaterBildeSeksjon(bilder) {
    elements.bildeSeksjon.style.display = "block";

    if (!bilder.length) {
      elements.eksisterendeBilder.innerHTML =
        '<p class="ingen-bilder">Ingen bilder enn&#229;</p>';
      return;
    }

    elements.eksisterendeBilder.innerHTML = bilder
      .map(
        (bilde) => `
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
    `,
      )
      .join("");
  }

  function aapneSidebar() {
    document.body.classList.add("sidebar-open");
    if (elements.formSidebar) {
      elements.formSidebar.querySelector("input, textarea")?.focus();
    }
  }

  function lukkSidebar() {
    document.body.classList.remove("sidebar-open");
  }

  function renderStagedParticipants() {
    if (!elements.stagedDeltakere) return;
    if (!state.stagedParticipants.length) {
      elements.stagedDeltakere.innerHTML = "";
      return;
    }

    elements.stagedDeltakere.innerHTML = state.stagedParticipants
      .map(
        (d) =>
          `<span class="staged-chip">
            ${escapeHtml(d.brukernavn)}
            <button type="button" class="staged-chip-remove" data-action="unstage-deltaker" data-bruker-id="${d.id}" title="Fjern">&times;</button>
          </span>`,
      )
      .join("");
  }

  async function sokEtterDeltaker(query) {
    if (!elements.deltakerResultater) return;
    if (!query || query.length < 2) {
      elements.deltakerResultater.innerHTML = "";
      return;
    }

    const response = await fetch(
      `/api/brukere/sok?q=${encodeURIComponent(query)}`,
    );
    const data = await response.json().catch(() => ({ brukere: [] }));
    const staged = new Set(state.stagedParticipants.map((d) => d.id));
    const treff = (data.brukere || []).filter((b) => !staged.has(b.id));

    if (!treff.length) {
      elements.deltakerResultater.innerHTML =
        '<p class="participant-no-results">Ingen treff.</p>';
      return;
    }

    elements.deltakerResultater.innerHTML = treff
      .map(
        (b) =>
          `<button type="button" class="participant-result-item" data-action="stage-deltaker" data-bruker-id="${b.id}" data-brukernavn="${escapeHtml(b.brukernavn)}">${escapeHtml(b.brukernavn)}</button>`,
      )
      .join("");
  }

  async function leggTilStagedeDeltakere(turId) {
    for (const d of state.stagedParticipants) {
      try {
        await fetch(`/api/turer/${turId}/deltakere`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brukerId: d.id }),
        });
      } catch (_) {}
    }
    state.stagedParticipants = [];
    renderStagedParticipants();
  }

  function renderTurCard(tur, index, total, isTagged) {
    const nr = String(total - index).padStart(3, "0");
    const bilder = tur.bilder || [];
    const cover = bilder[0];
    const extra = bilder.length - 1;
    const hoydeTag = tur.hoyde
      ? `<span class="tur-hero-hoyde">&#9650; ${tur.hoyde} moh</span>`
      : "";
    const countBadge =
      extra > 0 ? `<span class="tur-img-count">+${extra}</span>` : "";
    const hero = cover
      ? `
        <a href="${getTurDetaljUrl(tur.id)}" class="tur-hero tur-hero-link" aria-label="Aapne ${escapeHtml(tur.fjell)}">
          <img src="/uploads/${cover.filnavn}" alt="${escapeHtml(tur.fjell)}">
          <div class="tur-hero-overlay">
            <span class="tur-hero-num">#${nr}</span>
            <div class="tur-hero-right">${hoydeTag}${countBadge}</div>
          </div>
        </a>
      `
      : `
        <a href="${getTurDetaljUrl(tur.id)}" class="tur-hero tur-hero-link" aria-label="Aapne ${escapeHtml(tur.fjell)}">
          ${fjellSvg(tur.hoyde)}
          <div class="tur-hero-overlay">
            <span class="tur-hero-num">#${nr}</span>
            <div class="tur-hero-right">${hoydeTag}${countBadge}</div>
          </div>
        </a>
      `;

    const actions = isTagged
      ? `<span class="tur-tagged-badge">Du var med</span>`
      : `
        <button type="button" class="btn btn-edit" data-action="edit-trip" data-tur-id="${tur.id}">Rediger</button>
        <button type="button" class="btn btn-danger" data-action="delete-trip" data-tur-id="${tur.id}">Slett</button>
      `;

    return `
      <div class="tur-entry${isTagged ? " tur-entry-tagged" : ""}" data-tur-id="${tur.id}">
        ${hero}
        <div class="tur-body">
          <div class="tur-entry-top">
            <span class="tur-date">${escapeHtml(tur.dato)}</span>
          </div>
          <h3 class="tur-name"><a href="${getTurDetaljUrl(tur.id)}" class="tur-title-link">${escapeHtml(tur.fjell)}</a></h3>
          <div class="tur-meta">
            ${tur.distanse ? `<span class="tur-distance">${escapeHtml(tur.distanse)} km</span>` : ""}
            ${tur.hoyde ? `<span class="tur-hoyde">${escapeHtml(tur.hoyde)} moh</span>` : ""}
          </div>
          ${tur.notat ? `<p class="tur-note">${escapeHtml(tur.notat)}</p>` : ""}
          <div class="tur-actions">${actions}</div>
        </div>
      </div>
    `;
  }

  function renderTrips() {
    const egne = state.turer;
    const taggede = state.taggedeTurer;
    const total = egne.length + taggede.length;

    if (!total) {
      elements.turCount.textContent = "";
      elements.turListe.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">&#8743;</span>
          <p>Ingen turer registrert enda</p>
        </div>
      `;
      return;
    }

    elements.turCount.textContent = `${egne.length} ${egne.length === 1 ? "tur" : "turer"}`;

    const egneHtml = egne.map((tur, i) => renderTurCard(tur, i, egne.length, false)).join("");

    let taggedeHtml = "";
    if (taggede.length) {
      taggedeHtml = `
        <div class="tur-section-header">
          <h2 class="tur-section-title">Turer du var med p&aring;</h2>
        </div>
        ${taggede.map((tur, i) => renderTurCard(tur, i, taggede.length, true)).join("")}
      `;
    }

    elements.turListe.innerHTML = egneHtml + taggedeHtml;
  }

  async function lastTurer() {
    const svar = await fetch("/api/turer");
    const data = await lesJson(svar);
    state.turer = data.egne || [];
    state.taggedeTurer = data.taggede || [];
    renderTrips();

    if (state.aktivTurId !== null) {
      const tur = getTurById(state.aktivTurId);
      if (tur) {
        oppdaterBildeSeksjon(tur.bilder || []);
      }
    }
  }

  async function lastOppValgteBilder(turId, visStatus) {
    if (!turId || !elements.bildeInput.files.length) {
      return false;
    }

    const formData = new FormData();
    Array.from(elements.bildeInput.files).forEach((fil) => {
      formData.append("bilder", fil);
    });

    if (visStatus) {
      elements.lastOppBtn.disabled = true;
      elements.lastOppBtn.textContent = "Laster opp...";
    }

    try {
      logDebug("Laster opp bilder", {
        turId,
        fileCount: elements.bildeInput.files.length,
        files: Array.from(elements.bildeInput.files).map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
        })),
      });
      const svar = await fetch(`/api/turer/${turId}/bilder`, {
        method: "POST",
        body: formData,
      });
      await lesJson(svar);
      elements.bildeInput.value = "";
      oppdaterDropCount(0);
      return true;
    } finally {
      if (visStatus) {
        elements.lastOppBtn.disabled = false;
        elements.lastOppBtn.textContent = "Last opp";
      }
    }
  }

  async function lagreTur(event) {
    event.preventDefault();

    try {
      const id = elements.redigerId.value;
      const formData = getCurrentFormData();
      logDebug("Sender tur til lagring", {
        id: id || null,
        mode: id ? "edit" : "create",
        raw: {
          fjell: elements.fjell.value,
          dato: elements.dato.value,
          distanse: elements.distanse.value,
          hoyde: elements.hoyde.value,
          notat: elements.notat.value,
        },
        parsed: formData,
      });
      const url = id ? `/api/turer/${id}` : "/api/turer";
      const method = id ? "PUT" : "POST";
      const svar = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await lesJson(svar);
      const turId = id || result.id;

      if (!id) {
        state.aktivTurId = turId;
      }

      await lastOppValgteBilder(turId, false);
      await leggTilStagedeDeltakere(turId);
      await lastTurer();

      if (!id) {
        const tur = getTurById(result.id);
        if (tur) {
          setEditMode(tur);
        }

        return;
      }

      visMelding("Lagret", "ok");
    } catch (error) {
      logError("Kunne ikke lagre tur", {
        message: error.message,
        raw: {
          fjell: elements.fjell.value,
          dato: elements.dato.value,
          distanse: elements.distanse.value,
          hoyde: elements.hoyde.value,
          notat: elements.notat.value,
        },
      });
      visMelding(error.message || "Noe gikk galt.", "feil");
    }
  }

  async function lastOppBilder() {
    if (!elements.bildeInput.files.length) {
      visMelding("Velg minst ett bilde f\u00F8rst.", "feil");
      return;
    }

    if (!state.aktivTurId) {
      visMelding(
        "Lagre turen f\u00F8rst, s\u00E5 kan du laste opp bilder.",
        "feil",
      );
      return;
    }

    try {
      await lastOppValgteBilder(state.aktivTurId, true);
      await lastTurer();
      visMelding("Bilder lastet opp.", "ok");
    } catch (error) {
      logError("Kunne ikke laste opp bilder", {
        message: error.message,
        turId: state.aktivTurId,
      });
      visMelding(error.message || "Kunne ikke laste opp bilder.", "feil");
    }
  }

  async function slettBilde(bildeId) {
    if (!state.aktivTurId || !window.confirm("Slett dette bildet?")) {
      return;
    }

    await fetch(`/api/turer/${state.aktivTurId}/bilder/${bildeId}`, {
      method: "DELETE",
    });

    await lastTurer();
  }

  async function slettTur(id) {
    if (!window.confirm("Slett denne turen?")) {
      return;
    }

    const svar = await fetch(`/api/turer/${id}`, { method: "DELETE" });
    const data = await lesJson(svar).catch(() => null);
    if (!data) {
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
    elements.lightbox.style.display = "flex";
  }

  function visLightboxBilde() {
    if (!state.lightboxBilder.length) {
      return;
    }

    elements.lightboxBilde.src = state.lightboxBilder[state.lightboxIndex];
    const multi = state.lightboxBilder.length > 1;
    elements.lightboxPrev.style.display = multi ? "flex" : "none";
    elements.lightboxNext.style.display = multi ? "flex" : "none";
    elements.lightboxCounter.textContent = multi
      ? `${state.lightboxIndex + 1} / ${state.lightboxBilder.length}`
      : "";
  }

  function lightboxNav(direction) {
    if (!state.lightboxBilder.length) {
      return;
    }

    state.lightboxIndex =
      (state.lightboxIndex + direction + state.lightboxBilder.length) %
      state.lightboxBilder.length;
    visLightboxBilde();
  }

  function lukkLightbox() {
    elements.lightbox.style.display = "none";
    elements.lightboxBilde.src = "";
    state.lightboxBilder = [];
    state.lightboxIndex = 0;
  }

  async function loggUt() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/";
  }

  function handleTripListClick(event) {
    if (!event.target.closest("[data-action]")) {
      const interactive = event.target.closest("a, button, input, textarea, label");
      const entry = event.target.closest(".tur-entry[data-tur-id]");
      if (entry && !interactive) {
        window.location.href = getTurDetaljUrl(entry.dataset.turId);
      }
    }

    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) {
      return;
    }

    const { action, turId } = actionEl.dataset;
    if (action === "edit-trip") {
      const tur = getTurById(turId);
      if (!tur) {
        return;
      }

      setEditMode(tur);
      aapneSidebar();
      return;
    }

    if (action === "delete-trip") {
      slettTur(turId);
      return;
    }
  }

  function handleImageGridClick(event) {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) {
      return;
    }

    const { action, src, bildeId } = actionEl.dataset;
    if (action === "open-image" && src) {
      aapneLightbox(src, 0);
      return;
    }

    if (action === "delete-image") {
      slettBilde(bildeId);
    }
  }

  function setupDragAndDrop() {
    elements.dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("drag-over");
    });

    elements.dropZone.addEventListener("dragleave", (event) => {
      if (!elements.dropZone.contains(event.relatedTarget)) {
        elements.dropZone.classList.remove("drag-over");
      }
    });

    elements.dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("drag-over");

      const transfer = new DataTransfer();
      Array.from(event.dataTransfer.files).forEach((file) => {
        if (file.type.startsWith("image/")) {
          transfer.items.add(file);
        }
      });

      elements.bildeInput.files = transfer.files;
      oppdaterDropCount(transfer.files.length);
    });

    elements.bildeInput.addEventListener("change", () => {
      oppdaterDropCount(elements.bildeInput.files.length);
    });
  }

  function handleDeltakerResultClick(event) {
    const btn = event.target.closest('[data-action="stage-deltaker"]');
    if (!btn) return;

    const id = Number(btn.dataset.brukerId);
    const brukernavn = btn.dataset.brukernavn;
    if (!state.stagedParticipants.find((d) => d.id === id)) {
      state.stagedParticipants.push({ id, brukernavn });
      renderStagedParticipants();
    }

    if (elements.deltakerInput) elements.deltakerInput.value = "";
    if (elements.deltakerResultater) elements.deltakerResultater.innerHTML = "";
  }

  function handleStagedChipClick(event) {
    const btn = event.target.closest('[data-action="unstage-deltaker"]');
    if (!btn) return;

    const id = Number(btn.dataset.brukerId);
    state.stagedParticipants = state.stagedParticipants.filter(
      (d) => d.id !== id,
    );
    renderStagedParticipants();
  }

  function setupEventListeners() {
    elements.turForm.addEventListener("submit", lagreTur);
    elements.avbrytBtn.addEventListener("click", () => {
      resetForm();
      lukkSidebar();
    });
    elements.lastOppBtn.addEventListener("click", lastOppBilder);
    elements.logoutBtn.addEventListener("click", loggUt);
    elements.turListe.addEventListener("click", handleTripListClick);
    elements.eksisterendeBilder.addEventListener("click", handleImageGridClick);
    elements.lightbox.addEventListener("click", lukkLightbox);
    elements.lightboxPrev.addEventListener("click", (event) => {
      event.stopPropagation();
      lightboxNav(-1);
    });
    elements.lightboxNext.addEventListener("click", (event) => {
      event.stopPropagation();
      lightboxNav(1);
    });

    if (elements.nyTurBtn) {
      elements.nyTurBtn.addEventListener("click", () => {
        resetForm();
        aapneSidebar();
      });
    }

    if (elements.sidebarCloseBtn) {
      elements.sidebarCloseBtn.addEventListener("click", () => {
        resetForm();
        lukkSidebar();
      });
    }

    if (elements.sidebarBackdrop) {
      elements.sidebarBackdrop.addEventListener("click", () => {
        resetForm();
        lukkSidebar();
      });
    }

    if (elements.deltakerInput) {
      elements.deltakerInput.addEventListener("input", (e) => {
        window.clearTimeout(state.deltakersokTimer);
        state.deltakersokTimer = window.setTimeout(
          () => sokEtterDeltaker(e.target.value.trim()),
          300,
        );
      });
    }

    if (elements.deltakerResultater) {
      elements.deltakerResultater.addEventListener(
        "click",
        handleDeltakerResultClick,
      );
    }

    if (elements.stagedDeltakere) {
      elements.stagedDeltakere.addEventListener("click", handleStagedChipClick);
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (elements.lightbox.style.display === "flex") {
          lukkLightbox();
        } else if (document.body.classList.contains("sidebar-open")) {
          resetForm();
          lukkSidebar();
        }
      } else if (elements.lightbox.style.display === "flex") {
        if (event.key === "ArrowRight") lightboxNav(1);
        else if (event.key === "ArrowLeft") lightboxNav(-1);
      }
    });

    setupDragAndDrop();
  }

  async function init() {
    try {
      console.info("[trips] frontend version", APP_VERSION);
      const svar = await fetch("/api/meg");
      const data = await lesJson(svar);
      if (!data.bruker) {
        window.location.href = "/";
        return;
      }

      elements.navBruker.textContent = data.bruker.brukernavn;
      setupEventListeners();
      await lastTurer();
    } catch (_) {
      window.location.href = "/";
    }
  }

  init();
})();
