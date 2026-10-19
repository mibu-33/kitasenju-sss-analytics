"""Read-only SloNavi secondary ingestion for P-ARK Kitasenju SSS (hall 11400).

Only use when allowed by robots.txt; low-frequency requests, no challenge bypass,
no guessing missing seats. Primary SloRepo source is kept independent. Runs on
GitHub Actions following the regular SloRepo sync.
"""
from __future__ import annotations
import datetime as dt
import json
import os
import re
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo
import requests
from bs4 import BeautifulSoup

HALL_ID = 11400
ORIGIN = "https://slo-navi.com"
ROOT = Path(__file__).resolve().parents[1] / "data"
JST = ZoneInfo("Asia/Tokyo")
UA = "SSS-Analytics/1.3 (read-only, low-frequency public hall-data research)"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept": "text/html"})
FIRST_FALLBACK = dt.date(2026, 7, 8)


def as_int(value):
    raw = str(value or '').replace(',', '').replace('，','').strip().replace('−','-')
    if raw in ('', '-', '－', '—', '―'): return None
    if not re.fullmatch(r'[+＋-]?\d+',raw): return None
    return int(raw.replace('＋','+'))


def load_json(name, default):
    try: return json.loads((ROOT / name).read_text('utf-8'))
    except (OSError, ValueError): return default


def store_json(name, obj):
    ROOT.mkdir(parents=True,exist_ok=True)
    path = ROOT / name
    value = json.dumps(obj, ensure_ascii=False, indent=2) + '\n'
    if not path.exists() or path.read_text('utf-8') != value:
        path.write_text(value,'utf-8')


def robots_permit():
    """Fail closed when access directives cannot be determined (except 404)."""
    r=SESSION.get(ORIGIN+'/robots.txt',timeout=22)
    if r.status_code == 404: return True
    if r.status_code != 200:
        raise PermissionError(f'robots.txt HTTP {r.status_code}; do not attempt data requests')
    from urllib.robotparser import RobotFileParser
    rp=RobotFileParser()
    rp.parse(r.text.splitlines())
    return rp.can_fetch(UA, f'{ORIGIN}/data/2026-10-18-{HALL_ID}/')


def parse_day(html: str, day: str):
    """Return fully observed seats, or refuse an incomplete/foreign hall page."""
    soup=BeautifulSoup(html, 'html.parser')
    title=soup.get_text(' ',strip=True)[:300]
    if 'ピーアーク北千住' not in title or 'SSS' not in title.upper():
        raise ValueError('hall title is not P-ARK Kitasenju SSS')
    date_pattern=rf'{day[:4]}年0?{int(day[5:7])}月0?{int(day[8:10])}日'
    if not re.search(date_pattern, title):
        raise ValueError('requested date is not visible in response title')
    records={}
    wanted=('機種名','台番号','G数','差枚')
    found_table=False
    for table in soup.select('table'):
        headers=[tr for tr in table.select('tr') if any(x in tr.get_text(' ',strip=True) for x in wanted)]
        if not headers: continue
        trs=table.select('tr')
        ix=None
        for n,tr in enumerate(trs[:10]):
            h=[re.sub(r'\s+','',x.get_text(' ',strip=True)).upper() for x in tr.find_all(['th','td'])]
            if all(any(k.upper() in z for z in h) for k in wanted):
                ix={key:next(j for j,s in enumerate(h) if key.upper() in s) for key in wanted}
                for key in ('BB','RB'):
                    ids=[j for j,s in enumerate(h) if key == s]
                    ix[key]=ids[0] if ids else None
                start=n+1
                found_table=True
                break
        if ix is None: continue
        for tr in trs[start:]:
            fields=[x.get_text(' ',strip=True) for x in tr.find_all(['td','th'])]
            if len(fields)<=max(ix[k] for k in wanted): continue
            number=as_int(fields[ix['台番号']]);games=as_int(fields[ix['G数']]);diff=as_int(fields[ix['差枚']])
            if number is None or not 1<=number<=99999 or games is None or not 0<=games<=50000 or diff is None or not -30000<=diff<=30000: continue
            machine=fields[ix['機種名']].strip()
            if not machine: continue
            def bonus(key):
                j=ix.get(key)
                return as_int(fields[j]) if j is not None and j<len(fields) else None
            rec={'date':day,'number':number,'machine':machine,'diff':diff,'games':games,'bb':bonus('BB'),'rb':bonus('RB'),'source':'slo-navi'}
            if number in records and (records[number]['machine']!=machine or records[number]['diff']!=diff):
                raise ValueError(f'conflicting duplicate machine number {number}')
            records[number]=rec
    if not found_table: raise ValueError('machine-by-seat table not found')
    # An SSS report should have ~450 observations; reject teaser/truncated pages.
    if not 400<=len(records)<=520:
        raise ValueError(f'incomplete machine-by-seat table ({len(records)} rows)')
    return sorted(records.values(),key=lambda x:x['number'])


