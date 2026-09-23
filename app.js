/**
 * West Coast Carry Tracker — vanilla JS
 * Loads data/laws.json and renders Ask / state / compare / Updates views.
 * Search is offline keyword ranking over curated data (no LLM, no live web).
 */
(function () {
  "use strict";

  const DATA_URL = "data/laws.json";
  const SEARCH_DEBOUNCE_MS = 220;
  const EXAMPLE_QUERIES = [
    "Does Nevada recognize California permits?",
    "Oregon Measure 114 vs CHL",
    "Can I open carry in Nevada without a permit?",
    "California sensitive places SB 2",
    "Non-resident California CCW AB 1078",
  ];

  const els = {
    disclaimer: document.getElementById("disclaimer-text"),
    reviewed: document.getElementById("global-reviewed"),
    viewAsk: document.getElementById("view-ask"),
    viewState: document.getElementById("view-state"),
    viewCompare: document.getElementById("view-compare"),
    viewUpdates: document.getElementById("view-updates"),
    loadError: document.getElementById("load-error"),
    tabs: Array.from(document.querySelectorAll(".tab")),
  };

  let data = null;
  let currentView = "ca";
  let searchIndex = [];
  let searchTimer = null;
  let lastQuery = "";

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

  function tokenize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9+#./-]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  function resolveSourceLinks(urls) {
    if (!urls || !urls.length) return [];
    const byUrl = {};
    (data.states || []).forEach((st) => {
      (st.sources || []).forEach((s) => {
        if (s && s.url) byUrl[s.url] = s.title || s.url;
      });
    });
    return urls.map((url) => ({
      url: url,
      title: byUrl[url] || url.replace(/^https?:\/\//, "").slice(0, 60),
    }));
  }

  function pushDoc(docs, doc) {
    const hay = [
      doc.title,
      doc.snippet,
      doc.body,
      (doc.tags || []).join(" "),
      (doc.stateIds || []).join(" "),
      (doc.stateIds || []).map((id) => {
        const st = findState(id);
        return st ? st.name : id;
      }).join(" "),
      (doc.sources || []).map((s) => s.title || "").join(" "),
    ].join(" ");
    docs.push({
      id: doc.id,
      kind: doc.kind,
      title: doc.title,
      snippet: doc.snippet,
      body: doc.body || "",
      tags: doc.tags || [],
      stateIds: doc.stateIds || [],
      sources: doc.sources || [],
      tokens: unique(tokenize(hay)),
      hayLower: hay.toLowerCase(),
    });
  }

  function buildSearchIndex() {
    const docs = [];

    (data.qa || []).forEach((qa) => {
      pushDoc(docs, {
        id: qa.id,
        kind: "qa",
        title: qa.question,
        snippet: qa.answer,
        body: qa.answer,
        tags: qa.tags || [],
        stateIds: qa.stateIds || [],
        sources: resolveSourceLinks(qa.sourceUrls || []),
      });
    });

    (data.states || []).forEach((st) => {
      const fields = [
        ["Permit framework", st.permitFramework],
        ["Reciprocity (incoming)", st.reciprocityIn],
        ["Reciprocity (outgoing note)", st.reciprocityOutNote],
        ["Non-residents", st.nonResidentNote],
        ["Traveler notes", st.travelerTip],
        ["Open carry", st.openCarryNote],
        ["Validity", st.validity],
        ["Minimum age", st.minAge],
        ["Important", st.important],
        ["Measure 114", st.measure114Note],
        ["CCW renewal", st.renewalNote],
        ["Possession notes", st.possessionNotes],
        ["Permit name", st.permitName],
        ["Issuer", st.issuer],
      ];
      fields.forEach(([label, text], i) => {
        if (!text) return;
        pushDoc(docs, {
          id: "state-" + st.id + "-" + i,
          kind: "state",
          title: st.name + " — " + label,
          snippet: text,
          body: text,
          tags: [label.toLowerCase(), st.permitName || ""],
          stateIds: [st.id],
          sources: st.sources || [],
        });
      });
      (st.keyRestrictions || []).forEach((r, i) => {
        pushDoc(docs, {
          id: "restrict-" + st.id + "-" + i,
          kind: "restriction",
          title: st.name + " — key restriction",
          snippet: r,
          body: r,
          tags: ["restriction", "sensitive places"],
          stateIds: [st.id],
          sources: st.sources || [],
        });
      });
      if (st.recognizedStates && st.recognizedStates.length) {
        pushDoc(docs, {
          id: "recog-" + st.id,
          kind: "recognition",
          title: st.name + " — recognized out-of-state permits",
          snippet:
            "As of " +
            (st.recognizedStatesAsOf || "unknown") +
            ": " +
            st.recognizedStates.join(", "),
          body: st.recognizedStates.join(" "),
          tags: ["recognition", "reciprocity", "DPS"],
          stateIds: [st.id],
          sources: st.sources || [],
        });
      }
      (st.sources || []).forEach((s, i) => {
        pushDoc(docs, {
          id: "src-" + st.id + "-" + i,
          kind: "source",
          title: s.title,
          snippet: "Official / linked source for " + st.name,
          body: s.title + " " + (s.url || ""),
          tags: ["source"],
          stateIds: [st.id],
          sources: [s],
        });
      });
    });

    (data.compare || []).forEach((row, i) => {
      pushDoc(docs, {
        id: "compare-" + i,
        kind: "compare",
        title: "Compare — " + row.topic,
        snippet:
          "CA: " + row.ca + " · OR: " + row.or + " · NV: " + row.nv,
        body: [row.topic, row.ca, row.or, row.nv].join(" "),
        tags: ["compare", row.topic],
        stateIds: ["ca", "or", "nv"],
        sources: [],
      });
    });

    (data.topics || []).forEach((t) => {
      pushDoc(docs, {
        id: "topic-" + t.id,
        kind: "topic",
        title: "Topic — " + t.label,
        snippet: "Keywords: " + (t.keywords || []).join(", "),
        body: [t.label].concat(t.keywords || []).join(" "),
        tags: t.keywords || [],
        stateIds: t.stateIds || [],
        sources: [],
      });
    });

    const feed = getUpdateFeed();
    feed.forEach((entry, i) => {
      pushDoc(docs, {
        id: "update-" + i + "-" + entry.date,
        kind: "update",
        title: "Update — " + formatDate(entry.date),
        snippet: entry.text,
        body: entry.text,
        tags: ["update", "changelog"],
        stateIds: [],
        sources: [],
      });
    });

    searchIndex = docs;
  }

  function getUpdateFeed() {
    const fromUpdates = data.updates || [];
    const fromChangelog = data.changelog || [];
    const merged = fromUpdates.length ? fromUpdates.slice() : fromChangelog.slice();
    // If both exist, prefer updates but include any changelog dates not already present
    if (fromUpdates.length && fromChangelog.length) {
      const seen = {};
      fromUpdates.forEach((u) => {
        seen[u.date + "|" + u.text] = true;
      });
      fromChangelog.forEach((c) => {
        const key = c.date + "|" + c.text;
        if (!seen[key]) merged.push(c);
      });
    }
    return merged
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  function scoreDoc(doc, queryTokens, queryLower) {
    if (!queryTokens.length) return 0;
    let score = 0;
    const titleLower = (doc.title || "").toLowerCase();
    const snippetLower = (doc.snippet || "").toLowerCase();
    const tagLower = (doc.tags || []).join(" ").toLowerCase();

    queryTokens.forEach((tok) => {
      if (doc.tokens.indexOf(tok) !== -1) score += 3;
      if (titleLower.indexOf(tok) !== -1) score += 5;
      if (tagLower.indexOf(tok) !== -1) score += 4;
      if (snippetLower.indexOf(tok) !== -1) score += 2;
      // light prefix boost for partials (e.g. "recip" → reciprocity)
      if (tok.length >= 4) {
        doc.tokens.forEach((dt) => {
          if (dt.indexOf(tok) === 0 || tok.indexOf(dt) === 0) score += 1;
        });
      }
    });

    if (queryLower.length >= 6 && doc.hayLower.indexOf(queryLower) !== -1) {
      score += 8;
    }

    // Prefer curated Q&A slightly
    if (doc.kind === "qa") score += 1.5;
    if (doc.kind === "source") score *= 0.85;

    return score;
  }

  function makeSnippet(text, queryTokens, maxLen) {
    const raw = String(text || "");
    const limit = maxLen || 220;
    if (!raw) return "";
    const lower = raw.toLowerCase();
    let start = 0;
    for (let i = 0; i < queryTokens.length; i++) {
      const idx = lower.indexOf(queryTokens[i]);
      if (idx !== -1) {
        start = Math.max(0, idx - 40);
        break;
      }
    }
    let slice = raw.slice(start, start + limit);
    if (start > 0) slice = "…" + slice;
    if (start + limit < raw.length) slice = slice + "…";
    return slice;
  }

  function highlight(text, queryTokens) {
    let out = escapeHtml(text);
    if (!queryTokens.length) return out;
    const sorted = queryTokens
      .slice()
      .filter((t) => t.length >= 2)
      .sort((a, b) => b.length - a.length);
    sorted.forEach((tok) => {
      const re = new RegExp(
        "(" + tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")",
        "gi"
      );
      out = out.replace(re, "<mark>$1</mark>");
    });
    return out;
  }

  function stateBadges(stateIds) {
    if (!stateIds || !stateIds.length) return "";
    return stateIds
      .map((id) => {
        const st = findState(id);
        const name = st ? st.name : id.toUpperCase();
        return `<span class="badge state-badge state-${escapeHtml(id)}">${escapeHtml(name)}</span>`;
      })
      .join("");
  }

  function kindLabel(kind) {
    const map = {
      qa: "Q&A",
      state: "State data",
      restriction: "Restriction",
      recognition: "Recognition list",
      source: "Source",
      compare: "Compare",
      topic: "Topic",
      update: "Update",
    };
    return map[kind] || kind;
  }

  function runSearch(query) {
    const q = String(query || "").trim();
    lastQuery = q;
    const tokens = unique(tokenize(q));
    const qLower = q.toLowerCase();
    if (!tokens.length) return [];

    return searchIndex
      .map((doc) => ({
        doc: doc,
        score: scoreDoc(doc, tokens, qLower),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
      .slice(0, 25);
  }

  function renderAskResults(results, query) {
    const container = document.getElementById("ask-results");
    if (!container) return;

    const tokens = unique(tokenize(query));
    if (!query.trim()) {
      container.innerHTML = `
        <div class="ask-empty">
          <p class="ask-empty-title">Try an example</p>
          <ul class="ask-examples">
            ${EXAMPLE_QUERIES.map(
              (q) =>
                `<li><button type="button" class="ask-example" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button></li>`
            ).join("")}
          </ul>
        </div>`;
      container.querySelectorAll(".ask-example").forEach((btn) => {
        btn.addEventListener("click", () => {
          const input = document.getElementById("ask-input");
          if (input) {
            input.value = btn.getAttribute("data-q") || "";
            performAskSearch(input.value, true);
            input.focus();
          }
        });
      });
      return;
    }

    if (!results.length) {
      container.innerHTML = `
        <div class="ask-empty">
          <p>No matches in this tracker’s curated data for “${escapeHtml(query)}”.</p>
          <p class="ask-hint">Try different keywords, a state name, or an example below. Always verify official sources.</p>
          <ul class="ask-examples">
            ${EXAMPLE_QUERIES.map(
              (q) =>
                `<li><button type="button" class="ask-example" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button></li>`
            ).join("")}
          </ul>
        </div>`;
      container.querySelectorAll(".ask-example").forEach((btn) => {
        btn.addEventListener("click", () => {
          const input = document.getElementById("ask-input");
          if (input) {
            input.value = btn.getAttribute("data-q") || "";
            performAskSearch(input.value, true);
          }
        });
      });
      return;
    }

    const cards = results
      .map(({ doc, score }) => {
        const snip = makeSnippet(doc.snippet || doc.body, tokens);
        const sources =
          doc.sources && doc.sources.length
            ? `<ul class="result-sources">${doc.sources
                .slice(0, 4)
                .map(
                  (s) =>
                    `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a></li>`
                )
                .join("")}</ul>`
            : "";
        return `
          <article class="result-card" data-score="${score.toFixed(1)}">
            <div class="result-meta">
              <span class="badge kind-badge">${escapeHtml(kindLabel(doc.kind))}</span>
              ${stateBadges(doc.stateIds)}
            </div>
            <h3 class="result-title">${highlight(doc.title, tokens)}</h3>
            <p class="result-snippet">${highlight(snip, tokens)}</p>
            ${sources}
          </article>`;
      })
      .join("");

    container.innerHTML = `
      <p class="ask-count" aria-live="polite">${results.length} result${results.length === 1 ? "" : "s"} in curated tracker data</p>
      <div class="result-list">${cards}</div>`;
  }

  function performAskSearch(query, immediate) {
    const run = () => renderAskResults(runSearch(query), query);
    if (immediate) {
      if (searchTimer) clearTimeout(searchTimer);
      run();
      return;
    }
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(run, SEARCH_DEBOUNCE_MS);
  }

  function renderAsk() {
    els.viewAsk.innerHTML = `
      <div class="ask-panel">
        <h2 class="ask-heading">Ask / Search</h2>
        <p class="ask-honesty">Searches this tracker’s curated data and linked sources — not live web search or legal advice.</p>
        <form class="ask-form" id="ask-form" role="search">
          <label class="visually-hidden" for="ask-input">Question or keywords</label>
          <input
            type="search"
            id="ask-input"
            class="ask-input"
            placeholder="e.g. Does Nevada recognize California permits?"
            autocomplete="off"
            enterkeyhint="search"
          />
          <button type="submit" class="ask-submit">Search</button>
        </form>
        <p class="ask-legal-note"><strong>NOT LEGAL ADVICE.</strong> Ranked passages only — verify every answer with official sources.</p>
        <div id="ask-results" class="ask-results" aria-live="polite"></div>
      </div>`;

    const form = document.getElementById("ask-form");
    const input = document.getElementById("ask-input");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      performAskSearch(input.value, true);
    });
    input.addEventListener("input", () => performAskSearch(input.value, false));
    if (lastQuery) {
      input.value = lastQuery;
      performAskSearch(lastQuery, true);
    } else {
      renderAskResults([], "");
    }
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

    if (state.renewalNote) {
      extraBlocks += `
        <div class="card ${accent}-accent full">
          <h3>CCW renewal (recent change)</h3>
          <p class="callout caution">${escapeHtml(state.renewalNote)}</p>
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

  function renderUpdates() {
    const items = getUpdateFeed()
      .map(
        (entry) => `
      <li class="changelog-item update-item">
        <time class="changelog-date" datetime="${escapeHtml(entry.date)}">${escapeHtml(formatDate(entry.date))}</time>
        <p class="changelog-text">${escapeHtml(entry.text)}</p>
      </li>`
      )
      .join("");

    const watch =
      data.monitoringNote ||
      "Watching for changes: curated data is refreshed when material updates are verified against official sources (weekday monitoring). This is not live web search.";

    els.viewUpdates.innerHTML = `
      <h2 class="updates-heading">Updates</h2>
      <p class="watching-note" role="status">
        <span class="watching-dot" aria-hidden="true"></span>
        ${escapeHtml(watch)}
      </p>
      <ul class="changelog-list">${items || "<li>No entries.</li>"}</ul>
    `;
  }

  function showView(view) {
    // Alias old changelog hash → updates
    if (view === "changelog") view = "updates";
    currentView = view;
    const isState = view === "ca" || view === "or" || view === "nv";

    els.viewAsk.hidden = view !== "ask";
    els.viewState.hidden = !isState;
    els.viewCompare.hidden = view !== "compare";
    els.viewUpdates.hidden = view !== "updates";

    els.tabs.forEach((tab) => {
      const active = tab.dataset.view === view;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (view === "ask") {
      renderAsk();
    } else if (isState) {
      const state = findState(view);
      if (state) renderState(state);
    } else if (view === "compare") {
      renderCompare();
    } else if (view === "updates") {
      renderUpdates();
    }

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
    buildSearchIndex();

    const hash = (location.hash || "").replace(/^#/, "");
    const initial =
      hash === "ask" ||
      hash === "ca" ||
      hash === "or" ||
      hash === "nv" ||
      hash === "compare" ||
      hash === "updates" ||
      hash === "changelog"
        ? hash === "changelog"
          ? "updates"
          : hash
        : "ca";

    showView(initial);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
