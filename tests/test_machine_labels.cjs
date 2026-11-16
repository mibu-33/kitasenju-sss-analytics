const fs=require('fs'),assert=require('node:assert/strict');
const {shorten}=require('../public/sss-machine-labels.js');
const reference=JSON.parse(fs.readFileSync('public/reference/nov13_machine_labels.json','utf8'));
const inventory=JSON.parse(fs.readFileSync('data/floor_inventory.json','utf8'));
const src=fs.readFileSync('public/structural-floor-map.html','utf8');
assert.equal(reference.reference_date,'2026-11-13');
assert.equal(Object.keys(reference.labels).length,450,'450 legible machine labels from source photo');
assert.equal(reference.labels[691],undefined,'691 machine identity remains unknown');
assert.equal(reference.labels[601],undefined,'601 not drawn in source');
assert.ok(src.includes("692,null,691,690,689,687,688"),'mid-right gold bank has source blank slot after 692');
assert.ok(src.includes('sss-machine-labels.js'),'separate machine-name abbreviator loaded');
assert.ok(src.includes('machineLabelMode'),'users can see source vs date-specific machine name');
const byNumber=new Map(inventory.seats.map(x=>[Number(x.number),x]));
assert.equal(byNumber.size,451);
const disagreements=[],missing=[];
for(const [key,label] of Object.entries(reference.labels)){
 const n=Number(key),record=byNumber.get(n);
 if(!record?.machine){missing.push(n);continue}
 if(shorten(record.machine)!==label)disagreements.push({n,label,raw:record.machine,short:shorten(record.machine)});
}
console.log('Reference machine-name audit: '+(Object.keys(reference.labels).length-disagreements.length-missing.length)+
 '/'+Object.keys(reference.labels).length+' match on '+inventory.data_date+
 ' | disagreements '+disagreements.length+' | missing '+missing.length);
if(disagreements.length)console.log('Differences since 11/13:',JSON.stringify(disagreements.slice(0,30)));
if(inventory.data_date==='2026-11-15')assert.deepEqual(disagreements,[],'11/15 machine names should match 11/13 known source labels');
// Distinct names must remain distinct on the tiny map.
const samples=[
 ['からくりサーカス2','からくり2'],
 ['Lからくりサーカス','からくり'],
 ['革命機ヴァルヴレイヴ2','ヴヴヴ2'],
 ['革命機ヴァルヴレイヴ','ヴヴヴ'],
 ['マイジャグラーVI','マイVI'],
 ['マイジャグラーV','マイV'],
 ['ソードアート・オンラインⅡ','SAO2'],
 ['ソードアート・オンライン オルタナティブ ガンゲイル・オンライン','GGO'],
 ['一方通行 とある魔術の禁書目録','アクセラ'],
 ['とある魔術の禁書目録2','とある2'],
 ['東京喰種','喰種'],
 ['マギアレコード 魔法少女まどか☆マギカ外伝','マギレコ']
];
for(const [raw,name] of samples)assert.equal(shorten(raw),name,raw);
console.log('PASS: original Nov13 450 labels vs latest data + distinct short names + source blank gap');