def summarize(rows):
    """Observed all-seat totals, not vendor-reported numbers from another methodology."""
    d=rows[0]['date'];count=len(rows);wins=sum(r['diff']>0 for r in rows)
    return {'date':d, 'avg_diff':round(sum(r['diff'] for r in rows)/count,1),
        'avg_games':round(sum(r['games'] for r in rows)/count,1),
        'win_rate':round(100*wins/count,2), 'wins':wins, 'count':count,
        'source':'slo-navi-derived'}


def days_to_fetch(existing_dates, today, limit):
    yesterday=today-dt.timedelta(days=1)
    if yesterday<FIRST_FALLBACK: return []
    recent=[yesterday-dt.timedelta(days=x) for x in range(3)]
    recent=[x for x in recent if x>=FIRST_FALLBACK and x.isoformat() not in existing_dates]
    # Never redownload previously validated days; monotonically fill gaps backwards.
    missing=[];date=yesterday-dt.timedelta(days=3)
    while date>=FIRST_FALLBACK and len(missing)<1000:
        if date.isoformat() not in existing_dates:missing.append(date)
        date-=dt.timedelta(days=1)
    return [x.isoformat() for x in (recent+missing)[:limit]]


def main():
    now=dt.datetime.now(JST); status=load_json('status.json',{})
    status['fallback_last_attempt']=now.isoformat(timespec='seconds')
    existing={(x['date'],int(x['number'])):x for x in load_json('records.json',[])}
    summary={x['date']:x for x in load_json('summary.json',[])}
    existing_dates={d for d,n in existing if d>=FIRST_FALLBACK.isoformat()}
    limit=max(1,min(12,int(os.getenv('FALLBACK_DAYS_PER_RUN','6'))))
    targets=days_to_fetch(existing_dates,now.date(),limit)
    acquired=[];errors=[]
    try:
        if not robots_permit():raise PermissionError('robots.txt disallows /data/ for this User-Agent')
        for date in targets:
            url=f'{ORIGIN}/data/{date}-{HALL_ID}/'
            try:
                response=SESSION.get(url,timeout=35,allow_redirects=False)
                if response.status_code != 200:
                    if response.status_code in (401,403,429):
                        raise PermissionError(f'HTTP {response.status_code} from alternate source; stopping')
                    raise ValueError(f'HTTP {response.status_code}')
                if len(response.content)>24_000_000:raise ValueError(f'unexpectedly large report ({len(response.content)} bytes)')
                rows=parse_day(response.text,date)
                for item in rows:
                    key=(date,item['number'])
                    # Never overwrite a user-supplied SloRepo export when dates overlap.
                    if key not in existing:existing[key]=item
                if date not in summary: summary[date]=summarize(rows)
                acquired.append({'date':date,'rows':len(rows)})
                time.sleep(max(2.5,float(os.getenv('FALLBACK_REQUEST_INTERVAL','3'))))
            except PermissionError:raise
            except Exception as e:errors.append(f'{date}: {type(e).__name__}: {e}')
    except Exception as e:errors.append(f'{type(e).__name__}: {e}')
    status['fallback_status']='ok' if not errors else 'partial' if acquired else 'error'
    status['fallback_error']='; '.join(errors)[:1100] or None
    status['fallback_imported_days'] = [x['date'] for x in acquired]
    status['fallback_imported_rows'] = sum(x['rows'] for x in acquired)
    status['fallback_indexed_days'] = len(existing_dates|{x['date'] for x in acquired})
    status['fallback_source'] = ORIGIN+'/hall/11400/'
    if acquired:
        status['fallback_last_success']=now.isoformat(timespec='seconds')
        status['fallback_newest_date']=max([x['date'] for x in acquired]+[status.get('fallback_newest_date') or ''])
        status['last_success']=now.isoformat(timespec='seconds')
        status['newest_date']=max(status.get('newest_date') or '',status['fallback_newest_date'])
        status['status']='partial' if status.get('status')=='error' else status.get('status','ok')
        store_json('records.json',sorted(existing.values(),key=lambda x:(x['date'],x['number'])))
        store_json('summary.json',sorted(summary.values(),key=lambda x:x['date']))
    store_json('status.json',status)
    print(json.dumps({'acquired':acquired,'errors':errors,'status':status['fallback_status']},ensure_ascii=False))
    if errors and not acquired:raise SystemExit(1)


if __name__=='__main__':main()
