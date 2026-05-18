import React, { useEffect, useMemo, useState, useRef } from "react";

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

// ============================================================
// Glossary — definitions for technical terms
// ============================================================

const GLOSSARY = {
  "rho": "Spearman rank correlation. Ranges from −1 (perfect reverse ordering) to +1 (perfect agreement on ordering). Insensitive to the absolute scale.",
  "spearman_rho": "Spearman rank correlation between two rankings. Ranges from −1 to +1. We use it because the underlying scores live on different scales.",
  "anchor_calibration": "Per-area intercept shift derived from re-scoring 10 stratified contracts across all 9 provision areas in a single LLM session. Rank-preserving; harmonizes cross-area means.",
  "provision_summary": "Deterministic textual layout of all extracted provisions for one (contract, provision-area) cell, with their numeric fields. The only input the LLM scorer sees.",
  "davidson_pairwise": "Bradley-Terry / Davidson MLE on LLM-judged pairwise comparisons across all ${n \\choose 2}$ pairs. An in-house reference built for cross-method comparison, sharing the same 4-sub-criterion prompt structure as this pipeline.",
  "earlier_davidson": "An earlier in-house team pipeline that ran Davidson pairwise scoring on the same Cornell BLS corpus using a different 13-category ontology. Same authors, different framing.",
  "agentic_reread": "Iterative full-OCR re-rating by the same model that runs the pipeline. 40 cells across 4 areas and 10 contracts. Not human gold; bounded above by shared-model-prior variance.",
  "agentic_validation": "Validation against agent-generated reference points rather than human gold-standard labels. All three reference points here use Claude Sonnet 4.6 at some stage; ρ values are bounded above by shared-model-prior variance.",
  "test_retest": "Spearman ρ between two independent LLM scoring sessions on the same provision summary. Sets the within-method noise ceiling for any other ρ comparison.",
  "source_flag": "How the cell was scored. Values: 'absolute' (LLM), 'rubric' (Python rule, currently always demoted to diagnostic), 'unscored' (records exist but neither layer fired), 'absent' (no records).",
  "rule_based_scoring": "Deterministic Python rules over extracted typed fields. Reproducible and auditable; retained as a diagnostic layer because LLM scoring dominates on validation against external references.",
  "llm_scoring": "Single-shot Claude Sonnet 4.6 scoring of a (contract, area) cell from its provision summary, on a fixed 4-sub-criterion 1-5 anchor scale.",
  "provision_area": "Top-level grouping in the provision ontology. Nine substantive areas: Compensation, Disputes, Leave, Healthcare, Security, Recognition, Safety, Scheduling, Ancillary.",
  "subarea": "Second-level grouping. 26 sub-areas across the 9 provision areas.",
  "provision_type": "Third-level: specific provision types like C_LEAVE_VACATION, C_HEALTH_MEDICAL_ACTIVE_CONTRIBUTION. The level at which Python rule-based scoring is keyed. 50 types in this sample.",
  "subobject_type": "Fourth-level: fine-grained sub-types like 'vacation_weeks_max_or_tier'. Names the typed-field namespace within a provision type. 62 sub-types in this sample.",
  "composite": "Mean cell score across the eight substantive provision areas (excluding Miscellany), for contracts with at least eight scored areas. Compresses per-area heterogeneity; report cell-level scores for substantive analyses.",
  "cell": "One (contract, provision-area) pair. The unit of observation throughout. 100 contracts × 9 areas would be 900 cells; in practice 857 substantive cells after dropping 'absent' cells.",
  "wave1": "The 100-contract sample we report on, drawn from the U.S. DOL archive of LMRDA-filed CBAs.",
  "cell_uncertainty": "Per-cell standard deviation of approximately ±0.13 from test-retest, after anchor calibration. Two cells whose scores differ by ≤0.10 are not distinguishable from re-run noise.",
};

// ============================================================
// Shared primitives
// ============================================================

export function Tooltip({ text, children, side = "top" }) {
  // Lightweight tooltip using CSS hover. Wraps inline text.
  if (!text) return children;
  return (
    <span className={`v51Tooltip side-${side}`}>
      {children}
      <span className="v51TooltipContent">{text}</span>
    </span>
  );
}

