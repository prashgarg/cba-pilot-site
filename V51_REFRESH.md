# v5.1 Site Refresh — Notes

Date: 2026-05-18.

The site now serves the v5.1 wave-1 measurement results as the default view.
The previous v3 document/domain/relative/parallel/diagnostics views are
retained as legacy tabs so existing deep links still work.

## New data layer

`public/data/v5_1/` contains JSON files exported from
`codex_PG/scalable_v4/runs/2026-05-17_v4_native_wave1` and the 20-doc
validation run:

- `manifest.json` — corpus stats, validation summary, calibration metadata.
- `cell_scores.json` — 857 (contract, provision-area) cells with calibrated 0–1 scores, source flag, rubric and absolute components.
- `sector_category.json` — pre-aggregated sector × area means with n.
- `per_category_distribution.json` — per-area marginal stats (mean, SD, quartiles).
- `documents.json` — per-contract metadata (employer, union, sector, state, year, page count).
- `composite.json` — per-contract mean score across the eight substantive areas, sorted descending.
- `ontology.json` — four-level provision hierarchy (9 areas → 26 sub-areas → 50 types → 62 sub-types) with example provisions at each leaf.
- `validation.json` — per-area Spearman ρ against three independent references plus headline summary.

Regenerate via:

```bash
cd cba-pilot-site
python3.13 scripts/export_v5_1_data.py
```

## New pages

Five new top-level views in the navigation:

- **Overview (v5.1)** — landing page with corpus stats, validation summary, per-area distribution, sector × area heatmap, and top/bottom contracts. Default view.
- **Validation** — full per-area table of Spearman ρ against Davidson pairwise, Bone external, and hand re-read references, with a headline-summary panel.
- **Sector × area** — interactive heatmap with hover-for-n, plus a short interpretation panel naming the three stylized patterns the table reproduces.
- **Composite ranking** — sortable per-contract ranking with sector filter.
- **Ontology** — collapsible four-level tree of the provision taxonomy with example extracted provisions (and their fields) at each leaf.

## Files touched

- `src/main.jsx` — new imports + `V51Router` component + new tabs + updated header.
- `src/v5_1.jsx` — new file: all v5.1 page components and the `useV51Data` hook.
- `src/styles.css` — new `v51*` class block appended (~280 lines).
- `scripts/export_v5_1_data.py` — new data export.
- `public/data/v5_1/*.json` — generated data files.

## Smoke test

```bash
npm run build        # 32 s; 250 KB JS / 28 KB CSS
npm run preview      # serves on 127.0.0.1:4173
```

Build clean; preview serves; the default `?view=overview_v51` page loads all
v5.1 JSON files.

## What still uses v3 data

The legacy tabs (Documents (v3 explorer), Domains, Relative metrics,
Parallel comparison, Diagnostics) still point at the v3 export at
`public/data/*.json`. Anyone needing to walk a single contract's records
and rejected values still gets the v3 explorer. We deliberately did not
rewrite those tabs to use v5.1 cell scores because their value is the
record-level browsing UX, which is orthogonal to the cell-level scoring
we report in v5.1.

If the v3 explorer should also be retired or re-pointed at the v5.1
worker outputs (which use the same per-document JSON shape under
`scalable_v4/runs/2026-05-17_v4_native_wave1/per_document/`), that is a
separate refactor.
