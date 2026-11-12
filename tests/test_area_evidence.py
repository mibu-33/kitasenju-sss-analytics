"""Validate audited, manually confirmed island classifications."""
import json
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[1] / "data"

def test_island_mapping_is_unique_and_conservative():
    rows=json.loads((ROOT/"areas.json").read_text(encoding="utf-8"))
    assert len(rows)==237
    assert len({r["number"] for r in rows})==237
    assert len([r for r in rows if r.get("confidence")=="cross-checked"])==26
    assert len([r for r in rows if r.get("confidence")=="secondary-color-only"])==63
    assert not any(1005<=r["number"]<=1012 and r.get("corridor") for r in rows)
    assert all(not r["corridor"] and r["order"] is None and r["from"] for r in rows if r.get("confidence")=="secondary-color-only")
    silver=[r for r in rows if r.get("order") is not None]
    assert len(silver)==65
    assert all(r["zone"]=="silver" and r.get("confidence")=="user-on-site-row-order" for r in silver)
    assert all(r.get("order") is None for r in rows if r["zone"]!="silver"), "Do not invent adjacency outside field-verified silver"

def test_official_x_purple_blocks_match_verified_ranges():
    rows=json.loads((ROOT/"areas.json").read_text(encoding="utf-8"))
    for name,numbers in [("紫A",range(742,753)),("紫B",range(753,763)),("紫5台円卓",range(1013,1018))]:
        seen={r["number"] for r in rows if r["corridor"]==name}
        assert seen==set(numbers)
        assert all(r["zone"]=="purple" and r["floor"]=="2F" for r in rows if r["corridor"]==name)

def test_source_ledger_and_unknowns():
    info=json.loads((ROOT/"layout_sources.json").read_text(encoding="utf-8"))
    assert info["area_mapped_seats"]==180
    assert info["color_identified_seats"]==237
    assert info["color_only_secondary_seats"]==63
    assert info["total_seats"]==451
    assert len(info["unknown"])>=3
    assert any("x.com/Kitasenjusss/status/" in r.get("url","") for r in info["evidence"])

def test_roundtable_membership_does_not_assert_seat_order():
    rows=json.loads((ROOT/"areas.json").read_text(encoding="utf-8"))
    added=[r for r in rows if r.get("confidence")=="derived-color-and-roundtable-group"]
    assert {r["number"] for r in added}=={1005,1006,1007,1009,1010,1011,1012}
    assert all(r["floor"]=="2F" and r["zone"]=="gold" for r in added)
    assert all(not r["corridor"] and r["order"] is None and r.get("roundtable_group") for r in added)

def test_dated_placement_evidence_is_conservative():
    ledger=json.loads((ROOT/"placement_evidence.json").read_text(encoding="utf-8"))
    assert ledger["total_seats"]==451
    observations=ledger["reported_arrangements"]
    assert len(observations)>=24
    assert len({o["id"] for o in observations})==len(observations)
    assert all(not o["physical_seat_order_verified"] and o.get("source_url") for o in observations)
    assert {tuple(x["machine_numbers"]) for x in ledger["roundtable_groups"]}=={tuple(range(1001,1005)),tuple(range(1005,1009)),tuple(range(1009,1013)),tuple(range(1013,1018)),tuple(range(2001,2013))}
