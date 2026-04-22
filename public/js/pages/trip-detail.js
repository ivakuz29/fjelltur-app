(function () {
  const APP_VERSION = "20260422-9";
  const EMPTY_STAGE =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 900'>" +
        "<rect width='1200' height='900' fill='#dfeaf8'/>" +
        "<path d='M0 900 200 520 430 690 650 290 860 620 1030 420 1200 630 1200 900Z' fill='#bfd2ea'/>" +
        "<path d='M0 900 250 610 420 760 635 355 770 520 930 430 1200 720 1200 900Z' fill='#9fbbe0' opacity='.72'/>" +
        "<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#0c1e3a' font-family='Georgia, serif' font-size='66'>Ingen bilder enda</text>" +
      "</svg>",
    );

  const KB_VARIANTS = [
    { anim: "kenBurnsA", origin: "center center" },
    { anim: "kenBurnsB", origin: "62% 38%" },
    { anim: "kenBurnsC", origin: "38% 62%" },
    { anim: "kenBurnsD", origin: "55% 50%" },
  ];

  const state = {
    user: null,
    trip: null,
    comments: [],
    images: [],
    activeImageIndex: 0,
    carouselTimer: null,
    replyTargetId: null,
    kbIndex: 0,
    participantSearchTimer: null,
  };

  const elements = {
    navBruker: document.getElementById("nav-bruker"),
    logoutBtn: document.getElementById("logout-btn"),
    tripLoading: document.getElementById("trip-loading"),
    tripHeroPanel: document.getElementById("trip-hero-panel"),
    tripKicker: document.getElementById("trip-kicker"),
    tripTitle: document.getElementById("trip-title"),
    tripStatRow: document.getElementById("trip-stat-row"),
    tripNote: document.getElementById("trip-note"),
    tripStageImage: document.getElementById("trip-stage-image"),
    tripStageCounter: document.getElementById("trip-stage-counter"),
    tripStageStatus: document.getElementById("trip-stage-status"),
    tripThumbRow: document.getElementById("trip-thumb-row"),
    tripPrev: document.getElementById("trip-prev"),
    tripNext: document.getElementById("trip-next"),
    commentPanel: document.getElementById("comment-panel"),
    commentCount: document.getElementById("comment-count"),
    commentForm: document.getElementById("comment-form"),
    commentInput: document.getElementById("comment-input"),
    commentMessage: document.getElementById("comment-message"),
    commentList: document.getElementById("comment-list"),
    commentPrivateNotice: document.getElementById("comment-private-notice"),
    tripParticipantsSection: document.getElementById("trip-participants-section"),
    tripParticipantList: document.getElementById("trip-participant-list"),
    participantSearch: document.getElementById("participant-search"),
    participantInput: document.getElementById("participant-input"),
    participantResults: document.getElementById("participant-results"),
  };

  if (!elements.tripLoading) {
    return;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getTripIdFromPath() {
    const segments = window.location.pathname.split("/").filter(Boolean);
    return Number(segments[segments.length - 1]);
  }

  function formatTripDate(value) {
    if (!value) {
      return "";
    }

    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("no-NO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function formatCommentDate(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value.replace(" ", "T") + "Z");
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("no-NO", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  async function lesJson(svar) {
    const data = await svar.json().catch(() => null);
    if (!svar.ok || !data) {
      throw new Error("Ugyldig svar fra serveren.");
    }

    if (data.ok === false) {
      throw new Error(data.melding || "Noe gikk galt.");
    }

    return data;
  }

  function getTotalCommentCount(comments) {
    return comments.reduce(
      (sum, comment) => sum + 1 + getTotalCommentCount(comment.replies || []),
      0,
    );
  }

  function setCommentMessage(text, type) {
    elements.commentMessage.textContent = text;
    elements.commentMessage.className = type
      ? `skjema-melding ${type}`
      : "skjema-melding";
    window.clearTimeout(elements.commentMessage._timer);
    if (!text) {
      return;
    }

    elements.commentMessage._timer = window.setTimeout(() => {
      elements.commentMessage.textContent = "";
      elements.commentMessage.className = "skjema-melding";
    }, 3000);
  }

  function renderParticipants(deltakere, isEier) {
    const section = elements.tripParticipantsSection;
    if (!section) return;

    if (!deltakere.length && !isEier) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    const list = elements.tripParticipantList;

    if (!deltakere.length) {
      list.innerHTML = '<p class="no-participants">Ingen deltakere lagt til ennå.</p>';
    } else {
      list.innerHTML = deltakere
        .map(
          (d) => `
            <span class="participant-chip">
              ${escapeHtml(d.brukernavn)}
              ${isEier ? `<button type="button" class="participant-remove" data-action="remove-participant" data-bruker-id="${d.id}" title="Fjern">&times;</button>` : ""}
            </span>
          `,
        )
        .join("");
    }

    if (elements.participantSearch) {
      elements.participantSearch.hidden = !isEier;
    }
  }

  function renderStats(trip) {
    const stats = [
      { label: "Dato", value: formatTripDate(trip.dato) },
      { label: "Distanse", value: trip.distanse ? `${trip.distanse} km` : "Ikke registrert" },
      { label: "Hoyde", value: trip.hoyde ? `${trip.hoyde} moh` : "Ikke registrert" },
      { label: "Bilder", value: `${(trip.bilder || []).length}` },
    ];

    elements.tripStatRow.innerHTML = stats
      .map(
        (stat) => `
          <div class="trip-stat">
            <span class="trip-stat-label">${escapeHtml(stat.label)}</span>
            <strong>${escapeHtml(stat.value)}</strong>
          </div>
        `,
      )
      .join("");
  }

  function getImageItems(trip) {
    if (trip.bilder && trip.bilder.length) {
      return trip.bilder.map((image, index) => ({
        src: `/uploads/${image.filnavn}`,
        alt: `${trip.fjell} bilde ${index + 1}`,
      }));
    }

    return [{ src: EMPTY_STAGE, alt: "Ingen bilder enda" }];
  }

  function applyKenBurns(img) {
    const variant = KB_VARIANTS[state.kbIndex % KB_VARIANTS.length];
    state.kbIndex = (state.kbIndex + 1) % KB_VARIANTS.length;
    img.style.transformOrigin = variant.origin;
    img.style.animation = "none";
    void img.offsetWidth;
    img.style.animation = `${variant.anim} 8s ease-in-out forwards`;
  }

  function updateStageImage() {
    const current = state.images[state.activeImageIndex];
    if (!current) {
      return;
    }

    const img = elements.tripStageImage;
    const multi = state.images.length > 1;

    elements.tripStageCounter.textContent = multi
      ? `${state.activeImageIndex + 1} / ${state.images.length}`
      : "";
    elements.tripPrev.style.display = multi ? "flex" : "none";
    elements.tripNext.style.display = multi ? "flex" : "none";

    const isFirstLoad = !img.getAttribute("src");
    if (isFirstLoad) {
      img.src = current.src;
      img.alt = current.alt;
      applyKenBurns(img);
      img.style.opacity = "1";
    } else {
      img.style.opacity = "0";
      window.setTimeout(() => {
        img.src = current.src;
        img.alt = current.alt;
        applyKenBurns(img);
        img.style.opacity = "1";
      }, 550);
    }
  }

  function setActiveImage(index) {
    if (!state.images.length) {
      return;
    }

    state.activeImageIndex =
      (index + state.images.length) % state.images.length;
    updateStageImage();
  }

  function stopCarousel() {
    if (state.carouselTimer) {
      window.clearInterval(state.carouselTimer);
      state.carouselTimer = null;
    }
  }

  function startCarousel() {
    stopCarousel();

    if (state.images.length <= 1) {
      return;
    }

    state.carouselTimer = window.setInterval(() => {
      if (document.hidden) {
        return;
      }

      setActiveImage(state.activeImageIndex + 1);
    }, 8000);
  }

  function renderTrip(trip) {
    state.trip = trip;
    state.images = getImageItems(trip);
    state.activeImageIndex = 0;

    document.title = `Fjelltur - ${trip.fjell}`;
    elements.tripKicker.textContent = formatTripDate(trip.dato);
    elements.tripTitle.textContent = trip.fjell;
    elements.tripNote.textContent = trip.notat || "Ingen notat lagt til for denne turen enn\u00e5.";
    renderStats(trip);
    renderParticipants(trip.deltakere || [], !!trip.eier);
    updateStageImage();
    startCarousel();

    const isPublic = !!trip.offentlig;
    if (elements.commentPrivateNotice) {
      elements.commentPrivateNotice.hidden = isPublic;
    }
    if (elements.commentForm) {
      elements.commentForm.hidden = !isPublic;
    }

    elements.tripLoading.hidden = true;
    elements.tripHeroPanel.hidden = false;
    elements.commentPanel.hidden = false;
  }

  function renderCommentItem(comment, isReply) {
    const hasReplyForm = Number(state.replyTargetId) === Number(comment.id);
    return `
      <article class="comment-card${isReply ? " is-reply" : ""}">
        <div class="comment-meta">
          <strong>${escapeHtml(comment.bruker.brukernavn)}</strong>
          <span>${escapeHtml(formatCommentDate(comment.opprettet))}</span>
        </div>
        <p class="comment-body">${escapeHtml(comment.innhold)}</p>
        <div class="comment-actions">
          <button type="button" class="comment-reply-btn" data-action="toggle-reply" data-comment-id="${comment.id}">
            ${hasReplyForm ? "Avbryt svar" : "Svar"}
          </button>
        </div>
        ${
          hasReplyForm
            ? `
              <form class="reply-form" data-parent-id="${comment.id}">
                <label class="comment-label" for="reply-${comment.id}">Svar til ${escapeHtml(comment.bruker.brukernavn)}</label>
                <textarea id="reply-${comment.id}" name="innhold" placeholder="Skriv et svar..." required></textarea>
                <div class="comment-form-actions">
                  <button type="submit" class="btn btn-primary">Svar</button>
                </div>
              </form>
            `
            : ""
        }
        ${
          comment.replies && comment.replies.length
            ? `
              <div class="comment-replies">
                ${comment.replies.map((reply) => renderCommentItem(reply, true)).join("")}
              </div>
            `
            : ""
        }
      </article>
    `;
  }

  function renderComments(comments) {
    state.comments = comments;
    const count = getTotalCommentCount(comments);
    elements.commentCount.textContent = `${count} ${count === 1 ? "innlegg" : "innlegg"}`;

    if (!comments.length) {
      elements.commentList.innerHTML = `
        <div class="empty-state comment-empty">
          <span class="empty-icon">+</span>
          <p>Ingen kommentarer enn\u00e5</p>
        </div>
      `;
      return;
    }

    elements.commentList.innerHTML = comments
      .map((comment) => renderCommentItem(comment, false))
      .join("");
  }

  async function loggUt() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function submitComment(payload) {
    const response = await fetch(`/api/turer/${state.trip.id}/kommentarer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await lesJson(response);
    state.replyTargetId = null;
    renderComments(data.kommentarer || []);
    return data;
  }

  async function handleCommentSubmit(event) {
    event.preventDefault();

    const innhold = elements.commentInput.value.trim();
    if (!innhold) {
      setCommentMessage("Kommentaren kan ikke vare tom.", "feil");
      return;
    }

    try {
      await submitComment({ innhold });
      elements.commentInput.value = "";
      setCommentMessage("Kommentaren er lagt til.", "ok");
    } catch (error) {
      setCommentMessage(error.message || "Kunne ikke lagre kommentaren.", "feil");
    }
  }

  async function handleReplySubmit(event) {
    const form = event.target.closest(".reply-form");
    if (!form) {
      return;
    }

    event.preventDefault();

    const textarea = form.querySelector("textarea");
    const innhold = textarea ? textarea.value.trim() : "";
    const parentId = Number(form.dataset.parentId);
    if (!innhold || !parentId) {
      setCommentMessage("Svarfeltet kan ikke vare tomt.", "feil");
      return;
    }

    try {
      await submitComment({ innhold, parentId });
      setCommentMessage("Svaret er lagt til.", "ok");
    } catch (error) {
      setCommentMessage(error.message || "Kunne ikke lagre svaret.", "feil");
    }
  }

  function handleThumbClick(event) {
    const button = event.target.closest('[data-action="show-image"]');
    if (!button) {
      return;
    }

    setActiveImage(Number(button.dataset.index) || 0);
    startCarousel();
  }

  function handleCommentListClick(event) {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) {
      return;
    }

    if (actionEl.dataset.action === "toggle-reply") {
      const commentId = Number(actionEl.dataset.commentId);
      state.replyTargetId =
        Number(state.replyTargetId) === commentId ? null : commentId;
      renderComments(state.comments);
    }
  }

  async function handleParticipantRemove(brukerId) {
    if (!state.trip) return;
    const response = await fetch(
      `/api/turer/${state.trip.id}/deltakere/${brukerId}`,
      { method: "DELETE" },
    );
    const data = await lesJson(response);
    state.trip.deltakere = data.deltakere || [];
    renderParticipants(state.trip.deltakere, !!state.trip.eier);
  }

  function handleParticipantListClick(event) {
    const btn = event.target.closest('[data-action="remove-participant"]');
    if (!btn) return;
    handleParticipantRemove(Number(btn.dataset.brukerId));
  }

  async function handleParticipantSearch(query) {
    if (!elements.participantResults) return;
    if (!query || query.length < 2) {
      elements.participantResults.innerHTML = "";
      return;
    }

    const response = await fetch(
      `/api/brukere/sok?q=${encodeURIComponent(query)}`,
    );
    const data = await response.json().catch(() => ({ brukere: [] }));
    const existing = new Set(
      (state.trip.deltakere || []).map((d) => d.id),
    );

    const treff = (data.brukere || []).filter((b) => !existing.has(b.id));
    if (!treff.length) {
      elements.participantResults.innerHTML =
        '<p class="participant-no-results">Ingen treff.</p>';
      return;
    }

    elements.participantResults.innerHTML = treff
      .map(
        (b) =>
          `<button type="button" class="participant-result-item" data-action="add-participant" data-bruker-id="${b.id}">${escapeHtml(b.brukernavn)}</button>`,
      )
      .join("");
  }

  async function handleParticipantAdd(brukerId) {
    if (!state.trip) return;
    const response = await fetch(`/api/turer/${state.trip.id}/deltakere`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brukerId }),
    });
    const data = await lesJson(response);
    state.trip.deltakere = data.deltakere || [];
    renderParticipants(state.trip.deltakere, !!state.trip.eier);
    if (elements.participantInput) elements.participantInput.value = "";
    if (elements.participantResults) elements.participantResults.innerHTML = "";
  }

  function bindEvents() {
    elements.logoutBtn.addEventListener("click", loggUt);
    elements.tripPrev.addEventListener("click", () => {
      setActiveImage(state.activeImageIndex - 1);
      startCarousel();
    });
    elements.tripNext.addEventListener("click", () => {
      setActiveImage(state.activeImageIndex + 1);
      startCarousel();
    });
    elements.tripThumbRow.addEventListener("click", handleThumbClick);
    elements.commentForm.addEventListener("submit", handleCommentSubmit);
    elements.commentList.addEventListener("click", handleCommentListClick);
    elements.commentList.addEventListener("submit", handleReplySubmit);

    if (elements.tripParticipantList) {
      elements.tripParticipantList.addEventListener(
        "click",
        handleParticipantListClick,
      );
    }

    if (elements.participantInput) {
      elements.participantInput.addEventListener("input", (e) => {
        window.clearTimeout(state.participantSearchTimer);
        state.participantSearchTimer = window.setTimeout(
          () => handleParticipantSearch(e.target.value.trim()),
          300,
        );
      });
    }

    if (elements.participantResults) {
      elements.participantResults.addEventListener("click", (e) => {
        const btn = e.target.closest('[data-action="add-participant"]');
        if (btn) handleParticipantAdd(Number(btn.dataset.brukerId));
      });
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopCarousel();
      } else {
        startCarousel();
      }
    });
  }

  async function init() {
    try {
      const tripId = getTripIdFromPath();
      if (!Number.isInteger(tripId) || tripId < 1) {
        throw new Error("Ugyldig tur-id.");
      }

      console.info("[trip-detail] frontend version", APP_VERSION);
      const [meResponse, tripResponse] = await Promise.all([
        fetch("/api/meg"),
        fetch(`/api/turer/${tripId}`),
      ]);
      const me = await lesJson(meResponse);
      const tripData = await lesJson(tripResponse);

      state.user = me.bruker;
      elements.navBruker.textContent = me.bruker.brukernavn;
      renderTrip(tripData.tur);
      renderComments(tripData.kommentarer || []);
      bindEvents();
    } catch (error) {
      stopCarousel();
      elements.tripLoading.textContent =
        error.message || "Kunne ikke laste turen.";
      elements.tripLoading.classList.add("trip-loading-error");
    }
  }

  init();
})();
