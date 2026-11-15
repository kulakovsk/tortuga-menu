// RESILIENCE START
edits={};
let cloudReady=false,cloudBusy=null,catalogReady=false,lastCloudAttempt=0;
let cloudHealth={kitchen:false,bar:false};
const cloudConfig=window.TORTUGA_CONFIG;
const menuBackup=JSON.parse(document.getElementById('menuBackup').textContent);
const backupPhotos=menuBackup.photos||{};
const backupPaths=Object.fromEntries((menuBackup.data.menu_photos||[]).map(p=>[p.item_id,p.storage_path]));
function readWithDeadline(url,options,ms){
 return new Promise((resolve,reject)=>{
  const controller=typeof AbortController==='function'?new AbortController():null;
  const timer=setTimeout(()=>{if(controller)controller.abort();reject(Error('Request timed out'));},ms);
  fetch(url,{...options,...(controller?{signal:controller.signal}:{})}).then(resolve,reject).finally(()=>clearTimeout(timer));
 });
}
async function cloudRead(table){
 let error;
 for(let attempt=0;attempt<2;attempt++)try{
  const r=await readWithDeadline(cloudConfig.url+'/rest/v1/'+table+'?select=*',{headers:{apikey:cloudConfig.key},cache:'no-store'},7000);
  if(!r.ok)throw Error('Menu request failed: '+r.status);
  const v=await r.json();if(!Array.isArray(v))throw Error('Invalid menu response');return v;
 }catch(e){error=e;}
 throw error;
}
function applyKitchen(rows,cats,opts,links){
 if(!rows.length||!cats.length)throw Error('Empty kitchen');
 opts=opts.map(o=>o.names.ru==='Печная поляна'?{...o,names:{ru:'Лесная поляна',en:'“Forest Glade” tea blend',zh:'“森林空地”混合茶'}}:o);
 const byOpt=Object.fromEntries(opts.map(o=>[o.id,o]));
 const nextCats=Object.fromEntries([...cats].sort((a,b)=>a.sort_order-b.sort_order).map(c=>[c.id,LANGS.map(l=>c.names[l])]));
 const live=[...rows].sort((a,b)=>a.sort_order-b.sort_order).map(x=>{
  if(!nextCats[x.category_id]||!x.names||!x.descriptions||!['yes','no','later'].includes(x.status)||!Number.isFinite(Number(x.price)))throw Error('Invalid kitchen item');
  return {id:x.id,code:x.display_code||(/^K[0-9]+$/.test(x.id)?x.id:''),cat:x.category_id,...x.names,desc:x.descriptions.ru||'',desc_en:x.descriptions.en||'',desc_zh:x.descriptions.zh||'',price:Number(x.price),multi:x.multi,optional:x.optional,opts:links.filter(l=>l.item_id===x.id).sort((a,b)=>a.sort_order-b.sort_order).map(l=>{if(!byOpt[l.option_id])throw Error('Missing option');return byOpt[l.option_id].names.ru;})};
 });
 const nextEdits=Object.fromEntries(rows.map(x=>[x.id,{status:x.status}]));
 const blocked=new Set(opts.filter(o=>o.status!=='yes').map(o=>o.names.ru));
 live.forEach(applyReviewedTranslation);
 for(const o of opts)OPT_TRANSLATIONS[o.names.ru]=reviewedOption(o);
 BASE.items=[...live,...BASE.items.filter(x=>x.bar)];
 BASE.cats={...nextCats,...Object.fromEntries(Object.entries(BASE.cats).filter(([id])=>id.startsWith('bar-')))};
 applyReviewedCategories();edits=nextEdits;
 availableOptions=function(x){return x.opts.map((v,i)=>({v,i,blocked:blocked.has(v)}));};
}
function applyBar(cats,rows,servings){
 const next=window.TORTUGA_BAR_DATA(cats,rows,servings);
 BAR.items=next.items;BAR.cats=next.cats;
 for(const x of BAR.items)if(!x.variants.some(v=>v.label===barSelected[x.id]))barSelected[x.id]=x.variants[0].label;
 BASE.items=[...BASE.items.filter(x=>!x.bar),...BAR.items];
 BASE.cats={...Object.fromEntries(Object.entries(BASE.cats).filter(([id])=>!id.startsWith('bar-'))),...BAR.cats};
}
function applyPhotos(photos){
 const next={};
 for(const p of photos){
  if(typeof p.storage_path!=='string'||!p.item_id)throw Error('Invalid photo');
  next[p.item_id]=backupPaths[p.item_id]===p.storage_path&&backupPhotos[p.item_id]?backupPhotos[p.item_id]:cloudConfig.url+'/storage/v1/object/public/menu-photos/'+p.storage_path.split('/').map(encodeURIComponent).join('/');
 }
 publishedPhotos.photos=next;
}
window.tortugaPhotoError=function(img){
 const fallback=backupPhotos[img.dataset.dish];
 if(fallback&&img.getAttribute('src')!==fallback){img.src=fallback;return;}
 img.hidden=true;
};
photoMarkup=function(x){const src=photoOf(x.id);return src?'<img class="dish-photo" data-dish="'+escapeHtml(x.id)+'" src="'+escapeHtml(src)+'" alt="'+escapeHtml(name(x))+'" loading="lazy" decoding="async" onerror="window.tortugaPhotoError(this)">':'';};
function loadBundledMenu(){
 for(const d of document.querySelectorAll('dialog')){if(!d.showModal)d.showModal=function(){this.setAttribute('open','');};if(!d.close)d.close=function(){this.removeAttribute('open');};}
 const d=menuBackup.data;
 applyKitchen(d.menu_items,d.categories,d.menu_options,d.item_options);
 applyBar(d.bar_categories,d.bar_items,d.bar_servings);
 publishedPhotos.photos={...backupPhotos};catalogReady=true;
 if(!BASE.cats[category]&&category!=='all')category='all';render();
}
function cloudNotice(){
 const warning={ru:'⚓ Резервное меню: актуальные цены и наличие уточните у официанта. Заказ не отправляется автоматически.',en:'⚓ Backup menu: please confirm current prices and availability with your waiter. Your order is not sent automatically.',zh:'⚓ 备用菜单：请向服务员确认最新价格和供应情况。订单不会自动发送。'}[lang];
 if(!cloudHealth[menuSection])$('notice').textContent=warning;
 if(!cloudReady)$('cartHelp').textContent=warning;
}
const cloudRender=render;render=function(){cloudRender();cloudNotice();};
function reconcileCart(){
 for(const [key,v] of Object.entries(cart)){
  const x=item(v.id);
  if(!x||(x.bar?barState(x,v.opts):state(x))!=='yes'||v.opts.some(o=>!x.opts.includes(o))||(!x.bar&&v.opts.some(o=>availableOptions(x).some(a=>a.v===o&&a.blocked))))delete cart[key];
 }
}
function refreshCloud(){
 if(!cloudBusy&&Date.now()-lastCloudAttempt>3000){
  lastCloudAttempt=Date.now();
  const group=async(tables,apply,key)=>{
   try{const values=await Promise.all(tables.map(cloudRead));apply(...values);if(key)cloudHealth[key]=true;return true;}
   catch{if(key)cloudHealth[key]=false;return false;}
   finally{cloudReady=cloudHealth.kitchen&&cloudHealth.bar;if(catalogReady){reconcileCart();if(!BASE.cats[category]&&category!=='all')category='all';render();}}
  };
  cloudBusy=Promise.all([
   group(['menu_items','categories','menu_options','item_options'],applyKitchen,'kitchen'),
   group(['bar_categories','bar_items','bar_servings'],applyBar,'bar'),
   group(['menu_photos'],applyPhotos,null)
  ]).finally(()=>{cloudBusy=null;});
 }
 return Promise.resolve(catalogReady);
}
const cloudAdd=addItem;addItem=function(id){if(catalogReady){const x=item(id);if(x&&state(x)==='yes')cloudAdd(id);refreshCloud();}};
const cloudShowCart=$('cartBtn').onclick;$('cartBtn').onclick=()=>{cloudShowCart();cloudNotice();refreshCloud();};
const cloudOptionAdd=$('optionAdd').onclick;$('optionAdd').onclick=()=>{
 if(!pending||!catalogReady)return;
 const x=item(pending.id);if(!x||state(x)!=='yes'){$('optionDialog').close();pending=null;return;}
 const selected=[...$('optionChoices').querySelectorAll('input:checked')].map(el=>x.opts[Number(el.value)]);
 if(selected.some(v=>!v||availableOptions(x).some(o=>o.v===v&&o.blocked))){$('optionDialog').close();pending=null;return;}
 cloudOptionAdd();refreshCloud();
};
// RESILIENCE END
