/* Optional analytical modules. No data are fabricated; unknowns stay unknown. */
const $x = id => document.getElementById(id);
const numeric = n => Number.isFinite(Number(n)) ? Number(n) : null;
let machineDaily = [], tailDaily = [], layoutRows = [], eventRows = [];
const storageKey = x => `sss-${x}-v1`;
const stash = (name,data) => { try { localStorage.setItem(storageKey(name),JSON.stringify(data)) } catch(e) { console.warn('端末に保存できません',e) } };
const retrieve = name => { try { const v=JSON.parse(localStorage.getItem(storageKey(name))||'null'); return Array.isArray(v)?v:null } catch {return null} };
const gdate = () => chosen || summary.at(-1)?.date || new Date().toISOString().slice(0,10);
const rowHtml = cells => `<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`;
const tableHtml = (headers,rows) => `<div class="tablewrap"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const num = n => Number(n||0).toLocaleString('ja-JP');
const coloredDiff = n => n==null?'—':colored(n);
const overall = a => a.length?{n:a.length,mean:a.reduce((s,x)=>s+Number(x.diff||0),0)/a.length,win:a.filter(x=>Number(x.diff)>0).length/a.length*100,games:a.reduce((s,x)=>s+Number(x.games||0),0)/a.length}:null;
function partialAggregate(a){
 const denominator=a.reduce((s,x)=>s+(+x.count||0),0);
 return denominator?{n:denominator,days:a.length,mean:a.reduce((s,x)=>s+(+x.avg_diff||0)*(+x.count||0),0)/denominator,games:a.reduce((s,x)=>s+(+x.avg_games||0)*(+x.count||0),0)/denominator,win:100*a.reduce((s,x)=>s+(+x.wins||0),0)/denominator}:null;
}
const mapGroup = (a,by) => {const m=new Map();for(const x of a){const k=by(x);if(!m.has(k))m.set(k,[]);m.get(k).push(x)}return [...m];};
const activeRows = (rows,date) => rows.filter(r => !r.from || r.from<=date).filter(r=>!r.to || r.to>=date);
const layoutAt = date => {
 const map=new Map();
 for(const r of activeRows(layoutRows,date).sort((a,b)=>(a.from||'').localeCompare(b.from||''))) map.set(Number(r.number),r);
 return map;
};
function csvParse(text) { // Commas and tabs, handles CSV quotes and CRLF.
 const rows=[];let row=[],field='',quoted=false;const delimiter=text.split(/\r?\n/,1)[0]?.includes('\t')?'\t':',';
 for(let i=0;i<text.length;i++){
  const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c}
  else if(c==='"')quoted=true;else if(c===delimiter){row.push(field);field=''}else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field=''}else field+=c;
 }
 if(field||row.length){row.push(field);rows.push(row)}
 return rows.filter(r=>r.some(c=>String(c).trim()));
}
function normalizeLayout(row){
 const r={number:Number(row.number),corridor:String(row.corridor||'').trim(),side:String(row.side||'').trim(),order:Number(row.order),from:String(row.from||'').trim(),to:String(row.to||'').trim()};
 if(!Number.isSafeInteger(r.number)||r.number<1||r.number>99999||!r.corridor||!['左','右'].includes(r.side)||!Number.isFinite(r.order)||r.order<0)throw Error('島図の形式が不正です。台番・通路・左右・位置番号を確認してください。');
 for (const d of [r.from,r.to])if(d&&!/^\d{4}-\d{2}-\d{2}$/.test(d))throw Error('有効期間はYYYY-MM-DD形式にしてください');
 if(r.from&&r.to&&r.from>r.to)throw Error('開始日が終了日より後です');
 return r;
}
function layoutCSV(s){const rows=csvParse(s);if(!rows.length)return [];
 const map={number:['number','台番','台番号'],corridor:['corridor','通路'],side:['side','左右','側'],order:['order','位置','並び順'],from:['from','開始日','適用開始'],to:['to','終了日','適用終了']};
 const header=rows[0].map(x=>x.trim().toLowerCase());const pos={};
 for(const [name,aliases] of Object.entries(map)) pos[name]=header.findIndex(h=>aliases.includes(h));
 if(['number','corridor','side','order'].some(k=>pos[k]<0))throw Error('CSVのヘッダには「台番,通路,左右,位置」が必要です');
 return rows.slice(1).map(r=>normalizeLayout(Object.fromEntries(Object.keys(pos).map(k=>[k,pos[k]<0?'':r[pos[k]]||'']))));
}
function position(r){return layoutAt(r.date).get(+r.number)}
function filterDays(a,dateKey='date'){const r=current().s;const allowed=new Set([...current().r.map(x=>x.date),...r.map(x=>x.date)]);return a.filter(x=>allowed.has(x[dateKey]));}
function renderAggregate(){
 const r=current().r,m=filterDays(machineDaily);const source=r.length?'台別データ':'機種別集計';
 const groups=r.length?mapGroup(r,x=>x.machine).map(([label,a])=>({label,...overall(a),days:new Set(a.map(x=>x.date)).size})):mapGroup(m,x=>x.machine).map(([label,a])=>({label,...partialAggregate(a)})).filter(x=>x.n);
 groups.sort((a,b)=>b.mean-a.mean);
 $x('aggregateTable').innerHTML=tableHtml(['機種','収集日数','対象台日','平均差枚','勝率','平均G'],groups.map(x=>rowHtml([esc(x.label),num(x.days),num(x.n),coloredDiff(x.mean),x.win.toFixed(1)+'%',num(Math.round(x.games))])));
 $x('aggregateSource').textContent=`使用データ: ${source}。機種別集計は設置台数を加重した実績であり、台番別結果を意味しません。`;
 const tails=filterDays(tailDaily);
 const tailAgg=mapGroup(tails,x=>x.tail).map(([label,a])=>({label,...partialAggregate(a)})).filter(x=>x.n).sort((a,b)=>b.mean-a.mean);
 $x('dailyTails').innerHTML=tableHtml(['末尾','日数','台日','平均差枚','勝率'],tailAgg.map(x=>rowHtml([esc(x.label),num(x.days),num(x.n),coloredDiff(x.mean),x.win.toFixed(1)+'%'])));
}
function renderLayout(){
 const map=layoutAt(gdate()), groups=mapGroup([...map.values()],r=>r.corridor).sort((a,b)=>a[0].localeCompare(b[0],'ja',{numeric:true}));
 $x('layoutStatus').textContent=map.size?`${gdate()} 時点の島図: ${map.size}台 / ${groups.length}通路。未登録の台は分析対象から除外。`:'実際の島配置は未登録です。適当な台番で位置を推測しません。CSV取り込みまたは手入力で登録してください。';
 const dmap=new Map(records.filter(r=>r.date===gdate()).map(r=>[Number(r.number),r]));
 $x('layoutGrid').innerHTML=groups.map(([corridor,items])=>{
  const side=which=>items.filter(x=>x.side===which).sort((a,b)=>a.order-b.order).map(item=>{
   const found=dmap.get(+item.number),diff=found?.diff;const light=diff==null?'':diff>=0?'rgba(38,192,133,.19)':'rgba(230,76,99,.18)';
   return `<div class="seat" style="background:${light}" title="${esc(found?.machine||'台別データ未取得')}"><b>${num(item.number)}</b><small>${diff==null?'データなし':sgn(diff)}</small></div>`;
  }).join('');
  return `<section class="lane"><h4>${esc(corridor)}通路</h4><div class="lanePair"><div><small>左</small><div class="laneSide">${side('左')}</div></div><div><small>右</small><div class="laneSide">${side('右')}</div></div></div></section>`;
 }).join('')||'<p class="muted">通路データを登録するとここに島配置が表示されます。</p>';
 $x('layoutList').innerHTML=tableHtml(['台番','通路','左右','位置','開始日','終了日'],layoutRows.slice().sort((a,b)=>+a.number-+b.number).map(x=>rowHtml([num(x.number),esc(x.corridor),esc(x.side),num(x.order),esc(x.from||'—'),esc(x.to||'—')])));
 renderCorridors();
}
function renderCorridors(){
 const r=current().r.filter(x=>position(x));
 const lanes=mapGroup(r,x=>{const pos=position(x);return pos.corridor+'通路'+pos.side}).map(([label,values])=>({label,...overall(values)})).filter(x=>x.n);
 lanes.sort((a,b)=>b.mean-a.mean);
 $x('corridorTable').innerHTML=lanes.length?tableHtml(['通路側','台日','平均差枚','勝率','平均G'],lanes.map(x=>rowHtml([esc(x.label),num(x.n),coloredDiff(x.mean),x.win.toFixed(1)+'%',num(Math.round(x.games))]))):'<p class="muted">島図＋台別実績の両方が揃った場合に集計します。</p>';
 const pairings=[];const grouped=mapGroup(r,x=>x.date);
 for(const [date,day] of grouped){const byNumber=new Map(day.map(x=>[+x.number,x]));const byLane=mapGroup([...layoutAt(date).values()],x=>x.corridor+'通路'+x.side);
  for(const [label,items] of byLane){const line=items.slice().sort((a,b)=>a.order-b.order);for(let i=0;i+2<line.length;i++){
   const seats=line.slice(i,i+3);if(!seats.every((x,k)=>k===0||x.order===seats[k-1].order+1))continue;
   const actual=seats.map(x=>byNumber.get(+x.number));if(!actual.every(Boolean))continue;
   pairings.push({date,label,numbers:seats.map(x=>x.number).join('-'),avg:actual.reduce((s,x)=>s+x.diff,0)/3,plus:actual.filter(x=>x.diff>0).length});
  }}
 }
 pairings.sort((a,b)=>b.avg-a.avg);
 $x('neighborTable').innerHTML=pairings.length?tableHtml(['日付','通路側','3台並び','平均差枚','プラス台数'],pairings.slice(0,60).map(x=>rowHtml([esc(x.date),esc(x.label),esc(x.numbers),coloredDiff(x.avg),x.plus+'/3']))):'<p class="muted">実島図と台別データを取得できた日について、同じ列で位置番号が連続する3台を比較します。</p>';
}
function renderEvents(){
 const events=eventRows.slice().sort((a,b)=>b.date.localeCompare(a.date));
 const daily=new Map(machineDaily.map(x=>[x.date+'|'+x.machine,x]));
 const perNumber=new Map(records.map(x=>[x.date+'|'+x.number,x]));
 $x('eventTable').innerHTML=tableHtml(['実施日','種別','機種','台番','結果','備考'],events.map(e=>{
  const seat=e.number?perNumber.get(e.date+'|'+e.number):null;
  const m=e.machine?daily.get(e.date+'|'+e.machine):null;
  return rowHtml([esc(e.date),esc(e.type),esc(e.machine||'—'),esc(e.number||'全体'),seat?coloredDiff(seat.diff):m?coloredDiff(m.avg_diff)+' / 台':'未取得',esc(e.note||'')]);
 }));
 let grouped=mapGroup(events.filter(e=>e.machine&&!e.number),e=>e.machine+'|'+e.type);
 const comparisons=grouped.map(([key,rows])=>{
  const [machine,type]=key.split('|'),dates=new Set(rows.map(x=>x.date));
  const a=machineDaily.filter(x=>x.machine===machine && dates.has(x.date));
  const b=machineDaily.filter(x=>x.machine===machine && !dates.has(x.date));
  return {machine,type,a:partialAggregate(a),b:partialAggregate(b)};
 }).filter(x=>x.a);
 $x('eventPerformance').innerHTML=comparisons.length?tableHtml(['機種','種別','対象日','対象日平均','非対象日平均','差'],comparisons.map(x=>rowHtml([esc(x.machine),esc(x.type),num(x.a.days),coloredDiff(x.a.mean),coloredDiff(x.b?.mean),x.b?coloredDiff(x.a.mean-x.b.mean):'比較不足']))):'<p class="muted">おすすめ・ローテーション履歴を登録すると、当日の実績を照合します。比較対象は同じ機種の非対象日です。</p>';
}
function renderCandidates(){
 const m=filterDays(machineDaily), excluded=($x('excludeKeywords').value||'').split(/[,，]/).map(x=>x.trim()).filter(Boolean);stash('excluded',excluded);
 const rows=mapGroup(m.filter(x=>!excluded.some(term=>x.machine.includes(term))),x=>x.machine).map(([machine,a])=>{
  const s=partialAggregate(a);if(!s)return null;
  const variance=a.reduce((v,x)=>v+(Number(x.avg_diff)-s.mean)**2,0)/Math.max(1,a.length);
  // Shrink noisy single-day results toward zero and never assert high settings.
  const shrink=s.mean*(s.days/(s.days+8));
  const reliability=s.days>=10?'中':s.days>=5?'低':'不足';
  const last=a.sort((x,y)=>y.date.localeCompare(x.date))[0]?.date;
  return {machine,...s,score:shrink,volatility:Math.sqrt(variance),reliability,last};
 }).filter(Boolean).sort((a,b)=>b.score-a.score);
 $x('candidateTable').innerHTML=rows.length?tableHtml(['機種','収集日','台日','実績平均','参考スコア','ばらつき','標本','最新日'],rows.map(x=>rowHtml([esc(x.machine),num(x.days),num(x.n),coloredDiff(x.mean),coloredDiff(x.score),num(Math.round(x.volatility)),esc(x.reliability),esc(x.last)]))):'<p class="muted">機種別集計が取得できると参考ランキングを表示します。</p>';
 $x('candidateInfo').textContent='参考スコア＝機種平均差枚×（観測日数／（観測日数＋8））。小標本を控えめに評価します。設定確率・将来の期待値ではありません。過去結果に同じ評価期間を使っているため独立した予測検証にもなりません。';
}
function renderAllExtensions(){renderAggregate();renderLayout();renderEvents();renderCandidates()}
function normalizeEvent(x){const e={date:String(x.date||''),type:String(x.type||'おすすめ'),machine:String(x.machine||'').trim(),number:String(x.number||'').trim(),note:String(x.note||'').trim()};if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||(!e.machine&&!e.number))throw Error('日付と機種または台番を指定してください');return e}
async function initExtensions(){
 const files=await Promise.all(['machine_daily.json','tail_daily.json','layout.json','events.json'].map(async f=>{try{const resp=await fetch('data/'+f+'?t='+Date.now());return resp.ok?await resp.json():[]}catch{return []}}));
 machineDaily=Array.isArray(files[0])?files[0]:[];tailDaily=Array.isArray(files[1])?files[1]:[];
 layoutRows=retrieve('layout')||files[2]||[];eventRows=retrieve('events')||files[3]||[];
 $x('excludeKeywords').value=(retrieve('excluded')||[]).join('、');
 $x('layoutDate').value=gdate();$x('eventDate').value=gdate();
 $x('addLayout').onclick=()=>{try{let r=normalizeLayout({number:$x('positionNumber').value,corridor:$x('corridor').value,side:$x('side').value,order:$x('positionOrder').value,from:$x('layoutFrom').value,to:$x('layoutTo').value});layoutRows=layoutRows.filter(x=>!(+x.number===r.number&&(x.from||'')===r.from));layoutRows.push(r);stash('layout',layoutRows);renderAllExtensions();$x('layoutMessage').textContent='端末に島配置を保存しました（他の端末には同期されません）。'}catch(e){alert(e.message)}};
 $x('importLayout').onclick=()=>{try{const a=layoutCSV($x('layoutCSV').value);if(!a.length)throw Error('CSVが空です');layoutRows=a;stash('layout',layoutRows);renderAllExtensions();$x('layoutMessage').textContent=`${a.length}台の島配置を端末に保存しました。`}catch(e){alert(e.message)}};
 $x('downloadLayout').onclick=()=>downloadJSON('layout.json',layoutRows);
 $x('resetLayout').onclick=()=>{if(confirm('この端末の島図設定を初期化しますか？')){layoutRows=[];stash('layout',layoutRows);renderAllExtensions()}};
 $x('layoutDate').onchange=()=>{chosen=$x('layoutDate').value;renderAllExtensions()};
 $x('addEvent').onclick=()=>{try{eventRows.push(normalizeEvent({date:$x('eventDate').value,type:$x('eventType').value,machine:$x('eventMachine').value,number:$x('eventNumber').value,note:$x('eventNote').value}));stash('events',eventRows);renderAllExtensions();$x('eventMessage').textContent='イベント履歴を端末に保存しました。';}catch(e){alert(e.message)}};
 $x('downloadEvents').onclick=()=>downloadJSON('events.json',eventRows);
 $x('resetEvents').onclick=()=>{if(confirm('この端末のイベント履歴を初期化しますか？')){eventRows=[];stash('events',eventRows);renderAllExtensions()}};
 $x('eventFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const parsed=JSON.parse(await file.text());if(!Array.isArray(parsed))throw Error('JSON配列である必要があります');eventRows=parsed.map(normalizeEvent);stash('events',eventRows);renderAllExtensions();}catch(err){alert(err.message)}};
 $x('excludeKeywords').oninput=renderCandidates;
 $x('tab-extra').addEventListener('click',renderAllExtensions);
 document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',renderAllExtensions));
 $x('date').addEventListener('change',()=>{renderAllExtensions()});$x('period').addEventListener('change',renderAllExtensions);
 $x('refresh').addEventListener('click',()=>setTimeout(renderAllExtensions,350));
 renderAllExtensions();
}
function downloadJSON(filename,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
initExtensions();
