import React, { useEffect, useMemo, useState } from "react";

const V51_DATASETS = {
  manifest: "data/v5_1/manifest.json",
  cellScores: "data/v5_1/cell_scores.json",
  sectorCategory: "data/v5_1/sector_category.json",
  perCategory: "data/v5_1/per_category_distribution.json",
  documents: "data/v5_1/documents.json",
  composite: "data/v5_1/composite.json",
  ontology: "data/v5_1/ontology.json",
  validation: "data/v5_1/validation.json",
};

export function useV51Data() {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const entries = await Promise.all(
          Object.entries(V51_DATASETS).map(async ([key, path]) => {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`${path}: ${res.status}`);
            return [key, await res.json()];
          })
        );
        if (mounted) setState({ loading: false, error: null, data: Object.fromEntries(entries) });
      } catch (err) {
        if (mounted) setState({ loading: false, error: err.message, data: null });
      }
    })();
    return () => { mounted = false; };
  }, []);
  return state;
}

const fmt2 = (n) => (n === null || n === undefined ? "—" : Number(n).toFixed(2));
const fmt3 = (n) => (n === null || n === undefined ? "—" : Number(n).toFixed(3));

// ----------------- Overview (landing-style summary) -----------------

export function OverviewV51({ data }) {
  const { manifest, perCategory, sectorCategory, validation, composite } = data;
  const topDocs = composite.slice(0, 5);
  const bottomDocs = composite.slice(-5).reverse();
  return (
    <section className="v51Page">
      <div className="v51Hero">
        <h2>v5.1 measurement pipeline — wave-1 results</h2>
        <p className="v51HeroSub">
          A language-model-based pipeline that scores collective bargaining
          agreements on nine substantive provision areas, validated three
          ways against independent references.
        </p>
        <div className="v51StatsRow">
          <V51Stat big={manifest.n_contracts_scored} label="U.S. CBAs scored" />
          <V51Stat big={manifest.n_cells.toLocaleString()}
                   label="(contract × provision-area) cells" />
          <V51Stat big={manifest.n_provision_areas}
                   label="substantive provision areas" />
          <V51Stat big={`$${manifest.marginal_cost_usd_per_contract_estimate.toFixed(2)}`}
                   label="marginal compute cost per contract" />
        </div>
      </div>

      <div className="v51TwoCol">
        <div className="v51Card">
          <h3>Validation, mean ρ across nine provision areas</h3>
          <table className="v51ValTable">
            <tbody>
              <tr><td>Davidson pairwise (20-doc validation set)</td><td className="num">{fmt2(manifest.validation.davidson_pairwise_mean_rho)}</td></tr>
              <tr><td>Bone external reference (20-doc overlap)</td><td className="num">{fmt2(manifest.validation.bone_external_mean_rho)}</td></tr>
              <tr><td>Hand re-read (40 cells)</td><td className="num">{fmt2(manifest.validation.hand_reread_pooled_rho)}</td></tr>
              <tr><td>Within-method test–retest (20 cells)</td><td className="num">{fmt2(manifest.validation.test_retest_rho)}</td></tr>
            </tbody>
          </table>
          <p className="v51Note">
            All four references are LLM-based, so ρ values are bounded above
            by shared-model-prior variance. The within-method test–retest
            ρ ≈ 0.85 is the noise ceiling for any of these comparisons.
            Per-cell standard deviation is approximately ±{manifest.uncertainty_per_cell_sd}.
          </p>
        </div>

        <div className="v51Card">
          <h3>Per-area cell distribution</h3>
          <table className="v51DistTable">
            <thead><tr><th>Provision area</th><th>n</th><th>Mean</th><th>SD</th></tr></thead>
            <tbody>
              {perCategory.map(c => (
                <tr key={c.category}>
                  <td>{c.category_label}</td>
                  <td className="num">{c.n}</td>
                  <td className="num">{fmt2(c.mean)}</td>
                  <td className="num">{fmt2(c.std)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="v51Card">
        <h3>Sector × provision-area mean scores</h3>
        <SectorCategoryHeatmap data={sectorCategory} />
      </div>

      <div className="v51TwoCol">
        <div className="v51Card">
          <h3>Top 5 contracts by composite generosity</h3>
          <table className="v51DocTable">
            <thead><tr><th>Composite</th><th>Employer / union</th><th>Sector</th></tr></thead>
            <tbody>
              {topDocs.map(d => (
                <tr key={d.document_id}>
                  <td className="num">{fmt2(d.composite)}</td>
                  <td><strong>{d.employer || d.document_id}</strong> {d.union ? `/ ${d.union}` : ""}</td>
                  <td>{d.sector_label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="v51Card">
          <h3>Bottom 5 contracts by composite generosity</h3>
          <table className="v51DocTable">
            <thead><tr><th>Composite</th><th>Employer / union</th><th>Sector</th></tr></thead>
            <tbody>
              {bottomDocs.map(d => (
                <tr key={d.document_id}>
                  <td className="num">{fmt2(d.composite)}</td>
                  <td><strong>{d.employer || d.document_id}</strong> {d.union ? `/ ${d.union}` : ""}</td>
                  <td>{d.sector_label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function V51Stat({ big, label }) {
  return (
    <div className="v51Stat">
      <div className="v51StatBig">{big}</div>
      <div className="v51StatLabel">{label}</div>
    </div>
  );
}

// ----------------- Sector × Category Heatmap -----------------

function colorFor(value) {
  // 0–1 → blue (low) to red (high), passing through yellow at 0.5
  if (value === null || value === undefined) return "#f5f5f5";
  const v = Math.max(0, Math.min(1, (value - 0.2) / 0.6));
  // interpolate: blue (0) → yellow (0.5) → red (1)
  if (v < 0.5) {
    const t = v / 0.5;
    const r = Math.round(70 + (255 - 70) * t);
    const g = Math.round(120 + (220 - 120) * t);
    const b = Math.round(180 - 80 * t);
    return `rgb(${r},${g},${b})`;
  } else {
    const t = (v - 0.5) / 0.5;
    const r = Math.round(255);
    const g = Math.round(220 - 140 * t);
    const b = Math.round(100 - 60 * t);
    return `rgb(${r},${g},${b})`;
  }
}

export function SectorCategoryHeatmap({ data }) {
  const cats = ["Compensation", "Disputes", "Leave", "Healthcare", "Security",
                "Recognition", "Safety", "Scheduling", "Ancillary"];
  const labels = ["Wages", "Disputes", "Leave", "Healthcare", "Security",
                  "Recognition", "Safety", "Scheduling", "Ancillary"];
  return (
    <div className="v51Heatmap">
      <table>
        <thead>
          <tr>
            <th></th>
            {labels.map(l => <th key={l}>{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.sector}>
              <td className="sectorLabel">
                {row.sector_label}<br />
                <span className="muted">n={row.n_contracts}</span>
              </td>
              {cats.map(cat => {
                const cell = row.scores_by_category[cat];
                if (!cell) return <td key={cat} className="hmCell empty">—</td>;
                const color = colorFor(cell.mean);
                const textColor = (cell.mean > 0.65 || cell.mean < 0.35) ? "#fff" : "#222";
                return (
                  <td key={cat}
                      className="hmCell"
                      style={{ background: color, color: textColor }}
                      title={`${row.sector_label} × ${labels[cats.indexOf(cat)]}: mean ${fmt2(cell.mean)} (n=${cell.n})`}>
                    {fmt2(cell.mean)}<br />
                    <span style={{ opacity: 0.7, fontSize: "0.75em" }}>n={cell.n}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----------------- Validation panel -----------------

export function ValidationPanel({ data }) {
  const { per_category, summary } = data.validation;
  return (
    <section className="v51Page">
      <h2>Validation against three independent references</h2>
      <p className="v51HeroSub">
        Spearman rank correlation between pipeline scores and three external
        reference points, per provision area.
      </p>

      <div className="v51Card">
        <h3>Summary</h3>
        <ul className="v51Bullets">
          <li><strong>Davidson pairwise</strong> (separately-built MLE on LLM-judged pairs, 20-contract validation set): mean ρ across nine areas = {fmt2(summary.davidson_mean_rho)}.</li>
          <li><strong>Bone external</strong> (Bone 2024, 13-category Davidson on the same Cornell BLS collection): mean ρ across nine comparable areas = {fmt2(summary.bone_mean_rho)}.</li>
          <li><strong>Hand re-read</strong> (iterative full-OCR re-rating on 40 cells, 4 areas × 10 contracts): pooled ρ = {fmt2(summary.hand_reread_pooled_rho)}.</li>
          <li><strong>Test–retest noise ceiling</strong>: ρ = {fmt2(summary.test_retest_rho)} (n = {summary.test_retest_n} Compensation cells, two independent LLM sessions).</li>
        </ul>
      </div>

      <div className="v51Card">
        <h3>Per-provision-area Spearman ρ</h3>
        <table className="v51ValBigTable">
          <thead>
            <tr>
              <th rowSpan={2}>Provision area</th>
              <th colSpan={2}>Davidson pairwise</th>
              <th colSpan={2}>Bone external</th>
              <th colSpan={2}>Hand re-read</th>
            </tr>
            <tr>
              <th>ρ</th><th>n</th>
              <th>ρ</th><th>n</th>
              <th>ρ</th><th>n</th>
            </tr>
          </thead>
          <tbody>
            {per_category.map(c => (
              <tr key={c.category}>
                <td>{c.category_label}</td>
                <td className="num">{fmt2(c.davidson.rho)}</td>
                <td className="num">{c.davidson.n}</td>
                <td className="num">{fmt2(c.bone.rho)}</td>
                <td className="num">{c.bone.n}</td>
                <td className="num">{c.hand_reread.rho !== null ? fmt2(c.hand_reread.rho) : "—"}</td>
                <td className="num">{c.hand_reread.n >= 4 ? c.hand_reread.n : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="v51Note">
          The within-method noise ceiling on any of these comparisons is
          approximately ρ = 0.85. Compensation is the weakest area across
          every reference, reflecting that compensation generosity is a
          structural property (two-tier wage scales, employer-discretion
          clauses on increases, COLA pass-through strength) that the
          deterministically-assembled provision summary captures only
          partially.
        </p>
      </div>
    </section>
  );
}

// ----------------- Ontology browser -----------------

export function OntologyBrowser({ data }) {
  const { ontology } = data;
  const totalRecords = ontology.reduce((s, n) => s + n.n_records, 0);
  return (
    <section className="v51Page">
      <h2>Provision ontology</h2>
      <p className="v51HeroSub">
        A four-level hierarchy: nine canonical provision areas, twenty-six
        sub-areas, fifty provision types, and sixty-two fine-grained
        sub-types. Total {totalRecords.toLocaleString()} provision records
        across {data.manifest.n_contracts_scored} contracts. Expand any
        node to see example provisions with their extracted fields.
      </p>
      <div className="v51OntologyTree">
        {ontology.map(area => <OntologyNode key={area.name} node={area} />)}
      </div>
    </section>
  );
}

function OntologyNode({ node }) {
  const [open, setOpen] = useState(node.level < 1);
  const hasChildren = node.children && node.children.length > 0;
  const hasExamples = node.examples && node.examples.length > 0;
  const labelClass = `v51OntoLabel level${node.level}`;
  return (
    <div className="v51OntoNode">
      <button
        className={labelClass}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="v51OntoChevron">{open ? "▼" : "▶"}</span>
        <span className="v51OntoName">{node.label || node.name}</span>
        <span className="v51OntoCount">{node.n_records.toLocaleString()} records</span>
      </button>
      {open && hasChildren && (
        <div className="v51OntoChildren">
          {node.children.map((c, i) => <OntologyNode key={i} node={c} />)}
        </div>
      )}
      {open && hasExamples && (
        <div className="v51OntoExamples">
          <div className="v51OntoExamplesHeader">Example provisions ({node.examples.length} of {node.n_records}):</div>
          {node.examples.map((ex, i) => (
            <div key={i} className="v51OntoExample">
              <div className="v51OntoExampleDoc">
                <span className="muted">from</span> <strong>{ex.document_id}</strong>
                {ex.status && <span className="v51StatusPill">{ex.status}</span>}
              </div>
              <div className="v51OntoExampleDesc">{ex.description || "(no description)"}</div>
              {ex.fields && ex.fields.length > 0 && (
                <div className="v51OntoExampleFields">
                  {ex.fields.map((f, j) => (
                    <span key={j} className="v51FieldChip">
                      <code>{f.name}</code> = {f.value} {f.unit && <em className="muted">{f.unit}</em>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------- Composite ranking page -----------------

export function CompositeRanking({ data }) {
  const { composite } = data;
  const [sectorFilter, setSectorFilter] = useState("All");
  const sectors = Array.from(new Set(composite.map(d => d.sector_label).filter(Boolean))).sort();
  const filtered = sectorFilter === "All"
    ? composite
    : composite.filter(d => d.sector_label === sectorFilter);

  return (
    <section className="v51Page">
      <h2>Composite contract generosity ranking</h2>
      <p className="v51HeroSub">
        Mean cell score across the eight substantive provision areas (excluding
        Miscellany), for the {composite.length} contracts with at least eight
        scored areas. Per-cell uncertainty is approximately ±0.13, so
        rank differences of less than 5 positions should not be treated
        as substantively distinguishable.
      </p>
      <div className="v51FilterRow">
        <label>Filter by sector:</label>
        <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}>
          <option>All</option>
          {sectors.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <table className="v51CompositeTable">
        <thead>
          <tr>
            <th>Rank</th><th>Composite</th><th>Document</th>
            <th>Employer / union</th><th>Sector</th><th>Year</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((d, i) => (
            <tr key={d.document_id}>
              <td className="num">{i + 1}</td>
              <td className="num"><strong>{fmt2(d.composite)}</strong></td>
              <td>{d.document_id}</td>
              <td>{d.employer || ""} {d.union ? <em className="muted">/ {d.union}</em> : null}</td>
              <td>{d.sector_label || ""}</td>
              <td className="num">{d.year || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
