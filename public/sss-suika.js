(function(){
'use strict';
const $=id=>document.getElementById(id);
const NS='http://www.w3.org/2000/svg';
const escapeHtml=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const state={data:null,showRainbow:true,showIndividual:false,ready:false,computed:null};
const bridge=()=>window.sssFloorBridge;
const date=()=>bridge()?.getState()?.date||'';
const shortName=value=>{
 const input=String(value||'').trim();
 let name=window.sssMachineLabels?.shorten(input)||input;
 const aliases={'スーパーリオエース':'リオ2','リオエース':'リオ2','真打 吉宗':'吉宗','真打吉宗':'吉宗',
 'ゾンビランドサガ':'ゾンサガ','東京リベンジャーズ':'東リベ','戦国コレクション6':'戦コレ6',
 '青春ブタ野郎':'青ブタ','やじきた道中記':'やじきた','からくりサーカス':'からくり',
 '彼女、お借りします':'かのかり'};
 return aliases[name]||name;
};
function report(){return state.data?.reports?.find(r=>r.date===date())||null}
function highlights(){
 const day=bridge()?.getData()?.day||new Map(),rep=report(),all=new Map(),extra=new Map(),groups=[],notFound=[];
 if(rep){
  for(const name of rep.machine_labels||[]){
   const exactNumbers=rep.explicit_seat_numbers||[];
   const nums=[...day.values()].filter(row=>row&&row.machine&&shortName(row.machine)===name&&
    (!exactNumbers.length||exactNumbers.includes(Number(row.number)))).map(row=>Number(row.number)).sort((a,b)=>a-b);
   for(const n of nums)all.set(n,{label:name,date:rep.date});
   if(nums.length===0)notFound.push(name);
   groups.push({label:name,numbers:nums});
  }
 }
 const singles=state.data?.individually_reported?.find(x=>x.date===date());
 for(const group of singles?.categories||[]){
  for(const n of group.numbers||[])if(day.has(Number(n)))extra.set(Number(n),group.kind);
 }
 return {rep,all,extra,groups,notFound,dataCount:day.size};
}
function addGradient(map){
 if(map.querySelector('#sss-suika-gradient'))return;
 const defs=document.createElementNS(NS,'defs'),g=document.createElementNS(NS,'linearGradient');
 for(const [k,v] of Object.entries({id:'sss-suika-gradient',x1:'0%',y1:'0%',x2:'100%',y2:'0%'}))g.setAttribute(k,v);
 const colors=['#ff4266','#ffc638','#fbf45a','#59dc83','#4ca9f2','#a577fa','#f758d9'];
 colors.forEach((value,i)=>{const node=document.createElementNS(NS,'stop');node.setAttribute('offset',100*i/(colors.length-1)+'%');node.setAttribute('stop-color',value);g.appendChild(node)});
 defs.appendChild(g);map.appendChild(defs);
}
function paint(){
 if(!state.ready||!bridge())return;
 const svg=$('map');if(!svg)return;
 svg.querySelectorAll('.sss-suika-rainbow-stroke,.sss-suika-single-marker').forEach(node=>node.remove());
 const found=highlights();state.computed=found;
 if(!state.showRainbow&&!state.showIndividual)return;
 if(state.showRainbow&&found.all.size)addGradient(svg);
 document.querySelectorAll('#map g.s').forEach(group=>{
  const n=Number((group.getAttribute('aria-label')||'').replace('番',''));
  const rect=group.querySelector('rect.cell');if(!rect)return;
  const x=Number(rect.getAttribute('x')),y=Number(rect.getAttribute('y'));
  const w=Number(rect.getAttribute('width')),h=Number(rect.getAttribute('height'));
  if(![x,y,w,h].every(Number.isFinite))return;
  if(state.showRainbow&&found.all.has(n)){
   const outline=document.createElementNS(NS,'rect');
   for(const [k,v] of Object.entries({class:'sss-suika-rainbow-stroke',x:x-1.2,y:y-1.2,width:w+2.4,height:h+2.4,rx:1.6,fill:'none',stroke:'url(#sss-suika-gradient)','stroke-width':2.6}))outline.setAttribute(k,v);
   group.appendChild(outline);
  }
  if(state.showIndividual&&found.extra.has(n)){
   const dot=document.createElementNS(NS,'circle');
   for(const [k,v] of Object.entries({class:'sss-suika-single-marker',cx:x+w-1,cy:y+1,r:3,fill:'#ffe05b',stroke:'#884a15','stroke-width':.7}))dot.setAttribute(k,v);
   group.appendChild(dot);
  }
 });
}
function panel(){
 const d=state.computed=highlights(),status=$('sss-suika-status'),list=$('sss-suika-result-list');
 if(!status||!list||!state.data||!bridge())return;
 const last=state.data.reports[state.data.reports.length-1];
 if(d.rep){
  status.classList.toggle('warning',d.notFound.length>0);
  status.textContent=date()+'｜全🌈 '+d.groups.length+'機種／番号照合 '+d.all.size+'台'+
  (d.notFound.length?'｜未照合：'+d.notFound.join('・'):'')+'（スイカの機種単位の報告）';
  list.innerHTML=d.groups.map(g=>'<div class="sss-suika-result"><strong>🌈 '+escapeHtml(g.label)+'</strong><small>'+
   (g.numbers.length?g.numbers.length+'台の番号を照合':'該当台番号を照合できず')+'</small>'+
   '<div class="sss-suika-entry-list">'+g.numbers.map(n=>'<button type="button" class="sss-suika-chip" data-suika-seat="'+n+'">'+n+'</button>').join('')+'</div></div>').join('');
  if(d.dataCount===0)status.textContent+='｜当日の実績未取得';
 }else{
  status.classList.add('warning');
  status.textContent=date()+'のスイカ全🌈報告は未登録（最新記録 '+(last?.date||'不明')+'）。推測では虹枠を描きません。';
  list.innerHTML=last?'<div class="sss-suika-result"><strong>最新報告 '+escapeHtml(last.date.slice(5))+'</strong><small>'+escapeHtml(last.machine_labels.join('・'))+'</small><button type="button" class="sss-suika-chip" id="sss-suika-latest">最新報告日を見る</button></div>':'';
 }
 const lastButton=$('sss-suika-latest');
 if(lastButton)lastButton.onclick=()=>bridge().setDate(last.date);
 list.querySelectorAll('[data-suika-seat]').forEach(btn=>btn.onclick=()=>{
  bridge().selectSeat(Number(btn.dataset.suikaSeat));$('detail').scrollIntoView({behavior:'smooth',block:'nearest'});
 });
 const single=$('sss-suika-individual-summary');
 if(single){
  const kinds=[...d.extra.values()].reduce((o,v)=>(o[v]=(o[v]||0)+1,o),{});
  single.textContent=d.extra.size?'個別台番号の掲載 '+d.extra.size+'台（角'+(kinds.corner||0)+'・円卓'+(kinds.roundtable||0)+'・毎日機種'+(kinds.daily||0)+'）。黄色点は全🌈の確定ではありません。':'個別台の掲載記録はこの日には未登録';
 }
}
function refresh(){
 if(!state.ready||!bridge())return;
 const select=$('sss-suika-report-date');if(select)select.value=report()?date():'';
 paint();panel();
}
function onSeat(n,detail){
 if(!state.ready||!detail||!bridge())return;
 detail.querySelector('.sss-suika-seat-info')?.remove();
 const d=highlights(),rainbow=d.all.get(Number(n)),category=d.extra.get(Number(n));
 if(!rainbow&&!category)return;
 const section=document.createElement('div');section.className='sss-suika-seat-info';
 section.innerHTML=(rainbow?'<strong>🌈 スイカの全🌈機種として報告</strong><p>'+escapeHtml(rainbow.label)+'｜'+escapeHtml(date())+'（全台の設定6確定とは異なる）</p>':'')+
 (category?'<strong>🍉 '+escapeHtml({corner:'角チャレンジ',roundtable:'円卓チャレンジ',daily:'毎日機種の個別掲載'}[category]||category)+'</strong><p>投稿に載った台番号（設定の確定情報ではありません）</p>':'')+
 '<a href="https://x.com/suicaa_melonn31" target="_blank" rel="noopener noreferrer">スイカの投稿を確認</a>';
 detail.appendChild(section);
}
function init(){
 const rainbow=$('sss-suika-show-rainbow'),extra=$('sss-suika-show-individual'),select=$('sss-suika-report-date');
 if(rainbow)rainbow.onchange=()=>{state.showRainbow=rainbow.checked;refresh()};
 if(extra)extra.onchange=()=>{state.showIndividual=extra.checked;refresh()};
 if(select)select.onchange=()=>{if(select.value)bridge()?.setDate(select.value)};
 fetch('reference/suika_rainbow_2026_11.json?t='+Date.now())
 .then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})
 .then(d=>{
  if(!Array.isArray(d.reports))throw Error('データ形式不一致');
  state.data=d;state.ready=true;
  if(select)select.innerHTML='<option value="">🌈報告日へ移動</option>'+[...d.reports].reverse().map(item=>'<option value="'+escapeHtml(item.date)+'">'+escapeHtml(item.date.slice(5))+' '+escapeHtml(item.machine_labels.join('・'))+'</option>').join('');
  refresh();
 })
 .catch(err=>{const status=$('sss-suika-status');if(status)status.textContent='スイカの投稿データを読み込めません：'+err.message});
}
window.sssSuika={onRender:refresh,onSeat,refresh,highlights,shortName};
init();
})();