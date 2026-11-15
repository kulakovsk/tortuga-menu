'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {tables,sourceText}=require('./backup-shared.js');
const root=__dirname,hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function config(){const c={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'config.js'),'utf8'),c);return c.window.TORTUGA_CONFIG;}
async function get(url,options={}){
 let error;
 for(let attempt=0;attempt<3;attempt++)try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status+' from '+new URL(url).pathname);return r;}catch(e){error=e;}
 throw error;
}
async function readData(cfg){
 const data={};await Promise.all(tables.map(async t=>{
  const r=await get(cfg.url+'/rest/v1/'+t+'?select=*',{headers:{apikey:cfg.key}});
  const rows=await r.json();if(!Array.isArray(rows))throw Error('Invalid '+t);
  if(r.headers.get('content-range')?.match(/\/([0-9]+)$/)&&Number(r.headers.get('content-range').split('/')[1])>rows.length)throw Error('Truncated '+t);
  data[t]=rows;
 }));const ids=new Set(data.menu_items.map(x=>x.id));for(const t of ['menu_photos','item_options'])data[t]=data[t].filter(x=>ids.has(x.item_id));return data;
}
function validate(data){
 const c={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'bar-source.js'),'utf8'),c);
 c.window.TORTUGA_BAR_DATA(data.bar_categories,data.bar_items,data.bar_servings);
 if(!data.menu_items.length||!data.categories.length)throw Error('Empty kitchen');
 const cats=new Set(data.categories.map(c=>c.id)),opts=new Set(data.menu_options.map(o=>o.id)),ids=new Set(data.menu_items.map(x=>x.id));
 for(const x of data.menu_items){if(x.archived||!cats.has(x.category_id)||!['yes','no','later'].includes(x.status)||!Number.isFinite(Number(x.price))||Number(x.price)<0||!x.descriptions||!['ru','en','zh'].every(l=>typeof x.names[l]==='string'&&x.names[l]))throw Error('Invalid menu item '+x.id);}
 for(const l of data.item_options)if(ids.has(l.item_id)&&!opts.has(l.option_id))throw Error('Invalid option link');
 const seen=new Set();for(const p of data.menu_photos){if(!ids.has(p.item_id)||seen.has(p.item_id)||typeof p.storage_path!=='string'||p.storage_path.split('/').includes('..'))throw Error('Invalid photo');seen.add(p.item_id);}
}
function patchHtml(html,snapshot){
 const json=JSON.stringify(snapshot).replace(/</g,'\\u003c');
 const tag='<script id="menuBackup" type="application/json">'+json+'</script>';
 if(html.includes('id="menuBackup"'))html=html.replace(/<script id="menuBackup" type="application\/json">[\s\S]*?<\/script>/,()=>tag);
 else html=html.replace('<script id="publishedPhotos"',()=>tag+'\n<script id="publishedPhotos"');
 const guest=fs.readFileSync(path.join(root,'guest-resilience.js'),'utf8');
 if(html.includes('// RESILIENCE START'))html=html.replace(/\/\/ RESILIENCE START[\s\S]*?\/\/ RESILIENCE END/,()=>guest.trim());
 else {
  const start=html.indexOf('// Shared data replaces browser-local menu edits.');
  const end=html.indexOf('const BAR=',start);
  if(start<0||end<0)throw Error('Guest source markers missing');
  html=html.slice(0,start)+guest+'\n'+html.slice(end);
 }
 html=html.replace('Object.hasOwn(photoDrafts,id)','Object.prototype.hasOwnProperty.call(photoDrafts,id)');
 html=html.replace("for(const x of BAR.items)x.status='no';",'// Bundled bar retains its last published availability.');
 html=html.replace('initializeBar();refreshCloud();','initializeBar();loadBundledMenu();refreshCloud();');
 if(!html.includes('loadBundledMenu();refreshCloud()')||!html.includes('id="menuBackup"'))throw Error('Backup not connected');
 const compat="<script id=\"tortuga-dialog-compat\">if(typeof HTMLDialogElement!=='undefined'&&!HTMLDialogElement.prototype.showModal){HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}};</script><style>dialog:not([open]){display:none}dialog[open]{position:fixed;inset:5vh 12px;max-height:85vh;overflow:auto;z-index:1000;margin:auto}</style></head>";
 if(!html.includes('tortuga-dialog-compat'))html=html.replace('</head>',compat);
 return html;
}
async function build(){
 const cfg=config(),data=await readData(cfg);validate(data);
 const sourceHash=hash(sourceText(data));
 let previous=null;try{previous=await (await get('https://kulakovsk.github.io/tortuga-menu/backup-manifest.json?check='+Date.now())).json();}catch{}
 const revision=process.env.GITHUB_SHA||'local';
 if(process.env.GITHUB_EVENT_NAME==='schedule'&&previous?.source_hash===sourceHash&&previous?.source_revision===revision){
  if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'changed=false\n');
  console.log('Published backup is current.');return;
 }
 const out=path.join(root,'_site');fs.mkdirSync(path.join(out,'photos'),{recursive:true});
 const photos={};let next=0;const rows=data.menu_photos;
 await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{
  while(next<rows.length){const p=rows[next++];const url=cfg.url+'/storage/v1/object/public/menu-photos/'+p.storage_path.split('/').map(encodeURIComponent).join('/');
   const r=await get(url);const mime=(r.headers.get('content-type')||'').split(';')[0];
   if(!['image/jpeg','image/png','image/webp'].includes(mime))throw Error('Invalid image type');
   const b=Buffer.from(await r.arrayBuffer());if(!b.length||b.length>5*1024*1024)throw Error('Invalid image size');
   const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime];
   const filename=hash(b)+'.'+ext;fs.writeFileSync(path.join(out,'photos',filename),b);
   photos[p.item_id]='photos/'+filename;
  }
 }));
 if(hash(sourceText(await readData(cfg)))!==sourceHash)throw Error('Menu changed during build; keeping the previous publication. The next run will retry.');
 const snapshot={version:1,built_at:new Date().toISOString(),source_hash:sourceHash,data,photos};
 const html=patchHtml(fs.readFileSync(path.join(root,'index.html'),'utf8'),snapshot);
 for(const f of ['admin.html','admin.js','bar-admin.js','bar-source.js','config.js','dish-manager.js','tortuga-admin-config.js','backup-shared.js','backup-status.js'])fs.copyFileSync(path.join(root,f),path.join(out,f));
 const adminPath=path.join(out,'admin.html');let admin=fs.readFileSync(adminPath,'utf8');if(!admin.includes('backup-status.js')){admin=admin.replace('</html>','<script src="backup-shared.js?v=20261115"></script><script src="backup-status.js?v=20261115"></script></html>');fs.writeFileSync(adminPath,admin);}
 fs.writeFileSync(path.join(out,'index.html'),html);
 const manifest={version:1,built_at:snapshot.built_at,source_hash:sourceHash,source_revision:revision,photos:rows.length,kitchen_items:data.menu_items.length,bar_items:data.bar_items.length};
 fs.writeFileSync(path.join(out,'backup-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 fs.writeFileSync(path.join(out,'.nojekyll'),'');
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'changed=true\n');
 console.log(JSON.stringify({...manifest,html_bytes:Buffer.byteLength(html)}));
}
module.exports={readData,validate,patchHtml,build,hash};
if(require.main===module)build().catch(e=>{console.error(e.message);process.exitCode=1;});
