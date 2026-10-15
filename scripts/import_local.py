"""Import an authorized SloRepo XLSX or dated CSV export into historical machine rows.

Usage:
  python scripts/import_local.py ~/Downloads/table_data.xlsx
  python scripts/import_local.py data_export.csv

Does not infer dates from file modification times, does not overwrite unrelated days.
"""
import csv
import json
import re
import sys
from pathlib import Path
from sync import ROOT, as_date, number, normalize_col, parse_raw_xlsx, read, save


def parse_csv(path):
    with path.open('r',encoding='utf-8-sig',newline='') as f:
        for delimiter in (',','\t'):
            f.seek(0)
            try:
                data=list(csv.reader(f,delimiter=delimiter))
            except UnicodeDecodeError:
                raise ValueError('CSVはUTF-8で保存してください')
            if not data: return []
            header=[normalize_col(x) for x in data[0]]
            if any('台番' in h or 'number' in h for h in header):break
        else:raise ValueError('台番の列がありません')
    def col(*matches):return next((i for i,h in enumerate(header) if any(x in h for x in matches)),None)
    coln=col('台番','number');cold=col('差枚','diff');colg=col('g数','games','回転数');coldate=col('日付','date');colm=col('機種','machine');colbb=col('bb');colrb=col('rb')
    if None in (coln,cold,colg,coldate):raise ValueError('CSVには日付,台番号,差枚,G数が必要です')
    def get(row,i):return row[i] if i is not None and i<len(row) else ''
    rows=[]
    for row in data[1:]:
        date=as_date(get(row,coldate));seat=number(get(row,coln));delta=number(get(row,cold));games=number(get(row,colg))
        if date is None or seat is None or seat!=int(seat) or not 1<=seat<=99999 or delta is None or games is None or not -30000<=delta<=30000 or not 0<=games<=50000:continue
        bb=number(get(row,colbb));rb=number(get(row,colrb))
        rows.append({'date':date,'number':int(seat),'machine':get(row,colm) or '機種不明','diff':int(delta),'games':int(games),'bb':int(bb) if bb is not None else None,'rb':int(rb) if rb is not None else None})
    return rows


def import_path(path):
    if path.suffix.lower() in ('.xlsx','.xlsm'):rows=parse_raw_xlsx(path.read_bytes())
    elif path.suffix.lower() in ('.csv','.tsv'):rows=parse_csv(path)
    else:raise ValueError('xlsxまたはUTF-8 CSVを指定してください')
    if not rows:raise ValueError('日付・台番・差枚・G数を持つ正しいレコードがありません')
    ROOT.mkdir(exist_ok=True)
    cache={(x['date'],x['number']):x for x in read('records.json',[])}
    cache.update({(r['date'],r['number']):r for r in rows})
    save('records.json', sorted(cache.values(),key=lambda x:(x['date'],x['number'])))
    print(json.dumps({'imported':len(rows),'total':len(cache),'latest':max(x['date'] for x in cache.values())},ensure_ascii=False))


if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('使い方: python scripts/import_local.py <table_data.xlsx または dated.csv>')
    import_path(Path(sys.argv[1]))