export function TermInfo({ term, children }) {
  // Wraps a term in a glossary-defined tooltip. If no children, uses term as label.
  const text = GLOSSARY[term] || "";
  return (
    <span className="v51Term">
      <Tooltip text={text}>
        <span className="v51TermLabel">{children || term}</span>
      </Tooltip>
    </span>
  );
}

export function ExpandableCard({ title, defaultOpen = false, children, hint }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="v51Card v51Expandable">
      <button
        className="v51ExpandableHeader"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="v51ExpandChevron">{open ? "▼" : "▶"}</span>
        <h3>{title}</h3>
        {hint && !open && <span className="v51ExpandHint">{hint}</span>}
      </button>
      {open && <div className="v51ExpandableBody">{children}</div>}
    </div>
  );
}

export function Modal({ isOpen, onClose, title, children }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return (
    <div className="v51ModalOverlay" onClick={onClose}>
      <div className="v51ModalBox" onClick={(e) => e.stopPropagation()}>
        <div className="v51ModalHeader">
          <h3>{title}</h3>
          <button className="v51ModalClose" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="v51ModalBody">{children}</div>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, label }) {
  return (
    <div className="v51SearchWrap">
      {label && <label>{label}</label>}
      <input
        className="v51SearchInput"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button className="v51SearchClear" onClick={() => onChange("")} aria-label="Clear">×</button>
      )}
    </div>
  );
}

