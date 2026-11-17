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
const map=$('map'),groups=[74,75,76,77,1005,707].map((n,i)=>{
 const group=new FakeNode('g');group.setAttribute('aria-label',n+'番');
 const seat=new FakeNode('rect');seat.setAttribute('class','cell');seat.setAttribute('x',String(i*30+15));seat.setAttribute('y','100');seat.setAttribute('width','23');seat.setAttribute('height','10');seat.setAttribute('fill',n===707?'#c00000':'#b7c5d5');seat.setAttribute('fill-opacity','1');seat.setAttribute('stroke','#fff');seat.setAttribute('stroke-width','.4');group.appendChild(seat);map.appendChild(group);return group;
});
let activeDate='2026-11-15';
const sourceDay=new Map([74,75,76,77].map(n=>[n,{number:n,machine:'ゾンビランドサガ'}]));
sourceDay.set(1005,{number:1005,machine:'革命機ヴァルヴレイヴ'});
sourceDay.set(707,{number:707,machine:'革命機ヴァルヴレイヴ',diff:-3250,games:5000});
const api={
 getState(){return {date:activeDate}},
 getData(){return {day:activeDate==='2026-11-15'?sourceDay:new Map()}},
 getVisiblePositions(){return new Map(groups.map((g,i)=>[[74,75,76,77,1005,707][i],g]))},
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
 assert.equal(mentioned.size,46,'Nov 15 reports contain 46 unique cited numbers across full rainbow, single seats, 1/2, 1/3 and runs');
 assert.ok(mentioned.has(1005)&&mentioned.get(1005).kinds.includes('roundtable'),'1005 has roundtable source metadata');
 assert.ok(mentioned.has(52)&&mentioned.get(52).kinds.includes('corner'),'52 from corner challenge');
 assert.ok(mentioned.has(612)&&mentioned.get(612).kinds.includes('daily'),'612 from daily individual report');
 assert.ok(mentioned.has(178)&&mentioned.get(178).kinds.includes('half_machine'),'178 from 1/2 machine report');
 assert.ok(mentioned.has(703)&&mentioned.get(703).kinds.includes('five_run')&&mentioned.get(703).kinds.includes('third_machine'),'703 preserves two separate published reasons');
 assert.ok(mentioned.has(244)&&mentioned.get(244).kinds.includes('three_run'),'244 from three-seat report');
 assert.ok(mentioned.has(73)&&mentioned.get(73).kinds.includes('five_run'),'73 from five-seat report');
 assert.ok(mentioned.has(707),'707 included through 703–707 five-seat run');
 assert.ok(mentioned.get(707).kinds.includes('five_run')&&mentioned.get(707).kinds.includes('third_machine'),'707 preserves both Suika citation categories');
 const seat707=groups.at(-1).querySelector('rect.cell');
 assert.equal(seat707.getAttribute('fill'),'#c00000','707 remains red to show its actual losing payout despite Suika attribution');
 assert.ok(Number(groups.at(-1).children.find(x=>x.attrs.class==='sss-suika-rainbow-stroke').attrs['stroke-width'])>=3,'707 retains a conspicuous separate rainbow border');
 assert.equal(count('sss-suika-rainbow-stroke'),6,'four 11/15 Zombieland seats plus cited 1005 and negative 707 have rainbow borders');
 assert.equal(count('sss-suika-single-marker'),0,'no separate marker style remains');
 assert.match($('sss-suika-status').textContent,/46台/);
 $('sss-suika-show-rainbow').checked=false;$('sss-suika-show-rainbow').onchange();
 assert.equal(count('sss-suika-rainbow-stroke'),0,'single rainbow toggle hides all mentioned seats');
 assert.equal(seat707.getAttribute('fill'),'#c00000','turning off rainbow restores 707 actual negative-payout red color');
 $('sss-suika-show-rainbow').checked=true;$('sss-suika-show-rainbow').onchange();
 assert.equal(count('sss-suika-rainbow-stroke'),6,'single rainbow toggle restores full and individual reports');
 assert.equal(seat707.getAttribute('fill'),'#c00000','707 negative payout never gets hidden by rainbow attribution');
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
 console.log('PASS Suika all-mentions rainbow: full machines plus corner, roundtable, daily, 1/2, 1/3 and runs; 46 unique Nov 15 mentions, toggle, category provenance, date clearing');
})().catch(e=>{console.error(e);process.exitCode=1});
