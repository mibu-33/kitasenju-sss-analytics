"""Smoke test with fictional machine observations; nothing written to production data."""
from pathlib import Path
import json
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def test_browser(tmp_path):
    site=tmp_path/'site'
    shutil.copytree(ROOT/'public',site)
    data=site/'data';data.mkdir()
    fake=[{'date':'2026-10-14','number':205,'machine':'検証機種A','diff':900,'games':5000},
          {'date':'2026-10-14','number':206,'machine':'検証機種A','diff':-400,'games':5500},
          {'date':'2026-10-14','number':207,'machine':'検証機種B','diff':1500,'games':3000}]
    payloads={'records.json':fake,'summary.json':[{'date':'2026-10-14','avg_diff':666,'avg_games':4500,'win_rate':66.7}],
              'status.json':{'status':'ok','last_success':'2026-10-15T01:00:00+09:00','newest_date':'2026-10-14'},
              'machine_daily.json':[{'date':'2026-10-14','machine':'検証機種A','avg_diff':250,'avg_games':5250,'wins':1,'count':2}],
              'tail_daily.json':[],'layout.json':[],'events.json':[]}
    for fname,val in payloads.items(): (data/fname).write_text(json.dumps(val,ensure_ascii=False),encoding='utf-8')
    html=(site/'index.html').read_text(encoding='utf-8').replace('<script src="extensions.js"></script>', '<script>'+ (site/'extensions.js').read_text(encoding='utf-8')+'</script>')
    mocks=json.dumps({'data/'+k:v for k,v in payloads.items()},ensure_ascii=False)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':390,'height':844})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        mockjs="const data = %s;window.fetch=async (u)=>{const key=String(u).split('?')[0];if(key in data)return {ok:true,json:async()=>data[key]};return {ok:false,status:404,json:async()=>null}};" % mocks
        page.set_content(html.replace('<script>', '<script>'+mockjs+'</script><script>',1),wait_until='load')
        page.wait_for_timeout(250)
        assert page.locator('#stats').inner_text().find('3') >= 0
        page.get_by_role('button',name='実島図・通路').click()
        page.locator('#positionNumber').fill('205')
        page.locator('#corridor').fill('A')
        page.locator('#positionOrder').fill('1')
        page.locator('#addLayout').click()
        assert '205' in page.locator('#layoutGrid').inner_text()
        page.get_by_role('button',name='おすすめ検証').click()
        page.locator('#eventDate').fill('2026-10-14')
        page.locator('#eventMachine').fill('検証機種A')
        page.locator('#addEvent').click()
        assert '検証機種A' in page.locator('#eventTable').inner_text()
        page.get_by_role('button',name='参考ランキング').click()
        assert '検証機種A' in page.locator('#candidateTable').inner_text()
        page.screenshot(path=str(tmp_path/'smoke.png'),full_page=True)
        assert not errors, errors
        browser.close()

