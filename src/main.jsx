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

const HELP = {
  availableScore: "Average score among concepts with enough contract evidence to score. Blank means no score-ready records in that domain.",
  coverage: "Share of expected concepts in this domain that received score-ready records. A low value means sparse coverage, not necessarily low generosity.",
  scoreability: "Whether a record can be converted into a scalar score using only the CBA text. Some records are useful but intentionally not scored.",
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
      <header className="hero">
        <div>
          <p className="smallcaps">CBA measurement pilot</p>
          <h1>Provision records, scores, and diagnostics for 28 contracts</h1>
          <p className="lede">
            This site is a working viewer for the pilot measurement outputs. Use it to inspect each CBA,
            compare domain scores, read evidence-linked records, and diagnose where extraction or scoring
            remains uncertain.
          </p>
        </div>
        <div className="heroStats">
          <Stat label="Documents" value={data.manifest.document_count} />
          <Stat label="Records" value={data.manifest.record_count} />
          <Stat label="PDFs" value={data.manifest.pdf_count} />
        </div>
      </header>

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
              placeholder="Search employer, union, sector…"
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
      ?
      <span className="tip">{text}</span>
    </span>
  );
}

function DocumentPanel({ doc, records, scores, rejected, novelty }) {
  const [sourceView, setSourceView] = useState("pdf");
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
  const domainMean = doc.domain_scores
    .map((domain) => domain.available_score)
    .filter((score) => Number.isFinite(Number(score)));
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

      <div className="documentSummary">
        <Stat label="Avg. scored domain" value={avgDomainScore} />
        <Stat label="Provision records" value={records.length} />
        <Stat label="Score-ready-ish" value={scoreableCount} />
        <Stat label="Rejected values" value={rejected.length} />
      </div>

      <div className="scoreStrip">
        {doc.domain_scores.map((domain) => (
          <div className="domainScore" key={domain.domain}>
            <span>{domain.domain} <Info text={HELP.availableScore} /></span>
            <strong>{format(domain.available_score)}</strong>
            <em>{format(domain.coverage_share, 1)} coverage <Info text={HELP.coverage} /></em>
          </div>
        ))}
      </div>

      <div className="split">
        <div className="sourcePane">
          <div className="paneHeader">
            <div>
              <h3>Source</h3>
              <p>Fixed-height viewer. Use OCR search for quick checks; use PDF when available.</p>
            </div>
            <div className="switcher">
              <button className={sourceView === "pdf" ? "active" : ""} onClick={() => setSourceView("pdf")}>PDF</button>
              <button className={sourceView === "ocr" ? "active" : ""} onClick={() => setSourceView("ocr")}>OCR</button>
            </div>
          </div>
          {sourceView === "pdf" ? (
            doc.pdf_url ? <iframe title={`${doc.document_id} PDF`} src={doc.pdf_url} /> : <Empty text="No PDF copied for this document." />
          ) : (
            <OcrFrame url={doc.ocr_url} />
          )}
        </div>

        <div className="recordsPane">
          <div className="paneHeader stacked">
            <div>
              <h3>Records <Info text={HELP.scoreability} /></h3>
              <p>{filteredRecords.length} shown from {records.length}</p>
            </div>
            <input
              className="search"
              value={recordQuery}
              placeholder="Search concept, group, evidence…"
              onChange={(event) => setRecordQuery(event.target.value)}
            />
            <select value={recordFamily} onChange={(event) => setRecordFamily(event.target.value)}>
              {families.map((family) => <option key={family}>{family}</option>)}
            </select>
            <select value={recordStatus} onChange={(event) => setRecordStatus(event.target.value)}>
              {statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </div>
          <div className="recordList">
            {filteredRecords.map((record) => (
              <RecordCard key={record.concept_record_id} record={record} score={scoreByRecord.get(record.concept_record_id)} />
            ))}
            {!filteredRecords.length && <Empty text="No records match these filters." />}
          </div>
        </div>
      </div>

      <details className="auditBox">
        <summary>Rejected values <Info text={HELP.rejected} /> and novelty queue <Info text={HELP.novelty} /></summary>
        <div className="auditGrid">
          <AuditList title="Rejected values" rows={rejected} />
          <AuditList title="Novelty items" rows={novelty} />
        </div>
      </details>
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

function RecordCard({ record, score }) {
  const fields = record.fields ?? [];
  const status = record.scoreability?.status ?? "unknown";
  const shownFields = fields.slice(0, 3);
  const hiddenFields = fields.slice(3);
  return (
    <details className="recordCard">
      <summary>
      <div className="recordTop">
        <div>
          <span className="concept">{record.concept_id}</span>
          <h4>{record.concept_label}</h4>
          <p>{record.covered_group || record.beneficiary_or_affected_group || "No covered group stated."}</p>
        </div>
        <div className={`pill ${statusTone(status)}`}>{status}</div>
      </div>
      <div className="recordFacts">
        <span>Family: {record.family_label || "—"}</span>
        <span>Role: {record.aggregation_role || "—"}</span>
        <span>Score: {format(score?.draft_score ?? record.bridge_score?.score)}</span>
        <span>{fields.length} fields</span>
      </div>
      </summary>
      {score?.explanation && <p className="explain">{score.explanation}</p>}
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
          <p>Compare score-ready concepts across documents. Blank cells mean not scored or not observed in the central score matrix.</p>
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
              <strong>{domain.documents_with_records} docs with records</strong>
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
          <p>What the site is meant to make visible: coverage, scoreability, rejected values, and domains still not ready for a scalar score.</p>
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
            <th>Records</th>
            <th>Scored records</th>
            <th>Rejected values</th>
            <th>Novelty</th>
            <th>PDF</th>
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
              <td>{doc.pdf_url ? "yes" : "no"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CountCard({ title, counts }) {
  const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
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
