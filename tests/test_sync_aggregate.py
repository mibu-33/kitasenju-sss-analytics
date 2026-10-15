import io
import sys
import datetime as dt
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from bs4 import BeautifulSoup
from openpyxl import Workbook
from sync import extract_aggregate,summary_from_index,parse_raw_xlsx,as_date

def test_machine_daily():
    soup=BeautifulSoup('''<table><tr><th>機種</th><th>平均差枚</th><th>平均G数</th><th>勝率</th></tr><tr><td>モンキーターンV</td><td>+1,000</td><td>4,000</td><td>2/3</td></tr></table><table><tr><th>末尾番号</th><th>平均差枚</th><th>平均G数</th><th>勝率</th></tr><tr><td>末尾6</td><td>-100</td><td>2,000</td><td>1/5</td></tr></table>''','html.parser')
    m,t=extract_aggregate(soup,'2026-10-15')
    assert len(m)==len(t)==1
    assert m[0]['avg_diff']==1000 and m[0]['count']==3
    assert t[0]['tail']=='6' and t[0]['win_rate']==20

def test_index_with_date_in_url():
    soup=BeautifulSoup('<table><tr><td><a href="20260720/">7/20(月)</a></td><td>+157</td><td>5,015</td><td>40% (182/450)</td></tr></table>','html.parser')
    out,links=summary_from_index(soup,dt.date(2026,10,16))
    assert out[0]['date']=='2026-07-20' and out[0]['win_rate']==round(100*182/450,2)
    assert len(links)==1

def test_xlsx_dated_records():
    wb=Workbook();ws=wb.active;ws.title='2026-10-14';ws.append(['台番号','機種名','差枚','G数','BB','RB']);ws.append([205,'マイジャグラーV','+1,234',6700,28,25]);b=io.BytesIO();wb.save(b)
    rows=parse_raw_xlsx(b.getvalue());assert len(rows)==1 and rows[0]['number']==205 and rows[0]['diff']==1234

def test_xlsx_no_date_not_assumed():
    wb=Workbook();ws=wb.active;ws.title='RAW';ws.append(['台番','機種','差枚','G数']);ws.append([200,'Foo',1300,6000]);b=io.BytesIO();wb.save(b)
    assert parse_raw_xlsx(b.getvalue())==[]

def test_as_date():
    assert as_date('20261015')=='2026-10-15'
