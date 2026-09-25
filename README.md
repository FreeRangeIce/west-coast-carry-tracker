# West Coast Carry Tracker (CA · OR · NV · WA · AZ)

Self-contained static reference for **high-level** firearm and concealed-carry frameworks in California, Oregon, Nevada, Washington, and Arizona, plus a five-state reciprocity matrix, a tracked-litigation section, and county-level CCW notes.

**NOT LEGAL ADVICE.** Laws, court injunctions, and agency lists change. Verify official sources before carrying or traveling.

## Files

| Path | Role |
|------|------|
| `index.html` | App shell (+ iOS / PWA meta) |
| `styles.css` | Dark, mobile-friendly UI |
| `app.js` | Tabbed views (state tabs derived from `data.states`), Ask search, compare + reciprocity matrix, Litigation, Updates, SW register |
| `data/laws.json` | All content (see **Data structure** below) — the file the daily check updates |
| `manifest.webmanifest` | Web app manifest (Add to Home Screen) |
| `sw.js` | Tiny service worker (shell cache; bump `CACHE` version on each release — currently `carry-tracker-v7`) |
| `icons/` | 192 / 512 / apple-touch icons |
| `README.md` | This file + refresh checklist |

## How to open / serve

Browsers block `fetch()` of `data/laws.json` from `file://`. Prefer a static server:

```bash
cd west-coast-carry-tracker
python3 -m http.server 8765
```

