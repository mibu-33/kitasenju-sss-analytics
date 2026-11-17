const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('public/sss-suika.js','utf8');
new Function(src);
const data=JSON.parse(fs.readFileSync('public/reference/suika_rainbow_2026_11.json','utf8'));
assert.equal(data.reports.length,15);
assert.deepEqual(data.reports.find(x=>x.date==='2026-11-15').machine_labels,['ゾンサガ']);
assert.deepEqual(data.reports.find(x=>x.date==='2026-11-15').explicit_seat_numbers,[74,75,76,77]);
assert.equal(data.reports.find(x=>x.date==='2026-11-07').machine_labels.length,2);
assert.ok(!data.reports.some(x=>x.date==='2026-11-16'),'no unsourced Suika 11/16 all-rainbow report');
const labels=require('../public/sss-machine-labels.js');
class FakeNode{
 constructor(tag='div',id=''){
  this.tag=tag;this.id=id;this.children=[];this.attrs={};this.style={};this.dataset={};this.checked=true;this.textContent='';this.innerHTML='';
  this.classList={toggle(){},add(){},remove(){}};
 }
 setAttribute(k,v){this.attrs[k]=String(v)}
 getAttribute(k){return this.attrs[k]}
 appendChild(node){this.children.push(node);node.parent=this;return node}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
 querySelector(q){
  if(q==='rect.cell')return this.children.find(x=>x.tag==='rect'&&x.attrs.class==='cell')||null;
  if(q==='#sss-suika-gradient')return this.children.flatMap(x=>[x,...x.children]).find(x=>x.attrs.id==='sss-suika-gradient')||null;
  return null;
 }
 querySelectorAll(q){
  if(q==='[data-suika-seat]')return[];
  if(q==='.sss-suika-rainbow-stroke,.sss-suika-single-marker')return this.children.flatMap(x=>[x,...x.children]).filter(x=>['sss-suika-rainbow-stroke','sss-suika-single-marker'].includes(x.attrs.class));
  return[];
 }
 scrollIntoView(){}
}
const nodes=new Map();
const $=id=>{if(!nodes.has(id))nodes.set(id,new FakeNode('div',id));return nodes.get(id)};
const map=$('map'),groups=[74,75,76,77,1005].map((n,i)=>{
 const group=new FakeNode('g');group.setAttribute('aria-label',n+'番');
 const seat=new FakeNode('rect');seat.setAttribute('class','cell');seat.setAttribute('x',String(i*30+15));seat.setAttribute('y','100');seat.setAttribute('width','23');seat.setAttribute('height','10');group.appendChild(seat);map.appendChild(group);return group;
});
let activeDate='2026-11-15';
const sourceDay=new Map([74,75,76,77].map(n=>[n,{number:n,machine:'ゾンビランドサガ'}]));
sourceDay.set(1005,{number:1005,machine:'革命機ヴァルヴレイヴ'});
const api={
 getState(){return {date:activeDate}},
 getData(){return {day:activeDate==='2026-11-15'?sourceDay:new Map()}},
 getVisiblePositions(){return new Map(groups.map((g,i)=>[[74,75,76,77,1005][i],g]))},
 selectSeat(n){api.selected=n},
 setDate(d){activeDate=d;window.sssSuika.onRender();return Promise.resolve(true)}
};
const window={sssFloorBridge:api,sssMachineLabels:labels};
const document={getElementById:$,createElementNS(ns,tag){return new FakeNode(tag)},createElement(tag){return new FakeNode(tag)},
 querySelectorAll(q){return q==='#map g.s'?groups:[]}};
const fetch=async()=>({ok:true,json:async()=>data});
function count(cls){return groups.flatMap(g=>g.children).filter(x=>x.attrs.class===cls).length}
(async()=>{
 vm.runInNewContext(src,{window,document,fetch,Map,Set,Number,Object,Math,Date,Array,console});
 await new Promise(r=>setImmediate(r));
 const mentioned=window.sssSuika.highlights().mentioned;
 assert.equal(mentioned.size,23,'Nov 15 report has four full-rainbow plus 19 individually named seats');
 assert.ok(mentioned.has(1005)&&mentioned.get(1005).kinds.includes('roundtable'),'1005 has roundtable source metadata');
 assert.ok(mentioned.has(52)&&mentioned.get(52).kinds.includes('corner'),'52 from corner challenge');
 assert.ok(mentioned.has(612)&&mentioned.get(612).kinds.includes('daily'),'612 from daily individual report');
 assert.equal(count('sss-suika-rainbow-stroke'),5,'four 11/15 Zombieland seats plus individually cited 1005 get identical rainbow borders');
 assert.equal(count('sss-suika-single-marker'),0,'no separate marker style remains');
 assert.match($('sss-suika-status').textContent,/23台/);
 $('sss-suika-show-rainbow').checked=false;$('sss-suika-show-rainbow').onchange();
 assert.equal(count('sss-suika-rainbow-stroke'),0,'single rainbow toggle hides all mentioned seats');
 $('sss-suika-show-rainbow').checked=true;$('sss-suika-show-rainbow').onchange();
 assert.equal(count('sss-suika-rainbow-stroke'),5,'single rainbow toggle restores full and individual reports');
 activeDate='2026-11-14';window.sssSuika.onRender();
 assert.equal(count('sss-suika-rainbow-stroke'),0,'offscreen individual mentions have no false seats');
 assert.ok(window.sssSuika.highlights().mentioned.has(53),'11/14 corner is included even without daily records');
 assert.ok(window.sssSuika.highlights().mentioned.has(1006),'11/14 roundtable included even without daily records');
 activeDate='2026-11-16';window.sssSuika.onRender();
 assert.equal(count('sss-suika-rainbow-stroke'),0,'never carry yesterday rainbows onto an unreported date');
 assert.equal(window.sssSuika.highlights().mentioned.size,0,'unknown date has no invented mentions');
 assert.match($('sss-suika-status').textContent,/未登録/);
 $('sss-suika-report-date').value='2026-11-15';$('sss-suika-report-date').onchange();
 assert.equal(activeDate,'2026-11-15','published-date selector opens recorded date');
 console.log('PASS Suika all-mentions rainbow: full machines plus corner, roundtable, daily, 23 Nov 15 mentions, toggle, category provenance, date clearing');
})().catch(e=>{console.error(e);process.exitCode=1});
