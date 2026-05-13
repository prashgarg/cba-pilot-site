#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import shutil
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SITE = Path(__file__).resolve().parents[1]
PUBLIC = SITE / "public"
DATA = PUBLIC / "data"
OCR = PUBLIC / "ocr"
PDFS = PUBLIC / "pdfs"

RUN = ROOT / "codex_PG/agentic_v3/runs/2026-05-12_wave2_100doc_pilot"
PER_DOC = RUN / "per_document"
INPUT_TEXT = RUN / "inputs/document_text"
REVIEW = RUN / "review"
MANIFEST = RUN / "sample_manifest.csv"
DUPLICATES = RUN / "duplicate_subset.csv"


FAMILY_ORDER = {
    "Leave": 1,
    "Due process": 2,
    "Premium pay": 3,
    "Wages": 4,
    "Health": 5,
    "Job security": 6,
    "Union voice": 7,
    "Retirement/external funds": 8,
    "Scope/seniority/mobility": 9,
    "Safety": 10,
    "Scheduling/workload": 11,
    "Other": 99,
}


def read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def read_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def reset_public_outputs() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    OCR.mkdir(parents=True, exist_ok=True)
    for folder in (DATA, OCR, PDFS):
        if folder.exists():
            for child in folder.iterdir():
                if child.is_file():
                    child.unlink()
                elif child.is_dir():
                    shutil.rmtree(child)
    PDFS.mkdir(parents=True, exist_ok=True)


def base_document_id(folder_name: str) -> str:
    return folder_name.removesuffix("_agentA").removesuffix("_agentB")


def canonical_folder(document_id: str) -> Path | None:
    for suffix in ("_agentA", ""):
        candidate = PER_DOC / f"{document_id}{suffix}"
        if candidate.exists():
            return candidate
    return None


def source_preview(document_id: str) -> str:
    doc_dir = INPUT_TEXT / document_id
    page_index = doc_dir / "page_index.tsv"
    section_inventory = doc_dir / "section_inventory.md"
    metadata = read_json(doc_dir / "metadata.json", {})

    chunks = []
    if metadata:
        chunks.append(
            "\n".join(
                [
                    f"Document: {metadata.get('document_id', document_id)}",
                    f"Raw source: {metadata.get('raw_document_id', 'unknown')}",
                    f"Pages: {metadata.get('page_count', 'unknown')}",
                    f"OCR characters: {metadata.get('ocr_chars', 'unknown')}",
                    "",
                ]
            )
        )
    if section_inventory.exists():
        chunks.append(section_inventory.read_text(encoding="utf-8"))
    elif page_index.exists():
        rows = read_csv_tsv(page_index)
        lines = ["Page-level OCR headings preview", ""]
        for row in rows[:120]:
            lines.append(f"Page {row.get('page')}: {row.get('headings', '')}")
        chunks.append("\n".join(lines))
    return "\n\n".join(chunks).strip() or "No source preview exported for this document."


def read_csv_tsv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def format_title(document_id: str, metadata: dict, records: list[dict]) -> str:
    first = records[0] if records else {}
    label = first.get("covered_group") or first.get("beneficiary_or_affected_group") or ""
    if label and len(label) < 90:
        return label
    raw = metadata.get("raw_document_id") or document_id
    return raw.replace("_", " ").title()


