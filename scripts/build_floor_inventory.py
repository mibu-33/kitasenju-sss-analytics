#!/usr/bin/env python3
"""Build evidence-aware current-seat inventory for the SSS floor map.

Only observed layout entries contain floor/zone/corridor. Never infer geometry,
adjacency, exact seats, or a physical order from machine numbers.
"""
from __future__ import annotations
from collections import Counter, defaultdict
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def load(name, fallback):
    path = DATA / name
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def clean_num(value):
    try:
        if isinstance(value, bool):
            return None
        val = int(value)
        return val if 1 <= val <= 99999 else None
    except (ValueError, TypeError):
        return None


def build_inventory():
    areas = load("areas.json", [])
    records = load("records.json", [])
    status = load("status.json", {})
    by_number = {}
    for entry in areas:
        number = clean_num(entry.get("number"))
        if number is None:
            continue
        if number in by_number:
            raise ValueError("duplicate floor-map number: " + str(number))
        by_number[number] = entry

    by_date = defaultdict(dict)
    for item in records:
        if not isinstance(item, dict):
            continue
        date = str(item.get("date", ""))
        number = clean_num(item.get("number"))
        if len(date) != 10 or number is None:
            continue
        by_date[date][number] = item

    complete = [date for date, data in by_date.items() if len(data) >= 400]
    latest = max(complete, default="")
    day = by_date[latest] if latest else {}
    floor_count = Counter()
    machine_rows = []
    for number in sorted(set(day) | set(by_number)):
        observed = day.get(number)
        entry = by_number.get(number)
        if entry:
            floor = entry.get("floor")
            zone = entry.get("zone")
            corridor = entry.get("corridor") or None
            order = entry.get("order")
            confidence = entry.get("confidence", "unspecified")
            # This 'order' is not a physical coordinate and, outside silver,
            # must never be treated as verified adjacency.
            position_level = "on-site-row-order" if confidence == "user-on-site-row-order" else "group-only"
            floor_count["mapped_zone"] += 1
            if position_level == "on-site-row-order":
                floor_count["row_order_observed"] += 1
        else:
            floor = zone = corridor = order = confidence = None
            position_level = "unmapped"
            floor_count["unmapped"] += 1
        floor_hint = ("1F" if 1 <= number <= 261 else "2F" if 601 <= number <= 762 else None) if floor is None else floor
        machine_rows.append({
            "number": number,
            "floor_hint": floor_hint,
            "floor_hint_is_inference": floor is None and floor_hint is not None,
            "machine": observed.get("machine") if observed else None,
            "diff": observed.get("diff") if observed else None,
            "games": observed.get("games") if observed else None,
            "floor": floor,
            "zone": zone,
            "corridor": corridor,
            "order": order,
            "confidence": confidence,
            "position_level": position_level,
            "source": entry.get("source") if entry else None,
            "note": entry.get("note") if entry else None,
            "recorded_for_date": latest if observed else None,
        })

    missing = sorted(n for n in day if n not in by_number)
    unmapped_ranges = []
    if missing:
        start = prev = missing[0]
        for n in missing[1:]:
            if n == prev + 1:
                prev = n
            else:
                unmapped_ranges.append({"start": start, "end": prev, "count": prev - start + 1, "floor_hint": "1F" if start <= 261 else "2F" if start >= 601 and prev <= 762 else None})
                start = prev = n
        unmapped_ranges.append({"start": start, "end": prev, "count": prev - start + 1, "floor_hint": "1F" if start <= 261 else "2F" if start >= 601 and prev <= 762 else None})
    expected_total = 451
    return {
        "schema": 2,
        "title": "北千住SSS 台番号別照合台帳",
        "data_date": latest,
        "status_newest_date": status.get("newest_date"),
        "store_advertised_seat_count": expected_total,
        "observed_seat_count": len(day),
        "registered_layout_seat_count": len(by_number),
        "observed_row_order_count": floor_count["row_order_observed"],
        "unmapped_on_latest_date": len(missing),
        "unmapped_ranges": unmapped_ranges,
        "warning": "実店舗の幾何座標は未確定。色・所属情報と現地申告による列内順を区別。集計元の日付より後の入替を保証しません。",
        "seats": machine_rows,
    }


def main():
    data = build_inventory()
    if data["registered_layout_seat_count"] < 200:
        raise ValueError("floor area registry shrunk unexpectedly")
    if data["observed_row_order_count"] != 65:
        raise ValueError("the 65 field-reported silver positions were lost")
    path = DATA / "floor_inventory.json"
    serialized = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if not path.exists() or path.read_text(encoding="utf-8") != serialized:
        path.write_text(serialized, encoding="utf-8")
    print("Floor inventory:", data["data_date"], "observed", data["observed_seat_count"], "mapped", data["registered_layout_seat_count"], "field-ordered", data["observed_row_order_count"], "latest-unmapped", data["unmapped_on_latest_date"])


if __name__ == "__main__":
    main()
