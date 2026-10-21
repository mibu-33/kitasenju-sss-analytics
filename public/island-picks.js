/* P-ARK Kita-senju SSS island / colour ranking. Educational, no inferred settings.
 * Evidence: manually transcribed blocks from user-provided floor-map images.
 * The image capture date and historical seating configuration are not confirmed.
 */
(()=>{
'use strict';
const areaCore=()=>globalThis.SSSColorCore;
const D=(id)=>typeof document==='undefined'?null:document.getElementById(id);
const esc=(x)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const bound=(v,a,b)=>Math.min(b,Math.max(a,v));
const fmt=n=>Math.round(n).toLocaleString('ja-JP');
const dateMinus=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')-86400000*days).toISOString().slice(0,10);
const riskWords=['からくりサーカス','ヴァルヴレイヴ','かぐや様','ToLOVEる','シンフォギア','ダンベル'];
const risk=x=>riskWords.some(w=>String(x||'').toLowerCase().includes(w.toLowerCase()));
const colorJ={red:'赤',blue:'青',green:'緑',silver:'銀',gold:'金',purple:'紫'};
/** All target numbers and their current block must be map-certified.
 * Source and completeness filters avoid silently mixing measurement methodologies.
 */
function scoreIslands(target,all,mapForDate,opts={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(target))throw Error('予想日を指定してください');
 const site=mapForDate(target),known=[...site.values()];
 const oldest=dateMinus(target,opts.lookback||60);
 const eligible=all.filter(x=>x.date<target&&x.date>=oldest&&Number.isFinite(+x.diff)&&Number.isFinite(+x.games)&&+x.games>=300);
 const perDay=new Map();
 for(const row of eligible){if(!perDay.has(row.date))perDay.set(row.date,[]);perDay.get(row.date).push(row)}
 const complete=new Map([...perDay].filter(([d,rows])=>new Set(rows.map(x=>x.number)).size>=400));
 const latest=[...complete.keys()].sort().at(-1)||'';
 // Reconcile two independent data sources without claiming comparable scale.
 const latestSource=latest?complete.get(latest).find(x=>x.source)?.source:null;
 const usable=[...complete].filter(([d,rows])=>!latestSource||rows.every(x=>!x.source||x.source===latestSource));
 const baselines=new Map(usable.map(([d,rows])=>[d,avg(rows.map(x=>bound(+x.diff,-10000,10000)))]));
 const targetMap=site,zonePerDay=new Map(),islandPerDay=new Map(),seatRows=new Map();
 const allDaily=new Map();
 for(const [day,rows] of usable){
  const mapping=mapForDate(day);
  for(const row of rows){const pos=mapping.get(+row.number),current=targetMap.get(+row.number);if(!pos||!current||pos.zone!==current.zone||pos.corridor!==current.corridor)continue;
    const residual=bound(+row.diff,-10000,10000)-baselines.get(day);
    const color=day+'|'+pos.zone,block=day+'|'+pos.corridor;
    for(const [key,dict] of [[color,zonePerDay],[block,islandPerDay]]){if(!dict.has(key))dict.set(key,[]);dict.get(key).push({seat:+row.number,diff:+row.diff,delta:residual,day,machine:row.machine})}
    if(!seatRows.has(+row.number))seatRows.set(+row.number,[]);seatRows.get(+row.number).push({...row,delta:residual});
  }
  allDaily.set(day,rows.length);
 }
 function groups(dict,minCount=3){const by=new Map();for(const [key,rows] of dict){if(new Set(rows.map(x=>x.seat)).size<minCount)continue;
    const [date,label]=key.split('|');if(!by.has(label))by.set(label,[]);
    by.get(label).push({date,mean:avg(rows.map(x=>x.diff)),lift:avg(rows.map(x=>x.delta)),win:rows.filter(x=>x.diff>0).length/rows.length*100,n:rows.length});}
   return by;}
 const blockAgg=groups(islandPerDay),zoneAgg=groups(zonePerDay);
 function strength(arr,day){if(!arr||arr.length<5)return null;
   const digits=Number(day.slice(-1));const comparable=arr.filter(x=>Number(x.date.slice(-1))===digits);
   const same=comparable.length>=3?comparable:arr;
   const recent=arr.filter(x=>x.date>=dateMinus(day,14));
   const lift=avg(same.map(x=>x.lift))*same.length/(same.length+9);
   const trend=avg(recent.map(x=>x.lift))*recent.length/(recent.length+6);
   const total=avg(arr.map(x=>x.lift))*arr.length/(arr.length+10);
   return {days:arr.length,mean:avg(arr.map(x=>x.mean)),win:avg(arr.map(x=>x.win)),lift,total,trend,comparable:comparable.length};
 }
 const blocks=[];const blocksMeta=new Map();for(const pos of known){if(!pos.corridor)continue;let m=blocksMeta.get(pos.corridor);if(!m){m={zone:pos.zone,floor:pos.floor,block:pos.corridor,count:0};blocksMeta.set(pos.corridor,m)}m.count++}
 for(const block of blocksMeta.values()){const s=strength(blockAgg.get(block.block),target),z=strength(zoneAgg.get(block.zone),target);if(!s||!z)continue;
  const pts=Math.round(bound(50+s.lift/135+z.total/240+s.trend/270,0,100));
  blocks.push({...block,...s,zoneLift:z.total,score:pts,quality:s.days>=15?'中':'低'});
 }
 blocks.sort((a,b)=>b.score-a.score||b.days-a.days);
 const blockBy=new Map(blocks.map(x=>[x.block,x]));
 const picks=[];
 for(const [number,rs] of seatRows){const p=targetMap.get(number),block=blockBy.get(p?.corridor);if(!p||!block)continue;
  const days=new Set(rs.map(x=>x.date)).size;if(days<5)continue;
  const last=rs.reduce((m,x)=>x.date>m.date?x:m,rs[0]);
  if(last.date<dateMinus(target,14))continue;
  const seatlift=avg(rs.map(x=>x.delta))*days/(days+12),seatWin=100*rs.filter(x=>x.diff>0).length/rs.length;
  const pts=Math.round(bound(.75*block.score+12.5+bound(seatlift/220,-10,10)+bound((seatWin-50)*.1,-5,5),0,100));
  if(opts.excludeRisk&&risk(last.machine))continue;
  picks.push({number,block:p.corridor,zone:p.zone,floor:p.floor,machine:last.machine,asOf:last.date,days,mean:avg(rs.map(x=>+x.diff)),win:seatWin,score:pts,blockScore:block.score,seatLift:seatlift,source:latestSource||'未記載'});
 }
 picks.sort((a,b)=>b.score-a.score||b.days-a.days||a.number-b.number);
 return {target,latest,latestSource,usableDays:usable.length,known:known.length,blocks,picks,coverage:[...targetMap.values()].filter(x=>seatRows.has(+x.number)).length,mappingWarning:'島図画像の作成日と過去の配置継続は未確認。過去の台番を現在の色・ブロックに仮対応させた参考分析です。'};
}
function render(){if(!D('islandBlocks')||typeof records==='undefined')return;
 const value=D('colorDay')?.value;if(!value)return;
 const r=scoreIslands(value,records,day=>areaCore().at(day),{excludeRisk:D('colorRisk')?.checked});
 D('islandStatus').textContent=`色を確認した${r.known}台（島区分あり${[...areaCore().at(value).values()].filter(x=>x.corridor).length}台）のうち履歴あり${r.coverage}台。実績${r.usableDays}営業日（同一取得元・対象日より前・1日400台以上）／最終${r.latest||'未取得'}。${r.mappingWarning}`;
 const row=(cells)=>'<tr>'+cells.map(x=>'<td>'+x+'</td>').join('')+'</tr>';
 const table=(heads,body)=>'<div class="island-scroll"><table><thead>'+row(heads.map(esc))+'</thead><tbody>'+body.join('')+'</tbody></table></div>';
 D('islandBlocks').innerHTML=r.blocks.length?table(['順位','階・色','ブロック','登録台数','実績日','参考点','平均差枚','同日平均との差','勝率'],r.blocks.map((b,i)=>row([i+1,esc(b.floor+' '+colorJ[b.zone]),esc(b.block),b.count,b.days,`<b>${b.score}</b> / 100`,fmt(b.mean),fmt(b.total),b.win.toFixed(1)+'%']))):'<p class="muted">同じ取得元の十分な実績（1ブロック3台・5営業日以上）がまだありません。</p>';
 D('islandCandidates').innerHTML=r.picks.length?table(['順位','台番','機種','島','指数','観測日','平均差枚','勝率','直近確認'],r.picks.slice(0,30).map((p,i)=>row([i+1,`<b>${p.number}</b>`,esc(p.machine),esc(p.block),`<b>${p.score}</b> / 100`,p.days,fmt(p.mean),p.win.toFixed(1)+'%',esc(p.asOf)]))):'<p class="muted">色・島と台別の十分な実績が揃うまで候補を表示しません。</p>';
 D('islandSource').textContent=`使用データ: ${r.latestSource||'未記載'}。予想日前の台データのみ計算（差枚は±10,000枚で外れ値制限）。実際の設定配分や機械割は推定していません。島の並び順未確認のため3台並びはスコアに含めていません。`;
}
function install(){if(!D('colorZones')||D('islandBlocks'))return;
 const target=D('colorAreas')?.parentElement;
 if(!target)return;
 const section=document.createElement('div');section.className='panel';section.innerHTML='<h3>確認済みの島ブロック別実績</h3><p class="muted">画像で照合した青A・B、緑C〜F、赤S、紫A・B・5台円卓だけを島別集計。銀・赤・金の二次資料は色のみ登録し、実島ランキングには含めません。</p><p class="muted" id="islandStatus"></p><div id="islandBlocks"></div><h3>島の傾向を加味した台番号候補</h3><div id="islandCandidates"></div><p class="muted" id="islandSource"></p>';
 target.insertAdjacentElement('afterend',section);
 const s=document.createElement('style');s.textContent='#colorZones .island-scroll{overflow-x:auto}#colorZones .island-scroll table{width:100%;border-collapse:collapse;font-size:13px}#colorZones .island-scroll th,#colorZones .island-scroll td{white-space:nowrap;padding:9px;border-bottom:1px solid #31415b}';document.head.appendChild(s);
 D('colorDay')?.addEventListener('change',render);D('colorRisk')?.addEventListener('change',render);D('colorRecalc')?.addEventListener('click',render);
 D('colorImport')?.addEventListener('click',()=>setTimeout(render,50));
 const old=typeof renderAllExtensions==='function'?renderAllExtensions:null;
 if(old)renderAllExtensions=function(){old();render()};
 // The source data promise may finish after all modules have loaded.
 window.sssHistoryPromise?.then(()=>setTimeout(render,250));
 document.querySelector('[data-tab="colorZones"]')?.addEventListener('click',render);
 render();
}
if(typeof globalThis!=='undefined')globalThis.SSSIslandCore={scoreIslands};
if(typeof document!=='undefined')install();
})();