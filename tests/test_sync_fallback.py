import importlib.util
import pathlib

spec=importlib.util.spec_from_file_location('sync_fallback',pathlib.Path(__file__).resolve().parents[1]/'scripts'/'sync_fallback.py')
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def fixture(count=451):
    header='<tr><th>機種名</th><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th><th>ART</th></tr>'
    rows=''.join(f'<tr><td>モンキーターンV</td><td>{n}</td><td>6,000</td><td>{"+500" if n%2 else "-250"}</td><td>18</td><td>9</td><td>3</td></tr>' for n in range(1,count+1))
    return '<html><body><h1>2026年10月18日(日) ピーアーク北千住SSS</h1><table>'+header+rows+'</table></body></html>'


def test_valid_day():
    items=mod.parse_day(fixture(),'2026-10-18')
    assert len(items)==451
    assert items[0]['source']=='slo-navi'
    assert items[0]['diff']==500
    assert items[1]['diff']==-250
    s=mod.summarize(items)
    assert s['count']==451 and s['wins']==226 and s['source']=='slo-navi-derived'


def test_reject_partial():
    try:mod.parse_day(fixture(20),'2026-10-18')
    except ValueError as e: assert 'incomplete' in str(e)
    else:raise AssertionError('accepted partial daily table')


def test_reject_wrong_hall():
    try:mod.parse_day(fixture().replace('北千住SSS','金町'),'2026-10-18')
    except ValueError as e: assert 'hall title' in str(e)
    else:raise AssertionError('accepted foreign hall')


def test_reject_wrong_date():
    try:mod.parse_day(fixture(),'2026-10-17')
    except ValueError as e: assert 'date' in str(e)
    else:raise AssertionError('accepted unrelated day')


def test_backfill():
    today=__import__('datetime').date(2026,10,19)
    assert mod.days_to_fetch({'2026-10-18'},today,3)==['2026-10-17','2026-10-16','2026-10-15']
