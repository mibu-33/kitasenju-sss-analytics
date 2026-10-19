"""Validate audited, manually confirmed island classifications."""
import json
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[1] / "data"

def test_island_mapping_is_unique_and_conservative():
    rows=json.loads((ROOT/"areas.json").read_text(encoding="utf-8"))
    assert len(rows)==103
    assert len({r["number"] for r in rows})==103
    assert len([r for r in rows if r.get("confidence")=="cross-checked"])==26
    assert not any(1005<=r["number"]<=1012 for r in rows), "Gold round-table IDs remain unconfirmed"
    assert all(r.get("order") is None for r in rows), "Image label order is not proven adjacency"

def test_official_x_purple_blocks_match_verified_ranges():
    rows=json.loads((ROOT/"areas.json").read_text(encoding="utf-8"))
    for name,numbers in [("紫A",range(742,753)),("紫B",range(753,763)),("紫5台円卓",range(1013,1018))]:
        seen={r["number"] for r in rows if r["corridor"]==name}
        assert seen==set(numbers)
        assert all(r["zone"]=="purple" and r["floor"]=="2F" for r in rows if r["corridor"]==name)

def test_source_ledger_and_unknowns():
    info=json.loads((ROOT/"layout_sources.json").read_text(encoding="utf-8"))
    assert info["area_mapped_seats"]==103
    assert info["total_seats"]==451
    assert len(info["unknown"])>=3
    assert any("x.com/Kitasenjusss/status/" in r.get("url","") for r in info["evidence"])
