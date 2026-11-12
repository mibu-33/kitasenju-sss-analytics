const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/legacy-seat-layout.html','utf8');
const match=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match,'legacy seat map JavaScript exists');
new Function(match[1]); // syntax
const nodes=new Map();
function node(id=''){
 return {id,style:{},children:[],textContent:'',value:'',checked:false,
   setAttribute(k,v){this[k]=v},
   append(...elements){this.children.push(...elements)},
   replaceChildren(){this.children=[]},
   addEventListener(){},
   getAttribute(k){return this[k]}
 };
}
const document={
 getElementById(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id)},
 createElementNS(ns,name){return node(name)},
 createElement(name){return node(name)}
};
const result={data_date:'2026-11-11',seats:[{number:605,machine:'テスト機',diff:1500,games:5000}]};
(async()=>{
 vm.runInNewContext(match[1],{document,fetch:()=>Promise.resolve({json:()=>Promise.resolve(result)}),console});
 await new Promise(resolve=>setImmediate(resolve));
 const summary=nodes.get('summary').textContent;
 assert.match(summary,/転記した台：426台/,summary);
 assert.match(summary,/2026年実績が存在する転記台：1台/,summary);
 assert.equal(nodes.get('overlay').children.length,426,'one selectable cell per 2025 diagram number');
 nodes.get('find').value='605';nodes.get('search').onclick();
 assert.match(nodes.get('detail').children[0].textContent,/605番/);
 nodes.get('heat').onchange({target:{checked:true}});
 assert.equal(nodes.get('overlay').children.length,426);
 console.log('PASS historical geometry: 426 unique provisional positions, selection, heatmap');
})().catch(e=>{console.error(e);process.exitCode=1});
