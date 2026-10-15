import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from import_local import parse_csv

def test_manual_csv(tmp_path):
    path=tmp_path/'data.csv';path.write_text('日付,台番号,機種,差枚,G数\n2026/10/15,205,試験A,"+1,900","6,500"\n',encoding='utf-8-sig')
    results=parse_csv(path)
    assert len(results)==1 and results[0]['date']=='2026-10-15' and results[0]['diff']==1900