Then open: [http://127.0.0.1:8765/](http://127.0.0.1:8765/)

**GitHub Pages:** https://freerangeice.github.io/west-coast-carry-tracker/

## Install on iPhone

1. Open the site URL in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. Confirm the name (**Carry Tracker**) and tap **Add**.

The service worker caches the shell; bumping `CACHE` in `sw.js` makes installed copies pick up a new release.

## Features

- **NOT LEGAL ADVICE** banner at the top of every view, repeated in the footer (plus notes on Ask and Litigation)
- Tabs: **Ask** / California / Oregon / Nevada / Washington / Arizona / Compare / **Litigation** / **Updates** (deep links: `#wa`, `#az`, `#litigation`, …)
- **Ask / Search**: keyword ranking over curated Q&A, state fields, restrictions, recognition lists, legislation, the reciprocity matrix, court cases, county notes, compare rows, topics, sources and updates. Works offline after the first load. This is not live web search or an LLM.
- Per state: permit framework, issuer, eligibility, fees, training, processing time, validity, open carry, reciprocity (in/out), non-resident notes, prohibited places, magazine/assault-weapon rules, purchase rules (permit to purchase / waiting period), recent legislation, county/local notes, sources, and a `lastChecked` stamp
- Recognition lists: Nevada (DPS, July 1, 2026) and Washington (AG, July 10, 2026)
- **Compare**: five-state reciprocity matrix (cell notes: hover on desktop, or open 'Notes & list dates' below the matrix) plus side-by-side rows
- **Litigation**: tracked court cases with court, docket, what's challenged, status and date, impact, uncertainty flags and source links

## Data structure (`data/laws.json`, schemaVersion 2)

The daily check re-verifies each section against its sources, bumps that section's `lastChecked` (YYYY-MM-DD) even when nothing changed, and adds an `updates[]` entry only for material changes. The same summary is embedded in the JSON as `dailyCheck`.

| Key | Contents |
|-----|----------|
| `lastReviewed`, `lastCheckedBySection` | Global stamp + per-section check dates |
| `states[]` | One object per state id (`ca`, `or`, `nv`, `wa`, `az`): `permitFramework`, `issuer`, `minAge`, `eligibility`, `fees`, `training`, `processingTime`, `validity`, `openCarryNote`, `reciprocityIn`, `reciprocityOutNote`, `recognizedStates[]` + `recognizedStatesAsOf` + `recognizedStatesSource` (NV, WA), `keyRestrictions[]`, `magazineAwRules`, `purchaseRules`, `recentLegislation[]` (`date,title,status,summary,url,uncertain?`), `sources[]`, `lastChecked` |
| `reciprocityMatrix` | `states[]`, `honors[row][col]` = `"yes"`/`"no"` (row = where you carry, col = permit issuer), `cellNotes["row:col"]`, `asOf{}`, `sources[]`, `lastChecked` |
| `litigation` | `lastChecked`, `note`, `noCasesNote`, `cases[]` (`id,name,court,docket,challenges,status,statusDate,outcome(pending/granted/decided/stayed),impact,stateIds,sourceUrl,extraUrls?,uncertain,uncertainNote?,lastChecked`) |
| `countyNotes` | `lastChecked`, `states[]` (`stateId,summary,lastChecked,counties[]` with `name,agency,fees,processing,policies,sourceUrl,verified,uncertainNote?`) |
| `compare[]` | `{topic, ca, or, nv, wa, az}` |
| `topics[]`, `qa[]` | Search helpers + curated Q&A (`id,question,answer,stateIds,tags,sourceUrls`) |
| `updates[]` / `changelog[]` | Dated feed (`changelog` mirrors `updates` for older clients) |

Adding a state = add a `states[]` object, a tab button in `index.html`, and `--xx` color rules in `styles.css`. Routing, compare columns and search pick it up automatically.

## Refresh checklist (re-verify these official URLs)

### California
- [ ] [CCW License FAQs](https://oag.ca.gov/firearms/ccwlicfaqs) · [Public Firearms FAQs (reciprocity)](https://oag.ca.gov/firearms/pubfaqs) · [CCW regs](https://oag.ca.gov/firearms/regs/ccwl)
- [ ] [OAG 2026-DLE-13](https://www.oag.ca.gov/system/files/media/2026-dle-13.pdf) · [OAG 2026-DLE-14](https://www.oag.ca.gov/system/files/media/2026-dle-14.pdf)
- [ ] [PC 26230 (sensitive places)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=26230) + May/Carralero district-court status
- [ ] [AB 1948](https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260AB1948) (3-year term from Jan 1, 2027)
- [ ] County pages: [LASD](https://lasd.org/ccw/), [San Diego](https://www.sdsheriff.gov/i-want-to/get-a-permit-or-license/regulatory-licenses-and-fees/concealed-weapons-license), [Orange](https://www.ocsheriff.gov/commands-divisions/professional-services-command/professional-standards/ccw-licensing/fee-schedule), [Sacramento](https://www.sacsheriff.com/pages/ccw_gun_permit.php), [Riverside](https://riversideca.permitium.com/ccw/start), [San Bernardino](https://sbcsd.permitium.com/ccw/start), [Santa Clara](https://scso.permitium.com/ccw/start), [Alameda](https://alamedaca.permitium.com/ccw/start)

### Oregon
- [ ] [ORS Chapter 166 (official)](https://www.oregonlegislature.gov/bills_laws/ors/ors166.html) — 166.291 (fees, eligibility), 166.292 (45 days, 4-year term), 166.370/166.377
- [ ] Measure 114: [Oregon Supreme Court opinions](https://www.courts.oregon.gov/publications/sc/Pages/default.aspx) (Arnold v. Kotek, S071885); HB 4145 operative date Jan 1, 2028

### Nevada
- [ ] [DPS RCCD CCW Recognition List PDF](https://www.rccd.nv.gov/siteassets/content/resources/2026-ccw-recognition-list.pdf) (usually updated ~July 1)
- [ ] [NRS Chapter 202](https://www.leg.state.nv.us/NRS/NRS-202.html) — 202.3657, 202.366, 202.3673, 202.3677, 202.3688

### Washington
- [ ] [RCW 9.41.070](https://app.leg.wa.gov/RCW/default.aspx?cite=9.41.070) (CPL; HB 1163 changes May 1, 2027), [9.41.073](https://app.leg.wa.gov/RCW/default.aspx?cite=9.41.073), [9.41.300](https://app.leg.wa.gov/RCW/default.aspx?cite=9.41.300), [9.41.121](https://app.leg.wa.gov/RCW/default.aspx?cite=9.41.121), [9.41.370](https://app.leg.wa.gov/RCW/default.aspx?cite=9.41.370), [9.41.390](https://app.leg.wa.gov/RCW/default.aspx?cite=9.41.390), [9.41.092](https://app.leg.wa.gov/RCW/default.aspx?cite=9.41.092)
- [ ] [WA AG reciprocity list](https://www.atg.wa.gov/concealed-pistol-license-reciprocity) · [DOL firearms](https://dol.wa.gov/professional-licenses/firearms) · [WSP firearms background division](https://www.wsp.wa.gov/firearms-background-division/) (permit-to-purchase rollout and fee)

### Arizona
- [ ] [ARS 13-3112](https://www.azleg.gov/ars/13/03112.htm) · [ARS 13-3102](https://www.azleg.gov/ars/13/03102.htm) · [ARS 4-229](https://www.azleg.gov/ars/4/00229.htm) / [4-244](https://www.azleg.gov/ars/4/00244.htm)
- [ ] [AZ DPS CCW page](https://www.azdps.gov/services/public-services-center/concealed-weapons-and-permits) (fees, reciprocity table)

### Litigation
- [ ] SCOTUS dockets: [Duncan 25-198](https://www.supremecourt.gov/docket/docketfiles/html/public/25-198.html), [Viramontes 25-238](https://www.supremecourt.gov/docket/docketfiles/html/public/25-238.html) / [Grant 25-566](https://www.supremecourt.gov/docket/docketfiles/html/public/25-566.html), [Gator's 25-153](https://www.supremecourt.gov/docket/docketfiles/html/public/25-153.html)
- [ ] [9th Cir. en banc page](https://www.ca9.uscourts.gov/cases/en-banc/) (Rhode 24-542, Baird 24-565)
- [ ] CourtListener: [Baird](https://www.courtlistener.com/docket/68961920/baird-v-bonta/), [Hartford v. Brown](https://www.courtlistener.com/docket/67264060/hartford-v-brown/); May/Carralero (C.D. Cal. 8:23-cv-01696)

### Cross-cutting
- [ ] Reciprocity matrix still matches the NV list, WA AG list, ARS 13-3112 and CA/OR law
- [ ] Curated `qa` answers still match the state cards, the matrix and the litigation statuses (no invented claims)

## Caveats

- **CA sensitive places (PC 26230 / SB 2):** high-level categories per the 9th Circuit's Sept 2024 ruling and Wolford v. Lopez (2026). This is not a perfect live list.
- **Measure 114 (OR)** is separate from the CHL and not in effect.
- Magazine, assault-weapon and purchase rules are summarized at a high level only. Rosters, ammunition rules and transport rules are simplified.
- County notes cover only what official county pages and portals state. Fees change often.
- **Ask** only searches this repo's curated JSON, not the live web.

## License / use

Personal reference tool. No warranty. Do not rely on this instead of primary law or counsel.
