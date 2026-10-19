const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sandbox={console,Date,Intl};sandbox.globalThis=sandbox;
vm.runInNewContext(fs.readFileSync('public/color-areas.js','utf8'),sandbox);
const m=sandbox.SSSColorCore;
assert.equal(m.normalized({number:35,zone:'赤'}).floor,'1F');
assert.equal(m.normalized({number:810,zone:'金'}).floor,'2F');
assert.throws(()=>m.normalized({number:35,zone:'金',floor:'1F'}));
assert.throws(()=>m.normalized({number:35,zone:'青',from:'2026-10-20',to:'2026-10-01'}));
const rows=m.csv('台番,階,色,通路,左右,位置,開始日,終了日\n11,1F,青,A,左,1,2026-10-01,\n12,1F,赤,B,右,2,2026-10-01,');
assert.equal(rows.length,2);assert.equal(rows[0].zone,'blue');
assert.equal(m.targetType('2026-10-20'),0);
assert.equal(m.targetType('2026-10-19'),-1);
const area=[];
for(let seat=1;seat<=10;seat++)area.push(m.normalized({number:seat,zone:seat<=5?'red':'blue',floor:'1F',corridor:'A',side:'左',order:seat,from:'2026-01-01'}));
sandbox.records=[];
for(let day=1;day<=12;day++){
 const date='2026-10-'+String(day).padStart(2,'0');
 for(let seat=1;seat<=10;seat++)sandbox.records.push({date,number:seat,machine:'モンキーターン',diff:seat<=5?1400:-900,games:4400});
}
assert.equal(m.at('2026-10-19').size,0,'no unverified default mapping');

m.setAreas(area);
const result=m.compute('2026-10-20');
assert.equal(result.scores.length,2);
assert.equal(result.scores[0].zone,'red');
assert.ok(result.candidates.length>0);
const before=result.scores.map(x=>x.score);
sandbox.records.push({date:'2026-10-20',number:1,machine:'モンキーターン',diff:-10000,games:5000});
assert.deepEqual(m.compute('2026-10-20').scores.map(x=>x.score),before,'future observation must not leak into predictions');
console.log('Color area verification: 10 assertions and forward date isolation passed');