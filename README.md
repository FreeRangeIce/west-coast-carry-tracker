# West Coast Carry Tracker (CA · OR · NV)

Self-contained static reference for **high-level** firearm and conceal-carry frameworks in California, Oregon, and Nevada.

**NOT LEGAL ADVICE.** Laws, court injunctions, and agency lists change. Verify official sources before carrying or traveling.

## Files

| Path | Role |
|------|------|
| `index.html` | App shell (+ iOS / PWA meta) |
| `styles.css` | Dark, mobile-friendly UI |
| `app.js` | Tabbed views, compare matrix, changelog, SW register |
| `data/laws.json` | All encoded claims, sources, changelog |
| `manifest.webmanifest` | Web app manifest (Add to Home Screen) |
| `sw.js` | Tiny service worker (shell cache) |
| `icons/` | 192 / 512 / apple-touch icons |
| `README.md` | This file + refresh checklist |

## How to open / serve

Browsers block `fetch()` of `data/laws.json` from `file://`. Prefer a static server:

```bash
cd /workspace/gun-law-tracker
python3 -m http.server 8765
```

Then open: [http://127.0.0.1:8765/](http://127.0.0.1:8765/)

Any other static server (`npx serve`, nginx, etc.) works the same.


## Install on iPhone

Once hosted on GitHub Pages:

1. Open the site URL in **Safari** (not Chrome / in-app browsers).
2. Tap **Share** → **Add to Home Screen**.
3. Confirm the name (defaults to **Carry Tracker**) and tap **Add**.

The app opens fullscreen (standalone). After the first visit, a small service worker caches the shell so it can reopen offline-ish.

## Features

- Persistent **NOT LEGAL ADVICE** banner
- Tabs: California / Oregon / Nevada / Compare / Changelog
- Per state: permit framework, reciprocity, non-resident notes, traveler tips, sensitive-place summaries, sources
- Nevada recognized-states list (as of DPS July 1, 2026 list)
- Compare matrix (permit, constitutional carry, reciprocity among CA/OR/NV, issuer, min age)
- Changelog seeded from `data/laws.json`
- Global + per-state `lastReviewed` stamps (global: **2026-09-09**)

## Refresh checklist (re-verify these official URLs)

Update `data/laws.json` and bump `lastReviewed` / changelog when anything material changes.

### California
- [ ] [CCW License FAQs](https://oag.ca.gov/firearms/ccwlicfaqs)
- [ ] [Public Firearms FAQs (reciprocity)](https://oag.ca.gov/firearms/pubfaqs)
- [ ] [CCW regs / Bruen–SB 2 overview](https://oag.ca.gov/firearms/regs/ccwl)
- [ ] [OAG Bulletin 2026-DLE-03 (AB 1078 non-resident path)](https://www.oag.ca.gov/system/files/media/2026-DLE-03.pdf)
- [ ] [PC 26230 (sensitive places)](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=26230) — also check current injunction / Wolford-related Ninth Circuit status; do **not** treat any category list as permanently authoritative

### Oregon
- [ ] [ORS 166.291](https://oregon.public.law/statutes/ors_166.291)
- [ ] [Oregon CHL training (OSSA)](https://oregonchl.org/)
- [ ] Example sheriff page: [Yamhill County CHL](https://www.yamhillcounty.gov/706/Concealed-Handgun-Licenses)
- [ ] Measure 114 litigation / effective-date status (track separately from CHL; reports have cited a Jan 1, 2028 push)

### Nevada
- [ ] [DPS RCCD 2026 CCW Recognition List PDF](https://www.rccd.nv.gov/siteassets/content/resources/2026-ccw-recognition-list.pdf) (often updated ~July 1)
- [ ] [NV DPS RCCD home](https://www.rccd.nv.gov/)
- [ ] [NRS Chapter 202](https://www.leg.state.nv.us/NRS/NRS-202.html) (esp. concealed carry / recognition / new-resident 60-day rule)

### Cross-cutting
- [ ] Confirm CA and OR still do **not** honor each other’s (or NV’s) permits for concealed carry
- [ ] Confirm NV still does **not** list CA or OR on the recognition PDF
- [ ] Local city/county carry restrictions (esp. OR loaded open carry)

## Caveats

- **CA sensitive places (PC 26230 / SB 2):** Encoded as high-level categories plus an explicit “verify statute + court status” note. Some categories have been enjoined historically; the private-commercial “vampire rule” default was struck/enjoined (Wolford-related / Ninth Circuit). This app does **not** claim a perfect live list.
- **Measure 114 (OR):** Separate from CHL; litigation has delayed effectiveness.
- Content is intentionally high-level; magazine, roster, and assault-weapon possession regimes are out of scope.

## License / use

Personal reference tool. No warranty. Do not rely on this instead of primary law or counsel.
