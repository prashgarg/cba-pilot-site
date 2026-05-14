import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

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
  normalizationSummary: "data/normalization_summary.json"
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
  if (status.includes("score_ready") || status === "scoreable") return "good";
  if (status.includes("candidate") || status.includes("pilot")) return "warn";
  if (status.includes("external") || status.includes("normalization")) return "cool";
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
    record_only: ["Recorded only", "muted", "recorded"],
    framework_only: ["Recorded only", "muted", "recorded"],
    not_scoreable_ambiguous: ["Not scored", "muted", "not_scored"],
    not_scoreable_administrative: ["Not scored", "muted", "not_scored"],
    not_scoreable_external: ["External inputs needed", "cool", "external"],
    normalization_required: ["Needs normalization", "cool", "normalization"],
    requires_agentic_review: ["Needs review", "warn", "review"]
  };
  if (labels[status]) return labels[status];
  if (status.includes("scoreable")) return ["Score-ready, no draft score", "warn", "missing_score"];
  return labels[status] ?? [status.replaceAll("_", " "), "muted", "other"];
};

const recordedOnlySubtype = (record) => {
  const info = scoreabilityInfo(record);
  const status = info.status ?? "";
  const reason = (info.reason ?? "").toLowerCase();
  const missing = (info.missing_or_external_inputs ?? []).join(" ").toLowerCase();
  const role = (record.aggregation_role ?? "").toLowerCase();
  const text = [status, reason, missing, role].join(" ");

  if (status === "not_scoreable_external" || text.includes("external") || text.includes("spd") || text.includes("plan document")) {
    return "Requires external info";
  }
  if (status === "normalization_required" || text.includes("normalization") || text.includes("inflation") || text.includes("wage table")) {
    return "Needs normalization";
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
  if (text.includes("no calibrated") || text.includes("not calibrated") || text.includes("scalar-ready") || text.includes("no scalar") || text.includes("framework") || text.includes("proxy") || text.includes("fixed scalar") || text.includes("scoring rubric") || text.includes("scalar rubric") || text.includes("scalar module")) {
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
  ["withheld", "Structured, no score"],
  ["recorded", "Recorded only"],
  ["external", "External inputs needed"],
  ["normalization", "Needs normalization"],
  ["review", "Needs review"],
  ["not_scored", "Not scored"]
];

const SUBTYPE_FILTERS = [
  ["All", "All subtypes"],
  ["Context", "Context"],
  ["Requires external info", "Requires external info"],
  ["Scoring rule not set", "Scoring rule not set"],
  ["Needs normalization", "Needs normalization"],
  ["Needs review", "Needs review"],
  ["Statutory baseline unclear", "Statutory baseline unclear"],
  ["Avoids double counting", "Avoids double counting"],
  ["Too little entitlement detail", "Too little entitlement detail"],
  ["Kept separate", "Kept separate"]
];

const DOCUMENT_FILTERS = [
  ["All", "All documents"],
  ["scored", "Has scored provisions"],
  ["missing_score", "Score-ready, no draft score"],
  ["withheld", "Structured, no score"],
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
  domainScores: "Domain profiles summarize provisions with numeric draft scores. Blank means no scalar score is available for that family, not zero generosity.",
  scoreability: "Score-ready provisions have enough CBA-contained evidence for a draft scalar score. Structured, no score means the provision was extracted but the scalar score was withheld pending normalization, branch choice, or external inputs.",
  rejected: "Values the protocol saw but refused to use, usually because they were the wrong object, lacked support, or came from context rather than an operative provision.",
  novelty: "Provision material that did not fit cleanly into the fixed concept library for this run.",
  diagnosticsScored: "Provisions with a draft numeric scalar score. These are ingredients for domain profiles, not a final CBA-level index.",
  diagnosticsMissingScore: "Provisions labelled score-ready by the run but missing a numeric draft score in the exported matrix. These need score fill-in or central review before analysis.",
  diagnosticsWithheld: "Extracted provisions with useful fields and evidence but no scalar score assigned.",
  diagnosticsRejected: "Candidate values intentionally excluded from scoring or fields.",
  matrixDash: "A dash means no scalar score appears in the score matrix. The provision may be absent, recorded only, or withheld elsewhere in the run outputs.",
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

function App() {
  const { loading, error, data } = useSiteData();
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState("All");
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get("view") || "documents");
  const [domainFilter, setDomainFilter] = useState("All");
  const [metricFilter, setMetricFilter] = useState("All");

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
          <p className="smallcaps">CBA pilot</p>
          <h1>Collective bargaining provisions</h1>
          <p className="mastCopy">A 100-document proof-of-concept for measuring CBAs as provision-level records before any final generosity index.</p>
        </div>
        <div className="mastStats">
          <Stat label="Documents" value={data.manifest.document_count} />
          <Stat label="Provisions" value={data.manifest.record_count} />
          <Stat label="Score-ready" value={data.manifest.scored_record_count} />
        </div>
      </header>

      <div className="shell">
        <nav className="tabs" aria-label="Main views">
          {[
            ["documents", "Documents"],
            ["domains", "Domains"],
            ["relative", "Relative metrics"],
            ["diagnostics", "Diagnostics"]
          ].map(([id, label]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
        <details className="readGuide">
          <summary>How to read this</summary>
          <p>
            Provisions are extracted contract objects. Some are comparable enough for draft domain scores; others are kept as structured evidence,
            context, external-plan references, normalization cases, or future scoring candidates. This is not a final CBA-level generosity index.
          </p>
        </details>

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
            onSelectDocument={(id) => {
              setSelectedId(id);
              setView("documents");
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
    const subtype = recordedOnlySubtype(record);
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
              <span><strong>{format(avgDomainScore)}</strong> mean available domain</span>
              <span><strong>{records.length}</strong> provisions</span>
              <span><strong>{doc.scored_record_count ?? 0}</strong> score-ready</span>
              <span><strong>{scoredCount}</strong> draft scores</span>
              <span><strong>{withheldCount}</strong> structured, no score</span>
              <span><strong>{rejected.length}</strong> rejected values</span>
            </div>
            <div className="scoreStrip compact">
              {doc.domain_scores.map((domain) => (
                <div className="domainScore" key={domain.domain}>
                  <span>{domain.domain}</span>
                  <strong>{format(domain.available_score)}</strong>
                  <em>{format(domain.coverage_share, 1)} coverage</em>
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
              <p>Page headings and section inventory used to orient the document reader. Full OCR remains in the run archive.</p>
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
        <span>{rows.length} provisions · {scored.length} draft scores{withheld ? ` · ${withheld} structured, no score` : ""}</span>
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
          <p>{rows.length} provisions · {scored.length} draft scores</p>
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
  const statusDetail = recordedOnlySubtype(record);
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
      {info.reason && (
        <p className="whyLine">
          <strong>{statusDetail ? `Why ${statusDetail.toLowerCase()}:` : "Why:"}</strong>{" "}
          {info.reason}
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
            <span>{typeof child === "object" ? JSON.stringify(child) : format(child)}</span>
          </React.Fragment>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
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
  const visibleConcepts = domainFilter === "All" ? conceptIds : conceptIds.filter((id) => id.includes(domainFilter));
  const domainOptions = [
    ["All", "All"],
    ["LEAVE", "Leave"],
    ["HEALTH", "Health"],
    ["WAGE", "Wages"],
    ["PREMIUM", "Premiums"],
    ["GRIEVANCE", "Grievance"],
    ["ARBITRATION", "Arbitration"],
    ["DISCIPLINE", "Discipline"],
    ["JOB_SECURITY", "Job security"],
    ["SAFETY", "Safety"],
    ["UNION", "Union"]
  ];
  const filledCells = matrix.reduce(
    (count, row) => count + visibleConcepts.filter((id) => hasNumericScore(row[id])).length,
    0
  );
  const possibleCells = matrix.length * visibleConcepts.length;

  return (
    <section className="panel">
      <div className="sectionHeader">
        <div>
          <h2>Draft score matrix</h2>
          <p>Numeric draft scores by document and concept. Blank cells are missing scalar scores, not zeroes.</p>
        </div>
      </div>
      <div className="chipRail" aria-label="Domain filter">
        {domainOptions.map(([value, label]) => (
          <button
            key={value}
            className={domainFilter === value ? "active" : ""}
            onClick={() => setDomainFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="matrixSummary">
        <span><strong>{visibleConcepts.length}</strong> concepts shown</span>
        <span><strong>{filledCells}</strong> draft-score cells</span>
        <span><strong>{possibleCells - filledCells}</strong> blank cells <Info text={HELP.matrixDash} /></span>
      </div>
      <details className="compactDrawer">
        <summary>Domain status guide</summary>
        <div className="statusGrid">
          {status.map((domain) => (
            <div className="statusCard" key={domain.domain}>
              <span className={`pill ${statusTone(domain.current_status)}`}>{domain.current_status}</span>
              <h3>{domain.domain}</h3>
              <p>{domain.empirical_object}</p>
              <strong>{domain.documents_with_records} docs with provisions</strong>
            </div>
          ))}
        </div>
      </details>
      <div className="matrixWrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>Document</th>
              {visibleConcepts.map((id) => <th key={id}>{humanizeId(id)}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => {
              const doc = documents.find((item) => item.document_id === row.document_id);
              return (
                <tr key={row.document_id}>
                  <td>
                    <button className="linkButton" onClick={() => onSelectDocument(row.document_id)}>
                      {row.document_id}
                    </button>
                    <small>{doc?.employer}</small>
                  </td>
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
    </section>
  );
}

function RelativeMetrics({ documents, rows, summary, metricFilter, setMetricFilter, onSelectDocument }) {
  const docById = new Map(documents.map((doc) => [doc.document_id, doc]));
  const metricOptions = [
    ["All", "All"],
    ...Array.from(new Set(rows.map((row) => row.metric_family))).sort().map((metric) => [metric, displayLabel(metric)])
  ];
  const visible = rows
    .filter((row) => metricFilter === "All" || row.metric_family === metricFilter)
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
          <h2>Pilot-relative metrics</h2>
          <p>Central normalization for wages, active health contribution, and external fund proxies. Only confidence A/B rows are ranked.</p>
        </div>
      </div>
      <div className="matrixSummary">
        <span><strong>{rows.length}</strong> normalization rows</span>
        <span><strong>{ranked.length}</strong> ranked rows</span>
        <span><strong>{summary.length}</strong> metric families</span>
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
              <th>Percentile</th>
              <th>Tier</th>
              <th>Status</th>
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

function Diagnostics({ documents, records, scores, rejected, manifest, batch, duplicateQc }) {
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
      const key = provisionStatus(record, scoreByRecord.get(record.concept_record_id))[2];
      dispositionCounts.set(key, (dispositionCounts.get(key) ?? 0) + 1);
      const subtype = recordedOnlySubtype(record);
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
          <p>Run status, scoreability, rejected values, and duplicate-reader checks.</p>
        </div>
        <span className={`decisionBadge ${manifest.batch_decision}`}>{humanizeId(manifest.batch_decision || "unknown")}</span>
      </div>
      <div className="diagnosticStats">
        <DiagnosticStat label="Documents" value={documents.length} />
        <DiagnosticStat label="Output folders" value={manifest.intended_output_count} />
        <DiagnosticStat label="Provisions" value={Object.values(records).flat().length} />
        <DiagnosticStat label="Draft scored" value={dispositionCounts.get("scored") ?? 0} help={HELP.diagnosticsScored} />
        <DiagnosticStat label="Needs score fill-in" value={dispositionCounts.get("missing_score") ?? 0} help={HELP.diagnosticsMissingScore} />
        <DiagnosticStat label="Rejected values" value={Object.values(rejected).flat().length} help={HELP.diagnosticsRejected} />
      </div>
      <div className="qcGrid">
        <CountCard title="Batch checks" counts={new Map([
          ["Valid outputs", batch.stage_valid_outputs ?? 0],
          ["Schema or file errors", batch.stage_error_count ?? 0],
          ["Required-core ledger issues", batch.ledger_issues ?? 0],
          ["Adjudicated required-core rows", batch.adjudicated_required_core_miss_rows ?? 0],
          ["Adjudicated score/withhold rows", batch.adjudicated_score_withhold_rows ?? 0],
          ["Adjacent-score calibration rows", batch.adjudicated_score_band_calibration_rows ?? 0]
        ])} />
        <CountCard title={<>Duplicate-QC consequences <Info text={HELP.duplicateQc} /></>} counts={new Map(Object.entries(duplicateQc.consequence_counts ?? {}))} />
      </div>
      <div className="diagnosticGrid">
        <CountCard title="Provision disposition" counts={dispositionCounts} />
        <CountCard title="Why provisions are not scored" counts={subtypeCounts} />
        <CountCard title="Rejected-value reasons" counts={rejectedCounts} />
      </div>
      <div className="docAuditWrap">
        <table className="docAudit">
          <thead>
            <tr>
              <th>Document</th>
              <th>Provisions</th>
              <th>Draft scores</th>
              <th>Needs score fill-in</th>
              <th>Structured, no score</th>
              <th>External / normalize</th>
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
    withheld: "Structured, no score",
    recorded: "Recorded only",
    external: "External inputs needed",
    normalization: "Needs normalization",
    review: "Needs review",
    not_scored: "Not scored",
    no_direct_measurement_difference: "No direct measurement difference",
    score_level_calibration: "Score-level calibration",
    scoreability_or_scalar_inclusion_boundary: "Scoreability boundary",
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
