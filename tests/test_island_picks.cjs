const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sandbox={console};sandbox.globalThis=sandbox;
vm.runInNewContext(fs.readFileSync('public/island-picks.js','utf8'),sandbox);
const predict=sandbox.SSSIslandCore.scoreIslands;
const blocks=[['青A','blue','1F','左',66,87],['青B','blue','1F','右',88,110],['緑C','green','1F','左',234,240],['緑D','green','1F','右',255,261],['緑E','green','1F','左',241,247],['緑F','green','1F','右',248,254],['赤S','red','1F','',1001,1004],['紫5台円卓','purple','2F','',1013,1017]];
const mapped=JSON.parse(fs.readFileSync('data/areas.json','utf8'));
assert.equal(mapped.length,82,'82 positions should be mapped');
assert.equal(new Set(mapped.map(x=>x.number)).size,82);
assert.ok(mapped.every(x=>x.order==null),'do not fabricate adjacency');
const map=new Map(mapped.map(x=>[x.number,x])),at=()=>map;
const seats=[...new Set([...Array(451)].map((_,i)=>i+1).concat([1001,1002,1003,1004,1013,1014,1015,1016,1017]))];
let data=[];
for(let day=1;day<=25;day++){
 const date='2026-09-'+String(day).padStart(2,'0');
 for(const number of seats){
   const island=map.get(number)?.corridor;
   data.push({date,number,machine:'モンキーターン',diff:island==='青A'?1800:island==='青B'?-500:200,games:4500,source:'slo-navi'});
 }
}
const a=predict('2026-10-01',data,at);
assert.equal(a.known,82);
assert.equal(a.usableDays,25);
assert.equal(a.blocks[0]?.block,'青A');
assert.equal(a.picks[0]?.block,'青A');
const leaked=data.concat(seats.map(number=>({date:'2026-10-01',number,machine:'モンキーターン',diff:-10000,games:4400,source:'slo-navi'})));
assert.equal(predict('2026-10-01',leaked,at).blocks[0].score,a.blocks[0].score,'exclude forecast-day outcomes');
const partial=predict('2026-10-01',data.filter(x=>x.number<=300),at);
assert.equal(partial.blocks.length,0,'no incomplete-hall observations');
const other=data.concat(seats.map(number=>({date:'2026-10-03',number,machine:'test',diff:0,games:4400,source:'other'})));
assert.equal(predict('2026-10-04',other,at).usableDays,1,'do not mix data-source metrics');
assert.equal(predict('2026-10-01',data.map(x=>({...x,machine:'かぐや様'})),at,{excludeRisk:true}).picks.length,0);
console.log('PASS: mapping, time boundary, blocks, incomplete days, sources, risk filter');
