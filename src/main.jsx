import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  useV51Data,
  OverviewV51,
  OntologyBrowser,
  ValidationPanel,
  ReliabilityPanel,
  CompositeRanking,
  SectorCategoryHeatmap,
  SectorPage,
} from "./v5_1.jsx";

const DATASETS = {
  documents: "data/documents.json",
  records: "data/records_by_document.json",
  scores: "data/module_scores_by_document.json",
  rejected: "data/rejected_values_by_document.json",
  novelty: "data/novelty_by_document.json",
  status: "data/measurement_status_map.json",
  matrix: "data/initial_score_matrix.json",
  manifest: "data/site_manifest.json",
  batch: "data/batch_acceptance_summary.json",
  duplicateQc: "data/duplicate_qc_summary.json",
  normalizedMetrics: "data/normalized_relative_metrics.json",
  normalizationSummary: "data/normalization_summary.json",
  parallel: "data/parallel_pipeline_crosswalk.json"
};

const format = (value, digits = 2) => {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isFinite(num)) return num.toFixed(digits).replace(/\.00$/, "");
  return String(value);
};

const formatFieldLabel = (value = "") => humanizeId(value).replace(/\bOop\b/g, "OOP").replace(/\bCola\b/g, "COLA");

const humanizeId = (value = "") =>
  String(value)
    .replace(/^C_/, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const DISPLAY_LABELS = {
  active_health_contribution_burden: "Active health contribution burden",
  external_fund_contribution_proxy: "External fund contribution proxy",
  wage_growth: "Wage growth",
  wage_level: "Wage level",
  annual_percent_real_if_cpi_available_else_nominal: "Annual percent",
  dollars_per_hour_proxy: "Dollars per hour",
  dollars_per_hour: "Dollars per hour",
  dollars_per_month: "Dollars per month",
  percent: "Percent",
  cpi_adjusted: "CPI adjusted",
  nominal_only: "Nominal only",
  occupation_geography_unadjusted: "Unadjusted wage proxy",
  worker_burden: "Worker burden",
  employer_proxy: "Employer proxy",
  proxy_not_benefit_design: "Contribution proxy",
  comparable_direct: "Ranked",
  rankable_proxy: "Ranked proxy",
  unranked_retained: "Retained, not ranked",
  no_usable_numeric_value: "No usable numeric value",
  direct_or_comparable: "Comparable",
  proxy: "Proxy",
  insufficient_unit_or_object: "Unit or object unclear",
  no_numeric_value: "No numeric value",
  mean_explicit_percent_schedule: "Mean explicit percent schedule",
  mean_dollar_increment_over_base_proxy: "Dollar increment over base proxy",
  highest_stated_regular_hourly_rate_proxy: "Highest stated hourly rate",
  median_worker_contribution_or_premium_burden: "Median worker contribution",
  median_employer_contribution_proxy: "Median employer contribution proxy",
  median_employer_fund_contribution_proxy: "Median employer fund contribution proxy",
  A: "A",
  B: "B",
  C: "C",
  D: "D"
};

const displayLabel = (value = "") => DISPLAY_LABELS[value] ?? humanizeId(value);

const statusTone = (status = "") => {
  if (status.includes("score-ready") || status.includes("score_ready") || status === "scoreable") return "good";
  if (status.includes("candidate") || status.includes("review")) return "warn";
  if (status.includes("external") || status.includes("common") || status.includes("relative") || status.includes("proxy")) return "cool";
  return "muted";
};

const scoreValue = (record, score) => score?.draft_score ?? record.bridge_score?.score;
const hasNumericScore = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

const scoreabilityInfo = (record, score) => {
  if (score?.scoreability) {
    return {
      status: score.scoreability,
      reason: score.scoreability_reason || "",
      missing_or_external_inputs: score.missingness_or_flags || []
    };
  }
  const raw = record.scoreability;
  if (raw && typeof raw === "object") return raw;
  return {
    status: raw || "unknown",
    reason: "",
    missing_or_external_inputs: []
  };
};

const provisionStatus = (record, score) => {
  const status = scoreabilityInfo(record, score).status ?? "unknown";
  const numeric = hasNumericScore(scoreValue(record, score));
  if (numeric && status === "scoreable_with_flags") return ["Scored with caution", "warn", "scored"];
  if (numeric) return ["Scored", "good", "scored"];
  const labels = {
    record_only: ["Recorded/profile", "muted", "recorded"],
    framework_only: ["Recorded/profile", "muted", "recorded"],
    not_scoreable_ambiguous: ["Not scored", "muted", "not_scored"],
    not_scoreable_administrative: ["Not scored", "muted", "not_scored"],
    not_scoreable_external: ["External inputs needed", "cool", "external"],
    normalization_required: ["Needs common units", "cool", "normalization"],
    requires_agentic_review: ["Needs review", "warn", "review"]
  };
  if (labels[status]) return labels[status];
  if (status.includes("scoreable")) return ["Score-ready, no draft score", "warn", "missing_score"];
  return labels[status] ?? [status.replaceAll("_", " "), "muted", "other"];
};

const recordedOnlySubtype = (record, score) => {
  const info = scoreabilityInfo(record, score);
  const status = info.status ?? "";
  const reason = String(info.reason ?? "").toLowerCase();
  const missingInputs = info.missing_or_external_inputs ?? [];
  const missing = (Array.isArray(missingInputs) ? missingInputs : [missingInputs])
    .map((item) => formatNestedValue(item))
    .join(" ")
    .toLowerCase();
  const role = (record.aggregation_role ?? "").toLowerCase();
  const text = [status, reason, missing, role].join(" ");

  if (status === "not_scoreable_external" || text.includes("external") || text.includes("spd") || text.includes("plan document")) {
    return "Requires external info";
  }
  if (status === "normalization_required" || text.includes("normalization") || text.includes("inflation") || text.includes("wage table")) {
    return "Needs common units";
  }
  if (text.includes("source_reread_required") || text.includes("source reread")) {
    return "Source reread needed";
  }
  if (status === "requires_agentic_review" || text.includes("review") || text.includes("disentangle") || text.includes("exact")) {
    return "Needs review";
  }
  if (text.includes("duplicate") || text.includes("prevents duplicate") || text.includes("already scored under")) {
    return "Avoids double counting";
  }
  if (text.includes("statutory") || text.includes("baseline comparison")) {
    return "Statutory baseline unclear";
  }
  if (text.includes("no calibrated") || text.includes("not calibrated") || text.includes("score-ready") || text.includes("scalar-ready") || text.includes("no scalar") || text.includes("framework") || text.includes("proxy") || text.includes("fixed scalar") || text.includes("scoring rubric") || text.includes("scalar rubric") || text.includes("scalar module")) {
    return "Scoring rule not set";
  }
  if (text.includes("committee") || text.includes("governance") || text.includes("advisory") || text.includes("context") || text.includes("scope")) {
    return "Context";
  }
  if (text.includes("separately") || text.includes("not mechanically averaged") || text.includes("subobjects")) {
    return "Kept separate";
  }
  if (text.includes("does not state") || text.includes("lacks") || text.includes("not enough") || text.includes("not stated") || text.includes("no employer contribution") || text.includes("withheld pending detailed")) {
    return "Too little entitlement detail";
  }
  return null;
};

const STATUS_FILTERS = [
  ["All", "All statuses"],
  ["scored", "Scored"],
  ["missing_score", "Score-ready, no draft score"],
  ["withheld", "Recorded, score withheld"],
  ["recorded", "Recorded/profile"],
  ["external", "External inputs needed"],
  ["normalization", "Needs common units"],
  ["review", "Needs review"],
  ["not_scored", "Not scored"]
];

const SUBTYPE_FILTERS = [
  ["All", "All subtypes"],
  ["Context", "Context"],
  ["Requires external info", "Requires external info"],
  ["Scoring rule not set", "Scoring rule not set"],
  ["Needs common units", "Needs common units"],
  ["Needs review", "Needs review"],
  ["Source reread needed", "Source reread needed"],
  ["Statutory baseline unclear", "Statutory baseline unclear"],
  ["Avoids double counting", "Avoids double counting"],
  ["Too little entitlement detail", "Too little entitlement detail"],
  ["Kept separate", "Kept separate"]
];

const DOCUMENT_FILTERS = [
  ["All", "All documents"],
  ["scored", "Has scored provisions"],
  ["missing_score", "Score-ready, no draft score"],
  ["withheld", "Recorded, score withheld"],
  ["review", "Needs review"],
  ["rejected", "Has rejected values"]
];

const documentStats = (doc, recordsByDocument, scoresByDocument) => {
  const rows = recordsByDocument[doc.document_id] ?? [];
  const scores = new Map((scoresByDocument[doc.document_id] ?? []).map((score) => [score.concept_record_id, score]));
  const scored = rows.filter((record) => hasNumericScore(scoreValue(record, scores.get(record.concept_record_id)))).length;
  const missingScore = rows.filter((record) => provisionStatus(record, scores.get(record.concept_record_id))[2] === "missing_score").length;
  const withheld = rows.filter((record) => provisionStatus(record, scores.get(record.concept_record_id))[2] === "withheld").length;
  const review = rows.filter((record) => provisionStatus(record, scores.get(record.concept_record_id))[2] === "review").length;
  return { scored, missingScore, withheld, review, rejected: doc.rejected_value_count ?? 0 };
};

const familyName = (record) => {
  const concept = String(record.concept_id || "").toUpperCase();
  if (concept.startsWith("C_LEAVE")) return "Leave";
  if (concept.startsWith("C_GRIEVANCE") || concept.startsWith("C_ARBITRATION") || concept.startsWith("C_DISCIPLINE")) return "Due process";
  if (concept.startsWith("C_PREMIUM")) return "Premium pay";
  if (concept.startsWith("C_WAGE")) return "Wages";
  if (concept.startsWith("C_HEALTH")) return "Health";
  if (concept.startsWith("C_JOB_SECURITY")) return "Job security";
  if (concept.startsWith("C_UNION")) return "Union voice";
  if (concept.startsWith("C_RETIREMENT")) return "Retirement/external funds";
  if (concept.startsWith("C_SENIORITY") || concept.startsWith("C_JOB_POSTING") || concept.startsWith("C_RECOGNITION")) return "Scope/seniority/mobility";
  if (concept.startsWith("C_SAFETY")) return "Safety";
  if (concept.startsWith("C_TIME") || concept.startsWith("C_WORKLOAD")) return "Scheduling/workload";
  return record.family_label || "Other provisions";
};

const groupByFamily = (records) => {
  const groups = new Map();
  records.forEach((record) => {
    const family = familyName(record);
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push(record);
  });
  return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
};

const HELP = {
  domainScores: "Domain profiles summarize provisions with local draft scores. A blank cell means no local scalar score is available; it is not a zero.",
  scoreability: "Score-ready provisions have enough CBA-contained evidence for a draft local score. Other provisions are retained as profile, external-source, common-unit, or review cases.",
  rejected: "Values the protocol saw but refused to use, usually because they were the wrong object, lacked support, or came from context rather than an operative provision.",
  novelty: "Provision material that did not fit cleanly into the fixed concept library for this run.",
  diagnosticsScored: "Provisions with a draft numeric scalar score. These are ingredients for domain profiles, not a final CBA-level index.",
  diagnosticsMissingScore: "Provisions labelled score-ready by the run but missing a numeric draft score in the exported matrix. These need score fill-in or central review before analysis.",
  diagnosticsWithheld: "Extracted provisions with useful fields and evidence but no local scalar score assigned.",
  diagnosticsRejected: "Candidate values intentionally excluded from scoring or fields.",
  matrixDash: "A dash means no local score appears in this matrix. The provision may be absent, recorded/profile only, external, or handled in Relative metrics.",
  duplicateQc: "Ten documents were read twice. These counts classify duplicate-reader differences by what they would change for measurement."
};

function useSiteData() {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      Object.entries(DATASETS).map(([key, url]) =>
        fetch(url).then((response) => {
          if (!response.ok) throw new Error(`Could not load ${url}`);
          return response.json().then((payload) => [key, payload]);
        })
      )
    )
      .then((entries) => {
        if (!cancelled) setState({ loading: false, error: null, data: Object.fromEntries(entries) });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: error.message, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function V51Router({ view, onNavigate }) {
  const { loading, error, data } = useV51Data();
  if (loading) return <div className="loading" style={{ padding: 40, textAlign: "center" }}>Loading v5.1 data…</div>;
  if (error) return <div className="error" style={{ padding: 40, color: "#c8533d" }}>Error loading v5.1 data: {error}</div>;
  if (view === "overview_v51") return <OverviewV51 data={data} onNavigate={onNavigate} />;
  if (view === "validation_v51") return <ValidationPanel data={data} />;
  if (view === "reliability_v51") return <ReliabilityPanel data={data} />;
  if (view === "sector_v51") return <SectorPage data={data} />;
  if (view === "composite_v51") return <CompositeRanking data={data} />;
  if (view === "ontology_v51") return <OntologyBrowser data={data} />;
  return null;
}

// Grouped nav: 3 top-level groups, each with a dropdown of view options.
const NAV_GROUPS = [
  {
    key: "results",
    label: "Results",
    items: [
      ["overview_v51", "Overview"],
      ["sector_v51", "Sector × area"],
      ["composite_v51", "Composite ranking"],
    ],
  },
  {
    key: "method",
    label: "Method",
    items: [
      ["validation_v51", "Agentic validation"],
      ["reliability_v51", "Reliability"],
      ["ontology_v51", "Ontology"],
    ],
  },
  {
    key: "browse",
    label: "Browse contracts",
    items: [
      ["documents", "Documents (v3 explorer)"],
      ["domains", "Domains"],
      ["relative", "Relative metrics"],
      ["parallel", "Parallel comparison"],
      ["diagnostics", "Diagnostics"],
    ],
  },
];

function NavGroup({ group, currentView, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const isActive = group.items.some(([id]) => id === currentView);
  const activeLabel = group.items.find(([id]) => id === currentView)?.[1];
  return (
    <div className="v51NavGroup" ref={ref}>
      <button
        className={`v51NavGroupTrigger ${isActive ? "active" : ""}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {group.label}
        {isActive && activeLabel && <span style={{ opacity: 0.85, marginLeft: 6 }}>· {activeLabel}</span>}
        <span className="navChevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="v51NavDropdown" role="menu">
          {group.items.map(([id, label]) => (
            <button
              key={id}
              role="menuitem"
              className={currentView === id ? "active" : ""}
              onClick={() => { onSelect(id); setOpen(false); }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const { loading, error, data } = useSiteData();
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState("All");
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get("view") || "overview_v51");
  const [domainFilter, setDomainFilter] = useState("All");
  const [metricFilter, setMetricFilter] = useState("All");
  const [rankFilter, setRankFilter] = useState("All");

  useEffect(() => {
    if (!selectedId && data?.documents?.length) setSelectedId(data.documents[0].document_id);
  }, [data, selectedId]);

  if (loading) return <div className="boot">Loading CBA pilot data…</div>;
  if (error) return <div className="boot error">Data load failed: {error}</div>;

  const selected = data.documents.find((doc) => doc.document_id === selectedId) ?? data.documents[0];
  const records = data.records[selected.document_id] ?? [];
  const scores = data.scores[selected.document_id] ?? [];
  const rejected = data.rejected[selected.document_id] ?? [];
  const novelty = data.novelty[selected.document_id] ?? [];

  const filteredDocs = data.documents.filter((doc) => {
    const stats = documentStats(doc, data.records, data.scores);
    const haystack = [doc.document_id, doc.employer, doc.union, doc.industry, doc.sector, doc.location]
      .join(" ")
      .toLowerCase();
    const matchesQuery = haystack.includes(query.toLowerCase());
    const matchesFilter =
      docFilter === "All" ||
      (docFilter === "scored" && stats.scored > 0) ||
      (docFilter === "missing_score" && stats.missingScore > 0) ||
      (docFilter === "withheld" && stats.withheld > 0 && stats.scored === 0) ||
      (docFilter === "review" && stats.review > 0) ||
      (docFilter === "rejected" && stats.rejected > 0);
    return matchesQuery && matchesFilter;
  });

  return (
    <main>
      <header className="masthead">
        <div>
          <p className="smallcaps">CBA generosity measurement, v5.1 pipeline</p>
          <h1>Scoring U.S. collective bargaining agreement generosity at scale</h1>
          <p className="mastCopy">A language-model pipeline that assigns each contract a 0–1 generosity score on nine provision areas, with agentic validation against three reference points. 100-contract wave-1 results below; the v3 document explorer is retained as a separate tab.</p>
        </div>
        <div className="mastStats">
          <Stat label="Contracts" value={100} />
          <Stat label="Scored cells" value="857" />
          <Stat label="Agentic ρ" value="0.77–0.85" />
        </div>
      </header>

      <div className="shell">
        <nav className="tabs" aria-label="Main views" style={{ display: "flex", gap: 6 }}>
          {NAV_GROUPS.map(group => (
            <NavGroup
              key={group.key}
              group={group}
              currentView={view}
              onSelect={setView}
            />
          ))}
        </nav>
        <details className="readGuide">
          <summary>Measurement guide</summary>
          <p>
            Provisions are extracted contract objects. Some receive draft local scores. Others are retained as profile evidence, external-source
            cases, common-unit cases, or review cases. Relative metrics rank only values with comparable units.
          </p>
        </details>

        {view.endsWith("_v51") && <V51Router view={view} onNavigate={setView} />}

        {view === "documents" && (
        <section className="workspace">
          <aside className="sidebar">
            <details className="docBrowser">
              <summary>Documents</summary>
              <div className="docControls">
                <input
                  className="search"
                  value={query}
                  placeholder="Search documents"
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="miniChipRail" aria-label="Document filter">
                  {DOCUMENT_FILTERS.map(([value, label]) => (
                    <button
                      key={value}
                      className={docFilter === value ? "active" : ""}
                      onClick={() => setDocFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="docList">
                {filteredDocs.map((doc) => (
                  <button
                    key={doc.document_id}
                    className={`docButton ${doc.document_id === selected.document_id ? "selected" : ""}`}
                    onClick={() => setSelectedId(doc.document_id)}
                  >
                    <span>{doc.document_id}</span>
                    <strong>{doc.employer}</strong>
                    <em>{doc.year || "year unknown"} · {doc.sector || "sector unknown"}</em>
                  </button>
                ))}
              </div>
            </details>
          </aside>
          <DocumentPanel doc={selected} records={records} scores={scores} rejected={rejected} novelty={novelty} />
        </section>
        )}

        {view === "domains" && (
          <DomainExplorer
            documents={data.documents}
            status={data.status}
            matrix={data.matrix}
            domainFilter={domainFilter}
            setDomainFilter={setDomainFilter}
            onSelectDocument={(id) => {
              setSelectedId(id);
              setView("documents");
            }}
          />
        )}

        {view === "relative" && (
          <RelativeMetrics
            documents={data.documents}
            rows={data.normalizedMetrics}
            summary={data.normalizationSummary}
            metricFilter={metricFilter}
            setMetricFilter={setMetricFilter}
            rankFilter={rankFilter}
            setRankFilter={setRankFilter}
            onSelectDocument={(id) => {
              setSelectedId(id);
              setView("documents");
            }}
          />
        )}

        {view === "parallel" && (
          <ParallelComparison
            comparison={data.parallel}
            onSelectDomain={(domain) => {
              setDomainFilter(domain);
              setView("domains");
            }}
          />
        )}

        {view === "diagnostics" && (
          <Diagnostics
            documents={data.documents}
            records={data.records}
            scores={data.scores}
            rejected={data.rejected}
            manifest={data.manifest}
            batch={data.batch}
            duplicateQc={data.duplicateQc}
          />
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{format(value, 0)}</strong>
    </div>
  );
}

function Info({ text }) {
  return (
    <span className="info" tabIndex="0" aria-label={text}>
      i
      <span className="tip">{text}</span>
    </span>
  );
}

function DocumentPanel({ doc, records, scores, rejected, novelty }) {
  const [panelView, setPanelView] = useState(() => new URLSearchParams(window.location.search).get("panel") || "overview");
  const [recordQuery, setRecordQuery] = useState("");
  const [recordStatus, setRecordStatus] = useState("All");
  const [recordSubtype, setRecordSubtype] = useState("All");
  const [selectedFamily, setSelectedFamily] = useState(null);

  const scoreByRecord = useMemo(() => {
    const map = new Map();
    scores.forEach((score) => map.set(score.concept_record_id, score));
    return map;
  }, [scores]);

  const filteredRecords = records.filter((record) => {
    const score = scoreByRecord.get(record.concept_record_id);
    const category = provisionStatus(record, score)[2];
    const subtype = recordedOnlySubtype(record, score);
    const haystack = [
      record.concept_id,
      record.concept_label,
      record.family_label,
      record.covered_group,
      record.beneficiary_or_affected_group,
      subtype
    ]
      .join(" ")
      .toLowerCase();
    return (
      haystack.includes(recordQuery.toLowerCase()) &&
      (recordStatus === "All" || category === recordStatus) &&
      (recordSubtype === "All" || subtype === recordSubtype)
    );
  });

  const scoredCount = records.filter((record) => hasNumericScore(scoreValue(record, scoreByRecord.get(record.concept_record_id)))).length;
  const withheldCount = records.filter((record) => provisionStatus(record, scoreByRecord.get(record.concept_record_id))[2] === "withheld").length;
  const provisionGroups = groupByFamily(filteredRecords);
  const allProvisionGroups = groupByFamily(records);
  const activeFamily = selectedFamily && provisionGroups.some(([family]) => family === selectedFamily)
    ? selectedFamily
    : provisionGroups[0]?.[0] ?? null;
  const activeFamilyRows = filteredRecords.filter((record) => familyName(record) === activeFamily);
  const domainMean = doc.domain_scores
    .map((domain) => domain.available_score)
    .filter(hasNumericScore);
  const avgDomainScore = domainMean.length
    ? domainMean.reduce((sum, score) => sum + Number(score), 0) / domainMean.length
    : null;

  return (
    <section className="detail">
      <div className="documentHeader">
        <div>
          <p className="smallcaps">{doc.document_id}</p>
          <h2>{doc.employer}</h2>
          <p>{doc.union}</p>
        </div>
        <div className="metaGrid">
          <span>{doc.length_stratum || doc.sector || "Length unknown"}</span>
          <span>{doc.duplicate_read ? "duplicate-read QC" : "single read"}</span>
          <span>{format(doc.ocr_chars, 0)} OCR chars</span>
          <span>{doc.page_count} pages</span>
        </div>
      </div>

      <div className="panelTabs" role="tablist" aria-label="Document views">
        {[
          ["overview", "Overview"],
          ["source", "Source"],
          ["provisions", "Provisions"],
          ["audit", "Checks"]
        ].map(([id, label]) => (
          <button key={id} className={panelView === id ? "active" : ""} onClick={() => setPanelView(id)}>
            {label}
          </button>
        ))}
      </div>

      {panelView === "overview" && (
        <div className="overviewGrid">
          <section className="overviewBlock">
            <div className="scoreHeader">
              <h3>Domain profiles</h3>
              <Info text={HELP.domainScores} />
            </div>
            <div className="summaryLine">
              <span><strong>{format(avgDomainScore)}</strong> mean draft domain score</span>
              <span><strong>{records.length}</strong> provisions</span>
              <span><strong>{doc.scored_record_count ?? 0}</strong> score-ready</span>
              <span><strong>{scoredCount}</strong> local scores</span>
              <span><strong>{withheldCount}</strong> score withheld</span>
              <span><strong>{rejected.length}</strong> rejected values</span>
            </div>
            <div className="scoreStrip compact">
              {doc.domain_scores.map((domain) => (
                <div className="domainScore" key={domain.domain}>
                  <span>{domain.domain}</span>
                  <strong>{format(domain.available_score)}</strong>
                  <em>{hasNumericScore(domain.available_score) ? `${format(domain.coverage_share, 1)} coverage` : "no local score"}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="overviewBlock">
            <div className="paneHeader">
              <div>
                <h3>Provision families</h3>
              </div>
            </div>
            <div className="familyList">
              {allProvisionGroups.map(([family, rows]) => (
                <FamilySummary
                  key={family}
                  family={family}
                  rows={rows}
                  scoreByRecord={scoreByRecord}
                  onOpen={() => {
                    setSelectedFamily(family);
                    setPanelView("provisions");
                  }}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      {panelView === "source" && (
        <div className="singlePanel">
          <div className="paneHeader">
            <div>
              <h3>Source preview</h3>
              <p>OCR text used by the document reader. The preview is scrollable inside this panel.</p>
            </div>
          </div>
          <div className="viewerWrap">
            <OcrFrame url={doc.ocr_url} />
          </div>
        </div>
      )}

      {panelView === "provisions" && (
        <div className="singlePanel">
          <div className="paneHeader compactFilters">
            <div>
              <h3>Extracted provisions <Info text={HELP.scoreability} /></h3>
              <p>{filteredRecords.length} shown from {records.length}</p>
            </div>
            <input
              className="search"
              value={recordQuery}
              placeholder="Search provisions"
              onChange={(event) => setRecordQuery(event.target.value)}
            />
            <div className="statusChipRail" aria-label="Provision status filter">
              {STATUS_FILTERS.map(([status, label]) => (
                <button
                  key={status}
                  className={recordStatus === status ? "active" : ""}
                  onClick={() => setRecordStatus(status)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="statusChipRail subtypeRail" aria-label="Non-scored provision subtype filter">
              {SUBTYPE_FILTERS.map(([status, label]) => (
                <button
                  key={status}
                  className={recordSubtype === status ? "active" : ""}
                  onClick={() => setRecordSubtype(status)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="provisionBrowser">
            <aside className="provisionFamilyNav">
              {provisionGroups.map(([family, rows]) => (
                <FamilySummary
                  key={family}
                  family={family}
                  rows={rows}
                  scoreByRecord={scoreByRecord}
                  selected={family === activeFamily}
                  onOpen={() => {
                    setSelectedFamily(family);
                  }}
                />
              ))}
            </aside>
            <div className="provisionDetailPane">
              {activeFamily ? (
                <ProvisionFamily family={activeFamily} rows={activeFamilyRows} scoreByRecord={scoreByRecord} />
              ) : null}
            </div>
            {!filteredRecords.length && <Empty text="No provisions match these filters." />}
          </div>
        </div>
      )}

      {panelView === "audit" && (
        <div className="singlePanel">
          <div className="paneHeader">
            <div>
              <h3>Checks</h3>
            </div>
          </div>
          <div className="auditGrid">
            <AuditList title="Rejected values" rows={rejected} help={HELP.rejected} />
            <AuditList title="Novelty items" rows={novelty} help={HELP.novelty} />
          </div>
        </div>
      )}
    </section>
  );
}

function OcrFrame({ url }) {
  const [text, setText] = useState("Loading OCR text…");
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((response) => response.text())
      .then((body) => {
        if (!cancelled) setText(body);
      })
      .catch(() => {
        if (!cancelled) setText("OCR text could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return <pre className="ocrText">{text}</pre>;
}

function FamilySummary({ family, rows, scoreByRecord, onOpen, selected = false }) {
  const scored = rows.filter((record) => hasNumericScore(scoreValue(record, scoreByRecord.get(record.concept_record_id))));
  const withheld = rows.filter((record) => provisionStatus(record, scoreByRecord.get(record.concept_record_id))[2] === "withheld").length;
  return (
    <button className={`familyRow ${selected ? "selected" : ""}`} onClick={onOpen}>
      <div>
        <strong>{family}</strong>
        <span>{rows.length} provisions · {scored.length} local scores{withheld ? ` · ${withheld} score withheld` : ""}</span>
      </div>
      <span>{scored.length ? format(scored.reduce((sum, record) => sum + Number(scoreValue(record, scoreByRecord.get(record.concept_record_id))), 0) / scored.length) : "—"}</span>
    </button>
  );
}

function ProvisionFamily({ family, rows, scoreByRecord }) {
  const scored = rows.filter((record) => hasNumericScore(scoreValue(record, scoreByRecord.get(record.concept_record_id))));
  return (
    <section className="provisionFamily">
      <div className="familyHeader">
        <div>
          <h4>{family}</h4>
          <p>{rows.length} provisions · {scored.length} local scores</p>
        </div>
      </div>
      <div className="provisionRows">
        {rows.map((record) => (
          <RecordCard key={record.concept_record_id} record={record} score={scoreByRecord.get(record.concept_record_id)} />
        ))}
      </div>
    </section>
  );
}

function RecordCard({ record, score }) {
  const fields = record.fields ?? [];
  const info = scoreabilityInfo(record, score);
  const status = info.status ?? "unknown";
  const [statusLabel, statusClass] = provisionStatus(record, score);
  const statusDetail = recordedOnlySubtype(record, score);
  const shownFields = fields.slice(0, 3);
  const hiddenFields = fields.slice(3);
  const scoreShown = scoreValue(record, score);
  const scored = hasNumericScore(scoreShown);
  return (
    <details className="recordCard">
      <summary>
        <div className="provisionRow">
          <div>
            <h4>{record.concept_label}</h4>
            <p>{record.covered_group || record.beneficiary_or_affected_group || "No covered group stated."}</p>
          </div>
          <span className={`statusText ${statusClass}`}>
            {statusLabel}
            {statusDetail ? <em>{statusDetail}</em> : null}
          </span>
          <span className={`scoreBadge ${scored ? "scored" : ""}`}>
            <em>Score</em>
            <strong>{scored ? `${format(scoreShown)} / 5` : "—"}</strong>
          </span>
        </div>
      </summary>
      {score?.explanation && (
        <p className="explain">
          <strong>Score reason:</strong> {score.explanation}
        </p>
      )}
      {score?.analysis_correction_applied && (
        <p className="correctionNote">
          <strong>Audit correction:</strong>{" "}
          {score.analysis_correction_applied === "source_reread_blocker"
            ? "Local score withheld until the source pointer is reread."
            : "Local score withheld because this is an external contribution/proxy rather than a direct worker cost term."}
          {score.analysis_original_draft_score ? ` Original worker score: ${format(score.analysis_original_draft_score)} / 5.` : ""}
        </p>
      )}
      {info.reason && (
        <p className="whyLine">
          <strong>{statusDetail ? `Why ${statusDetail.toLowerCase()}:` : "Why:"}</strong>{" "}
          {formatNestedValue(info.reason)}
        </p>
      )}
      <div className="fields">
        {shownFields.map((field, index) => (
          <div className="field" key={`${field.field_name}-${index}`}>
            <strong>{formatFieldLabel(field.field_name)}</strong>
            <FieldValue value={field.value} />
            <em>{field.evidence?.quote_or_pointer || field.evidence?.page || "No evidence pointer"}</em>
          </div>
        ))}
        {!!hiddenFields.length && (
          <details className="moreFields">
            <summary>Show {hiddenFields.length} more fields</summary>
            {hiddenFields.map((field, index) => (
              <div className="field" key={`${field.field_name}-hidden-${index}`}>
                <strong>{formatFieldLabel(field.field_name)}</strong>
                <FieldValue value={field.value} />
                <em>{field.evidence?.quote_or_pointer || field.evidence?.page || "No evidence pointer"}</em>
              </div>
            ))}
          </details>
        )}
      </div>
      <details className="technicalDetails">
        <summary>Technical details</summary>
        <div className="recordFacts">
          <span>Concept ID: {record.concept_id}</span>
          <span>Internal status: {status}</span>
          <span>Role: {record.aggregation_role || "—"}</span>
          <span>Class: {record.concept_reporting_class || "—"}</span>
        </div>
      </details>
    </details>
  );
}

function FieldValue({ value }) {
  if (value === null || value === undefined || value === "") return <span>—</span>;

  if (Array.isArray(value)) {
    return (
      <div className="valueChips">
        {value.map((item, index) => <span key={index}>{String(item)}</span>)}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    const childKeys = entries
      .filter(([, child]) => child && typeof child === "object" && !Array.isArray(child))
      .map(([, child]) => Object.keys(child));
    const tableKeys = Array.from(new Set(childKeys.flat()));
    const isTable = entries.length > 1 && childKeys.length === entries.length && tableKeys.length > 0 && tableKeys.length <= 6;

    if (isTable) {
      return (
        <table className="valueTable">
          <thead>
            <tr>
              <th>Period</th>
              {tableKeys.map((key) => <th key={key}>{formatFieldLabel(key)}</th>)}
            </tr>
          </thead>
          <tbody>
            {entries.map(([rowLabel, child]) => (
              <tr key={rowLabel}>
                <td>{formatFieldLabel(rowLabel)}</td>
                {tableKeys.map((key) => <td key={key}>{format(child[key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    return (
      <div className="keyValueGrid">
        {entries.map(([key, child]) => (
          <React.Fragment key={key}>
            <b>{formatFieldLabel(key)}</b>
            <span>{formatNestedValue(child)}</span>
          </React.Fragment>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

function formatNestedValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map(formatNestedValue).join("; ");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, child]) => `${formatFieldLabel(key)}: ${formatNestedValue(child)}`)
      .join("; ");
  }
  return format(value);
}

function AuditList({ title, rows, help }) {
  return (
    <div>
      <h4>{title} {help ? <Info text={help} /> : null}</h4>
      {!rows.length && <p className="mutedText">None recorded.</p>}
      {rows.slice(0, 30).map((row, index) => (
        <AuditItem row={row} key={index} />
      ))}
    </div>
  );
}

function AuditItem({ row }) {
  const isRejectedValue = !!row.candidate_field || !!row.candidate_value;
  const title = isRejectedValue
    ? humanizeId(row.concept_id || row.candidate_field || "Candidate value")
    : row.candidate_object || row.novelty_label || "Novelty item";
  const reason = row.reason_rejected || row.reason_no_fixed_concept_fit || row.reason || row.description;
  const evidence = row.source_pointer || row.evidence_pointer;
  const classes = row.error_classes || row.error_class;
  const classList = Array.isArray(classes) ? classes : classes ? [classes] : [];

  return (
    <div className="auditItem">
      <div className="auditTitle">
        <strong>{title}</strong>
        {!!classList.length && <span>{classList.map(humanizeId).join(", ")}</span>}
      </div>
      {isRejectedValue && (
        <p>
          <b>{humanizeId(row.candidate_field || "Candidate")}:</b>{" "}
          {String(row.candidate_value ?? "not stated")}
        </p>
      )}
      {reason && <p>{reason}</p>}
      {evidence && <em>{evidence}</em>}
    </div>
  );
}

function DomainExplorer({ documents, status, matrix, domainFilter, setDomainFilter, onSelectDocument }) {
  const conceptIds = Object.keys(matrix[0] ?? {}).filter((key) => key !== "document_id");
  const domainOptions = [
    ["LEAVE", "Leave"],
    ["PREMIUM", "Premium pay"],
    ["GRIEVANCE|ARBITRATION|DISCIPLINE", "Due process"],
    ["JOB_SECURITY", "Job security"],
    ["WAGE", "Wages"],
    ["HEALTH", "Health"],
    ["SAFETY", "Safety"],
    ["UNION", "Union voice"]
  ];
  const activeDomain = domainFilter === "All" ? domainOptions[0][0] : domainFilter;
  const activeLabel = domainOptions.find(([value]) => value === activeDomain)?.[1] ?? displayLabel(activeDomain);
  const domainConcepts = (value) => {
    const tokens = value.split("|");
    return conceptIds.filter((id) => tokens.some((token) => id.includes(token)));
  };
  const visibleConcepts = domainConcepts(activeDomain);
  const filledCells = matrix.reduce(
    (count, row) => count + visibleConcepts.filter((id) => hasNumericScore(row[id])).length,
    0
  );
  const possibleCells = matrix.length * visibleConcepts.length;
  const scoredDocumentRows = matrix
    .map((row) => {
      const values = visibleConcepts.map((id) => row[id]).filter(hasNumericScore).map(Number);
      return {
        ...row,
        visibleValues: values,
        domainAverage: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
      };
    })
    .filter((row) => row.visibleValues.length > 0)
    .sort((a, b) => Number(b.domainAverage ?? -1) - Number(a.domainAverage ?? -1));
  const statusByDomain = new Map(status.map((item) => [item.domain, item]));
  const activeStatus = statusByDomain.get(activeLabel) ?? status.find((item) => activeLabel.includes(item.domain));

  return (
    <section className="panel">
      <div className="sectionHeader">
        <div>
          <h2>Domain explorer</h2>
          <p>Choose a provision family, then inspect the local scores behind it. Blank cells are not zeroes; some values are retained as profiles or relative metrics.</p>
        </div>
      </div>
      <div className="domainExplorer">
        <aside className="domainRail">
          {domainOptions.map(([value, label]) => {
            const domain = statusByDomain.get(label);
            const concepts = domainConcepts(value);
            const scoreCells = matrix.reduce((count, row) => count + concepts.filter((id) => hasNumericScore(row[id])).length, 0);
            return (
              <button
                key={value}
                className={`domainRailItem ${activeDomain === value ? "active" : ""}`}
                onClick={() => setDomainFilter(value)}
              >
                <span className={`pill ${statusTone(domain?.current_status || "")}`}>{domain?.current_status || "local scores"}</span>
                <strong>{label}</strong>
                <em>{domain?.documents_with_records ?? "—"} docs with provisions · {scoreCells} score cells</em>
              </button>
            );
          })}
        </aside>
        <div className="domainWorkspace">
          <div className="domainHero">
            <div>
              <span className={`pill ${statusTone(activeStatus?.current_status || "")}`}>{activeStatus?.current_status || "local scores"}</span>
              <h3>{activeLabel}</h3>
              <p>{activeStatus?.empirical_object || "Local score drilldown for selected provisions."}</p>
            </div>
            <div className="domainMetrics">
              <span><strong>{scoredDocumentRows.length}</strong> docs with local scores</span>
              <span><strong>{visibleConcepts.length}</strong> concepts</span>
              <span><strong>{filledCells}</strong> score cells</span>
              <span><strong>{possibleCells - filledCells}</strong> blanks <Info text={HELP.matrixDash} /></span>
            </div>
          </div>
          <div className="domainConceptRail" aria-label="Concepts in selected domain">
            {visibleConcepts.length
              ? visibleConcepts.map((id) => <span key={id}>{humanizeId(id)}</span>)
              : <span>No local-score concepts in this matrix</span>}
          </div>
          {scoredDocumentRows.length ? (
            <div className="matrixWrap domainMatrixWrap">
              <table className="matrix domainMatrix">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Domain mean</th>
                    {visibleConcepts.map((id) => <th key={id}>{humanizeId(id)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {scoredDocumentRows.map((row) => {
                    const doc = documents.find((item) => item.document_id === row.document_id);
                    return (
                      <tr key={row.document_id}>
                        <td>
                          <button className="linkButton" onClick={() => onSelectDocument(row.document_id)}>
                            {row.document_id}
                          </button>
                          <small>{doc?.employer}</small>
                        </td>
                        <td className="scoredCell domainMeanCell">{format(row.domainAverage)}</td>
                        {visibleConcepts.map((id) => (
                          <td key={id} className={hasNumericScore(row[id]) ? "scoredCell" : "blankCell"}>
                            {format(row[id])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty domainEmpty">
              No local score matrix rows for this family. In this proof of concept, these provisions are mainly handled as recorded/profile evidence or relative metrics.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RelativeMetrics({ documents, rows, summary, metricFilter, setMetricFilter, rankFilter, setRankFilter, onSelectDocument }) {
  const docById = new Map(documents.map((doc) => [doc.document_id, doc]));
  const metricOptions = [
    ["All", "All"],
    ...Array.from(new Set(rows.map((row) => row.metric_family))).sort().map((metric) => [metric, displayLabel(metric)])
  ];
  const rankOptions = [
    ["All", "All rows"],
    ["ranked", "Ranked only"],
    ["retained", "Retained, not ranked"]
  ];
  const visible = rows
    .filter((row) => metricFilter === "All" || row.metric_family === metricFilter)
    .filter((row) => {
      const isRanked = row.pilot_percentile !== "" && row.pilot_percentile !== null && row.pilot_percentile !== undefined;
      return rankFilter === "All" || (rankFilter === "ranked" && isRanked) || (rankFilter === "retained" && !isRanked);
    })
    .sort((a, b) => {
      const ap = Number(a.pilot_percentile);
      const bp = Number(b.pilot_percentile);
      if (Number.isFinite(bp) || Number.isFinite(ap)) return (Number.isFinite(bp) ? bp : -1) - (Number.isFinite(ap) ? ap : -1);
      return a.document_id.localeCompare(b.document_id);
    });
  const ranked = rows.filter((row) => row.pilot_percentile !== "" && row.pilot_percentile !== null && row.pilot_percentile !== undefined);

  return (
    <section className="panel">
      <div className="sectionHeader">
        <div>
          <h2>Relative metrics</h2>
          <p>Common-unit comparisons for wages, active health contribution burden, and external-fund contribution proxies. Values are ranked only when the unit and comparison object are clear.</p>
        </div>
      </div>
      <div className="matrixSummary">
        <span><strong>{rows.length}</strong> estimated rows</span>
        <span><strong>{ranked.length}</strong> ranked rows</span>
        <span><strong>{summary.length}</strong> metric families</span>
      </div>
      <div className="metricLegend" aria-label="Confidence tier guide">
        <span><strong>A</strong> direct comparable value</span>
        <span><strong>B</strong> rankable proxy</span>
        <span><strong>C</strong> retained, unit/object unclear</span>
        <span><strong>D</strong> no usable numeric value</span>
      </div>
      <div className="chipRail" aria-label="Relative metric filter">
        {metricOptions.map(([value, label]) => (
          <button
            key={value}
            className={metricFilter === value ? "active" : ""}
            onClick={() => setMetricFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="chipRail tightRail" aria-label="Rank status filter">
        {rankOptions.map(([value, label]) => (
          <button
            key={value}
            className={rankFilter === value ? "active" : ""}
            onClick={() => setRankFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="statusGrid compactStatusGrid">
        {summary.map((item) => (
          <div className="statusCard" key={item.metric_family}>
            <span className="pill cool">{displayLabel(item.metric_family)}</span>
            <h3>{item.ranked_records ?? item.comparable_or_proxy_records} ranked</h3>
            <p>{item.records} records across {item.documents} documents</p>
            <p>{Object.entries(item.tier_counts || {}).map(([tier, count]) => `${tier}: ${count}`).join(" · ")}</p>
            <small>{Object.entries(item.comparison_units || {}).map(([unit, count]) => `${displayLabel(unit)}: ${count}`).join(" · ") || "No comparable unit yet"}</small>
          </div>
        ))}
      </div>
      <div className="docAuditWrap">
        <table className="docAudit">
          <thead>
            <tr>
              <th>Document</th>
              <th>Metric</th>
              <th>Value</th>
              <th>Ranked percentile</th>
              <th>Confidence</th>
              <th>Rank status</th>
              <th>Coverage</th>
              <th>Method</th>
              <th>Why not ranked</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 160).map((row, index) => (
              <tr key={`${row.document_id}-${row.concept_record_id}-${row.metric_family}-${index}`}>
                <td>
                  <button className="linkButton" onClick={() => onSelectDocument(row.document_id)}>{row.document_id}</button>
                  <small>{docById.get(row.document_id)?.employer}</small>
                </td>
                <td>{displayLabel(row.metric_family)}</td>
                <td>
                  <strong>{format(row.normalized_value)}</strong>
                  <small>{displayLabel(row.value_unit)}</small>
                </td>
                <td>{format(row.pilot_percentile, 1)}</td>
                <td><span className={`tierBadge tier${row.confidence_tier}`}>{row.confidence_tier || "—"}</span></td>
                <td>{displayLabel(row.normalization_status)}</td>
                <td>{displayLabel(row.coverage_flag)}</td>
                <td>{displayLabel(row.normalization_method)}</td>
                <td>{row.rank_exclusion_reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ParallelComparison({ comparison, onSelectDomain }) {
  const rows = comparison.rows ?? [];
  const comparisonBuckets = [
    {
      title: "Presence",
      text: "Do both pipelines find worker-facing material in the same broad area?"
    },
    {
      title: "Ranking",
      text: "Where both sides produce comparable scores, do category rankings move together?"
    },
    {
      title: "Disagreement",
      text: "When rankings differ, inspect Matthew's category summary beside v3 provisions and rejected values."
    }
  ];
  const domainLink = (category) => {
    const links = {
      Compensation: "WAGE",
      Scheduling: "SCHED",
      Leave: "LEAVE",
      Healthcare: "HEALTH",
      Security: "JOB_SECURITY",
      Disputes: "GRIEVANCE|ARBITRATION|DISCIPLINE",
      Safety: "SAFETY"
    };
    return links[category] ?? null;
  };

  return (
    <section className="panel parallelPanel">
      <div className="sectionHeader parallelHeader">
        <div>
          <h2>Parallel comparison</h2>
          <p>
            Matthew's ACL draft uses a scalable category-ranking pipeline. This page shows how those broad categories map onto the v3
            provision-level objects. Numeric agreement will be added once we have per-document category outputs for the same CBAs.
          </p>
        </div>
        <span className="decisionBadge pending">Design only</span>
      </div>

      <div className="parallelHero">
        <div>
          <span className="pill cool">Independent benchmark</span>
          <h3>What this comparison is for</h3>
          <p>
            The point is not to collapse the two methods into one number immediately. The useful test is whether a cheaper,
            broad-category pipeline and an auditable provision-level pipeline tell the same story, and where their disagreements
            reveal missing extraction, category mismatch, compression loss, or real ambiguity.
          </p>
        </div>
        <div className="neededCard">
          <strong>Needed before numeric comparison</strong>
          <p>{comparison.needed_file}</p>
        </div>
      </div>

      <div className="parallelSteps">
        {comparisonBuckets.map((item) => (
          <div className="parallelStep" key={item.title}>
            <strong>{item.title}</strong>
            <p>{item.text}</p>
          </div>
        ))}
      </div>

      <div className="crosswalkGrid">
        {rows.map((row) => {
          const linkedDomain = domainLink(row.category);
          return (
            <article className="crosswalkCard" key={row.category}>
              <div className="crosswalkTitle">
                <div>
                  <span className="smallcaps">{row.comparison_level}</span>
                  <h3>{row.category}</h3>
                </div>
                {linkedDomain ? (
                  <button className="linkPill" onClick={() => onSelectDomain(linkedDomain)}>
                    Open v3 domain
                  </button>
                ) : null}
              </div>
              <p className="matthewObject">{row.matthew_object}</p>
              <div className="crosswalkMeta">
                <strong>v3 area</strong>
                <span>{row.v3_area}</span>
              </div>
              <div className="conceptChipList">
                {row.v3_concepts.length
                  ? row.v3_concepts.map((concept) => <span key={concept}>{humanizeId(concept)}</span>)
                  : <span>No one-to-one v3 concept yet</span>}
              </div>
              <p className="crosswalkNote">{row.note}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Diagnostics({ documents, records, scores, rejected, manifest, batch, duplicateQc }) {
  try {
  const dispositionCounts = new Map();
  const subtypeCounts = new Map();
  const rejectedCounts = new Map();
  const documentRows = documents.map((doc) => {
    const rows = records[doc.document_id] ?? [];
    const scoreByRecord = new Map((scores[doc.document_id] ?? []).map((score) => [score.concept_record_id, score]));
    const categoryFor = (record) => provisionStatus(record, scoreByRecord.get(record.concept_record_id))[2];
    const scored = rows.filter((record) => hasNumericScore(scoreValue(record, scoreByRecord.get(record.concept_record_id)))).length;
    const missingScore = rows.filter((record) => categoryFor(record) === "missing_score").length;
    const withheld = rows.filter((record) => categoryFor(record) === "withheld").length;
    const recorded = rows.filter((record) => categoryFor(record) === "recorded").length;
    const external = rows.filter((record) => ["external", "normalization"].includes(categoryFor(record))).length;
    const review = rows.filter((record) => categoryFor(record) === "review").length;
    return {
      ...doc,
      scored,
      missingScore,
      withheld,
      recorded,
      external,
      review,
      scoreShare: rows.length ? scored / rows.length : 0
    };
  });

  Object.entries(records).forEach(([documentId, rows]) => {
    const scoreByRecord = new Map((scores[documentId] ?? []).map((score) => [score.concept_record_id, score]));
    rows.forEach((record) => {
      const score = scoreByRecord.get(record.concept_record_id);
      const key = provisionStatus(record, score)[2];
      dispositionCounts.set(key, (dispositionCounts.get(key) ?? 0) + 1);
      const subtype = recordedOnlySubtype(record, score);
      if (subtype) subtypeCounts.set(subtype, (subtypeCounts.get(subtype) ?? 0) + 1);
    });
  });
  Object.values(rejected).flat().forEach((row) => {
    const classes = row.error_classes || row.error_class || ["unknown"];
    const list = Array.isArray(classes) ? classes : [classes];
    list.forEach((item) => rejectedCounts.set(item, (rejectedCounts.get(item) ?? 0) + 1));
  });

  return (
    <section className="panel">
      <div className="sectionHeader">
        <div>
          <h2>Diagnostics</h2>
          <p>Validity checks for provision coverage, local-score availability, rejected values, and duplicate-reader consequences.</p>
        </div>
        <span className={`decisionBadge ${manifest.batch_decision}`}>{humanizeId(manifest.batch_decision || "unknown")}</span>
      </div>
      <div className="diagnosticStats">
        <DiagnosticStat label="Documents" value={documents.length} />
        <DiagnosticStat label="Output folders" value={manifest.intended_output_count} />
        <DiagnosticStat label="Provisions" value={Object.values(records).flat().length} />
        <DiagnosticStat label="Local scores" value={dispositionCounts.get("scored") ?? 0} help={HELP.diagnosticsScored} />
        <DiagnosticStat label="Score-ready gaps" value={dispositionCounts.get("missing_score") ?? 0} help={HELP.diagnosticsMissingScore} />
        <DiagnosticStat label="Rejected values" value={Object.values(rejected).flat().length} help={HELP.diagnosticsRejected} />
      </div>
      <div className="qcGrid">
        <CountCard title={<>Duplicate-read consequences <Info text={HELP.duplicateQc} /></>} counts={new Map(Object.entries(duplicateQc.consequence_counts ?? {}))} />
        <CountCard title="Batch checks" counts={new Map([
          ["Valid outputs", batch.stage_valid_outputs ?? 0],
          ["Schema or file errors", batch.stage_error_count ?? 0],
          ["Required-core ledger issues", batch.ledger_issues ?? 0],
          ["Adjudicated required-core rows", batch.adjudicated_required_core_miss_rows ?? 0],
          ["Adjudicated score/withhold rows", batch.adjudicated_score_withhold_rows ?? 0],
          ["Adjacent-score calibration rows", batch.adjudicated_score_band_calibration_rows ?? 0]
        ])} />
      </div>
      <div className="diagnosticGrid">
        <CountCard title="Provision status" counts={dispositionCounts} />
        <CountCard title="Why local scores are withheld" counts={subtypeCounts} />
        <CountCard title="Rejected-value safeguards" counts={rejectedCounts} />
      </div>
      <div className="docAuditWrap">
        <table className="docAudit">
          <thead>
            <tr>
              <th>Document</th>
              <th>Provisions</th>
              <th>Local scores</th>
              <th>Score-ready gaps</th>
              <th>Score withheld</th>
              <th>External / common units</th>
              <th>Rejected</th>
              <th>Novelty</th>
            </tr>
          </thead>
          <tbody>
            {documentRows.map((doc) => (
              <tr key={doc.document_id} className={doc.scored === 0 && doc.withheld > 0 ? "needsAttention" : ""}>
                <td>
                  <strong>{doc.document_id}</strong>
                  <small>{doc.employer}</small>
                </td>
                <td>{doc.record_count}</td>
                <td>{doc.scored}</td>
                <td>{doc.missingScore}</td>
                <td>{doc.withheld}</td>
                <td>{doc.external}</td>
                <td>{doc.rejected_value_count}</td>
                <td>{doc.novelty_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
  } catch (error) {
    return (
      <section className="panel">
        <div className="sectionHeader">
          <div>
            <h2>Diagnostics</h2>
            <p>Diagnostics could not render. This usually means one exported diagnostic file has an unexpected shape.</p>
          </div>
        </div>
        <pre className="errorBox">{String(error?.message || error)}</pre>
      </section>
    );
  }
}

function DiagnosticStat({ label, value, help }) {
  return (
    <div className="diagnosticStat">
      <span>{label} {help ? <Info text={help} /> : null}</span>
      <strong>{format(value, 0)}</strong>
    </div>
  );
}

function CountCard({ title, counts }) {
  const labelMap = {
    scored: "Scored",
    scored_with_flags: "Scored with caution",
    missing_score: "Score-ready, no draft score",
    withheld: "Recorded, score withheld",
    recorded: "Recorded/profile",
    external: "External inputs needed",
    normalization: "Needs common units",
    review: "Needs review",
    not_scored: "Not scored",
    no_direct_measurement_difference: "No direct measurement difference",
    score_level_calibration: "Score-level calibration",
    scoreability_or_scalar_inclusion_boundary: "Score boundary",
    score_relevant_coverage_miss: "Score-relevant coverage miss",
    coverage_triage_not_confirmed_as_scalar_miss: "Coverage triage, not scalar miss",
    profile_or_context_breadth: "Profile/context breadth",
    true_nonemitter_miss: "True non-emitter miss"
  };
  const displayCounts = new Map();
  Array.from(counts.entries()).forEach(([label, count]) => {
    const displayLabel = labelMap[label] ?? label.replaceAll("_", " ");
    displayCounts.set(displayLabel, (displayCounts.get(displayLabel) ?? 0) + count);
  });
  const rows = Array.from(displayCounts.entries()).sort((a, b) => b[1] - a[1]);
  return (
    <div className="countCard">
      <h3>{title}</h3>
      {rows.map(([label, count]) => (
        <div className="countRow" key={label}>
          <span>{label}</span>
          <strong>{count}</strong>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

createRoot(document.getElementById("root")).render(<App />);
