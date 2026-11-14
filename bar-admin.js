'use strict';
function renderBarManager(){
 let panel=$('barManager');
 const query=$('barSearch')?.value||'';
 if(!panel){panel=element('section');panel.id='barManager';$('panel').append(panel);}
 panel.replaceChildren(element('h2','Бар'));
 panel.append(element('p','Цена и наличие каждого объёма сохраняются отдельно. Статус напитка действует на все его объёмы.'));
 const search=element('input');search.id='barSearch';search.type='search';search.placeholder='Название или код напитка';search.value=query;panel.append(search);
 const list=element('div');panel.append(list);
 function draw(){
  list.replaceChildren();const q=search.value.trim().toLowerCase();
  for(const x of barDishes.filter(x=>(x.id+' '+x.names.ru).toLowerCase().includes(q))){
   const card=element('article');card.className='card';card.append(element('h3',x.id+' · '+x.names.ru));
   if(x.presentation?.flavors?.length)card.append(element('p','Вкусы: '+x.presentation.flavors.map(f=>f.ru).join(', ')+'. Цена и наличие общие для всех вкусов этой марки.'));
   card.append(element('p',barCats.find(c=>c.id===x.category_id)?.names.ru||x.category_id));
   const row=element('div');row.className='row';const status=statusSelect(x.status),save=element('button','Сохранить наличие напитка');status.setAttribute('aria-label','Наличие напитка '+x.id);row.append(status,save);card.append(row);
   save.onclick=()=>exclusive(async()=>{const result=await request('/rest/v1/bar_items?id=eq.'+encodeURIComponent(x.id),{method:'PATCH',body:{status:status.value}});if(result?.length!==1)throw Error('Наличие напитка не сохранено.');x.status=result[0].status;say(x.id+': наличие напитка сохранено.');});
   for(const s of barServings.filter(s=>s.item_id===x.id).sort((a,b)=>(a.volume_ml===50?-1:b.volume_ml===50?1:a.sort_order-b.sort_order))){
    const volume=s.volume_ml===50?'50 мл':(s.kind==='bottle'?'Бутылка ':'')+String(s.volume_ml/1000).replace('.',',')+' л';
    const r=element('div');r.className='row';const price=element('input');price.type='number';price.min='0';price.max='99999999.99';price.step='.01';price.className='price';price.value=s.price;price.setAttribute('aria-label','Цена '+s.id);
    const st=statusSelect(s.status);st.setAttribute('aria-label','Наличие '+s.id);const button=element('button','Сохранить '+volume);button.dataset.barSave=s.id;
    r.append(element('span',volume),price,element('span','₽'),st,button);card.append(r);
    button.onclick=()=>exclusive(async()=>{
     const n=Number(price.value);if(!price.value||!Number.isFinite(n)||n<0||n>99999999.99||Math.abs(n*100-Math.round(n*100))>.00001)throw Error('Укажите корректную цену: не больше двух знаков после запятой.');
     const result=await request('/rest/v1/bar_servings?id=eq.'+encodeURIComponent(s.id),{method:'PATCH',body:{price:n,status:st.value}});
     if(result?.length!==1)throw Error('Цена или наличие объёма не сохранены.');Object.assign(s,result[0]);say(x.id+' · '+volume+': цена и наличие сохранены.');
    });
   }
   list.append(card);
  }
 }
 search.oninput=draw;draw();
}
