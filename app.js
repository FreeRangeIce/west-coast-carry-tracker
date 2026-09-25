/**
 * West Coast Carry Tracker — vanilla JS
 * Loads data/laws.json and renders Ask / state (CA, OR, NV, WA, AZ) / compare /
 * litigation / Updates views. State tabs are derived from data.states.
 * Search is offline keyword ranking over curated data (no LLM, no live web).
 */
(function () {
  "use strict";

  const DATA_URL = "data/laws.json";
  const SEARCH_DEBOUNCE_MS = 220;
  const EXAMPLE_QUERIES = [
    "Does Arizona honor California permits?",
    "Washington permit to purchase HB 1163",
    "Which states honor each other's permits?",
    "Duncan v. Bonta magazine case status",
    "California sensitive places SB 2",
    "Arizona bar carry permit",
    "Los Angeles CCW fees",
  ];
  const NON_STATE_VIEWS = ["ask", "compare", "litigation", "updates"];

  const els = {
    disclaimer: document.getElementById("disclaimer-text"),
    reviewed: document.getElementById("global-reviewed"),
    reviewedAge: document.getElementById("global-reviewed-age"),
    reviewedStamp: document.getElementById("reviewed-stamp"),
    viewAsk: document.getElementById("view-ask"),
    viewState: document.getElementById("view-state"),
    viewCompare: document.getElementById("view-compare"),
    viewUpdates: document.getElementById("view-updates"),
    viewLitigation: document.getElementById("view-litigation"),
    loadError: document.getElementById("load-error"),
    main: document.getElementById("main"),
    tabBar: document.querySelector(".tabs"),
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

  // Age line on the header "Last reviewed" stamp. The calendar date always shows.
  // After STALE_AFTER_DAYS the stamp turns amber and adds a written warning, so the
  // warning never depends on color alone. lastReviewed changes only when Micah approves
  // a source-checked ship to main; this code only reads it.
  // Threshold: 14 days (Micah, Sep 25 2026). Change to 30 if the real review cadence is monthly.
  const STALE_AFTER_DAYS = 14;
  function reviewAgeDays(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return null;
    const reviewed = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today - reviewed) / 86400000);
  }
  function renderReviewAge(iso) {
    if (!els.reviewedAge || !els.reviewedStamp) return;
    const days = reviewAgeDays(iso);
    const stale = days === null || days > STALE_AFTER_DAYS;
    els.reviewedStamp.classList.toggle("is-stale", stale);
    if (!stale) {
      els.reviewedAge.hidden = true;
      els.reviewedAge.textContent = "";
      return;
    }
    els.reviewedAge.textContent =
      (days === null ? "" : days + " days ago. ") + "Check sources before relying on this.";
    els.reviewedAge.hidden = false;
  }

  function findState(id) {
    return data.states.find((s) => s.id === id);
  }

  function stateIds() {
    return ((data && data.states) || []).map((s) => s.id);
  }

  function stateName(id) {
    const st = data ? findState(id) : null;
    return st ? st.name : String(id).toUpperCase();
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
    ((data.reciprocityMatrix && data.reciprocityMatrix.sources) || []).forEach((s) => {
      if (s && s.url && !byUrl[s.url]) byUrl[s.url] = s.title || s.url;
    });
    litigationCases().forEach((c) => {
      if (c.sourceUrl && !byUrl[c.sourceUrl]) byUrl[c.sourceUrl] = c.name + " — " + (c.court || "docket");
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
        ["Eligibility", st.eligibility],
        ["Fees", st.fees],
        ["Training", st.training],
        ["Processing time", st.processingTime],
        ["Magazines & assault weapons", st.magazineAwRules],
        ["Buying a gun (permit to purchase / waiting period)", st.purchaseRules],
        ["Recent legislation", st.recentLegislationNote],
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
            (st.recognizedStatesAsOf ? formatDate(st.recognizedStatesAsOf) : "unknown") +
            ": " +
            st.recognizedStates.join(", "),
          body: st.recognizedStates.join(" "),
          tags: ["recognition", "reciprocity", st.recognizedStatesSource || ""],
          stateIds: [st.id],
          sources: st.sources || [],
        });
      }
      (st.recentLegislation || []).forEach((b, i) => {
        pushDoc(docs, {
          id: "leg-" + st.id + "-" + i,
          kind: "legislation",
          title: st.name + " — " + b.title,
          snippet: (b.status ? b.status + ". " : "") + (b.summary || ""),
          body: [b.title, b.status, b.summary].join(" "),
          tags: ["legislation", "bill", "law change"],
          stateIds: [st.id],
          sources: b.url ? [{ title: b.title, url: b.url }] : [],
        });
      });
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

    const ids = stateIds();
    (data.compare || []).forEach((row, i) => {
      const cols = ids.filter((id) => row[id] != null);
      pushDoc(docs, {
        id: "compare-" + i,
        kind: "compare",
        title: "Compare — " + row.topic,
        snippet: cols.map((id) => id.toUpperCase() + ": " + row[id]).join(" · "),
        body: [row.topic].concat(cols.map((id) => row[id])).join(" "),
        tags: ["compare", row.topic],
        stateIds: cols,
        sources: [],
      });
    });

    const matrix = data.reciprocityMatrix;
    if (matrix && matrix.honors) {
      const lines = [];
      (matrix.states || ids).forEach((row) => {
        const honored = (matrix.states || ids).filter(
          (col) => col !== row && matrix.honors[row] && matrix.honors[row][col] === "yes"
        );
        lines.push(
          stateName(row) + " honors: " + (honored.length ? honored.map(stateName).join(", ") : "none of the others")
        );
      });
      pushDoc(docs, {
        id: "recip-matrix",
        kind: "matrix",
        title: "Reciprocity matrix — which of the five states honor each other's permits",
        snippet: lines.join(" · "),
        body: lines.join(" ") + " reciprocity matrix honor recognize permit",
        tags: ["reciprocity", "matrix", "recognize", "honor", "traveler"],
        stateIds: matrix.states || ids,
        sources: matrix.sources || [],
      });
    }

    litigationCases().forEach((c) => {
      pushDoc(docs, {
        id: "case-" + c.id,
        kind: "case",
        title: c.name + " — " + (c.court || ""),
        snippet: "Status: " + c.status + " Challenges: " + c.challenges,
        body: [c.name, c.docket, c.challenges, c.status, c.impact].join(" "),
        tags: ["litigation", "court", "case", c.outcome || ""],
        stateIds: c.stateIds || [],
        sources: [{ title: c.name + " — primary source", url: c.sourceUrl }],
      });
    });

    countyStates().forEach((cs) => {
      const st = findState(cs.stateId);
      const nm = st ? st.name : cs.stateId;
      pushDoc(docs, {
        id: "county-" + cs.stateId,
        kind: "county",
        title: nm + " — county / local issuing notes",
        snippet: cs.summary,
        body: cs.summary,
        tags: ["county", "sheriff", "local"],
        stateIds: [cs.stateId],
        sources: [],
      });
      (cs.counties || []).forEach((c, i) => {
        const text = [c.fees, c.processing, c.policies].filter(Boolean).join(" ");
        pushDoc(docs, {
          id: "county-" + cs.stateId + "-" + i,
          kind: "county",
          // Skip " County" when the name already says "(city)" or "County".
          title: c.name + (/\(city\)|County\b/i.test(c.name) ? "" : " County") + " (" + nm + ") — " + (c.agency || "CCW"),
          snippet: text,
          body: c.name + " county " + text,
          tags: ["county", "sheriff", "fees", "processing", c.name],
          stateIds: [cs.stateId],
          sources: c.sourceUrl ? [{ title: (c.agency || c.name) + " CCW page", url: c.sourceUrl }] : [],
        });
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

  function litigationCases() {
    return (data && data.litigation && data.litigation.cases) || [];
  }

  function countyStates() {
    return (data && data.countyNotes && data.countyNotes.states) || [];
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

  // Words that carry no meaning on their own. A query made only of these
  // returns "no match". "or" is left out on purpose: it is Oregon's code.
  const STOPWORDS = new Set(
    ("a an and any are as at be by can could do does did for from get has have how i if in into " +
      "is it its me my of on our should so that the their them there these this those to was " +
      "we what when where which who why will with would you your").split(" ")
  );
  // Everyday words mapped to the words the data actually uses.
  const SYNONYMS = {
    honor: ["recognize", "reciprocity"],
    honors: ["recognize", "reciprocity"],
    honored: ["recognize", "reciprocity"],
    accept: ["recognize", "reciprocity"],
    accepts: ["recognize", "reciprocity"],
    valid: ["recognize"],
    recognize: ["reciprocity"],
    recognizes: ["recognize", "reciprocity"],
    driving: ["traveler", "traveling", "vehicle"],
    drive: ["traveler", "traveling", "vehicle"],
    trip: ["traveler", "traveling"],
    visiting: ["traveler", "traveling"],
  };
  const STATE_WORDS = {
    california: "ca", ca: "ca",
    oregon: "or",
    nevada: "nv", nv: "nv",
    washington: "wa", wa: "wa",
    arizona: "az", az: "az",
  };

  // States named in the query, in the order they appear. The first one is
  // the state the question is about ("Does Nevada honor Washington permits?"
  // is a Nevada question). Uppercase "OR" counts as Oregon; lowercase "or" does not.
  function queryStates(query) {
    const out = [];
    const words = String(query || "").replace(/[^A-Za-z]+/g, " ").split(/\s+/).filter(Boolean);
    let host = null;
    words.forEach((w, i) => {
      const id = w === "OR" ? "or" : STATE_WORDS[w.toLowerCase()];
      if (!id || out.indexOf(id) !== -1) return;
      out.push(id);
      // "good in Nevada", "driving to Oregon", "through California": that is
      // the state whose rules apply, so it becomes the subject.
      const prev = (words[i - 1] || "").toLowerCase();
      if (!host && ["in", "into", "to", "through", "visiting"].indexOf(prev) !== -1) host = id;
    });
    if (host) out.splice(out.indexOf(host), 1), out.unshift(host);
    return out;
  }

  function scoreDoc(doc, queryTokens, queryLower, states) {
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
      // light prefix boost for partials (e.g. "recip" → reciprocity); both sides 4+ letters
      if (tok.length >= 4) {
        doc.tokens.forEach((dt) => {
          if (dt.length >= 4 && (dt.indexOf(tok) === 0 || tok.indexOf(dt) === 0)) score += 1;
        });
      }
    });

    // Nothing in the query matched this entry: never rescue it with bonuses.
    if (score === 0) return 0;

    if (queryLower.length >= 6 && doc.hayLower.indexOf(queryLower) !== -1) {
      score += 8;
    }

    // State intent: favor entries about the state the question is about.
    if (states && states.length && doc.stateIds.length) {
      const subject = states[0];
      const docMain = doc.stateIds[0];
      const titleStates = queryStates(doc.title);
      if (docMain === subject) score += 14;
      if (titleStates[0] === subject) score += 10;
      states.slice(1).forEach((id) => {
        if (doc.stateIds.indexOf(id) !== -1) score += 3;
      });
      // An entry about some other state (by its title, or its only state tag)
      // is off-topic, even if it mentions the named states in passing.
      const focus = titleStates[0] || (doc.stateIds.length === 1 ? docMain : null);
      const offTopic =
        (focus && states.indexOf(focus) === -1) ||
        !states.some((id) => doc.stateIds.indexOf(id) !== -1);
      if (offTopic) score *= 0.5;
      // About another state the user named, but not the one they asked about.
      else if (focus && focus !== subject) score *= 0.75;
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
      legislation: "Legislation",
      matrix: "Reciprocity matrix",
      "case": "Court case",
      county: "County note",
    };
    return map[kind] || kind;
  }

  function runSearch(query) {
    const q = String(query || "").trim();
    lastQuery = q;
    const words = unique(tokenize(q)).filter((t) => !STOPWORDS.has(t));
    const tokens = unique(
      words.concat(...words.map((t) => SYNONYMS[t] || []))
    );
    const qLower = q.toLowerCase();
    const states = queryStates(q);
    if (!tokens.length) return [];

    return searchIndex
      .map((doc) => ({
        doc: doc,
        score: scoreDoc(doc, tokens, qLower, states),
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
            placeholder="e.g. Does Arizona honor Washington permits?"
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
    // CSS accents are keyed by state id (.card.ca-accent, .card.wa-accent, …)
    const accent = escapeHtml(state.id);
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
          <p>${escapeHtml(state.recognizedStatesSource || "Official recognition list")} — verify the current official list before travel.</p>
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

    const infoCards = [
      ["Eligibility", state.eligibility],
      ["Fees", state.fees],
      ["Training", state.training],
      ["Processing time", state.processingTime],
    ]
      .filter(([, v]) => v)
      .map(
        ([h, v]) => `
        <div class="card ${accent}-accent">
          <h3>${escapeHtml(h)}</h3>
          <p>${escapeHtml(v)}</p>
        </div>`
      )
      .join("");

    const lawCards = [
      ["Magazines & assault weapons", state.magazineAwRules],
      ["Buying a gun: permit to purchase / waiting period", state.purchaseRules],
    ]
      .filter(([, v]) => v)
      .map(
        ([h, v]) => `
        <div class="card ${accent}-accent full">
          <h3>${escapeHtml(h)}</h3>
          <p>${escapeHtml(v)}</p>
        </div>`
      )
      .join("");

    const bills = state.recentLegislation || [];
    const legCard =
      bills.length || state.recentLegislationNote
        ? `<div class="card ${accent}-accent full">
          <h3>Recent / pending legislation</h3>
          ${
            bills.length
              ? `<ul class="leg-list">${bills
                  .map(
                    (b) => `<li>
                <span class="leg-date">${escapeHtml(formatDate(b.date))}</span>
                <strong>${b.url ? `<a href="${escapeHtml(b.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.title)}</a>` : escapeHtml(b.title)}</strong>
                ${b.status ? `<span class="badge leg-status">${escapeHtml(b.status)}</span>` : ""}
                ${b.uncertain ? '<span class="badge uncertain">Unverified detail</span>' : ""}
                <p>${escapeHtml(b.summary || "")}</p>
              </li>`
                  )
                  .join("")}</ul>`
              : ""
          }
          ${state.recentLegislationNote ? `<p class="callout">${escapeHtml(state.recentLegislationNote)}</p>` : ""}
        </div>`
        : "";

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
          State last checked<br />
          <strong>${escapeHtml(formatDate(state.lastChecked || state.lastReviewed))}</strong>
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

        ${infoCards}

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

        ${lawCards}

        ${extraBlocks}

        ${legCard}

        ${renderCountyCard(state, accent)}

        <div class="card ${accent}-accent full">
          <h3>Sources</h3>
          ${renderSources(state.sources)}
        </div>
      </div>
    `;
  }

  function renderCountyCard(state, accent) {
    const cs = countyStates().find((c) => c.stateId === state.id);
    if (!cs) return "";
    const rows = (cs.counties || [])
      .map(
        (c) => `
        <details class="county-item">
          <summary><strong>${escapeHtml(c.name)}</strong> <span class="county-agency">${escapeHtml(c.agency || "")}</span>${
            c.verified === false ? ' <span class="badge uncertain">Not re-checked</span>' : ""
          }</summary>
          ${c.fees ? `<p><strong>Fees:</strong> ${escapeHtml(c.fees)}</p>` : ""}
          ${c.processing ? `<p><strong>Processing:</strong> ${escapeHtml(c.processing)}</p>` : ""}
          ${c.policies ? `<p><strong>Notable policies:</strong> ${escapeHtml(c.policies)}</p>` : ""}
          ${c.uncertainNote ? `<p class="callout caution">${escapeHtml(c.uncertainNote)}</p>` : ""}
          ${
            c.sourceUrl
              ? `<p class="county-src"><a href="${escapeHtml(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">Official source</a>${(c.extraUrls || [])
                  .map((u, i) => ` · <a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">More ${i + 1}</a>`)
                  .join("")}</p>`
              : ""
          }
        </details>`
      )
      .join("");
    return `
      <div class="card ${accent}-accent full" id="county-notes">
        <h3>County / local notes <span class="section-checked">checked ${escapeHtml(formatDate(cs.lastChecked))}</span></h3>
        <p>${escapeHtml(cs.summary)}</p>
        ${rows ? `<div class="county-list">${rows}</div>` : ""}
      </div>`;
  }

  function renderMatrix() {
    const m = data.reciprocityMatrix;
    if (!m || !m.honors) return "";
    const ids = m.states || stateIds();
    const head = ids
      .map((id) => `<th scope="col" class="${escapeHtml(id)}-col">${escapeHtml(stateName(id))} permit</th>`)
      .join("");
    const body = ids
      .map((row) => {
        const cells = ids
          .map((col) => {
            if (row === col) return `<td class="mx-self" aria-label="Same state">—</td>`;
            const v = (m.honors[row] && m.honors[row][col]) || "unknown";
            const note = (m.cellNotes || {})[row + ":" + col] || "";
            const label = v === "yes" ? "Yes" : v === "no" ? "No" : "?";
            return `<td class="mx-${escapeHtml(v)}"${note ? ` title="${escapeHtml(note)}"` : ""}><span class="mx-pill">${label}</span></td>`;
          })
          .join("");
        return `<tr><th scope="row" class="${escapeHtml(row)}-col">In ${escapeHtml(stateName(row))}</th>${cells}</tr>`;
      })
      .join("");
    const notes = Object.keys(m.cellNotes || {})
      .map((k) => {
        const [r, c] = k.split(":");
        return `<li><strong>In ${escapeHtml(stateName(r))}, ${escapeHtml(stateName(c))} permit:</strong> ${escapeHtml(m.cellNotes[k])}</li>`;
      })
      .join("");
    const asOf = ids
      .filter((id) => m.asOf && m.asOf[id])
      .map((id) => `<li><strong>${escapeHtml(stateName(id))}:</strong> ${escapeHtml(m.asOf[id])}</li>`)
      .join("");
    return `
      <section class="matrix-section" aria-labelledby="matrix-heading">
        <h2 id="matrix-heading" class="section-heading">Reciprocity matrix <span class="section-checked">checked ${escapeHtml(formatDate(m.lastChecked))}</span></h2>
        <p class="compare-intro">${escapeHtml(m.description || "")}</p>
        <div class="compare-wrap">
          <table class="compare-table matrix-table">
            <thead><tr><th scope="col">Carrying in ↓ / Permit from →</th>${head}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <details class="matrix-notes">
          <summary>Notes &amp; list dates</summary>
          <ul>${notes}${asOf}</ul>
          ${renderSources(m.sources)}
        </details>
      </section>`;
  }

  function renderCompare() {
    const ids = stateIds();
    const rows = (data.compare || [])
      .map(
        (row) => `
      <tr>
        <th scope="row">${escapeHtml(row.topic)}</th>
        ${ids.map((id) => `<td>${escapeHtml(row[id] != null ? row[id] : "—")}</td>`).join("")}
      </tr>`
      )
      .join("");

    els.viewCompare.innerHTML = `
      ${renderMatrix()}
      <h2 class="section-heading">Side-by-side</h2>
      <p class="compare-intro">High-level comparison of ${escapeHtml(ids.map((id) => id.toUpperCase()).join(", "))}. Not a substitute for statutes or counsel.</p>
      <div class="compare-wrap">
        <table class="compare-table compare-5">
          <thead>
            <tr>
              <th scope="col">Topic</th>
              ${ids.map((id) => `<th scope="col" class="${escapeHtml(id)}-col">${escapeHtml(stateName(id))}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  function outcomeLabel(o) {
    const map = { pending: "Pending", granted: "Cert granted", decided: "Decided", stayed: "Stayed" };
    return map[o] || o || "Status";
  }

  function renderLitigation() {
    const lit = data.litigation || {};
    const cases = lit.cases || [];
    const cards = cases
      .map(
        (c) => `
      <article class="case-card outcome-${escapeHtml(c.outcome || "unknown")}" id="case-${escapeHtml(c.id)}">
        <div class="result-meta">
          <span class="badge outcome-badge outcome-${escapeHtml(c.outcome || "unknown")}">${escapeHtml(outcomeLabel(c.outcome))}</span>
          ${c.uncertain ? '<span class="badge uncertain">Partly uncertain</span>' : ""}
          ${stateBadges(c.stateIds)}
        </div>
        <h3 class="case-name">${escapeHtml(c.name)}</h3>
        <p class="case-court">${escapeHtml(c.court)}${c.docket ? " · " + escapeHtml(c.docket) : ""}</p>
        <dl class="case-facts">
          <dt>Challenges</dt><dd>${escapeHtml(c.challenges)}</dd>
          <dt>Status <span class="case-date">(latest court event: ${escapeHtml(formatDate(c.statusDate))})</span></dt><dd>${escapeHtml(c.status)}</dd>
          <dt>What a ruling would change</dt><dd>${escapeHtml(c.impact)}</dd>
        </dl>
        ${c.uncertainNote ? `<p class="callout caution"><strong>Uncertain:</strong> ${escapeHtml(c.uncertainNote)}</p>` : ""}
        <p class="case-src"><a href="${escapeHtml(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">Primary source</a>${(c.extraUrls || [])
          .map((u, i) => ` · <a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">Related ${i + 1}</a>`)
          .join("")}
          <span class="section-checked">checked ${escapeHtml(formatDate(c.lastChecked))}</span></p>
      </article>`
      )
      .join("");

    els.viewLitigation.innerHTML = `
      <h2 class="updates-heading">Litigation</h2>
      <p class="data-note">
        ${escapeHtml(lit.note || "")} Last checked ${escapeHtml(formatDate(lit.lastChecked))}.
      </p>
      <p class="callout caution"><strong>NOT LEGAL ADVICE.</strong> Court status summaries only. A pending case does not change the law until a court rules, and rulings can be stayed or appealed.</p>
      <div class="case-list">${cards || "<p>No cases listed.</p>"}</div>
      ${lit.noCasesNote ? `<p class="callout">${escapeHtml(lit.noCasesNote)}</p>` : ""}
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
      "Curated data is updated by hand when changes are verified against official sources. Updates are not automatic or daily. This is not live web search.";

    els.viewUpdates.innerHTML = `
      <h2 class="updates-heading">Updates</h2>
      <p class="data-note">
        ${escapeHtml(watch)}
      </p>
      <ul class="changelog-list">${items || "<li>No entries.</li>"}</ul>
    `;
  }

  // opts.fromUser: tab click, arrow key or in-page hash change (not the initial load).
  function showView(view, opts) {
    const fromUser = !!(opts && opts.fromUser);
    // Alias old changelog hash → updates
    if (view === "changelog") view = "updates";
    currentView = view;
    const isState = stateIds().indexOf(view) !== -1;

    els.viewAsk.hidden = view !== "ask";
    els.viewState.hidden = !isState;
    els.viewCompare.hidden = view !== "compare";
    els.viewUpdates.hidden = view !== "updates";
    els.viewLitigation.hidden = view !== "litigation";

    let activeTab = null;
    els.tabs.forEach((tab) => {
      const active = tab.dataset.view === view;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      if (active) activeTab = tab;
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
    } else if (view === "litigation") {
      renderLitigation();
    }

    // After rendering (a layout while the new view is still empty would clamp the
    // page scroll): if the tab bar is pinned, bring the new view's heading up under
    // it; then keep the active tab visible in the phone strip.
    if (fromUser) jumpToViewTop();
    revealTab(activeTab);

    if (history.replaceState) {
      history.replaceState(null, "", "#" + view);
    } else {
      location.hash = view;
    }
  }

  // When the page is scrolled past the tab bar's natural position (bar pinned),
  // jump instantly so the new view starts just under the bar. The target is the
  // bar's natural top, measured live (bar height varies: 52 / 60 / ~115px when the
  // tabs wrap), so the bar stays pinned and the header/disclaimer are not
  // re-shown. If the bar is not pinned yet, the page does not move.
  function jumpToViewTop() {
    if (!els.main || !els.tabBar) return;
    const barHeight = els.tabBar.getBoundingClientRect().height;
    const barNaturalTop = els.main.getBoundingClientRect().top + window.scrollY - barHeight;
    if (window.scrollY <= barNaturalTop + 0.5) return;
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto"; // instant, even where smooth scrolling is on
    window.scrollTo(0, Math.max(0, Math.round(barNaturalTop)));
    root.style.scrollBehavior = previous;
  }

  // Keep the active tab on-screen in the horizontally scrolling phone strip.
  // block/inline "nearest" only nudges the strip sideways; the tab bar is sticky
  // (always in the viewport), so the page itself does not move vertically.
  function revealTab(tab) {
    if (!tab || typeof tab.scrollIntoView !== "function") return;
    const smooth =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    tab.scrollIntoView({ block: "nearest", inline: "nearest", behavior: smooth ? "smooth" : "auto" });
  }

  function bindTabs() {
    els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => showView(tab.dataset.view, { fromUser: true }));
    });

    document.querySelector(".tabs").addEventListener("keydown", (e) => {
      const order = els.tabs;
      const idx = order.findIndex((t) => t.dataset.view === currentView);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = order[(idx + 1) % order.length];
        next.focus();
        showView(next.dataset.view, { fromUser: true });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = order[(idx - 1 + order.length) % order.length];
        prev.focus();
        showView(prev.dataset.view, { fromUser: true });
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
      // Error-path banner text (wording approved by Micah, Sep 25, 2026).
      // The bold "NOT LEGAL ADVICE." label is already in index.html, so the whole banner reads:
      // "NOT LEGAL ADVICE. The tracker data didn't load, so no legal information is shown here. Verify rules with official statutes, agency guidance, and a licensed attorney before carrying or traveling."
      // The success path below still takes its banner text from data.disclaimer.
      els.disclaimer.textContent =
        "The tracker data didn't load, so no legal information is shown here. Verify rules with official statutes, agency guidance, and a licensed attorney before carrying or traveling.";
      els.loadError.hidden = false;
      els.loadError.textContent =
        "Couldn't load the tracker data (" +
        (err && err.message ? err.message : "error") +
        "). Check your connection and reload. If you opened this file directly, serve it over HTTP.";
      return;
    }

    // The banner already shows a bold "NOT LEGAL ADVICE." label; avoid repeating it.
    els.disclaimer.textContent = String(data.disclaimer || "").replace(/^\s*NOT LEGAL ADVICE\.\s*/i, "");
    els.reviewed.textContent = formatDate(data.lastReviewed);
    renderReviewAge(data.lastReviewed);
    buildSearchIndex();

    const hash = (location.hash || "").replace(/^#/, "");
    const valid = NON_STATE_VIEWS.concat(stateIds());
    const normalized = hash === "changelog" ? "updates" : hash;
    const initial = valid.indexOf(normalized) !== -1 ? normalized : "ca";

    showView(initial);

    // Support in-app deep links / manual hash edits (e.g. #wa, #litigation)
    window.addEventListener("hashchange", () => {
      const h = (location.hash || "").replace(/^#/, "");
      const v = h === "changelog" ? "updates" : h;
      if (valid.indexOf(v) !== -1 && v !== currentView) showView(v, { fromUser: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
