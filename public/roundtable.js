/* SSS daily roundtable: recap labels are NOT confirmed settings. */
(()=>{"use strict";
const GROUPS={"カバネリ":[1001,1002,1003,1004],"ヴヴヴ":[1005,1006,1007,1008],"からくり2":[1009,1010,1011,1012],"紫バラ":[1013,1014,1015,1016,1017]};
const q=id=>document.getElementById(id);
let data=null;
function stats(rows,g,seats){
 const a=rows.filter(x=>Number.isInteger(x.targets[g])).map(x=>({date:x.date,number:x.targets[g]})).sort((x,y)=>x.date.localeCompare(y.date));
 const counts=Object.fromEntries(seats.map(n=>[n,0]));for(const x of a)counts[x.number]++;
 let pairs=0,repeats=0;for(let i=1;i<a.length;i++){let dt=(Date.parse(a[i].date+"T00:00:00Z")-Date.parse(a[i-1].date+"T00:00:00Z"))/86400000;if(dt===1){pairs++;if(a[i].number===a[i-1].number)repeats++;}}
 return {a,counts,pairs,repeats};
}
function walkforward(rows,g,seats){
 const obs=rows.filter(r=>Number.isInteger(r.targets[g])).map(r=>({day:r.date,number:r.targets[g]})).sort((a,b)=>a.day.localeCompare(b.day));
 const model={baseline:{n:0,hit:0,loss:0},avoid_last:{n:0,hit:0,loss:0},recent14:{n:0,hit:0,loss:0}};
 for(let i=14;i<obs.length;i++){
  const history=obs.slice(0,i),day=obs[i].day,actual=obs[i].number;
  const sameYesterday=(Date.parse(day+"T00:00:00Z")-Date.parse(obs[i-1].day+"T00:00:00Z"))===86400000;
  const uniform=Object.fromEntries(seats.map(n=>[n,1/seats.length]));
  let avoid=Object.fromEntries(seats.map(n=>[n,(!sameYesterday||n===obs[i-1].number)?1:1.6]));
  let total=Object.values(avoid).reduce((a,b)=>a+b,0);for(const n of seats)avoid[n]/=total;
  const last14=history.slice(-14);let freq=Object.fromEntries(seats.map(n=>[n,2+last14.filter(x=>x.number===n).length]));
  total=Object.values(freq).reduce((a,b)=>a+b,0);for(const n of seats)freq[n]/=total;
  for(const [type,p] of [["baseline",uniform],["avoid_last",avoid],["recent14",freq]]){
   const v=model[type];v.n++;const pick=seats.slice().sort((a,b)=>p[b]-p[a]||a-b)[0];
   v.hit+=type==="baseline"?1/seats.length:Number(pick===actual);
   v.loss+=-Math.log(Math.max(1e-9,p[actual]));
  }
 }
 for(const v of Object.values(model)){v.accuracy_pct=v.n?+(100*v.hit/v.n).toFixed(2):null;v.log_loss=v.n?+(v.loss/v.n).toFixed(4):null;}
 return model;
}
function render(){
 if(!data)return;const date=q("rtDate").value||"2026-11-04",start=new Date(Date.parse(date+"T00:00:00Z")-90*86400000).toISOString().slice(0,10);
 const rows=data.days.filter(x=>x.date<date&&x.date>=start).sort((a,b)=>a.date.localeCompare(b.date));
 const complete=rows.filter(x=>Object.keys(GROUPS).every(g=>Number.isInteger(x.targets[g])));
 q("rtIntro").textContent="予想日前90日間：確認済み"+rows.length+"日／4グループ揃う"+complete.length+"日。不明な日は不採用とは扱いません。これらは取材者の答え合わせで、設定値の実測ではありません。";
 q("rtCards").innerHTML=Object.entries(GROUPS).map(([name,seats])=>{const m=stats(rows,name,seats),max=Math.max(1,...Object.values(m.counts));return '<div class="rt-card"><h3>'+name+'</h3><p>前日と同じ台：<strong>'+(m.pairs?m.repeats+'/'+m.pairs+'（'+(100*m.repeats/m.pairs).toFixed(1)+'%）':'比較不足')+'</strong>／均等選択 '+(100/seats.length).toFixed(0)+'%</p><small>確認 '+m.a.length+'日分</small>'+seats.map(n=>'<div class="rt-row"><span>'+n+'</span><div class="rt-track"><div class="rt-fill" style="width:'+(100*m.counts[n]/max).toFixed(1)+'%"></div></div><b>'+m.counts[n]+'回</b></div>').join('')+'</div>'}).join('');
 let hist='<table><tr><th>日付</th>'+Object.keys(GROUPS).map(g=>'<th>'+g+'</th>').join('')+'</tr>';
 for(const x of rows.slice(-35).reverse())hist+='<tr><td>'+x.date+'</td>'+Object.keys(GROUPS).map(g=>'<td>'+(x.targets[g]??'未確認')+'</td>').join('')+'</tr>';
 q("rtHistory").innerHTML=hist+'</table>';
 const m=Object.fromEntries(Object.entries(GROUPS).map(([g,seats])=>[g,{walkforward:walkforward(rows,g,seats)}]));let table='<table><tr><th>島</th><th>検証日数</th><th>均等（期待率）</th><th>前日回避</th><th>頻度重視</th><th>損失（均等/回避/頻度）</th></tr>';let available=false;
 for(const g of Object.keys(GROUPS)){const v=m[g]?.walkforward;if(!v?.baseline?.n)continue;available=true;
 table+='<tr><td>'+g+'</td><td>'+v.baseline.n+'</td><td>'+v.baseline.accuracy_pct+'%</td><td>'+v.avoid_last.accuracy_pct+'%</td><td>'+v.recent14.accuracy_pct+'%</td><td>'+[v.baseline.log_loss,v.avoid_last.log_loss,v.recent14.log_loss].join(' / ')+'</td></tr>';}
 q("rtModels").innerHTML=available?table+'</table>':'予測検証には14日以上の履歴が必要。現在はデータ更新待ち。';
 q("rtSource").textContent="収集状況："+Object.entries(data.collection_status||{}).map(([k,v])=>k+': '+v).join(' / ');
}
function init(){
 const tabs=document.querySelector(".tabs"),main=document.querySelector("main");if(!tabs||!main)return;
 const css=document.createElement("style");css.textContent="#rt17 .rt-card{background:#101e35;border:1px solid #344965;border-radius:12px;padding:14px}#rt17 .rt-card h3{margin-top:0}#rt17 .rt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:12px}#rt17 .rt-row{display:flex;align-items:center;gap:9px;margin:11px 0}#rt17 .rt-row span{width:38px}#rt17 .rt-track{flex:1;background:#263a55;height:10px;border-radius:9px}#rt17 .rt-fill{background:#659fdf;height:10px;border-radius:9px}#rt17 .rt-row b{width:45px;text-align:right}#rt17 .rt-scroll{overflow:auto}#rt17 th,#rt17 td{text-align:left}";document.head.appendChild(css);
 const b=document.createElement("button");b.className="tab";b.dataset.tab="rt17";b.textContent="毎日円卓17台";tabs.appendChild(b);
 const s=document.createElement("section");s.id="rt17";s.className="hide";s.innerHTML='<h2>毎日円卓17台・ローテーション検証</h2><p class="note">スイカのスロット屋などの答え合わせを記録したもので、実際の設定値の確認ではありません。</p><div class="filters"><label>予想日 <input id="rtDate" type="date" value="2026-11-04"></label><button id="rtRefresh">再集計</button></div><p id="rtIntro" class="note">読込中…</p><div id="rtCards" class="rt-grid"></div><div class="panel"><h3>過去日付だけで予測したモデル比較</h3><p class="note">前日までの履歴だけを用いた上位1台的中率・損失。均等モデルは理論期待率25%／20%。データがある日だけで評価するため、無作為モデルを安定して超える保証はありません。</p><div id="rtModels" class="rt-scroll"></div></div><div class="panel"><h3>日別答え合わせ（最大35日）</h3><div id="rtHistory" class="rt-scroll"></div></div><p id="rtSource" class="note"></p>';main.appendChild(s);
 b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll("main>section:not(.stats)").forEach(x=>x.classList.add("hide"));b.classList.add("active");s.classList.remove("hide");render()};
 q("rtRefresh").onclick=render;q("rtDate").onchange=render;
 fetch("data/roundtable_targets.json?v="+Date.now()).then(r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json()}).then(j=>{data=j;render()}).catch(e=>q("rtIntro").textContent="履歴が読めません: "+e.message);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();