def family_bucket(record: dict) -> str:
    concept_id = str(record.get("concept_id", "")).upper()
    if concept_id.startswith("C_LEAVE"):
        return "Leave"
    if concept_id.startswith("C_GRIEVANCE") or concept_id.startswith("C_ARBITRATION") or concept_id.startswith("C_DISCIPLINE"):
        return "Due process"
    if concept_id.startswith("C_PREMIUM"):
        return "Premium pay"
    if concept_id.startswith("C_WAGE"):
        return "Wages"
    if concept_id.startswith("C_HEALTH"):
        return "Health"
    if concept_id.startswith("C_JOB_SECURITY"):
        return "Job security"
    if concept_id.startswith("C_UNION"):
        return "Union voice"
    if concept_id.startswith("C_RETIREMENT"):
        return "Retirement/external funds"
    if concept_id.startswith("C_SENIORITY") or concept_id.startswith("C_JOB_POSTING") or concept_id.startswith("C_RECOGNITION"):
        return "Scope/seniority/mobility"
    if concept_id.startswith("C_SAFETY"):
        return "Safety"
    if concept_id.startswith("C_TIME") or concept_id.startswith("C_WORKLOAD"):
        return "Scheduling/workload"
    text = " ".join(
        str(record.get(key, ""))
        for key in ("family_id", "family_label", "concept_id", "concept_label")
    ).upper()
    if "LEAVE" in text or "HOLIDAY" in text or "SICK" in text or "VACATION" in text:
        return "Leave"
    return "Other"


def score_value(record: dict, score: dict | None):
    if score and score.get("draft_score") not in (None, ""):
        return score.get("draft_score")
    bridge = record.get("bridge_score") or {}
    return bridge.get("score")


def record_scoreability_status(record: dict, score: dict | None = None) -> str:
    raw = record.get("scoreability")
    if isinstance(raw, dict):
        status = raw.get("status")
    else:
        status = raw
    return status or (score or {}).get("scoreability") or "unknown"


def is_numeric(value) -> bool:
    try:
        return value not in (None, "") and float(value) == float(value)
    except (TypeError, ValueError):
        return False


def provision_bucket(record: dict, score: dict | None) -> str:
    status = record_scoreability_status(record, score)
    if is_numeric(score_value(record, score)):
        return "scored_with_flags" if status == "scoreable_with_flags" else "scored"
    if status in {"not_scoreable_external"}:
        return "external"
    if status in {"normalization_required"}:
        return "normalization"
    if status in {"requires_agentic_review"}:
        return "review"
    if status in {"record_only", "framework_only", "not_scoreable_administrative"}:
        return "recorded"
    if "scoreable" in status:
        return "withheld"
    return "not_scored"


def domain_profiles(records: list[dict], scores: list[dict]) -> list[dict]:
    score_by_id = {s.get("concept_record_id"): s for s in scores}
    grouped: dict[str, list[tuple[dict, dict | None]]] = defaultdict(list)
    for record in records:
        grouped[family_bucket(record)].append((record, score_by_id.get(record.get("concept_record_id"))))

    profiles = []
    for family, rows in sorted(grouped.items(), key=lambda item: (FAMILY_ORDER.get(item[0], 99), item[0])):
        scored_values = [
            float(score_value(record, score))
            for record, score in rows
            if is_numeric(score_value(record, score))
        ]
        profiles.append(
            {
                "domain": family,
                "available_score": sum(scored_values) / len(scored_values) if scored_values else None,
                "scored_concepts": len(scored_values),
                "record_count": len(rows),
                "coverage_share": len(scored_values) / len(rows) if rows else None,
            }
        )
    return profiles


def score_matrix(documents: list[dict], records_by_document: dict, scores_by_document: dict) -> list[dict]:
    concept_ids = Counter()
    for doc_id, scores in scores_by_document.items():
        records = {r.get("concept_record_id"): r for r in records_by_document.get(doc_id, [])}
        for score in scores:
            value = score.get("draft_score")
            if is_numeric(value):
                record = records.get(score.get("concept_record_id"), {})
                concept_ids[score.get("concept_id") or record.get("concept_id")] += 1
    keep = [concept for concept, count in concept_ids.most_common() if concept][:40]
    rows = []
    for doc in documents:
        doc_id = doc["document_id"]
        row = {"document_id": doc_id}
        by_concept = {}
        for score in scores_by_document.get(doc_id, []):
            if is_numeric(score.get("draft_score")):
                by_concept.setdefault(score.get("concept_id"), []).append(float(score["draft_score"]))
        for concept in keep:
            values = by_concept.get(concept, [])
            row[concept] = sum(values) / len(values) if values else None
        rows.append(row)
    return rows


