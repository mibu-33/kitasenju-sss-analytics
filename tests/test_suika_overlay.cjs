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
 assert.equal(count('sss-suika-rainbow-stroke'),4,'all four 11/15 Zenby seats get rainbow borders');
 assert.equal(count('sss-suika-single-marker'),0,'individual challenge markers are opt-in');
 assert.match($('sss-suika-status').textContent,/4台/);
 $('sss-suika-show-rainbow').checked=false;$('sss-suika-show-rainbow').onchange();
 assert.equal(count('sss-suika-rainbow-stroke'),0,'toggle hides rainbow borders');
 $('sss-suika-show-rainbow').checked=true;$('sss-suika-show-rainbow').onchange();
 $('sss-suika-show-individual').checked=true;$('sss-suika-show-individual').onchange();
 assert.equal(count('sss-suika-rainbow-stroke'),4);
 assert.equal(count('sss-suika-single-marker'),1,'exact 1005 seat is individually highlighted without a false rainbow');
 activeDate='2026-11-16';window.sssSuika.onRender();
 assert.equal(count('sss-suika-rainbow-stroke'),0,'never show yesterday rainbow on a date without sourced report');
 assert.match($('sss-suika-status').textContent,/未登録/);
 $('sss-suika-report-date').onchange({target:{value:'2026-11-15'}});
 $('sss-suika-report-date').value='2026-11-15';$('sss-suika-report-date').onchange();
 assert.equal(activeDate,'2026-11-15');
 console.log('PASS Suika rainbow source attribution: four 11/15 seats, separate individual markers, toggle, old-date clearing and date jump');
})().catch(e=>{console.error(e);process.exitCode=1});
