'use strict';
// Validates a complete bar response before replacing the displayed catalog.
window.TORTUGA_BAR_DATA=function(categories,items,servings){
 const statuses=['yes','no','later'];
 const names=n=>n&&['ru','en','zh'].every(l=>typeof n[l]==='string'&&n[l].trim());
 if(!Array.isArray(categories)||!Array.isArray(items)||!Array.isArray(servings)||!categories.length||!items.length)throw Error('Incomplete bar response');
 const cats={};
 for(const c of [...categories].sort((a,b)=>a.sort_order-b.sort_order)){
  if(!c.id?.startsWith('bar-')||cats[c.id]||!names(c.names))throw Error('Invalid bar category');
  cats[c.id]=['ru','en','zh'].map(l=>c.names[l]);
 }
 const ids=new Set(),servingIds=new Set();
 for(const s of servings){
  if(servingIds.has(s.id)||!Number.isInteger(s.volume_ml)||s.volume_ml<=0||!['portion','bottle','package'].includes(s.kind)||!statuses.includes(s.status)||!Number.isFinite(Number(s.price))||Number(s.price)<0)throw Error('Invalid bar serving');
  servingIds.add(s.id);
 }
 const result=[...items].sort((a,b)=>a.sort_order-b.sort_order).map(x=>{
  if(ids.has(x.id)||!cats[x.category_id]||!names(x.names)||!statuses.includes(x.status))throw Error('Invalid bar item');
  ids.add(x.id);
  const seen=new Set();
  const variants=servings.filter(s=>s.item_id===x.id).sort((a,b)=>(a.volume_ml===50?-1:b.volume_ml===50?1:a.sort_order-b.sort_order)).map(s=>{
   if(seen.has(s.volume_ml))throw Error('Duplicate bar volume');seen.add(s.volume_ml);
   const volume=String(s.volume_ml/1000).replace('.',',');
   const label=s.volume_ml===50?'50 мл':((x.category_id==='bar-beer'||x.category_id==='bar-zero')?'':'Бутылка ')+volume+' л';
   return {id:s.id,label,ml:s.volume_ml,kind:s.kind,price:Number(s.price),status:s.status};
  });
  if(!variants.length)throw Error('Bar item has no servings');
  const p=x.presentation;
  if(!p||!['heading','brand','taste','flavor'].every(k=>p[k]&&['ru','en','zh'].every(l=>typeof p[k][l]==='string'))||!Array.isArray(p.flavors)||!p.flavors.every(names))throw Error('Missing v2 presentation');
  return {...p,id:x.id,cat:x.category_id,...x.names,desc:x.descriptions?.ru||'',desc_en:x.descriptions?.en||'',desc_zh:x.descriptions?.zh||'',status:x.status,price:variants[0].price,opts:[...variants.map(v=>v.label),...p.flavors.map(f=>f.ru)],variants,bar:true};
 });
 if(servings.some(s=>!ids.has(s.item_id)))throw Error('Orphan bar serving');
 return {items:result,cats};
};
