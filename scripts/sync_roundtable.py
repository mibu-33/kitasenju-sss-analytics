"""Daily SSS roundtable answer-checks, non-authoritative third-party labels.
robots-aware and fail-closed; store only derived date/seat IDs, not article text.
"""
import datetime as dt, json, math, re, time
from collections import Counter
from pathlib import Path
from urllib import robotparser
from urllib.parse import urlsplit
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]/"data"
DEST=ROOT/"roundtable_targets.json"
PAGES={
"2026-08":"https://note.com/akb_sss_shisa/n/n3e70ef2c7bb4",
"2026-09":"https://note.com/akb_sss_shisa/n/na70db37e6fda",
"2026-10":"https://note.com/akb_sss_shisa/n/ne73b4776ebca",
"2026-11":"https://note.com/akb_sss_shisa/n/n41e9c59526b7",
}
GROUPS={"カバネリ":list(range(1001,1005)),"ヴヴヴ":list(range(1005,1009)),
"からくり2":list(range(1009,1013)),"紫バラ":list(range(1013,1018))}
UA="SSS-Analytics/1.4 (low-frequency read-only research)"
DATES=re.compile(r"(?m)^\s*(8|9|10|11)\s*/\s*(\d{1,2})\s*$")
SEATS=re.compile(r"(?<!\d)(10(?:0[1-9]|1[0-7]))(?!\d)")

def parse_text(txt,month):
    matches=list(DATES.finditer(txt));out={}
    for m in matches:
        if int(m.group(1))!=month:continue
        try:date=dt.date(2026,month,int(m.group(2))).isoformat()
        except ValueError:continue
        if not "答え合わせ" in txt[max(0,m.start()-190):m.start()]:continue
        block=txt[m.end():m.end()+1000]
        if "ピーアーク北千住SSS" not in block[:200]:continue
        start=block.find("円卓チャレンジ")
        end=block.find("毎日機種",max(0,start))
        if start<0 or start>420 or end<0 or end-start>450:continue
        nums=[int(x) for x in SEATS.findall(block[start:end])]
        if len(set(nums))!=len(nums):continue
        d={}
        for name,group in GROUPS.items():
            found=[n for n in nums if n in group]
            if len(found)==1:d[name]=found[0]
        if not d:continue
        if date not in out or len(d)>len(out[date]["targets"]):
            out[date]={"date":date,"targets":d,"complete":len(d)==4,
                      "classification":"third-party answer check, not verified settings"}
    return list(out.values())

def report(rows):
    results={}
    for name,choices in GROUPS.items():
        valid=sorted([(x["date"],x["targets"][name]) for x in rows if name in x["targets"]])
        counts=Counter(label for _,label in valid)
        pairs=[(a,b) for a,b in zip(valid,valid[1:])
               if (dt.date.fromisoformat(b[0])-dt.date.fromisoformat(a[0])).days==1]
        repeats=sum(a[1]==b[1] for a,b in pairs)
        # True out-of-sample scoring, only earlier reported selections.
        models={"baseline":{"n":0,"hit":0,"loss":0.0},
                "avoid_last":{"n":0,"hit":0,"loss":0.0},
                "recent14":{"n":0,"hit":0,"loss":0.0}}
        for i,(day,actual) in enumerate(valid):
            if i<14:continue
            previous=[v for _,v in valid[:i]]
            last=previous[-1]
            calendar_prev=(dt.date.fromisoformat(day)-dt.date.fromisoformat(valid[i-1][0])).days==1
            uniform={n:1/len(choices) for n in choices}
            avoid={n:(1 if n==last else 1.6) for n in choices} if calendar_prev else uniform.copy()
            den=sum(avoid.values());avoid={n:v/den for n,v in avoid.items()}
            counts14=Counter(previous[-14:])
            recent={n:2+counts14[n] for n in choices}
            den=sum(recent.values());recent={n:v/den for n,v in recent.items()}
            for typ,p in [("baseline",uniform),("avoid_last",avoid),("recent14",recent)]:
                obj=models[typ];obj["n"]+=1
                predicted=max(choices,key=lambda v:(p[v],-v))
                # Uniform baseline has no top seat; its hit rate is expected 1/k,
                # not the retrospective count for an arbitrary tie-breaker.
                obj["hit"]+=(1/len(choices) if typ=="baseline" else int(predicted==actual))
                obj["loss"]+=-math.log(max(p[actual],1e-9))
        for obj in models.values():
            n=obj["n"]
            obj["accuracy_pct"]=round(obj["hit"]/n*100,2) if n else None
            obj["log_loss"]=round(obj.pop("loss")/n,4) if n else None
        results[name]={"n":len(valid),"counts":{str(n):counts[n] for n in choices},
          "adjacent_pairs":len(pairs),"repeat_pairs":repeats,
          "repeat_rate_pct":round(100*repeats/len(pairs),2) if pairs else None,
          "random_repeat_pct":round(100/len(choices),2),
          "first":valid[0][0] if valid else None,"last":valid[-1][0] if valid else None,
          "walkforward":models}
    return results

def allowed(session,url):
    uri=urlsplit(url)
    try:
        resp=session.get(uri.scheme+"://"+uri.netloc+"/robots.txt",timeout=18)
        if not resp.ok:return False
        rp=robotparser.RobotFileParser();rp.parse(resp.text.splitlines())
        return rp.can_fetch(UA,url)
    except requests.RequestException:return False

def main():
    try:old=json.loads(DEST.read_text(encoding="utf8")).get("days",[])
    except (OSError,ValueError):old=[]
    dated={r["date"]:r for r in old if "date" in r and "targets" in r}
    session=requests.Session();session.headers.update({"User-Agent":UA})
    status={}
    for ym,url in PAGES.items():
        if not allowed(session,url):
            status[ym]="robots.txt unavailable or disallowed";continue
        try:
            response=session.get(url,timeout=30)
            if response.status_code in (401,403,429):
                status[ym]="blocked HTTP "+str(response.status_code);continue
            response.raise_for_status()
            if urlsplit(response.url).netloc!="note.com":
                status[ym]="redirect outside note.com";continue
            soup=BeautifulSoup(response.text,"html.parser")
            body=soup.find("article") or soup
            batch=parse_text(body.get_text("\n",strip=True),int(ym[-2:]))
            for row in batch:
                row["source_url"]=url
                if row["date"] not in dated or len(dated[row["date"]]["targets"])<len(row["targets"]):
                    dated[row["date"]]=row
            status[ym]="parsed "+str(len(batch))+" days"
        except requests.RequestException as exc: status[ym]=type(exc).__name__
        time.sleep(2.5)
    first,last="2026-08-06","2026-11-03"
    rows=[v for d,v in sorted(dated.items()) if first<=d<=last]
    result={"window_start":first,"window_end":last,
        "label_definition":"third-party roundtable challenge answer checks; not confirmed settings",
        "collection_status":status,"sources":list(PAGES.values()),
        "days":rows,"metrics":report(rows)}
    DEST.parent.mkdir(parents=True,exist_ok=True)
    DEST.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(json.dumps({"days":len(rows),"complete":sum(x.get("complete",False) for x in rows),
                      "collection_status":status},ensure_ascii=False))
if __name__=="__main__":main()
