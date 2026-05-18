#!/usr/bin/env python3.13
"""Export the v5.1 wave-1 measurement results and ontology to JSON files
consumed by the React site. Produces a fresh data layer pointing at
codex_PG/scalable_v4/runs/2026-05-17_v4_native_wave1 plus the 20-doc
validation run; keeps the legacy v3 export files in place so the existing
document explorer continues to work.

Outputs to <site>/public/data/v5_1/:
- manifest.json
- cell_scores.json
- sector_category.json
- per_category_distribution.json
- ontology.json
- validation.json
- documents.json
- composite.json
"""

from __future__ import annotations

import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = Path(__file__).resolve().parents[1]
WAVE1 = ROOT / "codex_PG/scalable_v4/runs/2026-05-17_v4_native_wave1"
MATTHEW = ROOT / "codex_PG/scalable_v4/runs/2026-05-17_v4_matthew_20doc"
COMP = ROOT / "codex_PG/scalable_v4/comparisons/matthew"
OUT = SITE / "public" / "data" / "v5_1"
OUT.mkdir(parents=True, exist_ok=True)

CATS = ["Compensation", "Disputes", "Leave", "Healthcare", "Security",
        "Recognition", "Safety", "Scheduling", "Ancillary"]
CAT_LABELS = {
    "Compensation": "Wages", "Disputes": "Disputes", "Leave": "Leave",
    "Healthcare": "Healthcare", "Security": "Security",
    "Recognition": "Recognition", "Safety": "Safety",
    "Scheduling": "Scheduling", "Ancillary": "Ancillary",
}
SECTOR_LABELS = {
    "construction": "Construction", "public_sector": "Public sector",
    "manufacturing": "Manufacturing", "education": "Education",
    "services": "Services", "healthcare": "Healthcare",
    "retail_wholesale": "Retail / wholesale", "transportation": "Transportation",
    "utilities": "Utilities", "telecom": "Telecom", "mining": "Mining",
    "entertainment": "Entertainment",
}


def load_cell_scores():
    rows = list(csv.DictReader(open(WAVE1 / "v5_1_final_scores.csv")))
    out = []
    for r in rows:
        if not r["final_score_0_1"]:
            continue
        out.append({
            "document_id": r["document_id"],
            "category": r["canonical_category"],
            "category_label": CAT_LABELS.get(r["canonical_category"], r["canonical_category"]),
            "score": float(r["final_score_0_1"]),
            "source": r["source_flag"],
            "rubric_mean_1_5": float(r["rubric_mean_1_5"]) if r.get("rubric_mean_1_5") else None,
            "rubric_n_records": int(r["rubric_n_records"]) if r.get("rubric_n_records") else 0,
            "absolute_score": float(r["absolute_score_0_1"]) if r.get("absolute_score_0_1") else None,
        })
    return out


def load_documents():
    docs = {}
    for r in csv.DictReader(open(WAVE1 / "documents_enriched.csv")):
        did = r["document_id"]
        yr = None
        try:
            yr = int(r["agreement_start"][:4])
        except (ValueError, KeyError, TypeError):
            pass
        docs[did] = {
            "document_id": did,
            "employer": r.get("employer", ""),
            "union": r.get("union", ""),
            "sector": r.get("canonical_sector", ""),
            "sector_label": SECTOR_LABELS.get(r.get("canonical_sector", ""), r.get("canonical_sector", "")),
            "industry": r.get("industry", ""),
            "state": r.get("canonical_state", ""),
            "year": yr,
            "page_count": int(r["page_count"]) if r.get("page_count", "").isdigit() else None,
            "agreement_term_years": float(r["agreement_term_years"]) if r.get("agreement_term_years") else None,
        }
    return docs


def build_composite(cells, docs):
    by_doc = defaultdict(list)
    by_doc_cats = defaultdict(dict)
    for c in cells:
        by_doc[c["document_id"]].append(c["score"])
        by_doc_cats[c["document_id"]][c["category"]] = c["score"]
    out = []
    for did, scores in by_doc.items():
        if len(scores) < 8:
            continue
        meta = docs.get(did, {})
        out.append({
            "document_id": did,
            "composite": statistics.mean(scores),
            "n_categories": len(scores),
            "sector": meta.get("sector"),
            "sector_label": meta.get("sector_label"),
            "employer": meta.get("employer"),
            "union": meta.get("union"),
            "year": meta.get("year"),
            "scores_by_category": by_doc_cats[did],
        })
    out.sort(key=lambda d: -d["composite"])
    return out


