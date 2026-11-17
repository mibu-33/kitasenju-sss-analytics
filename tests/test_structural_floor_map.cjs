const fs=require('fs'),vm=require('vm'),assert=require('assert').strict;
const html=fs.readFileSync('public/structural-floor-map.html','utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);assert(m,'map JS');
new Function(m[1]);
assert(!html.includes('<img'),'image must not be copied into the map');
const reg=JSON.parse(fs.readFileSync('data/floor_inventory.json','utf8'));
const ref=JSON.parse(fs.readFileSync('public/reference/nov13_machine_labels.json','utf8'));
const globals={sssMachineLabels:require('../public/sss-machine-labels.js')};
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
const previousDate='2026-11-14';
const past=[{date:previousDate,number:612,machine:'過去テスト機種',diff:1234,games:4567}];
const summaries=[{date:reg.data_date},{date:previousDate}];
const fetch=async u=>({ok:true,json:async()=>u.includes('floor_inventory')?reg:u.includes('summary.json')?summaries:u.includes('records.json')?past:u.includes('nov13_machine_labels')?ref:[]});
async function tick(){await new Promise(r=>setImmediate(r));}
(async()=>{
 vm.runInNewContext(m[1],{document:doc,fetch,console,window:globals});
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
 assert.equal(Object.keys(globals.sssFloorBridge.getReferenceLabels()).length,450);
 const centerTexts=()=>nodes.get('map').children.filter(x=>x.kind==='text').map(x=>x.textContent);
 assert.ok(centerTexts().includes('喰種'),'2001-2012 center label');
 assert.ok(centerTexts().includes('ヴヴヴ'),'1005-1008 center label');
 assert.ok(centerTexts().includes('からくり2'),'1009-1012 center label');
 for(const wrong of ['絆','鏡','SAO / e-D'])assert.ok(!centerTexts().includes(wrong),'remove old incorrect center label: '+wrong);

 const nameAt=n=>{
  const group=nodes.get('map').children.find(x=>x.kind==='g'&&x.attrs['aria-label']===n+'番');
  assert.ok(group,n+' visible');return group.children.filter(x=>x.kind==='text').map(x=>x.textContent).slice(1).join('');
 };
 assert.equal(nameAt(758),'アクセラ','758 is 一方通行, not generic とある');
 assert.equal(nameAt(673),'からくり2');
 assert.equal(nameAt(678),'からくり');
 assert.equal(nameAt(623),'ヴヴヴ2');
 assert.equal(nameAt(695),'ヴヴヴ');
 assert.equal(nameAt(204),'マイVI');
 assert.equal(nameAt(218),'マイV');
 const seat692=svg.children.find(x=>x.kind==='g'&&x.attrs['aria-label']==='692番').children.find(x=>x.kind==='rect');
 const seat691=svg.children.find(x=>x.kind==='g'&&x.attrs['aria-label']==='691番').children.find(x=>x.kind==='rect');
 assert.ok(Number(seat691.attrs.x)-Number(seat692.attrs.x)>2*Number(seat691.attrs.width)-1,'preserve empty real slot between 692 and 691');

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
 // Historical dates must never fall back to the latest day's result when absent.
 nodes.get('date').value=previousDate;await nodes.get('date').onchange();await tick();
 nodes.get('query').value='87';nodes.get('find').onclick();
 assert.ok(nodes.get('detail').children.some(x=>String(x.textContent).includes('差枚：未取得')),'no latest-day leakage on historical missing seat');
 nodes.get('query').value='612';nodes.get('find').onclick();
 assert.ok(nodes.get('detail').children.some(x=>String(x.textContent).includes('差枚：+1,234枚')),'historical result attached by seat and date');
 nodes.get('scroll').clientWidth=340;nodes.get('fit').onclick();
 assert.ok(parseInt(nodes.get('map').style.width,10)<=340,'fit-to-width works on a phone');
 assert.equal(collect().length,451,'all cells remain after date and responsive zoom');
 assert.equal(nameAt(612),'過去テスト機種','past machine name does not leak from latest day');
 nodes.get('machineLabelMode').onchange({target:{value:'reference'}});
 assert.equal(nameAt(612),'サンブレ','reference mode displays 11/13 snapshot independently of selected-day row');
 for(const name of ['喰種','ヴヴヴ','からくり2','金カム','ガルパン','ダンバイン','e-D2','SAO'])
  assert.ok(centerTexts().includes(name),'11/13 floor map references correct mini-island labels: '+name);


 console.log('PASS: 451 cells, 1F/2F, search, date-isolated heatmap and mobile fit');
})().catch(e=>{console.error(e);process.exitCode=1});
