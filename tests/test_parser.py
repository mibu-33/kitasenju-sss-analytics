import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from bs4 import BeautifulSoup
from sync import extract_day, number

def test_day_table():
    html='<table><tr><th>台番</th><th>機種名</th><th>差枚</th><th>G数</th></tr><tr><td>752</td><td>モンキーターン</td><td>+1,500</td><td>5,000</td></tr></table>'
    rows=extract_day(BeautifulSoup(html,'html.parser'),'2026-10-15')
    assert rows[0]['diff']==1500
    assert rows[0]['number']==752
    assert rows[0]['games']==5000
    assert rows[0]['machine']=='モンキーターン'

def test_number():
    assert number('-1,234枚')==-1234
    assert number('未掲載') is None
