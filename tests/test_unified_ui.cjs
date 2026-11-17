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
   append(...x){this.children.push(...x)},appendChild(x){this.children.push(x)},replaceChildren(){this.children=[]}, 
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
 getVisiblePositions(){return new Map([[1,{}],[2,{}],[3,{}]])},
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
const syncStatus={status:'error',newest_date:'2026-11-15',error:'primary HTTP 403',fallback_status:'ok',fallback_last_success:'2026-11-15T14:00:00+09:00',indexed_days:132};
const fetch=async()=>({ok:true,json:async()=>syncStatus});
const context={window,document,localStorage,fetch,console,Date,Blob,URL,Number,Math,JSON,Intl,Set,Map};
(async()=>{
 vm.runInNewContext(src,context);
 assert.ok(window.sssUnifiedUI,'UI plugin exposed');
 assert.match($('sss-kpis').innerHTML,/総差枚/);
 assert.match($('sss-kpis').innerHTML,/5,000枚/);
 assert.match($('sss-date-label').textContent,/11\/15/);
 assert.equal(seatGroups[0].rect.attrs.fill,'#00b0f0','daily +5000 blue/cyan');
 assert.equal(window.sssUnifiedUI.getStats().rows.length,3);
 // Machine picker is filled from the selected date, without guessing from future inventory.
 const pick=$('sss-machine-filter');const options=pick.children.map(x=>x.value);
 assert.ok(options.includes('東京喰種')&&options.includes('モンキーターン'),'available machines listed');
 pick.value='東京喰種';pick.onchange();
 assert.equal(seatGroups[0].attrs.opacity,'.28','nonmatching seats are visually dimmed');
 assert.equal(seatGroups[1].attrs.opacity,'1','matching seats retain full opacity');
 assert.equal($('sss-machine-count').textContent,'2台（この表示 2台）');
 $('sss-machine-next').onclick();assert.equal(bridge.lastSelected,2,'next-seat action jumps to the next matching machine');
 pick.value='';pick.onchange();
 assert.equal(seatGroups[0].attrs.opacity,'1','clearing a filter restores every seat');
 await new Promise(r=>setImmediate(r));
 assert.match($('sss-sync-text').textContent,/主取得に制限・代替取得実績あり/,'sync health surfaces the failure separately from fallback');
 assert.match($('sss-sync-details').textContent,/primary HTTP 403/);
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