def measurement_status(records_by_document: dict, scores_by_document: dict) -> list[dict]:
    by_family: dict[str, dict] = defaultdict(lambda: {"docs": set(), "records": 0, "score_docs": set(), "score_ready": 0})
    for doc_id, rows in records_by_document.items():
        score_by_id = {s.get("concept_record_id"): s for s in scores_by_document.get(doc_id, [])}
        for record in rows:
            family = family_bucket(record)
            by_family[family]["docs"].add(doc_id)
            by_family[family]["records"] += 1
            if is_numeric(score_value(record, score_by_id.get(record.get("concept_record_id")))):
                by_family[family]["score_docs"].add(doc_id)
                by_family[family]["score_ready"] += 1
    out = []
    for family, item in sorted(by_family.items(), key=lambda kv: (FAMILY_ORDER.get(kv[0], 99), kv[0])):
        out.append(
            {
                "domain": family,
                "empirical_object": domain_description(family),
                "current_status": domain_status(family),
                "documents_with_records": len(item["docs"]),
                "record_count": item["records"],
                "documents_with_score_ready_records": len(item["score_docs"]),
                "score_ready_records": item["score_ready"],
            }
        )
    return out


def domain_description(family: str) -> str:
    descriptions = {
        "Leave": "Paid and protected time away from work.",
        "Due process": "Grievance, arbitration, discipline, just-cause, and appeal protections.",
        "Premium pay": "Extra compensation for overtime, shift work, call-in/reporting, standby, or special assignments.",
        "Wages": "Base rates, wage schedules, wage progression, and scheduled increases.",
        "Health": "Active medical contribution, plan design, dental, vision, and related benefits.",
        "Job security": "Layoff order, recall, severance, and benefit continuation.",
        "Union voice": "Union access, representation time, dues/security, and workplace voice provisions.",
        "Retirement/external funds": "Pension, annuity, welfare, trust, and other external-fund provisions.",
        "Safety": "PPE, unsafe-work refusal, assault/violence, and related safety provisions.",
        "Scheduling/workload": "Schedule notice, hours frameworks, workload, staffing, and schedule-change rules.",
    }
    return descriptions.get(family, "Other retained worker-facing provisions.")


def domain_status(family: str) -> str:
    if family in {"Leave", "Due process", "Premium pay", "Job security"}:
        return "score-ready core"
    if family in {"Health", "Safety", "Union voice"}:
        return "partly score-ready"
    if family == "Wages":
        return "normalization required"
    if family == "Retirement/external funds":
        return "proxy/profile"
    return "profile or future module"


