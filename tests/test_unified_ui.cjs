const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('public/sss-unified-ui.js','utf8');
new Function(src);
const mapSrc=fs.readFileSync('public/structural-floor-map.html','utf8');
assert.match(mapSrc,/sss-unified-ui\.js/);
assert.match(mapSrc,/sss-unified-ui\.css/);
const elements=new Map();
function element(id=''){
 return {id,value:'',textContent:'',innerHTML:'',disabled:false,style:{},className:'',dataset:{},
   children:[],attrs:{},classList:{toggle(k,on){this[k]=on},add(){},remove(){}},
   append(...x){this.children.push(...x)},appendChild(x){this.children.push(x)},
   querySelector(){return element('nested')},querySelectorAll(){return[]},
   setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},
   scrollIntoView(){},focus(){},showPicker(){},click(){this.onclick?.()},remove(){}};
}
function $(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id)}
const dateOptions=['2026-11-13','2026-11-14','2026-11-15'];$('date').options=dateOptions.map(value=>({value}));
const modes=['day','range','3','6','0'].map(x=>{const e=element();e.dataset.sssMode=x;return e});
const tabs=['machines','areas','numbers','favorites'].map(x=>{const e=element();e.dataset.sssTab=x;return e});
const data={
 '2026-11-15':[
  {date:'2026-11-15',number:1,machine:'モンキーターン',diff:5000,games:6000},
  {date:'2026-11-15',number:2,machine:'東京喰種',diff:-1500,games:3000},
  {date:'2026-11-15',number:3,machine:'東京喰種',diff:1500,games:5000}],
 '2026-11-14':[
  {date:'2026-11-14',number:1,machine:'モンキーターン',diff:1000,games:2500},
  {date:'2026-11-14',number:2,machine:'東京喰種',diff:3000,games:4000},
  {date:'2026-11-14',number:3,machine:'東京喰種',diff:-500,games:2500}],
 '2026-11-13':[
  {date:'2026-11-13',number:1,machine:'モンキーターン',diff:-1000,games:2000},
  {date:'2026-11-13',number:2,machine:'東京喰種',diff:2000,games:3500},
  {date:'2026-11-13',number:3,machine:'東京喰種',diff:500,games:4000}]
};
const toMap=x=>new Map(x.map(r=>[r.number,r]));
const history=new Map([['2026-11-15',toMap(data['2026-11-15'])]]);
let selectedDate='2026-11-15',ensureCalled=0;
const bridge={
 getState(){return {date:selectedDate,latest:'2026-11-15',floor:'ALL',selected:1}},
 getAvailableDates(){return dateOptions},
 getData(){return {day:history.get(selectedDate)||new Map(),history,inventory:toMap(data['2026-11-15'])}},
 getPlacements(){return new Map([[1,{zone:'red'}],[2,{zone:'gold'}],[3,{zone:'gold'}]])},
 async ensureHistory(){ensureCalled++;for(const [d,r] of Object.entries(data))history.set(d,toMap(r))},
 async setDate(d){selectedDate=d;window.sssUnifiedUI.onRender();return true},
 selectSeat(n){bridge.lastSelected=n}
};
const seatGroups=data['2026-11-15'].map(row=>{
 const rect=element('rect'),label=element('label'),title=element('title');
 const g=element('g');g.attrs['aria-label']=row.number+'番';
 g.querySelector=q=>q==='rect.cell'?rect:q==='text'?label:q==='title'?title:null;
 g.rect=rect;return g;
});
const document={
 getElementById:$,
 querySelectorAll(sel){if(sel==='#map g.s')return seatGroups;if(sel==='[data-sss-mode]')return modes;if(sel==='[data-sss-tab]')return tabs;return[]},
 createElement(){return element('created')},
 body:{appendChild(){}}
};
const localStorage={getItem(){return null},setItem(){}};
const window={sssFloorBridge:bridge};
const context={window,document,localStorage,console,Date,Blob,URL,Number,Math,JSON,Intl,Set,Map};
(async()=>{
 vm.runInNewContext(src,context);
 assert.ok(window.sssUnifiedUI,'UI plugin exposed');
 assert.match($('sss-kpis').innerHTML,/総差枚/);
 assert.match($('sss-kpis').innerHTML,/5,000枚/);
 assert.match($('sss-date-label').textContent,/11\/15/);
 assert.equal(seatGroups[0].rect.attrs.fill,'#00b0f0','daily +5000 blue/cyan');
 assert.equal(window.sssUnifiedUI.getStats().rows.length,3);
 await window.sssUnifiedUI.setMode('range');
 assert.ok(ensureCalled>0,'history loaded lazily for range comparison');
 assert.equal(window.sssUnifiedUI.getStats().rows.length,9);
 assert.match($('sss-mode-sub').textContent,/30日間/);
 await window.sssUnifiedUI.setMode('3');
 assert.equal(window.sssUnifiedUI.getStats().rows.length,3,'only date ending in 3');
 assert.ok($('sss-analysis-results').innerHTML.includes('最低サンプル'));
 $('sss-minsample').value='1';$('sss-minsample').onchange();
 tabs[1].onclick();assert.ok($('sss-table-body').innerHTML.includes('色エリア'));
 tabs[2].onclick();assert.ok($('sss-table-body').innerHTML.includes('台番号'));
 await $('sss-prev').onclick();
 assert.equal(selectedDate,'2026-11-14','date previous button uses previous available day');
 assert.match($('sss-date-label').textContent,/11\/14/);
 console.log('PASS unified UI: KPI, seven-color map, lazy history, range/3-day modes, area and seat tabs, date arrows');
})().catch(e=>{console.error(e);process.exitCode=1});
