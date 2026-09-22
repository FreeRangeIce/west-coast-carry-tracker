/**
 * West Coast Carry Tracker — vanilla JS
 * Loads data/laws.json and renders state / compare / changelog views.
 */
(function () {
  "use strict";

  const DATA_URL = "data/laws.json";

  const els = {
    disclaimer: document.getElementById("disclaimer-text"),
    reviewed: document.getElementById("global-reviewed"),
    viewState: document.getElementById("view-state"),
    viewCompare: document.getElementById("view-compare"),
    viewChangelog: document.getElementById("view-changelog"),
    loadError: document.getElementById("load-error"),
    tabs: Array.from(document.querySelectorAll(".tab")),
  };

  let data = null;
  let currentView = "ca";

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(iso) {
    if (!iso) return "—";
    // Keep YYYY-MM-DD readable; avoid TZ shift by parsing parts
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return escapeHtml(iso);
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const month = months[Number(m[2]) - 1] || m[2];
    return `${month} ${Number(m[3])}, ${m[1]}`;
  }

  function findState(id) {
    return data.states.find((s) => s.id === id);
  }

  function renderSources(sources) {
    if (!sources || !sources.length) {
      return "<p class=\"callout\">No sources listed.</p>";
    }
    const items = sources
      .map(
        (s) =>
          `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a></li>`
      )
      .join("");
    return `<ul class="sources">${items}</ul>`;
  }

  function renderList(items) {
    if (!items || !items.length) return "<p>—</p>";
    return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
  }

  function renderState(state) {
    const accent = escapeHtml(state.accent || state.id);
    const constitutionalBadge = state.constitutionalCarry
      ? '<span class="badge yes">Constitutional / permitless carry</span>'
      : '<span class="badge no">Permit required for concealed</span>';

    let extraBlocks = "";

    if (state.openCarryNote) {
      extraBlocks += `
        <div class="card ${accent}-accent">
          <h3>Open carry</h3>
          <p>${escapeHtml(state.openCarryNote)}</p>
        </div>`;
    }

    if (state.validity) {
      extraBlocks += `
        <div class="card ${accent}-accent">
          <h3>Validity</h3>
          <p>${escapeHtml(state.validity)}</p>
          ${state.minAge ? `<p><strong>Age:</strong> ${escapeHtml(state.minAge)}</p>` : ""}
        </div>`;
    } else if (state.minAge) {
      extraBlocks += `
        <div class="card ${accent}-accent">
          <h3>Minimum age</h3>
          <p>${escapeHtml(state.minAge)}</p>
        </div>`;
    }

    if (state.measure114Note) {
      extraBlocks += `
        <div class="card ${accent}-accent full">
          <h3>Measure 114 (separate from CHL)</h3>
          <p class="callout caution">${escapeHtml(state.measure114Note)}</p>
        </div>`;
    }

    if (state.recognizedStates && state.recognizedStates.length) {
      const tags = state.recognizedStates
        .map((name) => `<span class="tag">${escapeHtml(name)}</span>`)
        .join("");
      extraBlocks += `
        <div class="card ${accent}-accent full">
          <h3>Recognized out-of-state permits (as of ${escapeHtml(formatDate(state.recognizedStatesAsOf))})</h3>
          <p>Nevada DPS RCCD recognition list — verify the current official PDF.</p>
          <div class="tag-list">${tags}</div>
          ${
            state.important
              ? `<p class="callout important"><strong>Important:</strong> ${escapeHtml(state.important)}</p>`
              : ""
          }
        </div>`;
    } else if (state.important) {
      extraBlocks += `
        <div class="card ${accent}-accent full">
          <h3>Important</h3>
          <p class="callout important">${escapeHtml(state.important)}</p>
        </div>`;
    }

    els.viewState.innerHTML = `
      <div class="state-hero ${escapeHtml(state.id)}">
        <div>
          <h2>${escapeHtml(state.name)}</h2>
          <div class="state-meta">
            ${constitutionalBadge}
            <span class="badge">${escapeHtml(state.permitName)}</span>
            <span class="badge">Issuer: ${escapeHtml(state.issuer || "—")}</span>
          </div>
        </div>
        <div class="state-reviewed">
          State reviewed<br />
          <strong>${escapeHtml(formatDate(state.lastReviewed))}</strong>
        </div>
      </div>

      <div class="card-grid">
        <div class="card ${accent}-accent">
          <h3>Permit framework</h3>
          <p>${escapeHtml(state.permitFramework)}</p>
        </div>

        <div class="card ${accent}-accent">
          <h3>Reciprocity (incoming)</h3>
          <p>${escapeHtml(state.reciprocityIn)}</p>
          ${
            state.reciprocityOutNote
              ? `<p class="callout">${escapeHtml(state.reciprocityOutNote)}</p>`
              : ""
          }
        </div>

        <div class="card ${accent}-accent">
          <h3>Non-residents</h3>
          <p>${escapeHtml(state.nonResidentNote || "See sources / local issuing authority.")}</p>
        </div>

        <div class="card ${accent}-accent">
          <h3>Traveler notes</h3>
          <p>${escapeHtml(state.travelerTip || "—")}</p>
        </div>

        <div class="card ${accent}-accent full">
          <h3>Key off-limits / sensitive places (high-level)</h3>
          ${renderList(state.keyRestrictions)}
          <p class="callout caution">High-level summary only — not a complete live list. Court orders and local rules can change what is enforceable.</p>
        </div>

        ${
          state.possessionNotes
            ? `<div class="card ${accent}-accent full">
                <h3>Notable possession notes (high-level)</h3>
                <p>${escapeHtml(state.possessionNotes)}</p>
              </div>`
            : ""
        }

        ${extraBlocks}

        <div class="card ${accent}-accent full">
          <h3>Sources</h3>
          ${renderSources(state.sources)}
        </div>
      </div>
    `;
  }

  function renderCompare() {
    const rows = (data.compare || [])
      .map(
        (row) => `
      <tr>
        <th scope="row">${escapeHtml(row.topic)}</th>
        <td>${escapeHtml(row.ca)}</td>
        <td>${escapeHtml(row.or)}</td>
        <td>${escapeHtml(row.nv)}</td>
      </tr>`
      )
      .join("");

    els.viewCompare.innerHTML = `
      <p class="compare-intro">Side-by-side high-level comparison. Not a substitute for statutes or counsel.</p>
      <div class="compare-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th scope="col">Topic</th>
              <th scope="col" class="ca-col">California</th>
              <th scope="col" class="or-col">Oregon</th>
              <th scope="col" class="nv-col">Nevada</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderChangelog() {
    const items = (data.changelog || [])
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map(
        (entry) => `
      <li class="changelog-item">
        <time class="changelog-date" datetime="${escapeHtml(entry.date)}">${escapeHtml(formatDate(entry.date))}</time>
        <p class="changelog-text">${escapeHtml(entry.text)}</p>
      </li>`
      )
      .join("");

    els.viewChangelog.innerHTML = `
      <h2 style="margin:0 0 1rem;font-size:1.35rem;">Changelog</h2>
      <ul class="changelog-list">${items || "<li>No entries.</li>"}</ul>
    `;
  }

  function showView(view) {
    currentView = view;
    const isState = view === "ca" || view === "or" || view === "nv";

    els.viewState.hidden = !isState;
    els.viewCompare.hidden = view !== "compare";
    els.viewChangelog.hidden = view !== "changelog";

    els.tabs.forEach((tab) => {
      const active = tab.dataset.view === view;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (isState) {
      const state = findState(view);
      if (state) renderState(state);
    } else if (view === "compare") {
      renderCompare();
    } else if (view === "changelog") {
      renderChangelog();
    }

    // Update hash without jumping
    if (history.replaceState) {
      history.replaceState(null, "", "#" + view);
    } else {
      location.hash = view;
    }
  }

  function bindTabs() {
    els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => showView(tab.dataset.view));
    });

    // Keyboard: left/right among tabs
    document.querySelector(".tabs").addEventListener("keydown", (e) => {
      const order = els.tabs;
      const idx = order.findIndex((t) => t.dataset.view === currentView);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = order[(idx + 1) % order.length];
        next.focus();
        showView(next.dataset.view);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = order[(idx - 1 + order.length) % order.length];
        prev.focus();
        showView(prev.dataset.view);
      }
    });
  }


  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const secure =
      location.protocol === "https:" ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1";
    if (!secure) return;
    navigator.serviceWorker.register("./sw.js").catch(function () {
      /* ignore registration failures (file://, unsupported, etc.) */
    });
  }

  async function init() {
    bindTabs();
    registerServiceWorker();

    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      data = await res.json();
    } catch (err) {
      els.loadError.hidden = false;
      els.loadError.textContent =
        "Could not load data/laws.json (" +
        (err && err.message ? err.message : "error") +
        "). Serve this folder over HTTP (e.g. python3 -m http.server) — browsers block fetch() from file://.";
      return;
    }

    els.disclaimer.textContent = data.disclaimer || "";
    els.reviewed.textContent = formatDate(data.lastReviewed);

    const hash = (location.hash || "").replace(/^#/, "");
    const initial =
      hash === "ca" ||
      hash === "or" ||
      hash === "nv" ||
      hash === "compare" ||
      hash === "changelog"
        ? hash
        : "ca";

    showView(initial);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
