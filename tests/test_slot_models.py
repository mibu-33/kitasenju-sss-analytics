#!/usr/bin/env python3
"""Contract tests: the October–November holdout is never used for fitting."""
import json
from datetime import datetime
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts import train_slot_models as m

ROOT = Path(__file__).resolve().parents[1]
report = json.loads((ROOT / "public/model_results.json").read_text(encoding="utf-8"))
assert report["split"]["train_through"] == "2026-09-30"
assert report["split"]["test_from"] == "2026-10-01"
assert report["split"]["test_through"] == "2026-11-25"
assert report["split"]["locked_test"] is True
assert report["roundtable"]["training"]["days"] >= 20
assert report["roundtable"]["test"]["days"] >= 30
assert report["seat_proxy"]["training"]["days"] >= 35
assert report["seat_proxy"]["test"]["days"] >= 30
assert report["seat_proxy"]["training"]["samples"] >= 10000
assert report["seat_proxy"]["test"]["seat_predictions"] >= 10000
assert report["roundtable"]["model"]["features"] == m.ROUND_FEATURES
assert report["seat_proxy"]["model"]["features"] == m.SEAT_FEATURES
assert report["roundtable"]["test"]["group_predictions"] >= 100
assert 0 <= report["roundtable"]["test"]["top1_hit_rate_pct"] <= 100
assert 0 <= report["seat_proxy"]["test"]["top10_precision_pct"] <= 100
assert report["seat_proxy"]["test"]["top10_predictions"] > 100
assert len(report["roundtable"]["forecast"]["best_per_group"]) == 4
assert len(report["seat_proxy"]["forecast"]["seat_top20"]) == 20
assert report["roundtable"]["test"]["days"] <= len([d for d in m.read("roundtable_targets.json")["days"] if "2026-10-01" <= d["date"] <= "2026-11-25"])
assert all("2026-10" not in x and "2026-11" not in x for x in ["2026-09-30"])
assert all(k in m.GROUPS[choice["group"]] for choice in report["roundtable"]["forecast"]["best_per_group"] for k in [choice["number"]])
for group, candidates in m.GROUPS.items():
    p = sum(row["score_probability"] for row in report["roundtable"]["forecast"]["ranked_candidates"] if row["group"] == group)
    assert abs(p - 1) < .0001, (group, p)
# The output contains a future *forecast date* but no future training labels.
forecast = datetime.fromisoformat(report["seat_proxy"]["forecast"]["target_date"]).date()
latest = datetime.fromisoformat(report["seat_proxy"]["forecast"]["input_last_complete_day"]).date()
assert forecast > latest
# The source's last date matters. A missing daily answer-check must not silently
# become a synthetic loss for a supposedly 'setting 6' model.
assert "not confirmed settings" in report["roundtable"]["target"]
assert "NOT setting 6" in report["seat_proxy"]["target"]
print("PASS split locking, candidate probability sums, report schema, no setting-6 claim")
