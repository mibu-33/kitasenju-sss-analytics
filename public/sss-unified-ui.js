/* Unified floor analytics for Kitasenju SSS.
 * Powered entirely by the existing dated records and 11/13 SVG layout.
 * Mean difference is not a setting probability or confirmation.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number.isFinite(Number(v))?Math.round(Number(v)).toLocaleString('ja-JP'):'—';
const signed=v=>v==null?'—':(Number(v)>0?'+':'')+fmt(v);
const zones={red:'レッド',blue:'ブルー',green:'グリーン',silver:'シルバー',gold:'ゴールド',purple:'パープル'};
const C={purple:'#7030a0',blue:'#4472c4',cyan:'#00b0f0',green:'#70ad47',lightgreen:'#c6efce',neutral:'#fff',lightred:'#f4cccc',red:'#c00000',unknown:'#b7c5d5'};
const S={mode:'day',range:30,tab:'machines',min:5,ready:false,favs:new Set(),key:null,cache:null,machine:'',machineDate:'',machineNumbers:[],machineCursor:-1,deepLinked:false};
try{const x=JSON.parse(localStorage.getItem('sss-favorites-v2')||'[]');if(Array.isArray(x))S.favs=new Set(x.map(Number).filter(Number.isInteger))}catch(_){}
const api=()=>window.sssFloorBridge;
const date=()=>api()?.getState().date||'';
const allDates=()=>api()?api().getAvailableDates().filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort():[];
function datesForMode(){
 const base=date(),end=Date.parse(base+'T00:00:00Z');
 return allDates().filter(d=>d<=base&&(S.range===0||(end-Date.parse(d+'T00:00:00Z'))/86400000<S.range)&&
 (S.mode==='range'||S.mode==='day'||Number(d.slice(-1))===Number(S.mode)));
}
const description=()=>S.mode==='day'?'当日差枚':(S.range===0?'全期間':S.range+'日間')+'・'+(S.mode==='range'?'全日':S.mode+'の日');
function samples(){
 if(!api())return[];
 const data=api().getData();
 if(S.mode==='day')return [...data.day.values()].filter(r=>r?.diff!=null&&Number(r.games)>0);
 const out=[];
 for(const d of datesForMode()){const day=data.history.get(d);if(!day)continue;for(const r of day.values())if(r?.diff!=null&&Number(r.games)>0)out.push(r)}
 return out;
}
function groups(rows,keyOf){
 const m=new Map();
 for(const row of rows){
  const k=keyOf(row);if(k==null||k==='')continue;
  let a=m.get(k);if(!a){a={key:k,sum:0,gameSum:0,count:0,wins:0};m.set(k,a)}
  a.count++;a.sum+=Number(row.diff)||0;a.gameSum+=Number(row.games)||0;if(Number(row.diff)>0)a.wins++;
 }
 return [...m.values()].map(a=>({...a,mean:a.sum/a.count,win:a.wins/a.count*100,avgGame:a.gameSum/a.count}));
}
function stats(){
 const k=[date(),S.mode,S.range,api()?.getData().history.size].join('|');
 if(S.key===k&&S.cache)return S.cache;
 const rows=samples(),numbers=new Map(groups(rows,r=>Number(r.number)).map(x=>[Number(x.key),x]));
 return (S.key=k,S.cache={rows,numbers,dates:S.mode==='day'?[date()]:datesForMode()},S.cache);
}
function heatColor(value,mode){
 if(value==null||!Number.isFinite(Number(value)))return C.unknown;
 const x=Number(value);
 if(mode==='day'){
  if(x>=10000)return C.purple;if(x>=7000)return C.blue;if(x>=5000)return C.cyan;
  if(x>=3000)return C.green;if(x>=1000)return C.lightgreen;
  if(x<=-3000)return C.red;if(x<=-1000)return C.lightred;return C.neutral;
 }
 if(x>=3000)return C.purple;if(x>=1000)return C.blue;if(x>=300)return C.green;
 if(x>=0)return C.lightgreen;if(x<=-2000)return C.red;if(x<=-500)return C.lightred;return C.neutral;
}
function machineSelection(){
 const select=$('sss-machine-filter');if(!select||!api())return;
 const day=api().getData().day,dayKey=date()+'|'+day.size;
 if(S.machineDate!==dayKey){
  const groupsByMachine=new Map();
  for(const row of day.values()){
   if(!row?.machine||!Number.isInteger(Number(row.number)))continue;
   const name=String(row.machine),list=groupsByMachine.get(name)||[];
   list.push(Number(row.number));groupsByMachine.set(name,list);
  }
  S.machineDate=dayKey;
  if(S.machine&&!groupsByMachine.has(S.machine)){S.machine='';S.machineCursor=-1}
  select.replaceChildren();
  const first=document.createElement('option');first.value='';first.textContent='全機種を表示';select.appendChild(first);
  for(const [name,nums] of [...groupsByMachine].sort((a,b)=>a[0].localeCompare(b[0],'ja'))){
   const option=document.createElement('option');option.value=name;
   option.textContent=(window.sssMachineLabels?.shorten(name)||name)+' ('+nums.length+'台)';
   option.title=name;
   select.appendChild(option);
  }
  select.value=S.machine;
 }
 const list=[...day.values()].filter(r=>r?.machine===S.machine).map(r=>Number(r.number)).filter(Number.isInteger).sort((a,b)=>a-b);
 S.machineNumbers=S.machine?list:[];
 const visible=api().getVisiblePositions();
 const matched=S.machineNumbers.filter(n=>visible.has(n)).length;
 $('sss-machine-next').disabled=!S.machineNumbers.length;
 const count=$('sss-machine-count');
 if(count)count.textContent=S.machine?(S.machineNumbers.length+'台（この表示 '+matched+'台）'):(day.size?'機種を選ぶと台を強調':'この日付の機種データなし');
}
function stepMachine(){
 if(!S.machineNumbers.length)return;
 const selected=Number(api().getState().selected);
 const current=S.machineNumbers.indexOf(selected);
 const index=current<0?0:(current+1)%S.machineNumbers.length;
 S.machineCursor=index;api().selectSeat(S.machineNumbers[index]);
}
function shareSeat(n,button){
 if(typeof window==='undefined'||!window.location)return;
 const link=new URL(window.location.href);
 link.searchParams.set('date',date());link.searchParams.set('seat',String(n));
 link.hash='';
 const navigatorApi=window.navigator;
 if(navigatorApi?.clipboard?.writeText){
  navigatorApi.clipboard.writeText(link.toString()).then(()=>{button.textContent='リンクをコピーしました'}).catch(()=>{
   button.textContent='コピーできません。下のURLを利用してください';
   const url=document.createElement('p');url.textContent=link.toString();button.parentNode?.append(url);
  });
 }else{
  button.textContent='このURLをコピーしてください';
  const url=document.createElement('p');url.textContent=link.toString();button.parentNode?.append(url);
 }
}
function restoreSharedSeat(){
 if(S.deepLinked||typeof window==='undefined'||!window.location)return;
 S.deepLinked=true;
 const p=new URLSearchParams(window.location.search);
 const number=Number(p.get('seat'));const d=p.get('date');
 if(!Number.isInteger(number)||number<1||number>9999)return;
 // onReady occurs before the first map render. Defer until the SVG seats exist.
 Promise.resolve().then(async()=>{
  if(/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&allDates().includes(d)&&d!==date()){
   try{await api().setDate(d)}catch(_){return}
  }
  api().selectSeat(number);
 });
}
async function fetchSyncHealth(){
 const el=$('sss-sync-text'),details=$('sss-sync-details'),panel=$('sss-sync-banner');
 if(!el||!panel)return;
 try{
  const r=await fetch('data/status.json?t='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  const d=await r.json();
  const newest=d.newest_date||api()?.getState().latest||'不明';
  const fallbackOk=d.fallback_status==='ok'&&Boolean(d.fallback_last_success);
  const primaryOk=d.status==='ok';
  panel.classList.toggle('sss-sync-warning',!primaryOk);
  el.textContent='収集済み '+newest+' ／ '+(primaryOk?'通常取得に成功':fallbackOk?'主取得に制限・代替取得実績あり':'自動取得に問題あり');
  if(details)details.textContent='主経路：'+(primaryOk?'成功':d.error||'失敗')+
   ' ／ 代替経路：'+(fallbackOk?'成功（最終 '+d.fallback_last_success+'）':d.fallback_status||'未確認')+
   ' ／ 収録日数：'+(d.indexed_days??'不明')+'。収集済みデータと最新営業日の実績を混同しないでください。';
 }catch(err){
  panel.classList.add('sss-sync-warning');
  el.textContent='取得状況を確認できません（表示中のデータは保持）';
  if(details)details.textContent=String(err);
 }
}
function paint(){
 if(!api())return;
 const {numbers}=stats(),day=api().getData().day;
 document.querySelectorAll('#map g.s').forEach(g=>{
  const n=Number((g.getAttribute('aria-label')||'').replace('番',''));
  if(!Number.isFinite(n))return;
  const r=g.querySelector('rect.cell');if(!r)return;
  const metric=numbers.get(n),entry=day.get(n);
  const value=S.mode==='day'?(entry?.diff??null):metric?.mean;
  const color=heatColor(value,S.mode);
  const matched=!S.machine||entry?.machine===S.machine;
  g.setAttribute('opacity',matched?'1':'.28');
  r.setAttribute('fill',color);
  r.setAttribute('fill-opacity',S.mode==='day'||(metric?.count||0)>=Math.min(3,S.min)?1:.55);
  r.setAttribute('stroke',S.machine&&matched?'#42e5ff':S.favs.has(n)?'#fbbf24':'#fff');
  r.setAttribute('stroke-width',S.machine&&matched?'1.8':S.favs.has(n)?'1.2':'.4');
  const label=g.querySelector('text');
  if(label)label.setAttribute('fill',[C.purple,C.blue,C.green,C.red].includes(color)?'#fff':'#233447');
  const title=g.querySelector('title');
  if(title)title.textContent=n+'番｜'+(entry?.machine||api().getData().inventory.get(n)?.machine||'不明')+'｜'+signed(value)+'枚'+(S.mode==='day'?'':'／'+(metric?.count||0)+'台日');
 });
}
function renderLegend(){
 const target=$('sss-heatmap-legend');if(!target)return;
 const day=S.mode==='day';
 const items=day?[
  [C.purple,'+10,000枚〜'],[C.blue,'+7,000枚〜'],[C.cyan,'+5,000枚〜'],
  [C.green,'+3,000枚〜'],[C.lightgreen,'+1,000枚〜'],[C.neutral,'±999枚以内'],
  [C.lightred,'−1,000枚〜'],[C.red,'−3,000枚以下'],[C.unknown,'未取得']
 ]:[
  [C.purple,'平均+3,000枚〜'],[C.blue,'平均+1,000枚〜'],[C.green,'平均+300枚〜'],
  [C.lightgreen,'平均0枚〜'],[C.neutral,'−499〜−1枚'],[C.lightred,'平均−500枚〜'],
  [C.red,'平均−2,000枚以下'],[C.unknown,'データ不足']
 ];
 const whiteText=new Set([C.purple,C.blue,C.cyan,C.green,C.red]);
 target.innerHTML=items.map(([color,label])=>'<span class="sss-legend-chip" style="background:'+color+';color:'+(whiteText.has(color)?'#fff':'#243244')+'">'+label+'</span>').join('');
}
function kpis(){
 const target=$('sss-kpis');if(!target||!api())return;
 const raw=[...api().getData().day.values()].filter(r=>r?.diff!=null);
 const active=raw.filter(r=>Number(r.games)>0);
 const total=raw.reduce((s,r)=>s+Number(r.diff||0),0),win=active.filter(r=>Number(r.diff)>0).length;
 const k=[['総差枚',signed(total)+'枚',total],['平均差枚',raw.length?signed(total/raw.length)+'枚':'—',raw.length?total/raw.length:null],
  ['稼働台数',active.length+'台',null],['プラス台',win+'台',null],
  ['平均G',active.length?fmt(active.reduce((s,r)=>s+Number(r.games||0),0)/active.length)+'G':'—',null]];
 target.innerHTML=k.map(([name,value,n])=>'<div class="sss-kpi">'+name+'<strong class="'+(n==null?'':n>=0?'positive':'negative')+'">'+esc(value)+'</strong></div>').join('');
}
function dateBar(){
 const d=date(),list=allDates(),idx=list.indexOf(d);
 $('sss-date-label').textContent=d?d.slice(5).replace('-','/')+'（'+d.slice(0,4)+'）':'—';
 $('sss-prev').disabled=idx<=0;$('sss-next').disabled=idx<0||idx===list.length-1;
 const fresh=$('sss-data-freshness'),latest=api().getState().latest;
 fresh.textContent='最新 '+(latest?.slice(5)||'不明')+' ／ '+description();
 const lag=(Date.now()-Date.parse(latest+'T00:00:00+09:00'))/86400000;
 fresh.classList.toggle('stale',Number.isFinite(lag)&&lag>3);
}
function summary(){
 const target=$('sss-rank-summary'),{rows,dates}=stats();
 const leaders=groups(rows,r=>r.machine||'機種未登録').filter(a=>a.count>=S.min).sort((a,b)=>b.mean-a.mean).slice(0,5);
 $('sss-mode-sub').textContent=description();
 document.querySelectorAll('[data-sss-mode]').forEach(b=>b.classList.toggle('active',b.dataset.sssMode===S.mode));
 target.innerHTML='<span>'+esc(description())+' ／ '+fmt(rows.length)+'台日'+(S.mode==='day'?'':' ／ '+dates.length+'営業日')+'（設定確定情報ではありません）</span>'+
 (leaders.length?'<div class="sss-leaders">'+leaders.map(a=>'<span class="sss-leader">'+esc(a.key)+' '+signed(a.mean)+'枚（'+a.count+'台日）</span>').join('')+'</div>':'');
}
function table(head,body){
 if(!body.length)return'<p class="small">条件に合うデータがありません。</p>';
 return'<div class="sss-table-wrap"><table class="sss-data-table"><thead><tr>'+head.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+body.join('')+'</tbody></table></div>';
}
function statRow(a,label,num){
 return '<tr><td>'+(num?'<button data-sss-seat="'+num+'">'+esc(label)+'</button>':esc(label))+'</td><td>'+fmt(a.count)+'</td><td>'+signed(a.mean)+'</td><td>'+a.win.toFixed(1)+'%</td><td>'+fmt(a.avgGame)+'</td></tr>';
}
function analytics(){
 if(!$('sss-table-body')||!api())return;
 const {rows,numbers,dates}=stats(),bridge=api();
 $('sss-analysis-context').textContent=(S.mode==='day'?date():description()+' / '+dates.length+'営業日')+' ／ 平均差枚の降順';
 let html='';
 if(S.tab==='machines'){
  const a=groups(rows,r=>r.machine||'機種未登録').filter(x=>x.count>=S.min).sort((a,b)=>b.mean-a.mean);
  html=table(['機種','台日','平均差枚','勝率','平均G'],a.map(x=>statRow(x,x.key)));
 }else if(S.tab==='areas'){
  const p=bridge.getPlacements();
  const a=groups(rows,r=>p.get(Number(r.number))?.zone||'unknown').filter(x=>x.count>=S.min).sort((a,b)=>b.mean-a.mean);
  html='<p class="sss-hint">11/13の配置を使った集計です。過去日の実際の配置変更は未反映です。</p>'+
   table(['色エリア','台日','平均差枚','勝率','平均G'],a.map(x=>statRow(x,zones[x.key]||'未確認')));
 }else if(S.tab==='numbers'){
  const a=[...numbers.values()].filter(x=>x.count>=S.min).sort((a,b)=>b.mean-a.mean).slice(0,50);
  html=table(['台番号','台日','平均差枚','勝率','平均G'],a.map(x=>statRow(x,x.key,Number(x.key))));
 }else{
  const a=[...S.favs].sort((a,b)=>a-b).map(n=>({n,x:numbers.get(n),name:bridge.getData().day.get(n)?.machine||bridge.getData().inventory.get(n)?.machine||'機種未登録'}));
  html='<p class="sss-hint">★はこの端末内の保存のみ。設定投入を保証しません。</p>'+
   table(['台番号','機種','平均差枚','台日'],a.map(({n,x,name})=>'<tr><td><button data-sss-seat="'+n+'">'+n+'</button></td><td>'+esc(name)+'</td><td>'+(x?signed(x.mean):'—')+'</td><td>'+(x?fmt(x.count):'—')+'</td></tr>'));
 }
 const el=$('sss-table-body');el.innerHTML=html;
 el.querySelectorAll('[data-sss-seat]').forEach(b=>b.onclick=()=>{bridge.selectSeat(Number(b.dataset.sssSeat));$('detail').scrollIntoView({behavior:'smooth',block:'nearest'})});
}
function auditMachineNumbers(){
 const target=$('sss-machine-audit-result'),count=$('sss-machine-audit-count');
 if(!target||!api())return;
 const ref=api().getReferenceLabels?.()||{};
 const numbers=Object.keys(ref);
 if(!numbers.length){count.textContent='参照データ未取得';target.textContent='11/13参考図の機種名を読み込めませんでした。';return}
 const daily=api().getData().day,shorten=window.sssMachineLabels?.shorten;
 let equal=0,compared=0,missing=0;
 const disagreements=[];
 for(const key of numbers){
  const n=Number(key),record=daily.get(n);
  if(!record?.machine){missing++;continue}
  compared++;
  const actual=shorten?shorten(record.machine):record.machine;
  if(actual===ref[key])equal++;
  else disagreements.push({number:n,reference:ref[key],actual:actual,raw:record.machine});
 }
 disagreements.sort((a,b)=>a.number-b.number);
 count.textContent='一致 '+equal+'/'+compared+'台';
 count.style.color=disagreements.length?'#f6be80':'#a2e1c4';
 let message='<p class="sss-hint">選択日 '+esc(date())+' ／ 参考図に機種名がある450台中、照合可能 '+compared+'台、一致 '+equal+'台、相違 '+disagreements.length+'台、当日データ不足 '+missing+'台。</p>';
 message+='<p class="sss-hint">※11/13の図には691番の数字がありますが機種は未確認。実績台帳の601番は図上に位置を確認できないため、誤って同一視しません。</p>';
 if(disagreements.length)message+=table(['台番号','11/13の表記','選択日の表記','実績の正式機種名'],disagreements.map(x=>
  '<tr><td><button data-sss-seat="'+x.number+'">'+x.number+'</button></td><td>'+esc(x.reference)+'</td><td>'+esc(x.actual)+'</td><td>'+esc(x.raw)+'</td></tr>'));
 else message+='<p class="sss-hint">照合した機種名に不一致は見つかりませんでした。島の座席位置まで実測で確認できたという意味ではありません。</p>';
 target.innerHTML=message;
 target.querySelectorAll('[data-sss-seat]').forEach(b=>b.onclick=()=>api().selectSeat(Number(b.dataset.sssSeat)));
}
function update(){if(!S.ready)return;S.key=null;machineSelection();dateBar();kpis();paint();renderLegend();summary();analytics();auditMachineNumbers()}
async function setMode(m){
 if(!['day','range','3','6','0'].includes(m))return;
 S.mode=m;
 if(m!=='day'){
  $('sss-mode-sub').textContent='履歴を読み込み中…';
  try{await api().ensureHistory()}catch(e){S.mode='day';$('sss-rank-summary').textContent='履歴を取得できません：'+e.message}
 }
 update();
}
function historyDetail(number,target){
 const list=allDates().filter(d=>d<=date()).slice(-14),history=api().getData().history;
 const rows=list.map(d=>({date:d,row:history.get(d)?.get(number)}));
 if(!rows.some(x=>x.row)){target.textContent='履歴なし';return}
 const max=Math.max(1000,...rows.map(x=>Math.abs(Number(x.row?.diff)||0)));
 target.innerHTML='<div class="sss-detail-history">'+rows.map(x=>{
  const v=Number(x.row?.diff||0),h=Math.min(40,Math.max(2,Math.abs(v)/max*40));
  return '<span class="sss-detail-bar" title="'+esc(x.date)+' '+(x.row?signed(v):'未取得')+'"><i style="height:'+h+'px;background:'+
  (!x.row?'#7d90aa':v>=0?'#6cdbab':'#ec8497')+'"></i><small>'+esc(x.date.slice(-2))+'</small></span>';
 }).join('')+'</div>';
}
function saveFavorites(){try{localStorage.setItem('sss-favorites-v2',JSON.stringify([...S.favs].sort((a,b)=>a-b)))}catch(_){}}
function seatDetails(n,panel){
 if(!S.ready||!panel)return;
 panel.querySelector('.sss-extra-detail')?.remove();
 const div=document.createElement('div');div.className='sss-extra-detail';
 div.innerHTML='<div class="sss-detail-actions"><button class="sss-star">'+(S.favs.has(n)?'★ お気に入り解除':'☆ お気に入り登録')+
 '</button><button class="sss-history">過去14日の推移</button><button class="sss-share">台のリンクをコピー</button></div><p class="sss-detail-note">設定確定を示すものではありません。</p><div class="sss-detail-slot sss-hint">履歴を開くと直近の差枚を表示します。</div>';
 panel.appendChild(div);
 div.querySelector('.sss-share').onclick=()=>shareSeat(n,div.querySelector('.sss-share'));
 div.querySelector('.sss-star').onclick=()=>{
  if(S.favs.has(n))S.favs.delete(n);else S.favs.add(n);
  saveFavorites();paint();analytics();seatDetails(n,panel);
 };
 div.querySelector('.sss-history').onclick=async()=>{
  const slot=div.querySelector('.sss-detail-slot');slot.textContent='履歴を取得中…';
  try{await api().ensureHistory();if(api().getState().selected===n)historyDetail(n,slot)}
  catch(e){slot.textContent='履歴の取得失敗：'+e.message}
 };
}
function csv(){
 const map=api().getData().day,d=date(),rows=[['date','number','machine','diff','games']];
 [...map.values()].sort((a,b)=>Number(a.number)-Number(b.number)).forEach(r=>rows.push([d,r.number,r.machine||'',r.diff??'',r.games??'']));
 const data='\ufeff'+rows.map(a=>a.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='sss_'+d+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function onReady(){
 if(S.ready||!api()?.getState().latest)return;S.ready=true;
 $('sss-prev').onclick=()=>{const a=allDates(),i=a.indexOf(date());if(i>0)api().setDate(a[i-1])};
 $('sss-next').onclick=()=>{const a=allDates(),i=a.indexOf(date());if(i>=0&&i<a.length-1)api().setDate(a[i+1])};
 $('sss-date-label').onclick=()=>{if(window.sssPeerUI?.toggleDatePopover)window.sssPeerUI.toggleDatePopover();else{try{$('date').showPicker()}catch(_){$('date').focus()}}};
 $('sss-range').onchange=()=>{S.range=Number($('sss-range').value);S.key=null;setMode(S.mode)};
 document.querySelectorAll('[data-sss-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.sssMode));
 document.querySelectorAll('[data-sss-tab]').forEach(b=>b.onclick=()=>{
  S.tab=b.dataset.sssTab;document.querySelectorAll('[data-sss-tab]').forEach(x=>x.classList.toggle('active',x===b));analytics();
 });
 $('sss-export').onclick=csv;
 $('sss-machine-filter').onchange=()=>{
  S.machine=$('sss-machine-filter').value;S.machineCursor=-1;machineSelection();paint();
 };
 $('sss-machine-next').onclick=stepMachine;
 $('sss-sync-refresh').onclick=fetchSyncHealth;
 fetchSyncHealth();
 $('sss-analysis-results').innerHTML='<div class="sss-analysis-controls"><label>最低サンプル <select id="sss-minsample"><option value="1">1台日</option><option value="3">3台日</option><option value="5" selected>5台日</option><option value="10">10台日</option><option value="20">20台日</option></select></label><span id="sss-analysis-context" class="sss-hint"></span></div><div id="sss-table-body"></div><p class="sss-hint">勝率＝稼働台日のうち差枚プラスの割合。強弱は選択日以前だけを集計。高設定の確定・設定予測を意味しません。</p>';
 $('sss-minsample').onchange=()=>{S.min=Number($('sss-minsample').value);update()};
 update();restoreSharedSeat();
}
window.sssUnifiedUI={onReady,onRender:update,onSeat:seatDetails,setMode,getStats:stats};
if(api()?.getState().latest)onReady();
})();