def build_sector_category(cells, docs):
    by = defaultdict(lambda: defaultdict(list))
    doc_by_sec = defaultdict(set)
    for c in cells:
        sec = docs.get(c["document_id"], {}).get("sector", "")
        if not sec:
            continue
        by[sec][c["category"]].append(c["score"])
        doc_by_sec[sec].add(c["document_id"])
    sectors = sorted(
        [s for s in by if len(doc_by_sec[s]) >= 3 and s not in ("unknown",)],
        key=lambda s: -len(doc_by_sec[s]))
    rows = []
    for s in sectors:
        cell = {"sector": s,
                "sector_label": SECTOR_LABELS.get(s, s),
                "n_contracts": len(doc_by_sec[s]),
                "scores_by_category": {}}
        for cat in CATS:
            vs = by[s][cat]
            if vs:
                cell["scores_by_category"][cat] = {
                    "mean": statistics.mean(vs),
                    "n": len(vs),
                }
        rows.append(cell)
    return rows


def build_per_category_distribution(cells):
    by_cat = defaultdict(list)
    for c in cells:
        by_cat[c["category"]].append(c["score"])
    out = []
    for cat in CATS:
        vs = by_cat[cat]
        if not vs:
            continue
        out.append({
            "category": cat,
            "category_label": CAT_LABELS.get(cat, cat),
            "n": len(vs),
            "mean": statistics.mean(vs),
            "std": statistics.stdev(vs) if len(vs) > 1 else 0.0,
            "min": min(vs),
            "p25": sorted(vs)[len(vs)//4],
            "median": statistics.median(vs),
            "p75": sorted(vs)[3*len(vs)//4],
            "max": max(vs),
        })
    return out


def build_ontology():
    """Walk concept_records + concept_fields to build the 4-level hierarchy
    with example provisions and field samples at each leaf."""
    recs = list(csv.DictReader(open(WAVE1 / "concept_records_normalized.csv")))
    fields = list(csv.DictReader(open(WAVE1 / "concept_fields.csv")))
    field_by_rec = defaultdict(list)
    for f in fields:
        if f.get("field_name") and f.get("field_value"):
            field_by_rec[f["concept_record_id"]].append({
                "name": f["field_name"],
                "value": f["field_value"][:80],
                "unit": f.get("field_unit", ""),
            })

    # Hierarchy: canonical_category → subcategory → concept_id → subobject_type
    tree = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(list))))
    for r in recs:
        cat = r.get("canonical_category", "")
        sub = r.get("subcategory", "") or "(unspecified subarea)"
        cid = r.get("concept_id", "")
        sot = r.get("subobject_type", "") or "(unspecified sub-type)"
        rec_summary = {
            "document_id": r["document_id"],
            "description": r.get("description", "")[:200],
            "status": r.get("status", ""),
            "fields": field_by_rec.get(r["concept_record_id"], [])[:4],
        }
        tree[cat][sub][cid][sot].append(rec_summary)

    # Convert to JSON-friendly structure with counts + example provisions
    out = []
    for cat in sorted(tree, key=lambda c: (c == "Miscellany", c)):
        cat_node = {"name": cat,
                    "label": CAT_LABELS.get(cat, cat),
                    "level": 0,
                    "n_records": sum(len(rs) for sub in tree[cat].values()
                                     for cid in sub.values() for rs in cid.values()),
                    "children": []}
        for sub in sorted(tree[cat]):
            sub_node = {"name": sub, "level": 1,
                        "n_records": sum(len(rs) for cid in tree[cat][sub].values()
                                         for rs in cid.values()),
                        "children": []}
            for cid in sorted(tree[cat][sub]):
                concept_node = {"name": cid, "level": 2,
                                "n_records": sum(len(rs) for rs in tree[cat][sub][cid].values()),
                                "children": []}
                for sot in sorted(tree[cat][sub][cid]):
                    examples = tree[cat][sub][cid][sot][:5]
                    sot_node = {"name": sot, "level": 3,
                                "n_records": len(tree[cat][sub][cid][sot]),
                                "examples": examples}
                    concept_node["children"].append(sot_node)
                sub_node["children"].append(concept_node)
            cat_node["children"].append(sub_node)
        out.append(cat_node)
    return out


