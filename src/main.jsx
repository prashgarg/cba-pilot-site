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
  manifest: "data/site_manifest.json"
};

const format = (value, digits = 2) => {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isFinite(num)) return num.toFixed(digits).replace(/\.00$/, "");
  return String(value);
};

const statusTone = (status = "") => {
  if (status.includes("score_ready") || status === "scoreable") return "good";
  if (status.includes("candidate") || status.includes("pilot")) return "warn";
  if (status.includes("external") || status.includes("normalization")) return "cool";
  return "muted";
};

const provisionStatus = (status = "") => {
  const labels = {
    scoreable: ["Scored", "good"],
    scoreable_with_flags: ["Scored with caution", "warn"],
    record_only: ["Recorded only", "muted"],
    framework_only: ["Recorded only", "muted"],
    not_scoreable_ambiguous: ["Not scored", "muted"],
    not_scoreable_external: ["External inputs needed", "cool"],
    normalization_required: ["Needs normalization", "cool"],
    requires_agentic_review: ["Needs review", "warn"]
  };
  return labels[status] ?? [status.replaceAll("_", " "), "muted"];
};

const scoreValue = (record, score) => score?.draft_score ?? record.bridge_score?.score;
const hasNumericScore = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

const groupByFamily = (records) => {
  const groups = new Map();
  records.forEach((record) => {
    const family = record.family_label || "Other provisions";
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push(record);
  });
  return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
};