def main() -> None:
    reset_public_outputs()

    manifest_rows = read_csv(MANIFEST)
    manifest = {row["document_id"]: row for row in manifest_rows}
    duplicate_docs = {row["document_id"] for row in read_csv(DUPLICATES) if row.get("document_id")}
    batch_summary = read_json(REVIEW / "batch_acceptance_summary.json", {})
    duplicate_summary = read_json(REVIEW / "duplicate_qc_measurement_consequence_summary.json", {})

    documents = []
    records_by_document = {}
    scores_by_document = {}
    rejected_by_document = {}
    novelty_by_document = {}

    for row in manifest_rows:
        document_id = row["document_id"]
        doc_dir = canonical_folder(document_id)
        if doc_dir is None:
            continue
        records = read_jsonl(doc_dir / "concept_records.jsonl")
        scores = read_jsonl(doc_dir / "module_scores.jsonl")
        rejected = read_jsonl(doc_dir / "rejected_values.jsonl")
        novelty = read_jsonl(doc_dir / "novelty_queue.jsonl")
        metadata = read_json(INPUT_TEXT / document_id / "metadata.json", {})

        OCR.joinpath(f"{document_id}.txt").write_text(source_preview(document_id), encoding="utf-8")
        score_by_id = {score.get("concept_record_id"): score for score in scores}
        scored = sum(1 for record in records if is_numeric(score_value(record, score_by_id.get(record.get("concept_record_id")))))
        scored_with_flags = sum(
            1
            for record in records
            if is_numeric(score_value(record, score_by_id.get(record.get("concept_record_id"))))
            and record_scoreability_status(record, score_by_id.get(record.get("concept_record_id"))) == "scoreable_with_flags"
        )
        withheld = sum(1 for record in records if provision_bucket(record, score_by_id.get(record.get("concept_record_id"))) == "withheld")

        documents.append(
            {
                "document_id": document_id,
                "raw_document_id": row.get("raw_document_id") or metadata.get("raw_document_id") or document_id,
                "employer": format_title(document_id, metadata, records),
                "union": "Department of Labor OCR archive",
                "source": row.get("source_path") or metadata.get("source_path") or "",
                "location": "",
                "industry": "",
                "sector": row.get("length_stratum", ""),
                "year": "",
                "title": row.get("raw_document_id") or document_id,
                "page_count": int(float(row.get("page_count") or metadata.get("page_count") or 0)),
                "ocr_chars": int(float(row.get("ocr_chars") or metadata.get("ocr_chars") or 0)),
                "length_stratum": row.get("length_stratum", ""),
                "duplicate_read": document_id in duplicate_docs,
                "record_count": len(records),
                "scored_record_count": scored,
                "scored_with_flags_count": scored_with_flags,
                "structured_no_score_count": withheld,
                "rejected_value_count": len(rejected),
                "novelty_count": len(novelty),
                "pdf_url": None,
                "ocr_url": f"ocr/{document_id}.txt",
                "domain_scores": domain_profiles(records, scores),
            }
        )
        records_by_document[document_id] = records
        scores_by_document[document_id] = scores
        rejected_by_document[document_id] = rejected
        novelty_by_document[document_id] = novelty

    documents.sort(key=lambda item: item["document_id"])
    matrix = score_matrix(documents, records_by_document, scores_by_document)
    status = measurement_status(records_by_document, scores_by_document)

    write_json(DATA / "documents.json", documents)
    write_json(DATA / "records_by_document.json", records_by_document)
    write_json(DATA / "module_scores_by_document.json", scores_by_document)
    write_json(DATA / "rejected_values_by_document.json", rejected_by_document)
    write_json(DATA / "novelty_by_document.json", novelty_by_document)
    write_json(DATA / "measurement_status_map.json", status)
    write_json(DATA / "initial_score_matrix.json", matrix)
    write_json(DATA / "batch_acceptance_summary.json", batch_summary)
    write_json(DATA / "duplicate_qc_summary.json", duplicate_summary)
    write_json(
        DATA / "site_manifest.json",
        {
            "generated_from": str(RUN.relative_to(ROOT)),
            "document_count": len(documents),
            "distinct_document_count": len(documents),
            "intended_output_count": batch_summary.get("intended_outputs", 110),
            "duplicate_read_document_count": len(duplicate_docs),
            "record_count": sum(d["record_count"] for d in documents),
            "scored_record_count": sum(d["scored_record_count"] for d in documents),
            "rejected_value_count": sum(d["rejected_value_count"] for d in documents),
            "pdf_count": 0,
            "batch_decision": batch_summary.get("batch_decision", "unknown"),
        },
    )
    (PUBLIC / "data/README.txt").write_text(
        "Generated website data for the CBA v3.2 proof-of-concept pilot. Recreate with npm run export:data.\n",
        encoding="utf-8",
    )
    print(f"Exported {len(documents)} documents and {sum(d['record_count'] for d in documents)} provisions to {DATA}")


if __name__ == "__main__":
    main()
