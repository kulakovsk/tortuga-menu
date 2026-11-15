(function(root){
 'use strict';
 const tables=['menu_items','categories','menu_options','item_options','menu_photos','bar_categories','bar_items','bar_servings'];
 function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
 }
 function sourceText(data){
  const normalized={},ids=new Set((data.menu_items||[]).map(x=>x.id));
  for(const t of tables){if(!Array.isArray(data[t]))throw Error('Missing '+t);const rows=['menu_photos','item_options'].includes(t)?data[t].filter(x=>ids.has(x.item_id)):data[t];normalized[t]=rows.map(canonical).sort();}
  return canonical(normalized);
 }
 const api={tables,canonical,sourceText};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.TORTUGA_BACKUP_TOOLS=api;
})(typeof window!=='undefined'?window:this);