const HELP = {
  domainScores: "Mean score uses concepts with enough contract evidence. Coverage is the share of expected concepts observed in that domain.",
  scoreability: "Some extracted provisions are scored. Others are kept as context because they define scope, require outside inputs, or are not comparable enough for a scalar score.",
  rejected: "Values the protocol saw but refused to use, usually because they were the wrong object, lacked support, or came from context rather than an operative provision.",
  novelty: "Provision material that did not fit cleanly into the fixed concept library for this run."
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
  const [view, setView] = useState("documents");
  const [domainFilter, setDomainFilter] = useState("All");

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
    const haystack = [doc.document_id, doc.employer, doc.union, doc.industry, doc.sector, doc.location]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <main>
      <header className="masthead">
        <div>
          <p className="smallcaps">CBA pilot</p>
          <h1>Collective bargaining provisions</h1>
        </div>
        <div className="mastStats">
          <Stat label="Documents" value={data.manifest.document_count} />
          <Stat label="Provisions" value={data.manifest.record_count} />
        </div>
      </header>

      <div className="shell">
        <nav className="tabs" aria-label="Main views">
          {[
            ["documents", "Documents"],
            ["domains", "Domain explorer"],
            ["diagnostics", "Diagnostics"]
          ].map(([id, label]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>

        {view === "documents" && (
        <section className="workspace">
          <aside className="sidebar">
            <input
              className="search"
              value={query}
              placeholder="Search documents"
              onChange={(event) => setQuery(event.target.value)}
            />
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

        {view === "diagnostics" && (
          <Diagnostics documents={data.documents} status={data.status} records={data.records} rejected={data.rejected} />
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
  const [panelView, setPanelView] = useState("overview");
  const [recordQuery, setRecordQuery] = useState("");
  const [recordStatus, setRecordStatus] = useState("All");
  const [recordFamily, setRecordFamily] = useState("All");

  const scoreByRecord = useMemo(() => {
    const map = new Map();
    scores.forEach((score) => map.set(score.concept_record_id, score));
    return map;
  }, [scores]);

  const filteredRecords = records.filter((record) => {
    const status = record.scoreability?.status ?? "unknown";
    const family = record.family_label ?? "Other";
    const haystack = [
      record.concept_id,
      record.concept_label,
      record.family_label,
      record.covered_group,
      record.beneficiary_or_affected_group
    ]
      .join(" ")
      .toLowerCase();
    return (
      haystack.includes(recordQuery.toLowerCase()) &&
      (recordStatus === "All" || status === recordStatus) &&
      (recordFamily === "All" || family === recordFamily)
    );
  });

  const statuses = ["All", ...Array.from(new Set(records.map((record) => record.scoreability?.status ?? "unknown"))).sort()];
  const families = ["All", ...Array.from(new Set(records.map((record) => record.family_label ?? "Other"))).sort()];
  const scoreableCount = records.filter((record) => (record.scoreability?.status ?? "").includes("scoreable")).length;
  const provisionGroups = groupByFamily(filteredRecords);
  const allProvisionGroups = groupByFamily(records);
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
          <span>{doc.industry || "Industry unknown"}</span>
          <span>{doc.location || "Location unknown"}</span>
          <span>{doc.year || "Year unknown"}</span>
          <span>{doc.page_count} pages</span>
        </div>
      </div>

      <div className="panelTabs" role="tablist" aria-label="Document views">
        {[
          ["overview", "Overview"],
          ["source", "Source"],
          ["provisions", "Provisions"],
          ["audit", "Review notes"]
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
              <h3>Domain scores</h3>
              <Info text={HELP.domainScores} />
            </div>
            <div className="documentSummary">
              <Stat label="Mean score" value={avgDomainScore} />
              <Stat label="Provisions" value={records.length} />
              <Stat label="Score-ready" value={scoreableCount} />
              <Stat label="Rejected" value={rejected.length} />
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
                    setRecordFamily(family);
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
              <h3>OCR text</h3>
            </div>
          </div>
          <div className="viewerWrap">
            <OcrFrame url={doc.ocr_url} />
          </div>
        </div>
      )}

      {panelView === "provisions" && (
        <div className="singlePanel">
          <div className="paneHeader stacked">
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
            <select value={recordFamily} onChange={(event) => setRecordFamily(event.target.value)}>
              {families.map((family) => <option key={family}>{family}</option>)}
            </select>
            <select value={recordStatus} onChange={(event) => setRecordStatus(event.target.value)}>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status === "All" ? "All statuses" : provisionStatus(status)[0]}
                </option>
              ))}
            </select>
          </div>
          <div className="provisionGroups">
            {provisionGroups.map(([family, rows]) => (
              <ProvisionFamily key={family} family={family} rows={rows} scoreByRecord={scoreByRecord} />
            ))}
            {!filteredRecords.length && <Empty text="No provisions match these filters." />}
          </div>
        </div>
      )}

      {panelView === "audit" && (
        <div className="singlePanel">
          <details className="auditBox" open>
            <summary>Rejected values <Info text={HELP.rejected} /> and novelty queue <Info text={HELP.novelty} /></summary>
            <div className="auditGrid">
              <AuditList title="Rejected values" rows={rejected} />
              <AuditList title="Novelty items" rows={novelty} />
            </div>
          </details>
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

function FamilySummary({ family, rows, scoreByRecord, onOpen }) {
  const scored = rows.filter((record) => hasNumericScore(scoreValue(record, scoreByRecord.get(record.concept_record_id))));
  const review = rows.filter((record) => provisionStatus(record.scoreability?.status ?? "unknown")[1] === "warn").length;
  return (
    <button className="familyRow" onClick={onOpen}>
      <div>
        <strong>{family}</strong>
        <span>{rows.length} provisions · {scored.length} scored{review ? ` · ${review} with caution` : ""}</span>
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
          <p>{rows.length} provisions · {scored.length} scored</p>
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
  const status = record.scoreability?.status ?? "unknown";
  const [statusLabel, statusClass] = provisionStatus(status);
  const shownFields = fields.slice(0, 3);
  const hiddenFields = fields.slice(3);
  const scoreShown = scoreValue(record, score);
  return (
    <details className="recordCard">
      <summary>
        <div className="provisionRow">
          <div>
            <h4>{record.concept_label}</h4>
            <p>{record.covered_group || record.beneficiary_or_affected_group || "No covered group stated."}</p>
          </div>
          <span className={`statusText ${statusClass}`}>{statusLabel}</span>
          <strong>{format(scoreShown)}</strong>
        </div>
      </summary>
      {score?.explanation && <p className="explain">{score.explanation}</p>}
      {record.scoreability?.reason && <p className="mutedText">{record.scoreability.reason}</p>}
      <div className="fields">
        {shownFields.map((field, index) => (
          <div className="field" key={`${field.field_name}-${index}`}>
            <strong>{field.field_name}</strong>
            <span>{typeof field.value === "object" ? JSON.stringify(field.value) : String(field.value ?? "—")}</span>
            <em>{field.evidence?.quote_or_pointer || field.evidence?.page || "No evidence pointer"}</em>
          </div>
        ))}
        {!!hiddenFields.length && (
          <details className="moreFields">
            <summary>Show {hiddenFields.length} more fields</summary>
            {hiddenFields.map((field, index) => (
              <div className="field" key={`${field.field_name}-hidden-${index}`}>
                <strong>{field.field_name}</strong>
                <span>{typeof field.value === "object" ? JSON.stringify(field.value) : String(field.value ?? "—")}</span>
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

function AuditList({ title, rows }) {
  return (
    <div>
      <h4>{title}</h4>
      {!rows.length && <p className="mutedText">None recorded.</p>}
      {rows.slice(0, 30).map((row, index) => (
        <div className="auditItem" key={index}>
          <strong>{row.concept_id || row.novelty_label || row.candidate_field || "Item"}</strong>
          <span>{row.reason_rejected || row.reason || row.description || JSON.stringify(row).slice(0, 180)}</span>
        </div>
      ))}
    </div>
  );
}

function DomainExplorer({ documents, status, matrix, domainFilter, setDomainFilter, onSelectDocument }) {
  const conceptIds = Object.keys(matrix[0] ?? {}).filter((key) => key !== "document_id");
  const visibleConcepts = domainFilter === "All" ? conceptIds : conceptIds.filter((id) => id.includes(domainFilter));
  const domainOptions = ["All", "LEAVE", "PREMIUM", "GRIEVANCE", "ARBITRATION", "DISCIPLINE", "JOB_SECURITY"];

  return (
    <section className="panel">
      <div className="sectionHeader">
        <div>
          <h2>Domain explorer</h2>
          <p>Score-ready concepts across documents.</p>
        </div>
        <select value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}>
          {domainOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
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
              {visibleConcepts.map((id) => <th key={id}>{id.replace("C_", "").replaceAll("_", " ")}</th>)}
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
                  {visibleConcepts.map((id) => <td key={id}>{format(row[id])}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Diagnostics({ documents, status, records, rejected }) {
  const scoreabilityCounts = new Map();
  const rejectedCounts = new Map();
  Object.values(records).flat().forEach((record) => {
    const key = record.scoreability?.status ?? "unknown";
    scoreabilityCounts.set(key, (scoreabilityCounts.get(key) ?? 0) + 1);
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
          <p>Coverage, scoreability, and rejected values.</p>
        </div>
      </div>
      <div className="diagnosticGrid">
        <CountCard title="Scoreability" counts={scoreabilityCounts} />
        <CountCard title="Rejected-value classes" counts={rejectedCounts} />
      </div>
      <table className="docAudit">
        <thead>
          <tr>
            <th>Document</th>
            <th>Provisions</th>
            <th>Scored provisions</th>
            <th>Rejected values</th>
            <th>Novelty</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.document_id}>
              <td>{doc.document_id}</td>
              <td>{doc.record_count}</td>
              <td>{doc.scored_record_count}</td>
              <td>{doc.rejected_value_count}</td>
              <td>{doc.novelty_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CountCard({ title, counts }) {
  const displayCounts = new Map();
  Array.from(counts.entries()).forEach(([label, count]) => {
    const displayLabel = title === "Scoreability" ? provisionStatus(label)[0] : label.replaceAll("_", " ");
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
