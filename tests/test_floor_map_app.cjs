const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/floor-map-derived.html','utf8'),match=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match,'map JS present');new Function(match[1]);
const registry=JSON.parse(fs.readFileSync('data/floor_inventory.json','utf8'));
const summary=JSON.parse(fs.readFileSync('data/summary.json','utf8'));
const provenance=JSON.parse(fs.readFileSync('data/placement_evidence.json','utf8'));
const nodes=new Map();
function node(id=''){
 return {id,children:[],style:{},dataset:{},innerHTML:'',textContent:'',value:'',checked:false,hidden:false,
  classList:{toggle(){},add(){},remove(){}},setAttribute(k,v){this[k]=v},
  append(...els){this.children.push(...els)},appendChild(el){this.children.push(el)},
  replaceChildren(...els){this.children=[...els]},addEventListener(){},scrollIntoView(){}};
}
const document={
 getElementById(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id)},
 createElementNS(ns,name){return node(name)},createElement(name){return node(name)},
 createTextNode(s){let n=node('text');n.textContent=s;return n}
};
const mocked=[
 {date:'2026-11-10',number:1,machine:'過去テスト機種',diff:2700,games:5555},
 {date:'2026-11-10',number:234,machine:'過去テスト緑',diff:-1000,games:2222}
];
const fetch=url=>Promise.resolve({ok:true,json:()=>Promise.resolve(
 url.includes('floor_inventory')?registry:
 url.includes('placement_evidence')?provenance:
 url.includes('summary.json')?summary:
 url.includes('records.json')?mocked:[])});
(async()=>{
 vm.runInNewContext(match[1],{document,fetch,console});
 const tick=()=>new Promise(r=>setImmediate(r));
 await tick();await tick();
 assert.equal(nodes.get('total').textContent,451);
 assert.equal(nodes.get('mapped').textContent,237);
 assert.equal(nodes.get('field').textContent,65);
 assert.ok(nodes.get('map').children.length>20,'1F groups rendered');
 assert.match(nodes.get('update').textContent,/位置未登録：214台/);
 nodes.get('floor2').onclick();
 assert.ok(nodes.get('map').children.length>15,'2F groups rendered');
 nodes.get('floor1').onclick();
 nodes.get('search').value='1';nodes.get('search').oninput();
 assert.match(nodes.get('detail').children[0].textContent,/1番/);
 nodes.get('heat').checked=true;nodes.get('heat').onchange();
 nodes.get('historyDate').onchange.call({value:'2026-11-10'});
 await tick();await tick();
 assert.match(nodes.get('update').textContent,/表示実績：2026-11-10/);
 assert.match(nodes.get('update').textContent,/当日の実位置を保証しません/);
 nodes.get('mode-guide').onclick();
 assert.equal(nodes.get('cell-layout').hidden,true);
 assert.equal(nodes.get('guide-layout').hidden,false);
 nodes.get('mode-compare').onclick();
 assert.equal(nodes.get('cell-layout').hidden,false);
 assert.equal(nodes.get('guide-layout').hidden,false);
 console.log('PASS: SSS floor map renders 1F/2F, 451 records, search, heat, history and view modes');
})().catch(e=>{console.error(e);process.exitCode=1});
