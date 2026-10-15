import datetime as dt, json, re, time
from pathlib import Path
from urllib.parse import urljoin
from zoneinfo import ZoneInfo
import requests
from bs4 import BeautifulSoup

BASE='https://www.slorepo.com/hole/e38394e383bce382a2e383bce382afe58c97e58d83e4bd8f535353code/'
ROOT=Path(__file__).resolve().parents[1]/'data'
S=requests.Session()
S.headers.update({'User-Agent':'SSS-Analytics/1.0 personal research'})
def number(v):
    m=re.search(r'-?\d+(?:\.\d+)?',str(v or '').replace(',','').replace('−','-'))
    return float(m.group()) if m else None
def read(name):
    try:return json.loads((ROOT/(name+'.json')).read_text(encoding='utf8'))
    except (OSError,ValueError):return {} if name=='status' else []
def save(name,obj):
    (ROOT/(name+'.json')).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def soup(url):
    if not url.startswith(BASE):raise ValueError('unapproved domain')
    r=S.get(url,timeout=30,allow_redirects=True)
    r.raise_for_status()
    if not r.url.startswith(BASE):raise ValueError('unexpected redirect')
    if len(r.content)>10_000_000:raise ValueError('response too large')
    if any(w in r.text[:1500].lower() for w in ('captcha','cloudflare challenge','access denied')):raise ValueError('access restriction')
    r.encoding=r.apparent_encoding or 'utf8'
    return BeautifulSoup(r.text,'html.parser')
def index(doc):
    summary={}; links={}
    for a in doc.select('a[href]'):
        if not re.search(r'\d{1,2}/\d{1,2}\s*\(',a.get_text(' ',strip=True)):continue
        url=urljoin(BASE,a['href'])
        if not url.startswith(BASE):continue
        m=re.search(r'/(20\d{6})/?$',url)
        if not m:continue
        d=dt.datetime.strptime(m.group(1),'%Y%m%d').date().isoformat()
        tr=a.find_parent('tr')
        if tr is None:continue
        cells=[c.get_text(' ',strip=True) for c in tr.find_all('td')]
        if len(cells)<4:continue
        diff,games=number(cells[1]),number(cells[2])
        if diff is None or games is None:continue
        win=re.search(r'(\d+)\s*/\s*(\d+)',cells[3])
        wins,count=(int(win[1]),int(win[2])) if win else (None,None)
        summary[d]={'date':d,'avg_diff':diff,'avg_games':games,'wins':wins,'count':count,'win_rate':100*wins/count if count else number(cells[3])}
        links[d]=url
    return summary,links
def col(head,patterns):
    normalized=[re.sub(r'\s','',s.lower()) for s in head]
    return next((i for i,s in enumerate(normalized) if any(p in s for p in patterns)),None)
def day(doc,date):
    machines=[];records=[]
    for t in doc.select('table'):
        rows=[[c.get_text(' ',strip=True) for c in tr.find_all(['th','td'])] for tr in t.select('tr')]
        for i,h in enumerate(rows[:4]):
            seat=col(h,['台番号','台番']); name=col(h,['機種']); diff=col(h,['差枚','差玉']); games=col(h,['g数','ゲーム数','回転数']); win=col(h,['勝率'])
            if seat is not None and diff is not None and games is not None:
                for r in rows[i+1:]:
                    if max(seat,diff,games)>=len(r):continue
                    n=number(r[seat]);d=number(r[diff]);g=number(r[games])
                    if n is None or n!=int(n) or d is None or g is None or not (1<=n<=99999 and -30000<=d<=30000 and 0<=g<=50000):continue
                    records.append({'date':date,'number':int(n),'machine':r[name] if name is not None and name<len(r) else '不明','diff':int(d),'games':int(g)})
                break
            avgdiff=col(h,['平均差枚']); avggames=col(h,['平均g','平均ゲーム'])
            if None in (name,avgdiff,avggames,win):continue
            for r in rows[i+1:]:
                if max(name,avgdiff,avggames,win)>=len(r):continue
                d,g=number(r[avgdiff]),number(r[avggames]);m=re.search(r'(\d+)\s*/\s*(\d+)',r[win])
                if d is None or g is None or not m:continue
                machines.append({'date':date,'machine':r[name],'avg_diff':d,'avg_games':g,'wins':int(m[1]),'count':int(m[2])})
            break
    return machines,records
def main():
    ROOT.mkdir(exist_ok=True)
    status=read('status');status['last_attempt']=dt.datetime.now(ZoneInfo('Asia/Tokyo')).isoformat(timespec='seconds')
    summary={x['date']:x for x in read('summary')}
    machines={(x['date'],x['machine']):x for x in read('machine_daily')}
    records={(x['date'],x['number']):x for x in read('records')}
    errors=[]
    try:
        latest,links=index(soup(BASE))
        if not links:raise ValueError('日別リンクなし / HTML変更の可能性')
        summary.update(latest)
        for d in sorted(links,reverse=True)[:7]:
            try:
                m,r=day(soup(links[d]),d)
                for x in m:machines[(d,x['machine'])]=x
                for x in r:records[(d,x['number'])]=x
                if not m and not r:errors.append(d+' 集計なし')
                time.sleep(2.5)
            except Exception as e:errors.append(d+': '+str(e))
        status.update(status='partial' if errors else 'ok',last_success=status['last_attempt'],newest_date=max(summary))
    except Exception as e:
        errors.append(type(e).__name__+': '+str(e));status['status']='error'
    status['error']='; '.join(errors)[:1300] if errors else None
    save('summary',sorted(summary.values(),key=lambda x:x['date']))
    save('machine_daily',sorted(machines.values(),key=lambda x:(x['date'],x['machine'])))
    save('records',sorted(records.values(),key=lambda x:(x['date'],x['number'])))
    save('status',status)
    print(json.dumps(status,ensure_ascii=False))
    if status['status']=='error':raise SystemExit(1)
if __name__=='__main__':main()
