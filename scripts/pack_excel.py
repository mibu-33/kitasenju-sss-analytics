"""Create compressed, reproducible, non-Excel slot analytics from a user-supplied export.

Reads OOXML using only Python standard library.  It does not bypass access controls.
The original workbook is never included in the published site.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
import datetime as dt
import gzip
import json
from pathlib import Path
import re
import zipfile
import xml.etree.ElementTree as ET

NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
DATE = re.compile(r'(20\d\d)[/-](\d{1,2})[/-](\d{1,2})')
FIELDS=('date','number','machine','diff','games','bb','rb')

def date_value(v):
    m=DATE.search(str(v or ''))
    if not m:return None
    try:return dt.date(*map(int,m.groups())).isoformat()
    except ValueError:return None

def integer(v,optional=False):
    if v is None or str(v).strip()=='':return None if optional else None
    try:return int(float(str(v).replace(',','').strip()))
    except (ValueError,TypeError,OverflowError):return None

def sheet_rows(book):
    """Yields all nonempty shared/inline text cells for supported XLSX row layouts."""
    with zipfile.ZipFile(book) as z:
        if not any(n.startswith('xl/worksheets/sheet') and n.endswith('.xml') for n in z.namelist()):
            raise ValueError('Excelワークシートが存在しません')
        strings=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            with z.open('xl/sharedStrings.xml') as fh:
                for _,el in ET.iterparse(fh,events=('end',)):
                    if el.tag==NS+'si':
                        strings.append(''.join(x.text or '' for x in el.iter(NS+'t')))
                        el.clear()
        sheet_names=sorted(n for n in z.namelist() if re.fullmatch(r'xl/worksheets/sheet\d+\.xml',n))
        for sheet_name in sheet_names:
            with z.open(sheet_name) as fh:
                for _,el in ET.iterparse(fh,events=('end',)):
                    if el.tag!=NS+'row':continue
                    out={}
                    for cell in el.findall(NS+'c'):
                        ref=cell.get('r','')
                        match=re.match(r'([A-Z]+)',ref)
                        if not match:continue
                        index=0
                        for char in match.group(1):index=index*26+ord(char)-64
                        index-=1
                        if index>40:continue
                        val=cell.find(NS+'v')
                        if cell.get('t')=='inlineStr':
                            inline=cell.find(NS+'is')
                            text=''.join(t.text or '' for t in inline.iter(NS+'t')) if inline is not None else ''
                        else:
                            text=val.text if val is not None else ''
                            if cell.get('t')=='s' and text!='':text=strings[int(text)]
                        if text!='':out[index]=text
                    if out:yield out
                    el.clear()

def key_of(s):return re.sub(r'\s|[（）()_ -]','',str(s or '')).lower()

def extract(book):
    columns=None;observed={};names=set();skipped=0;duplicates=0
    for row in sheet_rows(book):
        if columns is None:
            h={key_of(v):i for i,v in row.items()}
            def match(*tokens):
                for key,index in h.items():
                    if any(token in key for token in tokens):return index
                return None
            columns={
                'shop':match('店舗'), 'date':match('日付','date'),
                'machine':match('機種'), 'number':match('台番号','台番'),
                'diff':match('差枚','差玉'), 'games':match('ゲーム数','g数','総回転'),
                'bb':match('ビッグボーナス数','bb'), 'rb':match('レギュラーボーナス数','rb'),
            }
            if all(columns.get(x) is not None for x in ('date','number','diff','games')):
                continue
            columns=None
            continue
        def field(k):return row.get(columns[k]) if columns[k] is not None else None
        shop=field('shop')
        if shop and 'ピーアーク北千住SSS' not in str(shop):
            raise ValueError(f'別店舗の記録を検出しました: {shop}')
        date=date_value(field('date'))
        seat=integer(field('number'));diff=integer(field('diff'));games=integer(field('games'))
        if date is None or seat is None or diff is None or games is None or not 0<seat<=99999 or not -30000<=diff<=30000 or not 0<=games<=50000:
            skipped+=1;continue
        machine=str(field('machine') or '機種不明').strip()
        key=(date,seat)
        item=(date,seat,machine,diff,games,integer(field('bb'),True),integer(field('rb'),True))
        if key in observed:
            duplicates+=1
            if observed[key]!=item:raise ValueError(f'同じ日・台番に異なる観測値があります: {key}')
        observed[key]=item
        names.add(machine)
    if columns is None:raise ValueError('必要な見出し列を検出できませんでした')
    if not observed:raise ValueError('有効な台別記録がありません')
    return list(observed.values()),{'skipped':skipped,'duplicates':duplicates,'machines':len(names)}

def aggregate(vals):
    n=len(vals); wins=sum(x[3]>0 for x in vals)
    return [n,round(sum(x[3] for x in vals)/n,2),round(sum(x[4] for x in vals)/n,2),round(wins*100/n,2),wins]

def pack(book,output):
    rows,checks=extract(book)
    dates=sorted({r[0] for r in rows});machines=sorted({r[2] for r in rows})
    dmap={d:i for i,d in enumerate(dates)};mmap={m:i for i,m in enumerate(machines)}
    # Match stable representation regardless of order in the input workbook.
    rows.sort(key=lambda r:(r[0],r[1]))
    daily=defaultdict(list);by_machine=defaultdict(list);by_tail=defaultdict(list)
    packed=[]
    for r in rows:
        d,n,m,diff,g,bb,rb=r;key=(d,n)
        packed.append([dmap[d],n,mmap[m],diff,g,bb,rb]);daily[d].append(r)
        by_machine[(d,m)].append(r);by_tail[(d,n%10)].append(r)
    payload={
        'version':1,'source':'user-supplied slorepo RAW export',
        'source_last_date':dates[-1],'first_date':dates[0],
        'dates':dates,'machines':machines,'rows':packed,
        'summary':[[dmap[d],*aggregate(rs)] for d,rs in sorted(daily.items())],
        'machine_daily':[[dmap[d],mmap[m],*aggregate(rs)] for (d,m),rs in sorted(by_machine.items())],
        'tail_daily':[[dmap[d],t,*aggregate(rs)] for (d,t),rs in sorted(by_tail.items())],
        'metadata':{'seat_days':len(rows),'days':len(dates),'machines':len(machines),'seats':len({r[1] for r in rows}),**checks}
    }
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    content=json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    with output.open('wb') as f:
        with gzip.GzipFile(fileobj=f, mode='wb',compresslevel=9,mtime=0) as gz:gz.write(content)
    print(json.dumps({'file':str(output),'gzip_bytes':output.stat().st_size,'uncompressed_bytes':len(content),'first_date':dates[0],'last_date':dates[-1],**payload['metadata']},ensure_ascii=False))
    return payload

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('xlsx');p.add_argument('--output',default='data/history.json.gz');args=p.parse_args()
    pack(args.xlsx,args.output)
