const fs=require('fs'),vm=require('vm'),assert=require('assert').strict;
const html=fs.readFileSync('public/structural-floor-map.html','utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);assert(m,'map JS');
new Function(m[1]);
assert(!html.includes('<img'),'image must not be copied into the map');
const reg=JSON.parse(fs.readFileSync('data/floor_inventory.json','utf8'));
const nodes=new Map();
function node(kind,id=''){return {kind,id,children:[],style:{},attrs:{},value:'',textContent:'',clientWidth:850,clientHeight:500,scrollLeft:0,scrollTop:0,
 classList:{toggle(){},add(){},remove(){}},
 setAttribute(k,v){this.attrs[k]=v},
 appendChild(c){this.children.push(c);return c},append(...c){this.children.push(...c)},
 replaceChildren(){this.children=[]},addEventListener(){},click(){this.onclick?.()},
 }; }
const doc={
 getElementById(id){if(!nodes.has(id))nodes.set(id,node('div',id));return nodes.get(id)},
 createElementNS(ns,k){return node(k)},createElement(k){return node(k)}
};
const fetch=async u=>({ok:true,json:async()=>u.includes('floor_inventory')?reg:[]});
async function tick(){await new Promise(r=>setImmediate(r));}
(async()=>{
 vm.runInNewContext(m[1],{document:doc,fetch,console});
 await tick();await tick();
 const svg=nodes.get('map');
 let groups=svg.children.filter(x=>x.kind==='g'&&x.attrs.class?.startsWith('s'));
 const collect=()=>nodes.get('map').children.filter(x=>x.kind==='g'&&x.attrs.class?.startsWith('s')).map(x=>Number(x.attrs['aria-label'].replace('番','')));
 let nums=collect();
 // Measure how far each individual cell center is from the manually annotated
 // reference-image center; these are approximate visual centers, not survey coordinates.
 const anchors=new Map(JSON.parse(fs.readFileSync('public/reference/tousenbo_20261113_coords.json','utf8')).entries.map(x=>[x.number,x]));
 const diagnostics=svg.children.filter(x=>x.kind==='g'&&x.attrs.class?.startsWith('s')).map(g=>{
  const n=Number(g.attrs['aria-label'].replace('番','')),c=anchors.get(n);
  const r=g.children.find(k=>k.kind==='rect');
  const dx=Number(r.attrs.x)+Number(r.attrs.width)/2-c.x;
  const dy=Number(r.attrs.y)+Number(r.attrs.height)/2-c.y;
  return {n,group:c.group,dx:+dx.toFixed(1),dy:+dy.toFixed(1),dist:+Math.hypot(dx,dy).toFixed(1)};
 }).sort((a,b)=>b.dist-a.dist);
 const mean=diagnostics.reduce((sum,x)=>sum+x.dist,0)/diagnostics.length;
 const p90=diagnostics[Math.floor(diagnostics.length*.1)].dist;
 console.log('Reference image alignment / avg='+mean.toFixed(1)+'px / p90='+p90+'px / worst '+JSON.stringify(diagnostics.slice(0,16)));
 assert.equal(nums.length,451,'451 independent SVG machine cells');
 assert.equal(new Set(nums).size,451,'no duplicated machine numbers');
 const registered=new Set(reg.seats.map(x=>Number(x.number)));
 assert.equal(registered.size,451);
 const screenshotOnly=nums.filter(n=>!registered.has(n)),registryOnly=[...registered].filter(n=>!nums.includes(n));
 assert.deepEqual(screenshotOnly,[691],'Nov 13 reference shows 691, not registry 601');
 assert.deepEqual(registryOnly,[601],'current registry seat 601 is not printed on reference image');
 assert.equal(nums.filter(n=>registered.has(n)).length,450,'450 machine numbers match between image and current registry');
 assert.equal(nums.filter(n=>n>=1&&n<=261).length,261);
 assert.equal(nums.filter(n=>n>=602&&n<=762).length,161);
 assert.equal(nums.filter(n=>n>=1001&&n<=1017).length,17);
 assert.equal(nums.filter(n=>n>=2001&&n<=2012).length,12);
 assert.ok(svg.children.filter(x=>x.kind==='rect').length>35,'distinct island outlines and corridors');
 nodes.get('first').onclick();
 nums=collect();assert.equal(nums.length,265,'1F has 261+4 seats');
 nodes.get('second').onclick();
 nums=collect();assert.equal(nums.length,186,'2F has 161+13+12 seats');
 nodes.get('all').onclick();
 nodes.get('query').value='612';
 nodes.get('find').onclick();
 assert.match(nodes.get('detail').children[0].textContent,/612番/);
 nodes.get('heat').onchange({target:{checked:true}});
 assert.equal(collect().length,451);
 console.log('PASS: 451 independent SVG cells, verified full seat coverage, 1F/2F, search, and heatmap');
})().catch(e=>{console.error(e);process.exitCode=1});
