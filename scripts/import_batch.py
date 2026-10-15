"""Import user-supplied, authorized SSS source exports placed in imports/.

Never infer missing dates or inflate partial seat data into a store-level summary.
Only files with a date, seat number, games and difference can be added.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from zoneinfo import ZoneInfo

from import_local import parse_csv
from sync import ROOT, read, save, parse_raw_xlsx

BASE = Path(__file__).resolve().parents[1]
INBOX = BASE/'imports'
SUPPORTED = {'.csv','.tsv','.xlsx','.xlsm'}


def process():
    INBOX.mkdir(exist_ok=True)
    ROOT.mkdir(exist_ok=True)
    registry = read('imported_files.json', {})
    records = {(x['date'],x['number']):x for x in read('records.json', [])}
    summary = {x['date']:x for x in read('summary.json', [])}
    problems=[]; changed=[]; imported=0
    for path in sorted(INBOX.iterdir()):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED:
            continue
        fingerprint=hashlib.sha256(path.read_bytes()).hexdigest()
        key=path.name
        if registry.get(key)==fingerprint:
            continue
        try:
            if path.suffix.lower() in ('.csv','.tsv'):
                rows=parse_csv(path)
            else:
                rows=parse_raw_xlsx(path.read_bytes())
            if not rows:
                raise ValueError('日付・台番号・G数・差枚の4列が確認できません')
            incoming={(row['date'],row['number']):row for row in rows}
            if len(incoming)!=len(rows):
                raise ValueError('同じ営業日と台番号の重複レコードがあります')
            for item in incoming.values():
                item['source']='user-authorized-export'
            records.update(incoming)
            imported+=len(incoming)
            registry[key]=fingerprint
            changed.append(key)
        except Exception as e:
            problems.append(f'{path.name}: {type(e).__name__}: {e}')
    # Store summary only when enough complete seat records for a given day are present.
    # User may load a single machine export; NEVER treat that as a whole-hall result.
    byday=defaultdict(list)
    for item in records.values():byday[item['date']].append(item)
    computed=0
    for day,rs in byday.items():
        if day in summary and summary[day].get('source') not in ('raw-derived',):
            continue
        if len(rs)<400:continue
        n=len(rs)
        summary[day]={
            'date':day,'avg_diff':round(sum(r['diff'] for r in rs)/n,2),
            'avg_games':round(sum(r['games'] for r in rs)/n,2),
            'win_rate':round(100*sum(r['diff']>0 for r in rs)/n,2),
            'wins':sum(r['diff']>0 for r in rs),'count':n,
            'source':'raw-derived'
        }
        computed+=1
    if changed:
        save('records.json',sorted(records.values(),key=lambda x:(x['date'],x['number'])))
        save('summary.json',sorted(summary.values(),key=lambda x:x['date']))
        save('imported_files.json',registry)
        status=read('status.json',{})
        status['last_import_success']=dt.datetime.now(ZoneInfo('Asia/Tokyo')).isoformat(timespec='seconds')
        status['import_rows_added']=imported
        status['dated_machine_rows']=len(records)
        status['indexed_days']=len(summary)
        status['newest_date']=max([*summary,*[r['date'] for r in records.values()]],default=None)
        # Preserve the previous network error; the import is a separate provenance path.
        if status.get('status')=='error':status['status']='partial'
        save('status.json',status)
    print(json.dumps({'changed':changed,'import_rows':imported,'computed_summaries':computed,'problems':problems},ensure_ascii=False))
    if problems:raise SystemExit(1)

if __name__=='__main__':process()
