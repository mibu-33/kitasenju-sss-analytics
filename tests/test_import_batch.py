import sys
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import import_batch
import sync


def test_import_per_seat_with_source_and_no_false_summary(tmp_path):
    inbox=tmp_path/'imports';inbox.mkdir()
    data=tmp_path/'data';data.mkdir()
    (inbox/'valid.csv').write_text('日付,台番号,機種,差枚,G数\n2026/10/15,205,テスト機種,"+1,900","6,500"\n',encoding='utf-8')
    with patch.object(import_batch,'ROOT',data),patch.object(import_batch,'INBOX',inbox),patch.object(sync,'ROOT',data):
        import_batch.process()
    import json
    rows=json.loads((data/'records.json').read_text())
    assert len(rows)==1 and rows[0]['diff']==1900
    assert rows[0]['source']=='user-authorized-export'
    assert json.loads((data/'summary.json').read_text())==[]
    with patch.object(import_batch,'ROOT',data),patch.object(import_batch,'INBOX',inbox),patch.object(sync,'ROOT',data):
        import_batch.process()
    assert len(json.loads((data/'records.json').read_text()))==1
