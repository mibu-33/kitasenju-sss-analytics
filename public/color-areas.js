/* Colour zones of P-ARK Kitasenju SSS. These are geographic labels, not proof of settings. */
(function(){
"use strict";
const zones={red:["赤","1F","#e65757"],blue:["青","1F","#4b98ed"],green:["緑","1F","#52b887"],silver:["銀","1F","#b2bdce"],gold:["金","2F","#d3b355"],purple:["紫","2F","#b08ae4"]};
const ja={赤:"red",青:"blue",緑:"green",銀:"silver",金:"gold",紫:"purple"};
const key="sss-verified-color-zones-v1";
const el=id=>typeof document==="undefined"?null:document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const number=x=>Math.round(x).toLocaleString("ja-JP");
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const clamp=(v,l,h)=>Math.min(h,Math.max(l,v));
const shrink=(v,n,k)=>v*n/(n+k);
let areas=[];
function normalized(x){
 const z=ja[String(x.zone||x.color||"").trim()]||String(x.zone||x.color||"").trim().toLowerCase();
 if(!zones[z])throw Error("色は赤・青・緑・銀・金・紫から選んでください");
 const a={number:Number(x.number),zone:z,floor:String(x.floor||zones[z][1]).toUpperCase(),corridor:String(x.corridor||""),side:String(x.side||""),order:x.order==null||x.order===""?null:Number(x.order),from:String(x.from||""),to:String(x.to||""),source:String(x.source||""),confidence:String(x.confidence||""),historical_layout_verified:x.historical_layout_verified===true};
 if(!Number.isInteger(a.number)||a.number<1||a.number>99999)throw Error("台番号が不正です");
 if(a.floor!==zones[z][1])throw Error("色と階が一致しません");
 if(a.side&&!["左","右"].includes(a.side))throw Error("左右は左・右");
 if(a.order!=null&&(!Number.isInteger(a.order)||a.order<1))throw Error("並び順が不正です");
 if([a.from,a.to].some(d=>d&&!/^\d{4}-\d\d-\d\d$/.test(d))||(a.from&&a.to&&a.from>a.to))throw Error("適用日が不正です");
 return a;
}
function at(date){
 const active=new Map();
 const combined=(typeof layoutRows!=="undefined"?layoutRows.filter(x=>x.zone&&zones[ja[x.zone]||x.zone]):[]).concat(areas);
 for(const raw of combined){let a;try{a=normalized(raw)}catch{continue}
  if((a.from&&a.from>date)||(a.to&&a.to<date))continue;
  const old=active.get(a.number);if(!old||(a.from||"")>=(old.from||""))active.set(a.number,a);
 }
 return active;
}
function csv(text){
 const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());
 if(lines.length<2)throw Error("CSVが空です。ヘッダーと行を入力してください");
 const headers=lines.shift().split(",").map(x=>x.trim());
 const aliases={number:["台番","台番号","number"],zone:["色","エリア","zone"],floor:["階","floor"],corridor:["通路","corridor"],side:["左右","side"],order:["位置","並び順","order"],from:["開始日","from"],to:["終了日","to"]};
 const cols={};for(const [k,labels] of Object.entries(aliases))cols[k]=headers.findIndex(x=>labels.includes(x));
 if(cols.number<0||cols.zone<0)throw Error("CSVヘッダーに「台番,色」が必要です");
 return lines.map((line,i)=>{const cells=line.split(",");const raw={};for(const k in cols)raw[k]=cols[k]<0?"":cells[cols[k]]?.trim()||"";try{return normalized(raw)}catch(e){throw Error((i+2)+"行目: "+e.message)}});
}
function targetData(date){
 const min=new Date(Date.parse(date+"T00:00:00Z")-75*86400000).toISOString().slice(0,10);
 return (typeof records!=="undefined"?records:[]).filter(x=>x.date<date&&x.date>=min&&Number.isFinite(+x.diff)&&+x.games>=300);
}
function targetType(date){const d=Number(date.slice(-2))%10;return [0,3,4,6,7].includes(d)?d:-1}
function compute(date){
 const data=targetData(date),target=at(date),cache=new Map();
 const lookup=d=>{if(!cache.has(d))cache.set(d,at(d));return cache.get(d)};
 const days=new Map(),dayZone=new Map(),seats=new Map();
 for(const r of data){
  const d=r.date,v=clamp(+r.diff,-10000,10000);
  if(!days.has(d))days.set(d,[]);days.get(d).push(v);
  const a=lookup(d).get(+r.number);if(!a)continue;
  const k=d+"|"+a.zone;if(!dayZone.has(k))dayZone.set(k,[]);dayZone.get(k).push(v);
  if(target.has(+r.number)&&target.get(+r.number).zone===a.zone){const n=+r.number;if(!seats.has(n))seats.set(n,[]);seats.get(n).push(r)}
 }
 const perZone=new Map();
 for(const [k,values] of dayZone){if(values.length<5)continue;const idx=k.indexOf("|"),day=k.slice(0,idx),zone=k.slice(idx+1);
  if(!perZone.has(zone))perZone.set(zone,[]);
  perZone.get(zone).push({day,avg:mean(values),lift:mean(values)-mean(days.get(day)),win:values.filter(v=>v>0).length*100/values.length});
 }
 const sameType=targetType(date),scores=[];
 for(const [zone,arr] of perZone){if(arr.length<5)continue;
  const matching=arr.filter(x=>targetType(x.day)===sameType),used=matching.length>=3?matching:arr;
  const recent=arr.filter(x=>x.day>=new Date(Date.parse(date+"T00:00:00Z")-30*86400000).toISOString().slice(0,10));
  const lift=shrink(mean(used.map(x=>x.lift)),used.length,5),trend=shrink(mean(recent.map(x=>x.lift)),recent.length,4),win=mean(used.map(x=>x.win));
  const score=Math.round(clamp(50+.017*lift+.011*trend+.05*(win-50),0,100));
  scores.push({zone,score,days:arr.length,same:matching.length,lift,win,avg:mean(arr.map(x=>x.avg)),quality:matching.length>=4&&arr.length>=20?"中":"低"});
 }
 scores.sort((a,b)=>b.score-a.score);
 const sc=new Map(scores.map(x=>[x.zone,x])),candidates=[],skip=["ヴァルヴレイヴ","ヴヴヴ","からくりサーカス","ToLOVEる","かぐや様","シンフォギア","ダンベル"];
 const exclude=el("colorRisk")?.checked;
 for(const [seat,rs] of seats){const a=target.get(seat),g=sc.get(a.zone),observed=new Set(rs.map(x=>x.date)).size;
  if(!g||observed<5)continue;
  const sorted=rs.slice().sort((x,y)=>y.date.localeCompare(x.date)),machine=sorted[0]?.machine||"不明";
  if(exclude&&skip.some(w=>machine.toLowerCase().includes(w.toLowerCase())))continue;
  const avg=mean(rs.map(x=>+x.diff)),win=rs.filter(x=>x.diff>0).length*100/rs.length;
  candidates.push({seat,machine,zone:a.zone,confidence:a.confidence||"manual",days:observed,avg,win,score:Math.round(clamp(g.score*.7+15+clamp(shrink(avg,observed,10)/300,-12,12)+clamp((win-50)*.1,-5,5),0,100))});
 }
 candidates.sort((a,b)=>b.score-a.score||b.days-a.days);
 // Only truly consecutive order positions on the same floor, colour, aisle and side.
 const byCorridor=new Map(),streaks=new Map();
 for(const r of data){const a=lookup(r.date).get(+r.number);
  if(!a||!a.corridor||!a.side||!a.order)continue;
  const k=[r.date,a.floor,a.zone,a.corridor,a.side].join("|");
  if(!byCorridor.has(k))byCorridor.set(k,[]);byCorridor.get(k).push({order:a.order,diff:+r.diff,zone:a.zone});
 }
 for(const rows of byCorridor.values()){rows.sort((a,b)=>a.order-b.order);for(let i=0;i+2<rows.length;i++){const part=rows.slice(i,i+3);if(part[1].order!==part[0].order+1||part[2].order!==part[1].order+1)continue;
  const z=part[0].zone,p=streaks.get(z)||{total:0,positive:0};p.total++;if(part.filter(x=>x.diff>1000).length>=2)p.positive++;streaks.set(z,p);
 }}
 return {target,data,scores,candidates,streaks};
}
function render(){
 if(!el("colorDay"))return;
 const date=el("colorDay").value,r=compute(date),mapped=r.target.size;
 const last=(typeof records!=="undefined"?records:[]).reduce((a,x)=>x.date<date&&x.date>a?x.date:a,"");
 const latest=(typeof records!=="undefined"?records:[]).filter(x=>x.date===last);
 const covered=latest.filter(x=>r.target.has(+x.number)).length;
 const occasion={0:"0のつく日：過去には列単位などの仕掛け報告あり。",3:"3のつく日：各色エリアで3台並びの報告あり。",4:"4のつく日：各色エリアに異なる仕掛けを分ける「あみだ」の報告あり。",6:"6のつく日：過去の重点営業日。列・末尾・機種の実績を確認。",7:"7のつく日：過去には3台/5台並びや末尾など複数要素の報告あり。"};
 el("colorGuidance").textContent="過去の取材傾向（当日の告知ではありません）："+(occasion[targetType(date)]||"特定日の仕掛けは未確認。通常日の実績を優先。");
 el("colorInfo").textContent="確認済みの位置 "+mapped+"台／直近の実績台 "+covered+"/"+latest.length+"台。予想日の前75日・G数300以上のデータ "+r.data.length+"台日。未来のデータは使用していません。";
 const corroborated=[...r.target.values()].filter(a=>a.confidence==="cross-checked").length;
 const colorOnly=[...r.target.values()].filter(a=>a.confidence==="secondary-color-only").length;
 el("colorInfo").textContent+=" 画像照合 "+corroborated+"台、画像判読 "+(mapped-corroborated-colorOnly)+"台、二次資料の色のみ "+colorOnly+"台。後者の島・並び位置は未確認。";
 el("colorCount").innerHTML=Object.entries(zones).map(([z,m])=>'<span class="color-chip" style="border-color:'+m[2]+'">'+m[1]+" "+m[0]+" "+[...r.target.values()].filter(x=>x.zone===z).length+"台</span>").join("");
 function areaLabel(code){const z=zones[code];return '<span class="color-chip" style="border-color:'+z[2]+'">'+z[1]+" "+z[0]+"</span>"}
 el("colorAreas").innerHTML=r.scores.length?'<div class="color-overflow"><table><tr><th>区分</th><th>指数</th><th>日数</th><th>同末尾日</th><th>平均差枚</th><th>同日平均との差</th><th>勝率</th><th>標本</th></tr>'+r.scores.map(g=>"<tr><td>"+areaLabel(g.zone)+"</td><td>"+g.score+"/100</td><td>"+g.days+"</td><td>"+g.same+"</td><td>"+number(g.avg)+"</td><td>"+number(g.lift)+"</td><td>"+g.win.toFixed(1)+"%</td><td>"+g.quality+"</td></tr>").join("")+"</table></div>":'<p class="muted">最新の色別台番マップが未登録か、色ごとの実績が不足しています（1日5台×5日以上が必要）。</p>';
 el("colorSeats").innerHTML=r.candidates.length?'<div class="color-overflow"><table><tr><th>順位</th><th>台番</th><th>機種</th><th>区分</th><th>配置根拠</th><th>指数</th><th>日数</th><th>平均差枚</th><th>勝率</th></tr>'+r.candidates.slice(0,30).map((x,i)=>"<tr><td>"+(i+1)+"</td><td><b>"+x.seat+"</b></td><td>"+esc(x.machine)+"</td><td>"+areaLabel(x.zone)+"</td><td>"+esc(x.confidence==="secondary-color-only"?"二次資料・色のみ":x.confidence==="cross-checked"?"複数画像":x.confidence==="readable-label"?"提供画像":"手動")+"</td><td>"+x.score+"</td><td>"+x.days+"</td><td>"+number(x.avg)+"</td><td>"+x.win.toFixed(1)+"%</td></tr>").join("")+"</table></div>":'<p class="muted">現行の色別台番と各台5日以上のデータが必要です。未確認台の順位は捏造しません。</p>';
 el("colorNeighbors").innerHTML=r.scores.map(g=>{const x=r.streaks.get(g.zone);return areaLabel(g.zone)+(x?x.positive+"/"+x.total+"組窓":'並び順未登録')}).join("　")||"通路・左右・並び順を登録すると、3台並びの過去実績を検証します。";
}
function setup(){
 const nav=document.querySelector(".tabs"),main=document.querySelector("main");if(!nav||!main)return;
 const style=document.createElement("style");style.textContent="#colorZones .panel{margin:12px 0}#colorZones .color-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}#colorZones textarea{width:100%;min-height:115px}#colorZones input[type=checkbox]{width:18px;height:18px}#colorZones .color-overflow{overflow-x:auto}#colorZones table{border-collapse:collapse;width:100%;font-size:13px}#colorZones td,#colorZones th{padding:9px;border-bottom:1px solid #31415b;white-space:nowrap}#colorZones .color-chip{display:inline-block;border-left:5px solid;padding:5px 8px;margin:3px;background:#192c45;border-radius:4px}";document.head.appendChild(style);
 const button=document.createElement("button");button.className="tab";button.dataset.tab="colorZones";button.textContent="色別エリア・狙い目";nav.appendChild(button);
 const panel=document.createElement("section");panel.id="colorZones";panel.className="hide";
 panel.innerHTML='<h2>トリエス 色別エリア分析</h2><p class="muted">1Fは赤・青・緑・銀、2Fは金・紫。色は島の区分であり、台の設定を意味しません。確認できない台の配置は推測しません。</p><div id="colorCount"></div><div class="color-row"><label>狙う日 <input id="colorDay" type="date"></label><label><input id="colorRisk" type="checkbox" checked>荒い機種・SANKYO系を一部除外</label><button id="colorRecalc">分析</button></div><p id="colorInfo" class="muted"></p><p id="colorGuidance" class="muted"></p><div class="panel"><h3>色エリア別実績</h3><div id="colorAreas"></div><p class="muted">指数は過去差枚を同日の店内平均で補正して縮小した相対指標。設定6の確率や勝率の予想ではありません。</p></div><div class="panel"><h3>暫定狙い目（台番号）</h3><div id="colorSeats"></div></div><div class="panel"><h3>隣接3台並び</h3><div id="colorNeighbors"></div><p class="muted">同じ通路・左右・色・位置順で連続する3台を集計。3台中2台が+1000枚超の観測です。</p></div><div class="panel"><h3>色別島図を登録</h3><p class="muted">最新のフロアマップで確認したものだけ登録。ヘッダー：台番,階,色,通路,左右,位置,開始日,終了日。色は赤・青・緑・銀・金・紫。古い島図は有効期間を限定してください。</p><textarea id="colorCsv" placeholder="台番,階,色,通路,左右,位置,開始日,終了日"></textarea><div class="color-row"><button id="colorImport">CSV取込</button><button id="colorExport">CSV出力</button><button id="colorDelete">端末の色別配置を消去</button></div><p id="colorMessage" class="muted"></p><p class="muted">参考：<a href="https://note.com/cozy_fowl8277/n/na874d5c4a382" target="_blank" rel="noopener">色別仕掛けの過去解説</a>。掲載当時から位置が変わっている可能性があります。</p></div>';
 main.appendChild(panel);
 button.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));document.querySelectorAll("main>section:not(.stats)").forEach(s=>s.classList.add("hide"));button.classList.add("active");panel.classList.remove("hide");render()});
 el("colorDay").value=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Date.now()+86400000));
 ["colorDay","colorRisk"].forEach(id=>el(id).addEventListener("change",render));el("colorRecalc").onclick=render;
 el("colorImport").onclick=()=>{try{const added=csv(el("colorCsv").value);for(const x of added){const i=areas.findIndex(y=>+y.number===x.number&&(y.from||"")===x.from);if(i<0)areas.push(x);else areas[i]=x}localStorage.setItem(key,JSON.stringify(areas));el("colorMessage").textContent=added.length+"行をこの端末に登録しました";render()}catch(e){el("colorMessage").textContent="取込失敗: "+e.message}};
 el("colorExport").onclick=()=>{const head=["台番","階","色","通路","左右","位置","開始日","終了日"];const body=areas.map(x=>[x.number,x.floor,zones[x.zone][0],x.corridor,x.side,x.order??"",x.from,x.to]);const content="\ufeff"+[head,...body].map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(",")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type:"text/csv"}));a.download="sss-color-area-map.csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
 el("colorDelete").onclick=()=>{if(confirm("この端末に保存した色別島図を消去しますか？")){areas=[];localStorage.removeItem(key);render()}};
 try{const local=JSON.parse(localStorage.getItem(key)||"[]");areas=Array.isArray(local)?local.map(normalized):[]}catch{areas=[]}
 fetch("data/areas.json?v="+Date.now()).then(r=>r.ok?r.json():[]).then(list=>{if(!Array.isArray(list))return;for(const x of list){try{const v=normalized(x);if(!areas.some(y=>y.number===v.number&&y.from===v.from))areas.push(v)}catch{}}render()}).catch(()=>{});
 const original=typeof renderAllExtensions==="function"?renderAllExtensions:null;
 if(original)renderAllExtensions=function(){original();render()};
 render();
}
if(typeof document!=="undefined")setup();
if(typeof globalThis!=="undefined")globalThis.SSSColorCore={normalized,csv,targetType,at,compute,setAreas:(a)=>{areas=a.map(normalized)}};
})();