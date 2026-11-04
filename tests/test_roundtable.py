from scripts.sync_roundtable import parse_text,report,GROUPS
from datetime import date
import json
from pathlib import Path

EXAMPLE="""〖晒し屋の答え合わせ〗
10/1
📝ピーアーク北千住SSS（トリエス）
✅1/4角チャレンジ
53スマスロ北斗
✅円卓チャレンジ
1003カバネリ海門決戦・1007ヴヴヴ
1012からくりサーカス2・1016イニD2
✅毎日機種
1マギレコ・25ゴッドイーター
〖晒し屋の答え合わせ〗
10/2
📝ピーアーク北千住SSS（トリエス）
✅円卓チャレンジ
1003カバネリ海門決戦・1007ヴヴヴ
1009からくりサーカス2・1013カムイ
✅毎日機種
1マギレコ
"""

def test_extract_only_circle_and_no_out_of_order():
    p=parse_text(EXAMPLE,10)
    assert len(p)==2
    assert p[0]["targets"]=={"カバネリ":1003,"ヴヴヴ":1007,"からくり2":1012,"紫バラ":1016}
    assert p[1]["targets"]["カバネリ"]==1003
    assert not parse_text(EXAMPLE,9)

def test_initial_sourced_dataset():
    src=json.loads(Path("data/roundtable_targets.json").read_text(encoding="utf8"))
    rows=src["days"]
    assert len(rows)>=16
    assert len({r["date"] for r in rows})==len(rows)
    for row in rows:
        assert "2026-08-06"<=row["date"]<="2026-11-03"
        assert row["source_url"].startswith("https://")
        for g,n in row["targets"].items():
            assert n in GROUPS[g]
    m=report(rows)
    assert m["カバネリ"]["n"]>=16
    assert m["カバネリ"]["adjacent_pairs"]>=15
    assert m["カバネリ"]["repeat_pairs"]>=4

def test_do_not_infer_unobserved_days():
    rows=[{"date":"2026-10-01","targets":{"カバネリ":1001}},
          {"date":"2026-10-03","targets":{"カバネリ":1001}}]
    m=report(rows)
    assert m["カバネリ"]["adjacent_pairs"]==0
    assert m["カバネリ"]["repeat_rate_pct"] is None
