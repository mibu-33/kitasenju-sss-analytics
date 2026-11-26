/* Lightweight DOM regression for peer-compatible SSS shell. No third-party packages. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('public/sss-peer-ui.js','utf8');
const html=fs.readFileSync('public/structural-floor-map.html','utf8');
const css=fs.readFileSync('public/sss-peer-ui.css','utf8');
new Function(src);
assert.match(html,/sss-peer-ui\.css/);assert.match(html,/sss-peer-ui\.js/);
assert.match(html,/id="sss-theme-toggle"/);
assert.match(html,/sssPeerUI\?\.onSeat/);
assert.match(html,/getZoom:\(\)=>zoom/);assert.match(html,/setZoom:\(value,x,y\)=>zoomTo\(value,x,y\)/);
assert.match(css,/\.sss-peer-zoom/);
assert.match(css,/\.sss-peer-detail-dialog/);
assert.match(css,/\.sss-datebar/);
assert.match(css,/\.sss-peer-light/);
assert.match(css,/\.sss-legend-chip/);
const registry=new Map();
class Element{
 constructor(tag='div',id='',cls=''){
  this.tagName=tag.toUpperCase();this.id=id;this.classes=new Set(cls.split(' ').filter(Boolean));
  this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),contains:x=>this.classes.has(x),toggle:(x,value)=>{
   const yes=value===undefined?!this.classes.has(x):!!value;
   if(yes)this.classes.add(x);else this.classes.delete(x);return yes;
  }};
  this.children=[];this.parentElement=null;this.textContent='';this.hidden=false;this.open=false;
  this.events={};this.attrs={};this.value='';this.style={};this.clientWidth=600;this.clientHeight=400;
  if(id)registry.set(id,this);
 }
 adopt(n,index=this.children.length){
  if(n.parentElement)n.parentElement.children=n.parentElement.children.filter(v=>v!==n);
  n.parentElement=this;this.children.splice(index,0,n);return n;
 }
 append(...items){items.forEach(x=>this.adopt(x))}
 appendChild(x){return this.adopt(x)}
 insertBefore(n,ref){const i=this.children.indexOf(ref);return this.adopt(n,i<0?this.children.length:i)}
 after(n){if(!this.parentElement)throw Error('detached element after '+this.id);this.parentElement.adopt(n,this.parentElement.children.indexOf(this)+1)}
 before(n){if(!this.parentElement)throw Error('detached element before '+this.id);this.parentElement.adopt(n,this.parentElement.children.indexOf(this))}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null}
 setAttribute(k,v){this.attrs[k]=String(v)}
 getAttribute(k){return this.attrs[k]??null}
 removeAttribute(k){delete this.attrs[k]}
 addEventListener(name,fn){(this.events[name]??=[]).push(fn)}
 contains(other){return other===this||this.children.some(x=>x.contains(other))}
 find(selector){
  if(selector.startsWith('#'))return registry.get(selector.slice(1))||null;
  if(selector.startsWith('.')){const cls=selector.slice(1);return [this,...this.children].find(x=>x.classes.has(cls))||null}
  return this.walk().find(x=>x.tagName.toLowerCase()===selector)||null;
 }
 querySelector(selector){if(selector.startsWith('.'))return this.walk().find(x=>x.classes.has(selector.slice(1)))||null;return this.find(selector)}
 walk(){return [this,...this.children.flatMap(x=>x.walk())]}
 showModal(){this.open=true}
 close(){this.open=false}
 focus(){this.focused=true}
 getBoundingClientRect(){return {left:10,top:20,width:600,height:400}}
}
const E=(tag,id='',cls='')=>new Element(tag,id,cls);
const body=E('body'),head=E('header','', 'sss-peer-header'),main=E('main');
body.append(head,main);
const theme=E('button','sss-theme-toggle');head.appendChild(theme);
const datebar=E('div','','sss-datebar'),dateLabel=E('button','sss-date-label'),datePrev=E('button','sss-prev'),dateNext=E('button','sss-next');
datebar.append(datePrev,dateLabel,dateNext);main.appendChild(datebar);
const kpis=E('section','sss-kpis');main.appendChild(kpis);
const source=E('details','','sss-map-source-note');main.appendChild(source);
const sync=E('section','sss-sync-banner');main.appendChild(sync);
const suika=E('section','sss-suika-panel'),controls=E('div','','sss-suika-controls'),status=E('p','sss-suika-status');
suika.append(controls,status);main.appendChild(suika);
const modes=E('section','','sss-modes');main.appendChild(modes);
const toolbar=E('div','','toolbar');
const less=E('button','less'),fit=E('button','fit'),more=E('button','more');
const originalDateLabel=E('label'),date=E('select','date');
originalDateLabel.appendChild(date);
toolbar.append(less,fit,more,originalDateLabel);main.appendChild(toolbar);
const workspace=E('div','','workspace'),mapSection=E('section'),legend=E('div','sss-heatmap-legend','legend'),scroll=E('div','scroll'),detail=E('aside','detail');
mapSection.append(scroll,legend);workspace.append(mapSection,detail);main.appendChild(workspace);
const document={body,readyState:'complete',createElement:tag=>E(tag),getElementById:id=>registry.get(id)||null,querySelector:selector=>body.querySelector(selector),events:{},addEventListener(name,fn){(this.events[name]??=[]).push(fn)}};
const storage=new Map();
const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,val)=>storage.set(key,val)};
const window={sssFloorBridge:{getZoom:()=>1.23,setZoom(){}}};
vm.runInNewContext(src,{window,document,localStorage,console,Math,Number});
assert.ok(window.sssPeerUI,'peer UI exposed');
assert.equal(datebar.parentElement,body,'date controls are fixed outside main');
assert.equal(date.parentElement.tagName,'LABEL','date select remains in popover with label');
const pop=registry.get('sss-peer-date-popover');assert.equal(pop.hidden,true);
window.sssPeerUI.toggleDatePopover();assert.equal(pop.hidden,false);
window.sssPeerUI.toggleDatePopover(false);assert.equal(pop.hidden,true);
assert.equal(legend.parentElement,main,'payout legend moved above map');
assert.equal(legend.classes.has('sss-peer-legend'),true);
const quick=registry.get('sss-peer-quick');
assert.equal(controls.parentElement,quick,'Suika overlay toggle stays immediately above map');
assert.equal(status.parentElement,quick,'number of Suika citations remains visible');
assert.equal(suika.parentElement.id,'sss-peer-suika-tools','long Suika source list is collapsible after map');
const floating=registry.get('sss-peer-zoom');
assert.equal(less.parentElement,floating);assert.equal(fit.parentElement,floating);assert.equal(more.parentElement,floating);
const modal=registry.get('sss-peer-detail-dialog');
assert.equal(detail.parentElement,modal,'real seat detail is a modal as in other two apps');
window.sssPeerUI.onSeat();assert.equal(modal.open,true);
window.sssPeerUI.closeSeat();assert.equal(modal.open,false);
assert.equal(body.classes.has('sss-peer-dark'),true,'Mizumoto noir default');
theme.onclick();assert.equal(body.classes.has('sss-peer-light'),true,'Kameari light theme switch');
assert.equal(storage.get('sss-shared-theme-v1'),'light');
window.sssPeerUI.onRender();assert.match(fit.title,/123%/);
assert.equal(source.parentElement,main,'source provenance retained');
assert.equal(sync.parentElement,main,'sync status retained');
assert.equal(workspace.children.length,1,'map is full-width instead of split by details');
console.log('PASS: shared peer shell, floating date/zoom, compact map-first order, Suika controls, modal and theme switch');
