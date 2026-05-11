#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SITE = Path(__file__).resolve().parents[1]
PUBLIC = SITE / "public"
DATA = PUBLIC / "data"
PDFS = PUBLIC / "pdfs"
OCR = PUBLIC / "ocr"

RUN = ROOT / "codex_PG/agentic_v3/runs/2026-05-11_v3_1_consolidated_validation"
CENTRAL = RUN / "central_score_inputs"
PER_DOC = RUN / "per_document"
STATUS_CSV = ROOT / "codex_PG/agentic_v3/outputs/measurement_status_map.csv"
PILOT_MANIFEST = ROOT / "claude/samples/task_2.2_healthcare_pilot.csv"


def read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


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


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def safe_copy(src: Path, dst: Path) -> bool:
    if not src.exists():
        matches = list(ROOT.glob(f"**/{src.name}"))
        matches = [match for match in matches if "node_modules" not in match.parts and "dist" not in match.parts]
        if matches:
            src = matches[0]
    if not src.exists():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return True


def canonical_path(document_id: str) -> Path | None:
    candidates = [
        ROOT / f"codex_PG/data/pilot_outputs/healthcare_full20_taxonomy_first_round18_parental_upstream_local_v2/{document_id}/artifacts/canonical_document.json",
        ROOT / f"codex_PG/data/pilot_outputs/healthcare_heldout_validation_v1/{document_id}/artifacts/canonical_document.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def extract_canonical(document_id: str) -> tuple[dict, str, Path | None]:
    path = canonical_path(document_id)
    if path is None:
        return {}, "", None
    doc = json.loads(path.read_text(encoding="utf-8"))
    pages = doc.get("pages", [])
    chunks = []
    for page in pages:
        page_no = page.get("page_number")
        text = page.get("normalized_text") or page.get("raw_text") or ""
        chunks.append(f"\n\n--- Page {page_no} ---\n{text}".strip())
    pdf_path = None
    for item in doc.get("source_files", []):
        if item.get("type") == "pdf" and item.get("path"):
            pdf_path = Path(item["path"])
            break
    return doc, "\n".join(chunks), pdf_path


def domain_scores(row: dict) -> list[dict]:
    domains = ["leave", "premium_pay", "due_process", "job_security"]
    out = []
    for domain in domains:
        out.append(
            {
                "domain": domain.replace("_", " ").title(),
                "available_score": parse_float(row.get(f"{domain}_available_score")),
                "absence_adjusted_score": parse_float(row.get(f"{domain}_absence_adjusted_score")),
                "scored_concepts": parse_int(row.get(f"{domain}_scored_concepts")),
                "coverage_share": parse_float(row.get(f"{domain}_coverage_share")),
            }
        )
    return out


def parse_float(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_int(value):
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    PDFS.mkdir(parents=True, exist_ok=True)
    OCR.mkdir(parents=True, exist_ok=True)

    manifest = {row["contract_id"]: row for row in read_csv(PILOT_MANIFEST)}
    domain_summary = {row["document_id"]: row for row in read_csv(CENTRAL / "domain_profile_summary.csv")}
    initial_scores = {row["document_id"]: row for row in read_csv(CENTRAL / "initial_score_matrix.csv")}
    status_map = read_csv(STATUS_CSV)
    score_inputs = read_csv(CENTRAL / "score_input_records.csv")
    extended = read_csv(CENTRAL / "extended_domain_profile_summary.csv")
    wage_growth = read_csv(CENTRAL / "wage_growth_relative_profile.csv")
    external_funds = read_csv(CENTRAL / "external_fund_proxy_profile.csv")
    wage_readiness = read_csv(CENTRAL / "wage_level_construct_readiness.csv")

    document_ids = sorted([p.name for p in PER_DOC.iterdir() if p.is_dir()])
    documents = []
    records_by_document = {}
    scores_by_document = {}
    rejected_by_document = {}
    novelty_by_document = {}

    for document_id in document_ids:
        doc_dir = PER_DOC / document_id
        concept_records = read_jsonl(doc_dir / "concept_records.jsonl")
        module_scores = read_jsonl(doc_dir / "module_scores.jsonl")
        rejected_values = read_jsonl(doc_dir / "rejected_values.jsonl")
        novelty = read_jsonl(doc_dir / "novelty_queue.jsonl")
        canonical, ocr_text, pdf_path = extract_canonical(document_id)

        OCR.joinpath(f"{document_id}.txt").write_text(ocr_text, encoding="utf-8")

        copied_pdf = False
        if pdf_path is not None:
            copied_pdf = safe_copy(pdf_path, PDFS / f"{document_id}.pdf")

        manifest_row = manifest.get(document_id, {})
        documents.append(
            {
                "document_id": document_id,
                "employer": manifest_row.get("employer") or canonical.get("employer") or "Unknown employer",
                "union": manifest_row.get("union") or canonical.get("union") or "Unknown union",
                "source": manifest_row.get("source") or "unknown",
                "location": manifest_row.get("location") or "",
                "industry": manifest_row.get("industry") or "",
                "sector": manifest_row.get("sector") or "",
                "year": manifest_row.get("year") or "",
                "title": canonical.get("title") or document_id,
                "page_count": len(canonical.get("pages", [])),
                "record_count": len(concept_records),
                "scored_record_count": sum(1 for r in module_scores if r.get("draft_score") is not None),
                "rejected_value_count": len(rejected_values),
                "novelty_count": len(novelty),
                "pdf_url": f"pdfs/{document_id}.pdf" if copied_pdf else None,
                "ocr_url": f"ocr/{document_id}.txt",
                "domain_scores": domain_scores(domain_summary.get(document_id, {})),
            }
        )
        records_by_document[document_id] = concept_records
        scores_by_document[document_id] = module_scores
        rejected_by_document[document_id] = rejected_values
        novelty_by_document[document_id] = novelty

    write_json(DATA / "documents.json", documents)
    write_json(DATA / "records_by_document.json", records_by_document)
    write_json(DATA / "module_scores_by_document.json", scores_by_document)
    write_json(DATA / "rejected_values_by_document.json", rejected_by_document)
    write_json(DATA / "novelty_by_document.json", novelty_by_document)
    write_json(DATA / "domain_profile_summary.json", list(domain_summary.values()))
    write_json(DATA / "initial_score_matrix.json", list(initial_scores.values()))
    write_json(DATA / "score_input_records.json", score_inputs)
    write_json(DATA / "measurement_status_map.json", status_map)
    write_json(DATA / "extended_domain_profile_summary.json", extended)
    write_json(DATA / "wage_growth_relative_profile.json", wage_growth)
    write_json(DATA / "external_fund_proxy_profile.json", external_funds)
    write_json(DATA / "wage_level_construct_readiness.json", wage_readiness)
    write_json(
        DATA / "site_manifest.json",
        {
            "generated_from": str(RUN.relative_to(ROOT)),
            "document_count": len(documents),
            "record_count": sum(d["record_count"] for d in documents),
            "pdf_count": sum(1 for d in documents if d["pdf_url"]),
        },
    )

    write_text(
        PUBLIC / "data/README.txt",
        "Generated website data for the CBA measurement pilot. Recreate with npm run export:data.\n",
    )
    print(f"Exported {len(documents)} documents to {DATA}")


if __name__ == "__main__":
    main()
