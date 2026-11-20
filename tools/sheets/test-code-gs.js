// Tests tools/sheets/Code.gs in Node with a fake spreadsheet (no Google needed).
//   node tools/sheets/test-code-gs.js tools/sheets/Code.gs
const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
function Sheet(rows){this.rows=rows;}
Sheet.prototype={getLastRow(){return this.rows.length;},appendRow(r){this.rows.push(r.slice());},
 getDataRange(){const s=this;return{getDisplayValues(){return s.rows.map(r=>r.map(v=>v instanceof Date?v.toISOString():String(v??'')));}};},
 getRange(r,c,nr=1,nc=1){const s=this;return{
  getDisplayValues(){const o=[];for(let i=0;i<nr;i++){o.push([]);for(let j=0;j<nc;j++)o[i].push(String(s.rows[r-1+i]?.[c-1+j]??''));}return o;},
  getValues(){const o=[];for(let i=0;i<nr;i++){o.push([]);for(let j=0;j<nc;j++)o[i].push(s.rows[r-1+i]?.[c-1+j]??'');}return o;},
  setValues(v){v.forEach((row,i)=>{s.rows[r-1+i]=s.rows[r-1+i]||[];row.forEach((x,j)=>s.rows[r-1+i][c-1+j]=x);});},
  setValue(x){s.rows[r-1]=s.rows[r-1]||[];s.rows[r-1][c-1]=x;},setNumberFormat(){return this;}};}};
const tabs={Products:new Sheet([['product_id','kind','price'],['tea','food','10']]),Classes:new Sheet([['class_id','title'],['a','A']]),Questions:new Sheet([['class_id','question'],['a','Q?']]),Players:new Sheet([['phone','name','class_level','cash','health','vehicles','weapons','homes','lessons_done','created_at','last_seen','pin_salt','pin_hash','token_hash','failed_logins','save_json']])};
const props={};
const ctx={
 SpreadsheetApp:{openById:()=>({getSheetByName:n=>tabs[n],insertSheet:n=>(tabs[n]=new Sheet([]))})},
 ContentService:{createTextOutput:t=>({setMimeType(){return JSON.parse(t);}}),MimeType:{JSON:1}},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v})},
 Utilities:{getUuid:()=>crypto.randomUUID(),computeDigest:(a,t)=>[...crypto.createHash('sha256').update(t).digest()],base64Encode:b=>Buffer.from(b).toString('base64'),DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1}},
 Date,JSON,String,Number,Object,
};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
const post=b=>ctx.doPost({postData:{contents:JSON.stringify(b)}});
const a=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)process.exitCode=1;};
const g=ctx.doGet({parameter:{action:'content'}});a(g.ok&&g.products[0].product_id==='tea'&&!g.players,'content');
let r=post({action:'signup',phone:'+8801712345678',name:'=HACK()',classLevel:'hsc-2',pin:'1234',save:'{"cash":1}',summary:{cash:1000,vehicles:['taxi'],weapons:['pistol'],homes:[],lessonsDone:0}});a(r.ok&&r.token,'signup '+JSON.stringify(r).slice(0,80));
a(tabs.Players.rows[1][0]==='01712345678'&&tabs.Players.rows[1][1].startsWith("'")&&tabs.Players.rows[1][12]!=='1234','row stored safely '+tabs.Players.rows[1].slice(0,3));
a(post({action:'signup',phone:'01712345678',name:'X Y',classLevel:'c',pin:'1111'}).error==='exists','duplicate refused');
a(post({action:'signup',phone:'0123',name:'X Y',classLevel:'c',pin:'1111'}).error==='badPhone','bad phone');
a(post({action:'signin',phone:'01712345678',pin:'0000'}).error==='badPin','bad pin');
const s=post({action:'signin',phone:'01712345678',pin:'1234'});a(s.ok&&s.save==='{"cash":1}'&&s.profile.name==='=HACK()','signin');
a(post({action:'save',phone:'01712345678',token:r.token,save:'{}'}).error==='badToken','old token refused');
a(post({action:'save',phone:'01712345678',token:s.token,save:'{"cash":5}',summary:{cash:5}}).ok&&tabs.Players.rows[1][3]===5,'save');
for(let i=0;i<5;i++)post({action:'signin',phone:'01712345678',pin:'9999'});
a(post({action:'signin',phone:'01712345678',pin:'1234'}).error==='locked','locked after 5');