export function DistributionStrip({ values, highlight = null, width = 480, height = 40 }) {
  // Simple SVG strip plot showing 1-D distribution of `values` with optional `highlight` set.
  if (!values || values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const scale = (v) => ((v - min) / range) * (width - 20) + 10;
  return (
    <svg className="v51DistStrip" width={width} height={height} aria-label="Distribution strip">
      <line x1={10} y1={height / 2} x2={width - 10} y2={height / 2}
            stroke="#e1e5ee" strokeWidth={1} />
      {values.map((v, i) => {
        const isHi = highlight && highlight.has(v);
        return (
          <circle
            key={i}
            cx={scale(v)}
            cy={height / 2}
            r={isHi ? 4 : 2.5}
            fill={isHi ? "#c8533d" : "#1f4e79"}
            opacity={isHi ? 0.95 : 0.5}
          />
        );
      })}
      <text x={10} y={height - 4} fontSize={10} fill="#888">{fmt2(min)}</text>
      <text x={width - 10} y={height - 4} fontSize={10} fill="#888" textAnchor="end">{fmt2(max)}</text>
    </svg>
  );
}

// ============================================================
// Overview — true landing (hero + stats + 6 card-links)
// ============================================================

export function OverviewV51({ data, onNavigate }) {
  const { manifest } = data;
  const cards = [
    {
      key: "validation_v51",
      title: "Agentic validation",
      teaser: "How the pipeline scores compare to three agent-generated reference points, per provision area.",
      stat: `mean ρ = ${fmt2(manifest.validation.davidson_pairwise_mean_rho)} – ${fmt2(manifest.validation.test_retest_rho)}`,
      statLabel: "across nine areas",
    },
    {
      key: "sector_v51",
      title: "Sector × area",
      teaser: "Mean generosity scores by sector and provision area. Reproduces the classic Freeman–Medoff contrast.",
      stat: "construction 0.76 vs public 0.57 on wages",
      statLabel: "headline contrast",
    },
    {
      key: "composite_v51",
      title: "Composite ranking",
      teaser: "Per-contract composite generosity, sortable and searchable with sector filter.",
      stat: `${manifest.n_contracts_scored} contracts`,
      statLabel: "ranked",
    },
    {
      key: "ontology_v51",
      title: "Ontology",
      teaser: "Interactive four-level browser of the provision taxonomy with extracted-field examples at each leaf.",
      stat: `${manifest.n_provision_areas} areas → 50 types`,
      statLabel: "with examples",
    },
    {
      key: "reliability_v51",
      title: "Reliability",
      teaser: "Within-method noise estimate, batch calibration outcomes, per-cell standard error.",
      stat: `±${manifest.uncertainty_per_cell_sd}`,
      statLabel: "per-cell SD",
    },
    {
      key: "documents",
      title: "Browse contracts (v3 explorer)",
      teaser: "Document-by-document explorer of the underlying extracted provisions and rejected values.",
      stat: "record-level",
      statLabel: "details",
    },
  ];
  return (
    <section className="v51Page">
      <div className="v51Hero">
        <h2>Wave-1 measurement results</h2>
        <p className="v51HeroSub">
          A language-model pipeline that scores collective bargaining agreements on
          nine substantive provision areas. <TermInfo term="wave1">Wave-1</TermInfo>{" "}
          covers {manifest.n_contracts_scored} U.S. CBAs from the DOL archive,
          with <TermInfo term="agentic_validation">agentic validation</TermInfo>{" "}
          against three reference points.
        </p>
        <div className="v51StatsRow">
          <V51Stat big={manifest.n_contracts_scored} label="contracts scored" />
          <V51Stat big={manifest.n_cells.toLocaleString()}
                   label={<>scored <TermInfo term="cell">cells</TermInfo></>} />
          <V51Stat big={manifest.n_provision_areas}
                   label={<TermInfo term="provision_area">provision areas</TermInfo>} />
          <V51Stat big={`$${manifest.marginal_cost_usd_per_contract_estimate.toFixed(2)}`}
                   label="compute cost / contract" />
        </div>
      </div>

      <div className="v51LandingGrid">
        {cards.map((card) => (
          <button
            key={card.key}
            className="v51LandingCard"
            onClick={() => onNavigate(card.key)}
          >
            <div className="v51LandingCardTitle">{card.title}</div>
            <div className="v51LandingCardTeaser">{card.teaser}</div>
            <div className="v51LandingCardStat">{card.stat}</div>
            <div className="v51LandingCardStatLabel">{card.statLabel}</div>
            <div className="v51LandingCardArrow">→</div>
          </button>
        ))}
      </div>

      <ExpandableCard
        title="What the scores mean"
        hint="how to read the 0–1 scale"
        defaultOpen={false}
      >
        <p className="v51Note">
          Each (<TermInfo term="cell">cell</TermInfo>) gets a 0–1 score from four
          1-5 <span className="v51Term">sub-criterion</span> ratings that sum to a
          0-20 total, then divided by 20. A 0.65 on Compensation means the
          contract sits in the upper third of the corpus on its combination of
          wage levels, growth schedule, premium-pay menu, and tenure progression.
          A 0.30 on Safety means a thin, statutory-minimum-leaning treatment of
          PPE, the right to refuse unsafe work, joint health-and-safety committees,
          and hazard-assault language.{" "}
          <TermInfo term="cell_uncertainty">Per-cell uncertainty</TermInfo> is
          approximately ±0.13 after{" "}
          <TermInfo term="anchor_calibration">anchor calibration</TermInfo>.
        </p>
      </ExpandableCard>

      <ExpandableCard
        title="LLM-vs-LLM caveat"
        hint="why ρ values are bounded above"
        defaultOpen={false}
      >
        <p className="v51Note">
          All three validation references — the{" "}
          <TermInfo term="davidson_pairwise">Davidson pairwise</TermInfo> baseline,
          the iterative <TermInfo term="agentic_reread">agentic re-read</TermInfo>, and
          the within-method <TermInfo term="test_retest">test-retest</TermInfo> —
          use the same Claude Sonnet 4.6 model that runs the pipeline. Shared
          model priors inflate the reported correlations relative to a
          human-graded gold standard. A agentic re-rater study on a small subsample
          is the highest-priority follow-up.
        </p>
      </ExpandableCard>
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

// ============================================================
// Sector × Category heatmap with hover highlight + click drilldown
// ============================================================

function colorFor(value) {
  if (value === null || value === undefined) return "#f5f5f5";
  const v = Math.max(0, Math.min(1, (value - 0.2) / 0.6));
  if (v < 0.5) {
    const t = v / 0.5;
    const r = Math.round(70 + (255 - 70) * t);
    const g = Math.round(120 + (220 - 120) * t);
    const b = Math.round(180 - 80 * t);
    return `rgb(${r},${g},${b})`;
  } else {
    const t = (v - 0.5) / 0.5;
    const r = 255;
    const g = Math.round(220 - 140 * t);
    const b = Math.round(100 - 60 * t);
    return `rgb(${r},${g},${b})`;
  }
}

const CATS = ["Compensation", "Disputes", "Leave", "Healthcare", "Security",
              "Recognition", "Safety", "Scheduling", "Ancillary"];
const CAT_LABELS = ["Wages", "Disputes", "Leave", "Healthcare", "Security",
                    "Recognition", "Safety", "Scheduling", "Ancillary"];

export function SectorCategoryHeatmap({ data, onCellClick }) {
  const [hoverRow, setHoverRow] = useState(null);
  const [hoverCol, setHoverCol] = useState(null);
  return (
    <div className="v51HeatmapScroll">
      <table className="v51Heatmap">
        <thead>
          <tr>
            <th></th>
            {CAT_LABELS.map((l, j) => (
              <th key={l}
                  className={hoverCol === j ? "hmHeaderHi" : ""}
                  onMouseEnter={() => setHoverCol(j)}
                  onMouseLeave={() => setHoverCol(null)}>
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.sector}
                className={hoverRow === i ? "hmRowHi" : ""}
                onMouseEnter={() => setHoverRow(i)}
                onMouseLeave={() => setHoverRow(null)}>
              <td className={`sectorLabel ${hoverRow === i ? "hmHeaderHi" : ""}`}>
                {row.sector_label}<br />
                <span className="muted">n={row.n_contracts}</span>
              </td>
              {CATS.map((cat, j) => {
                const cell = row.scores_by_category[cat];
                if (!cell) return <td key={cat} className="hmCell empty">—</td>;
                const color = colorFor(cell.mean);
                const textColor = (cell.mean > 0.65 || cell.mean < 0.35) ? "#fff" : "#222";
                const isHi = hoverRow === i || hoverCol === j;
                return (
                  <td key={cat}
                      className={`hmCell ${isHi ? "hmCellHi" : ""}`}
                      style={{ background: color, color: textColor }}
                      onClick={() => onCellClick && onCellClick(row.sector, row.sector_label, cat, cell)}
                      title={`${row.sector_label} × ${CAT_LABELS[j]}: mean ${fmt2(cell.mean)} (n=${cell.n}). Click for contract list.`}>
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

export function SectorPage({ data }) {
  const [modal, setModal] = useState(null);
  const handleCellClick = (sector, sectorLabel, category, cellInfo) => {
    // Find all contracts in this sector × category, sorted by score
    const matches = data.cellScores
      .filter(c => c.category === category)
      .filter(c => {
        const doc = data.documents.find(d => d.document_id === c.document_id);
        return doc && doc.sector === sector;
      })
      .sort((a, b) => b.score - a.score)
      .map(c => {
        const doc = data.documents.find(d => d.document_id === c.document_id);
        return { ...c, ...doc };
      });
    setModal({ sectorLabel, category, mean: cellInfo.mean, n: cellInfo.n, matches });
  };
  return (
    <section className="v51Page">
      <h2>Sector × provision-area generosity</h2>
      <p className="v51HeroSub">
        Mean <TermInfo term="cell">cell</TermInfo> score by sector (rows) and{" "}
        <TermInfo term="provision_area">provision area</TermInfo> (columns) on
        the 100-contract <TermInfo term="wave1">wave-1</TermInfo> sample, after{" "}
        <TermInfo term="anchor_calibration">anchor calibration</TermInfo>. Click
        any cell to see the contracts in that sector × area.
      </p>
      <div className="v51Card">
        <SectorCategoryHeatmap data={data.sectorCategory} onCellClick={handleCellClick} />
      </div>

      <ExpandableCard title="About this table" defaultOpen={false}
                      hint="sample size and reading guide">
        <p className="v51Note">
          Sectors with fewer than three contracts are omitted from the display
          (the suppressed cells are 'unknown' n=2 and 'private_other' n=2). Cell
          color encodes the mean 0-1 score on a blue (low) → yellow → red (high)
          scale; numbers in the cell are the mean and n. Hover a row to highlight
          the sector profile across areas; hover a column to compare one area
          across sectors. The within-method noise floor on any single cell is
          approximately ±0.13.
        </p>
      </ExpandableCard>

      <div className="v51Card">
        <h3>Stylized patterns the table reproduces</h3>
        <ul className="v51Bullets">
          <li><strong>Construction</strong> is cash-heavy with thin protections: highest wage score (0.76), lowest leave (0.31) and lowest job security (0.26). Hiring-hall structure moves vacation, healthcare, and layoff/recall outside the contract.</li>
          <li><strong>Public sector</strong> is deferred-comp-heavy: highest leave score (0.77), strong disputes (0.65), moderate wages (0.57). The classic trade of current pay for benefits and tenure protection.</li>
          <li><strong>Utilities</strong> top wages (0.81). Gas and electric utility workers earn premium wages relative to other private-sector union contracts.</li>
        </ul>
      </div>

      <Modal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        title={modal ? `${modal.sectorLabel} × ${CAT_LABELS[CATS.indexOf(modal.category)]} — ${modal.n} contracts (mean ${fmt2(modal.mean)})` : ""}
      >
        {modal && (
          <table className="v51DocTable">
            <thead><tr><th>Score</th><th>Document</th><th>Employer / union</th><th>Year</th></tr></thead>
            <tbody>
              {modal.matches.map(c => (
                <tr key={c.document_id}>
                  <td className="num"><strong>{fmt2(c.score)}</strong></td>
                  <td>{c.document_id}</td>
                  <td>{c.employer || ""} {c.union ? <em className="muted">/ {c.union}</em> : null}</td>
                  <td className="num">{c.year || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </section>
  );
}

// ============================================================
// Validation panel — summary + collapsible detail table
// ============================================================

export function ValidationPanel({ data }) {
  const { per_category, summary } = data.validation;
  return (
    <section className="v51Page">
      <h2>Agentic validation against three reference points</h2>
      <p className="v51HeroSub">
        <TermInfo term="spearman_rho">Spearman ρ</TermInfo> between
        pipeline scores and three <TermInfo term="agentic_validation">agent-generated reference points</TermInfo>,
        by provision area. We call this <em>agentic validation</em>:
        every reference here uses a language model at some stage, so the
        ρ values are bounded above by shared-model-prior variance rather
        than measuring agreement with human ground truth.
      </p>

      <div className="v51Card">
        <h3>Summary</h3>
        <ul className="v51Bullets">
          <li><TermInfo term="davidson_pairwise"><strong>Davidson pairwise</strong></TermInfo>{" "}
              (separately-built MLE on LLM-judged pairs, 20-contract validation set):
              mean ρ across nine areas = <strong>{fmt2(summary.davidson_mean_rho)}</strong>.</li>
          <li><TermInfo term="earlier_davidson"><strong>Earlier 13-category Davidson</strong></TermInfo>{" "}
              (an earlier in-house team pipeline using a 13-category ontology on the same Cornell BLS corpus):
              mean ρ across nine comparable areas = <strong>{fmt2(summary.earlier_davidson_mean_rho)}</strong>.</li>
          <li><TermInfo term="agentic_reread"><strong>Agentic re-read</strong></TermInfo>{" "}
              (iterative full-OCR re-rating on 40 cells, 4 areas × 10 contracts):
              pooled ρ = <strong>{fmt2(summary.agentic_reread_pooled_rho)}</strong>.</li>
          <li><TermInfo term="test_retest"><strong>Test-retest noise ceiling</strong></TermInfo>:
              ρ = <strong>{fmt2(summary.test_retest_rho)}</strong> (n = {summary.test_retest_n}{" "}
              Compensation cells, two independent LLM sessions).</li>
        </ul>
      </div>

      <ExpandableCard title="Per-provision-area Spearman ρ" defaultOpen={false}
                      hint="9 rows × 3 references">
        <div className="v51TableScroll">
          <table className="v51ValBigTable">
            <thead>
              <tr>
                <th rowSpan={2}>Provision area</th>
                <th colSpan={2}>Davidson pairwise</th>
                <th colSpan={2}>Earlier 13-category Davidson</th>
                <th colSpan={2}>Agentic re-read</th>
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
                  <td className="num">{fmt2(c.earlier_davidson.rho)}</td>
                  <td className="num">{c.earlier_davidson.n}</td>
                  <td className="num">{c.agentic_reread.rho !== null ? fmt2(c.agentic_reread.rho) : "—"}</td>
                  <td className="num">{c.agentic_reread.n >= 4 ? c.agentic_reread.n : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ExpandableCard>

      <ExpandableCard title="Why Compensation is the weakest area"
                      hint="structural property of the contract" defaultOpen={false}>
        <p className="v51Note">
          Compensation is the weakest area across every reference. The
          deterministic provision summary captures wage <em>levels</em>,
          premium-pay menus, and fixed annual increases well; it captures
          contract <em>structure</em> only partially. The structural features
          that matter most are two-tier wage scales (post-cutoff hires paid a
          reduced percentage of the class rate), employer-discretion clauses on
          increase percentages, partial-pass-through cost-of-living formulas, and
          work-year normalization for teacher and seasonal contracts. Improving
          Compensation requires upstream improvements to provision extraction
          rather than downstream prompting fixes.
        </p>
      </ExpandableCard>
    </section>
  );
}

// ============================================================
// Reliability page
// ============================================================

export function ReliabilityPanel({ data }) {
  const { manifest } = data;
  return (
    <section className="v51Page">
      <h2>Reliability</h2>
      <p className="v51HeroSub">
        Within-method noise, batch-intercept calibration, and per-cell
        standard error.
      </p>

      <div className="v51Card">
        <h3><TermInfo term="test_retest">Test-retest</TermInfo></h3>
        <p className="v51Note">
          We re-scored 20 Compensation cells in a second, independent LLM
          session, using the same provision summary and the same prompt.
          Spearman ρ between the two runs was{" "}
          <strong>{fmt2(manifest.validation.test_retest_rho)}</strong>;
          Pearson r = 0.94. The two means differed by +0.12 — the second
          run systematically scored every contract higher — but ordering
          was preserved.
        </p>
        <p className="v51Note">
          The variance has two components. A per-batch <em>intercept</em>{" "}
          shift dominates (≈ 0.12 on this test). A per-cell <em>residual</em>{" "}
          standard deviation of approximately 0.10 remains after the intercept
          is removed.
        </p>
      </div>

      <div className="v51Card">
        <h3><TermInfo term="anchor_calibration">Anchor calibration outcomes</TermInfo></h3>
        <ul className="v51Bullets">
          <li>Per-area means on the four agentic re-rated areas match the iterative-reading means within 0.03–0.05 after calibration.</li>
          <li>Pooled mean absolute deviation against agentic re-read dropped 22% (0.125 → 0.098 across 40 cells).</li>
          <li>Contract-level rankings unchanged: ρ between pre- and post-calibration mean rankings = 0.9995 on the 100-contract sample. Max rank shift: 3 positions of 94.</li>
        </ul>
      </div>

      <div className="v51Card">
        <h3>Per-cell uncertainty</h3>
        <p className="v51Note">
          After calibration, a reasonable summary for a published cell score
          is <strong>X ± {manifest.uncertainty_per_cell_sd}</strong>{" "}
          (test-retest cell-level RMSE). Two cells whose scores differ by
          ≤ 0.10 are not distinguishable from re-run noise. Sector-level
          means computed over ≥ 10 contracts have standard error ≈
          0.13/√n ≈ 0.04, comfortably below the largest sector × area
          differences in the headline table.
        </p>
      </div>

      <ExpandableCard title="What we do not measure" defaultOpen={false}
                      hint="extraction-stage noise + worker recall">
        <p className="v51Note">
          We do not separately estimate extraction-stage noise: the variance
          introduced if a second set of workers re-extracted the contract
          tables from OCR. That number bounds the total noise budget of the
          pipeline and is a natural follow-up at the next scale-up. We also
          do not measure worker recall — whether the workers systematically
          miss a class of provisions — so the pipeline's scores reflect what
          the workers extracted, not what is in the OCR. The roughly +0.10
          systematic under-rating against iterative reading before calibration
          is consistent with mild under-extraction; calibration closes most
          of it.
        </p>
      </ExpandableCard>
    </section>
  );
}

// ============================================================
// Ontology browser with search + sticky breadcrumb
// ============================================================

function nodeMatches(node, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if ((node.label || node.name || "").toLowerCase().includes(q)) return true;
  if ((node.name || "").toLowerCase().includes(q)) return true;
  if (node.children) {
    return node.children.some(c => nodeMatches(c, q));
  }
  if (node.examples) {
    return node.examples.some(ex =>
      (ex.description || "").toLowerCase().includes(q) ||
      (ex.document_id || "").toLowerCase().includes(q) ||
      (ex.fields || []).some(f => `${f.name} ${f.value}`.toLowerCase().includes(q))
    );
  }
  return false;
}

export function OntologyBrowser({ data }) {
  const { ontology } = data;
  const [query, setQuery] = useState("");
  const totalRecords = ontology.reduce((s, n) => s + n.n_records, 0);
  const filtered = query
    ? ontology.filter(n => nodeMatches(n, query))
    : ontology;

  return (
    <section className="v51Page">
      <h2>Provision ontology</h2>
      <p className="v51HeroSub">
        A four-level hierarchy: nine{" "}
        <TermInfo term="provision_area">canonical provision areas</TermInfo>,
        twenty-six <TermInfo term="subarea">sub-areas</TermInfo>, fifty{" "}
        <TermInfo term="provision_type">provision types</TermInfo>, and sixty-two
        fine-grained <TermInfo term="subobject_type">sub-types</TermInfo>. Total{" "}
        {totalRecords.toLocaleString()} provision records across{" "}
        {data.manifest.n_contracts_scored} contracts. Expand any node to see
        example provisions; type in the search box to filter.
      </p>
      <div className="v51OntologyControls">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search ontology (e.g. 'vacation', 'severance', 'two-tier', 'COLA')"
          label="Filter"
        />
        {query && (
          <span className="v51OntoMatchCount">
            {filtered.length} of {ontology.length} areas have a matching node
          </span>
        )}
      </div>
      <div className="v51OntologyTree">
        {filtered.map(area => (
          <OntologyNode key={area.name} node={area} query={query} forceOpen={!!query} />
        ))}
        {query && filtered.length === 0 && (
          <div className="v51Empty">No matches for “{query}”.</div>
        )}
      </div>
    </section>
  );
}

function OntologyNode({ node, query = "", forceOpen = false }) {
  const [openState, setOpen] = useState(node.level < 1);
  const open = forceOpen || openState;
  const hasChildren = node.children && node.children.length > 0;
  const hasExamples = node.examples && node.examples.length > 0;
  const labelClass = `v51OntoLabel level${node.level}`;
  const visibleChildren = query && hasChildren
    ? node.children.filter(c => nodeMatches(c, query))
    : node.children;
  return (
    <div className="v51OntoNode">
      <button
        className={labelClass}
        onClick={() => setOpen(!openState)}
        aria-expanded={open}
      >
        <span className="v51OntoChevron">{open ? "▼" : "▶"}</span>
        <span className="v51OntoName">{highlightMatch(node.label || node.name, query)}</span>
        <span className="v51OntoCount">{node.n_records.toLocaleString()} {node.n_records === 1 ? "record" : "records"}</span>
      </button>
      {open && hasChildren && (
        <div className="v51OntoChildren">
          {visibleChildren.map((c, i) => (
            <OntologyNode key={i} node={c} query={query} forceOpen={forceOpen} />
          ))}
        </div>
      )}
      {open && hasExamples && (
        <div className="v51OntoExamples">
          <div className="v51OntoExamplesHeader">
            Example provisions ({node.examples.length} of {node.n_records}):
          </div>
          {node.examples.map((ex, i) => (
            <div key={i} className="v51OntoExample">
              <div className="v51OntoExampleDoc">
                <span className="muted">from</span>{" "}
                <strong>{ex.document_id}</strong>
                {ex.status && <span className="v51StatusPill">{ex.status}</span>}
              </div>
              <div className="v51OntoExampleDesc">
                {highlightMatch(ex.description || "(no description)", query)}
              </div>
              {ex.fields && ex.fields.length > 0 && (
                <div className="v51OntoExampleFields">
                  {ex.fields.map((f, j) => (
                    <span key={j} className="v51FieldChip">
                      <code>{f.name}</code> = {f.value}{" "}
                      {f.unit && <em className="muted">{f.unit}</em>}
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

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ============================================================
// Composite ranking with search + pagination + distribution strip
// ============================================================

export function CompositeRanking({ data }) {
  const { composite } = data;
  const [sectorFilter, setSectorFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const sectors = Array.from(new Set(composite.map(d => d.sector_label).filter(Boolean))).sort();
  const filtered = useMemo(() => composite
    .filter(d => sectorFilter === "All" || d.sector_label === sectorFilter)
    .filter(d => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (d.document_id || "").toLowerCase().includes(q)
        || (d.employer || "").toLowerCase().includes(q)
        || (d.union || "").toLowerCase().includes(q);
    }),
    [composite, sectorFilter, query]
  );

  const visible = showAll ? filtered : filtered.slice(0, 20);
  const allValues = composite.map(d => d.composite);
  const filteredValues = new Set(filtered.map(d => d.composite));

  return (
    <section className="v51Page">
      <h2>Composite contract generosity ranking</h2>
      <p className="v51HeroSub">
        <TermInfo term="composite">Composite</TermInfo> = mean cell score
        across the eight substantive provision areas. {composite.length} contracts
        with at least eight scored areas. Per-cell{" "}
        <TermInfo term="cell_uncertainty">uncertainty</TermInfo> is approximately
        ±0.13, so rank differences smaller than 5 positions should not be
        treated as substantively distinguishable.
      </p>

      <div className="v51Card">
        <div className="v51DistRow">
          <div>
            <div className="v51DistLabel">Distribution{query || sectorFilter !== "All" ? " (filtered)" : ""}</div>
            <DistributionStrip values={allValues} highlight={filteredValues} width={520} height={42} />
          </div>
          <div className="v51DistStats">
            <span>n = <strong>{filtered.length}</strong></span>
            <span>min = <strong>{fmt2(Math.min(...filtered.map(d => d.composite)))}</strong></span>
            <span>median = <strong>{fmt2([...filtered.map(d => d.composite)].sort()[Math.floor(filtered.length/2)])}</strong></span>
            <span>max = <strong>{fmt2(Math.max(...filtered.map(d => d.composite)))}</strong></span>
          </div>
        </div>
      </div>

      <div className="v51FilterRow">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by document ID, employer, or union"
          label="Search"
        />
        <label className="v51InlineLabel">
          Sector:
          <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}>
            <option>All</option>
            {sectors.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div className="v51TableScroll">
        <table className="v51CompositeTable">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Composite</th>
              <th>Document</th>
              <th>Employer / union</th>
              <th>Sector</th>
              <th>Year</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d, i) => (
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
      </div>

      {filtered.length > 20 && (
        <div className="v51PaginationFooter">
          {showAll
            ? <>Showing all {filtered.length} contracts. <button onClick={() => setShowAll(false)} className="v51LinkBtn">Show top 20</button></>
            : <>Showing top 20 of {filtered.length}. <button onClick={() => setShowAll(true)} className="v51LinkBtn">Show all</button></>
          }
        </div>
      )}
    </section>
  );
}
