(function(){
'use strict';
const $=id=>document.getElementById(id);
const NS='http://www.w3.org/2000/svg';
const escapeHtml=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const state={data:null,showRainbow:true,ready:false,computed:null};
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
 const day=bridge()?.getData()?.day||new Map(),rep=report();
 const all=new Map(),extra=new Map(),mentioned=new Map(),groups=[],notFound=[];
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
 const individual=state.data?.individually_reported?.find(x=>x.date===date());
 for(const group of individual?.categories||[]){
  for(const id of group.numbers||[]){
   const n=Number(id);
   if(Number.isInteger(n)&&n>0)extra.set(n,[...(extra.get(n)||[]),group.kind]);
  }
 }
 // Every source-mentioned seat gets the same rainbow border. Keep category
 // metadata separately so "全🌈", "角", "円卓", "毎日" never imply setting 6.
 for(const [n,info] of all)mentioned.set(n,{all:info,kinds:[]});
 for(const [n,kinds] of extra){
  const item=mentioned.get(n)||{all:null,kinds:[]};
  item.kinds=[...new Set([...item.kinds,...kinds])];
  mentioned.set(n,item);
 }
 return {rep,all,extra,mentioned,groups,notFound,dataCount:day.size};
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
 if(state.showRainbow&&found.mentioned.size)addGradient(svg);
 document.querySelectorAll('#map g.s').forEach(group=>{
  const n=Number((group.getAttribute('aria-label')||'').replace('番',''));
  const rect=group.querySelector('rect.cell');if(!rect)return;
  // Keep the actual difference-of-coins color visible. Restore the value if
  // a previous version of the overlay had covered red/green with a rainbow fill.
  if(rect.getAttribute('fill')==='url(#sss-suika-gradient)'){
   for(const [attr,backup] of [['fill','data-suika-base-fill'],['fill-opacity','data-suika-base-opacity'],['stroke','data-suika-base-stroke'],['stroke-width','data-suika-base-stroke-width']]){
    const val=rect.getAttribute(backup);
    if(val!=null)rect.setAttribute(attr,val);
   }
  }
  if(!state.showRainbow||!found.mentioned.has(n))return;
  const x=Number(rect.getAttribute('x')),y=Number(rect.getAttribute('y'));
  const w=Number(rect.getAttribute('width')),h=Number(rect.getAttribute('height'));
  if(![x,y,w,h].every(Number.isFinite))return;
  // Suika attribution is an outer gradient only, not an assertion of setting 6.
  const border=document.createElementNS(NS,'rect');
  for(const [key,value] of Object.entries({class:'sss-suika-rainbow-stroke',x:x-1.6,y:y-1.6,width:w+3.2,height:h+3.2,rx:1.6,fill:'none',stroke:'url(#sss-suika-gradient)','stroke-width':3.4})){
   border.setAttribute(key,value);
  }
  group.appendChild(border);
 });
}
function panel(){
 const d=state.computed=highlights(),status=$('sss-suika-status'),list=$('sss-suika-result-list');
 if(!status||!list||!state.data||!bridge())return;
 const dates=[...new Set([...(state.data.reports||[]),...(state.data.individually_reported||[])].map(x=>x.date))].sort();
 const last=dates[dates.length-1];
 const allCount=d.all.size,individualCount=d.extra.size,unionCount=d.mentioned.size;
 const visible=bridge().getVisiblePositions?.();
 const drawn=visible?([...d.mentioned.keys()].filter(n=>visible.has(n)).length):unionCount;
 status.classList.toggle('warning',d.notFound.length>0||(!d.rep&&!individualCount));
 if(d.rep||individualCount){
  status.textContent=date()+'｜スイカが言及した台 '+unionCount+'台（表示中 '+drawn+'台）'+
   '／全🌈機種 '+d.groups.length+'機種／個別掲載 '+individualCount+'台'+
   (d.notFound.length?'｜機種未照合：'+d.notFound.join('・'):'');
  if(d.dataCount===0&&d.rep)status.textContent+='｜全🌈機種の台番号照合には当日の実績が必要';
 }else{
  status.textContent=date()+'のスイカ掲載台は未登録（最終登録 '+(last||'不明')+'）。未確認の日に虹枠は付けません。';
 }
 const kinds={corner:'角チャレンジ',roundtable:'円卓チャレンジ',daily:'毎日機種',half_machine:'1/2機種',third_machine:'1/3機種',three_run:'3連番',five_run:'5連番'};
 const items=[];
 for(const g of d.groups){
  items.push('<div class="sss-suika-result"><strong>🌈 全🌈 '+escapeHtml(g.label)+'</strong><small>'+
   (g.numbers.length?g.numbers.length+'台を番号照合':'台番号の照合待ち')+'</small>'+
   '<div class="sss-suika-entry-list">'+g.numbers.map(n=>'<button type="button" class="sss-suika-chip" data-suika-seat="'+n+'">'+n+'</button>').join('')+'</div></div>');
 }
 for(const [kind,label] of Object.entries(kinds)){
  const nums=[...d.extra].filter(([n,ks])=>ks.includes(kind)).map(([n])=>n).sort((a,b)=>a-b);
  if(nums.length)items.push('<div class="sss-suika-result"><strong>🌈 '+escapeHtml(label)+'</strong><small>'+nums.length+'台を個別掲載</small><div class="sss-suika-entry-list">'+
   nums.map(n=>'<button type="button" class="sss-suika-chip" data-suika-seat="'+n+'">'+n+'</button>').join('')+'</div></div>');
 }
 for(const kind of [...new Set([...d.extra.values()].flat())].filter(k=>!kinds[k])){
  const nums=[...d.extra].filter(([n,ks])=>ks.includes(kind)).map(([n])=>n).sort((a,b)=>a-b);
  items.push('<div class="sss-suika-result"><strong>🌈 '+escapeHtml(kind)+'</strong><small>'+nums.length+'台を個別掲載</small><div class="sss-suika-entry-list">'+nums.map(n=>'<button type="button" class="sss-suika-chip" data-suika-seat="'+n+'">'+n+'</button>').join('')+'</div></div>');
 }
 if(!items.length&&last)items.push('<div class="sss-suika-result"><strong>最新登録 '+escapeHtml(last.slice(5))+'</strong><button type="button" class="sss-suika-chip" id="sss-suika-latest">この日の島図を見る</button></div>');
 list.innerHTML=items.join('');
 const lastButton=$('sss-suika-latest');
 if(lastButton)lastButton.onclick=()=>bridge().setDate(last);
 list.querySelectorAll('[data-suika-seat]').forEach(btn=>btn.onclick=()=>{
  bridge().selectSeat(Number(btn.dataset.suikaSeat));$('detail').scrollIntoView({behavior:'smooth',block:'nearest'});
 });
 const summary=$('sss-suika-individual-summary');
 if(summary)summary.textContent=individualCount?'個別掲載台も全🌈機種と同じ虹枠で表示。タップすると角・円卓・毎日・1/2・1/3・3連番・5連番などの言及種別が分かります。':'個別台番号の掲載はこの日の登録資料にはありません。';
}
function refresh(){
 if(!state.ready||!bridge())return;
 const select=$('sss-suika-report-date');if(select)select.value=(report()||state.data?.individually_reported?.some(x=>x.date===date()))?date():'';
 paint();panel();
}
function onSeat(n,detail){
 if(!state.ready||!detail||!bridge())return;
 detail.querySelector('.sss-suika-seat-info')?.remove();
 const entry=highlights().mentioned.get(Number(n));
 if(!entry)return;
 const section=document.createElement('div');section.className='sss-suika-seat-info';
 const kinds={corner:'角チャレンジ',roundtable:'円卓チャレンジ',daily:'毎日機種',half_machine:'1/2機種',third_machine:'1/3機種',three_run:'3連番',five_run:'5連番'};
 section.innerHTML=(entry.all?'<strong>🌈 スイカの全🌈機種として掲載</strong><p>'+escapeHtml(entry.all.label)+'｜'+escapeHtml(date())+'（設定6確定とは別）</p>':'')+
 entry.kinds.map(k=>'<strong>🌈 '+escapeHtml(kinds[k]||k)+'で言及</strong><p>スイカがこの台番号を個別掲載した記録です。設定確定を示すものではありません。</p>').join('')+
 '<a href="https://x.com/suicaa_melonn31" target="_blank" rel="noopener noreferrer">スイカの投稿を確認</a>';
 detail.appendChild(section);
}
function init(){
 const rainbow=$('sss-suika-show-rainbow'),select=$('sss-suika-report-date');
 if(rainbow)rainbow.onchange=()=>{state.showRainbow=rainbow.checked;refresh()};
 if(select)select.onchange=()=>{if(select.value)bridge()?.setDate(select.value)};
 fetch('reference/suika_rainbow_2026_11.json?t='+Date.now())
 .then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})
 .then(d=>{
  if(!Array.isArray(d.reports))throw Error('データ形式不一致');
  state.data=d;state.ready=true;
  if(select){
   const combined=[...new Set([...d.reports,...(d.individually_reported||[])].map(x=>x.date))].sort().reverse();
   select.innerHTML='<option value="">🍉掲載日へ移動</option>'+combined.map(day=>'<option value="'+escapeHtml(day)+'">'+escapeHtml(day.slice(5))+'</option>').join('');
  }
  refresh();
 })
 .catch(err=>{const status=$('sss-suika-status');if(status)status.textContent='スイカの投稿データを読み込めません：'+err.message});
}
window.sssSuika={onRender:refresh,onSeat,refresh,highlights,shortName};
init();
})();