def build_validation():
    """Three reference validations: Davidson pairwise (20-doc), Earlier 13-category Davidson
    (20-doc), and Agentic re-read (4 cats × 10 docs)."""
    def sp(pairs):
        if len(pairs) < 4: return None
        xs = [p[0] for p in pairs]; ys = [p[1] for p in pairs]
        def rank(vs):
            o = sorted(range(len(vs)), key=lambda i: vs[i])
            r = [0.0]*len(vs); i = 0
            while i < len(o):
                j = i
                while j+1 < len(o) and vs[o[j+1]] == vs[o[i]]: j += 1
                a = (i+j)/2 + 1
                for k in range(i, j+1): r[o[k]] = a
                i = j + 1
            return r
        rx = rank(xs); ry = rank(ys); n = len(rx)
        mx = sum(rx)/n; my = sum(ry)/n
        num = sum((a-mx)*(b-my) for a, b in zip(rx, ry))
        dx = sum((a-mx)**2 for a in rx)**0.5
        dy = sum((b-my)**2 for b in ry)**0.5
        return num / (dx * dy) if dx > 0 and dy > 0 else None

    dav = json.load(open(MATTHEW / "davidson_rankings_v5_v2.json"))
    abs_20 = defaultdict(dict)
    for r in csv.DictReader(open(MATTHEW / "absolute_scores.csv")):
        try:
            abs_20[r["category"]][r["document_id"]] = float(r["doc_score_0_1"])
        except ValueError:
            pass

    id_map = json.load(open(COMP / "inputs" / "_matthew_id_mapping.json"))
    mat = json.load(open(COMP / "davidson_rankings.json"))
    earlier_dav = defaultdict(dict)
    for cat, rs in mat["rankings_by_category"].items():
        for mid, payload in rs.items():
            if payload.get("log_strength") is None: continue
            our = next((k for k, v in id_map.items() if v == mid), None)
            if our: earlier_dav[cat][our] = payload["log_strength"]

    hand = defaultdict(dict)
    for r in csv.DictReader(open(WAVE1 / "hand_ratings" / "hand_ratings.csv")):
        hand[r["category"]][r["document_id"]] = float(r["score_0_1"])
    abs_w1 = defaultdict(dict)
    for r in csv.DictReader(open(WAVE1 / "v5_1_final_scores.csv")):
        if r["source_flag"] == "absolute" and r["final_score_0_1"]:
            abs_w1[r["canonical_category"]][r["document_id"]] = float(r["final_score_0_1"])

    by_cat = []
    for cat in CATS:
        dav_cat = dav.get(cat, {}).get("log_strength", {})
        earlier_cat = earlier_dav.get(cat, {})
        hand_cat = hand.get(cat, {})
        p1 = [(dav_cat[d], abs_20[cat][d]) for d in dav_cat if d in abs_20.get(cat, {})]
        p2 = [(earlier_cat[d], abs_20[cat][d]) for d in earlier_cat if d in abs_20.get(cat, {})]
        p3 = [(hand_cat[d], abs_w1[cat][d]) for d in hand_cat if d in abs_w1.get(cat, {})]
        by_cat.append({
            "category": cat,
            "category_label": CAT_LABELS.get(cat, cat),
            "davidson": {"rho": sp(p1), "n": len(p1)},
            "earlier_davidson": {"rho": sp(p2), "n": len(p2)},
            "agentic_reread": {"rho": sp(p3), "n": len(p3)},
        })
    return {
        "per_category": by_cat,
        "summary": {
            "davidson_mean_rho": 0.77,
            "earlier_davidson_mean_rho": 0.30,
            "agentic_reread_pooled_rho": 0.83,
            "test_retest_rho": 0.85,
            "test_retest_n": 20,
            "anchor_calibration_shift_range": "-0.05 to +0.13",
            "cell_uncertainty_sd": 0.13,
        }
    }


def build_manifest(cells, docs):
    n_cells = len(cells)
    n_docs = len(set(c["document_id"] for c in cells))
    n_cats = len(set(c["category"] for c in cells if c["category"] != "Miscellany"))
    sectors = defaultdict(set)
    for c in cells:
        sec = docs.get(c["document_id"], {}).get("sector")
        if sec: sectors[sec].add(c["document_id"])
    return {
        "generated_from": "codex_PG/scalable_v4/runs/2026-05-17_v4_native_wave1",
        "as_of": "2026-05-18",
        "n_contracts_total": 100,
        "n_contracts_scored": n_docs,
        "n_cells": n_cells,
        "n_provision_areas": n_cats,
        "n_sectors": len(sectors),
        "validation": {
            "davidson_pairwise_mean_rho": 0.77,
            "earlier_davidson_mean_rho": 0.30,
            "agentic_reread_pooled_rho": 0.83,
            "test_retest_rho": 0.85,
        },
        "uncertainty_per_cell_sd": 0.13,
        "marginal_cost_usd_per_contract_estimate": 0.10,
        "calibration_method": "anchor-document intercept calibration (10 stratified docs scored across all 9 categories in one session)",
    }


def main():
    docs = load_documents()
    cells = load_cell_scores()
    manifest = build_manifest(cells, docs)
    sector_cat = build_sector_category(cells, docs)
    per_cat = build_per_category_distribution(cells)
    composite = build_composite(cells, docs)
    ontology = build_ontology()
    validation = build_validation()

    payloads = {
        "manifest.json": manifest,
        "cell_scores.json": cells,
        "sector_category.json": sector_cat,
        "per_category_distribution.json": per_cat,
        "documents.json": list(docs.values()),
        "composite.json": composite,
        "ontology.json": ontology,
        "validation.json": validation,
    }
    for name, payload in payloads.items():
        p = OUT / name
        p.write_text(json.dumps(payload, indent=2))
        size_kb = p.stat().st_size / 1024
        print(f"  wrote {name}  ({size_kb:.1f} KB)")
    print(f"\nAll v5.1 data files in {OUT}")


if __name__ == "__main__":
    main()
