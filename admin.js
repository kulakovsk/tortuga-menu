'use strict';
const cfg=window.TORTUGA_CONFIG,$=id=>document.getElementById(id);
const say=s=>{$('message').textContent=s};
let session=null,dishes=[],photos=[],options=[],busy=false;
const storeKey='tortuga-captain-session';
try{session=JSON.parse(sessionStorage.getItem(storeKey)||'null')}catch{}
function saveSession(s){session=s;if(s)sessionStorage.setItem(storeKey,JSON.stringify(s));else sessionStorage.removeItem(storeKey)}
async function request(route,{method='GET',body,raw=false}={}){
 if(!session)throw Error('Войдите в аккаунт.');
 if(Date.now()>session.expires_at-60000){
 const r=await fetch(cfg.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
 if(!r.ok){saveSession(null);showLogin();throw Error('Сессия истекла. Войдите снова.')}
 const s=await r.json();saveSession({access_token:s.access_token,refresh_token:s.refresh_token,expires_at:Date.now()+s.expires_in*1000});
 }
 const headers={apikey:cfg.key,Authorization:'Bearer '+session.access_token};
 if(body&&!raw)headers['Content-Type']='application/json';
 if(method==='PATCH'||method==='POST'||method==='DELETE')headers.Prefer='return=representation';
 const r=await fetch(cfg.url+route,{method,headers,body:body?(raw?body:JSON.stringify(body)):undefined,cache:'no-store'});
 if(!r.ok){if(r.status===401){saveSession(null);showLogin()}throw Error(r.status===401?'Войдите снова.':'Не удалось сохранить или загрузить данные. Проверьте соединение и доступ.');}
 const text=await r.text();return text?JSON.parse(text):null;
}
function showLogin(){$('login').hidden=false;$('panel').hidden=true;$('password').value=''}
async function exclusive(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn()}catch(e){say(e.message)}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false)}}
async function load(){
 const member=await request('/rest/v1/menu_admins?select=active&active=eq.true');
 if(!member?.length){saveSession(null);showLogin();throw Error('У аккаунта нет доступа к управлению меню.')}
 [dishes,photos,options]=await Promise.all(['menu_items?select=*&order=sort_order','menu_photos?select=*','menu_options?select=*'].map(t=>request('/rest/v1/'+t)));
 $('login').hidden=true;$('panel').hidden=false;render();say('Меню загружено. Сохраняйте изменения кнопкой у блюда.');
}
$('login').onsubmit=e=>{e.preventDefault();exclusive(async()=>{
 const username=$('username').value.trim(),password=$('password').value;
 let r;try{r=await fetch(cfg.url+'/functions/v1/captain-login',{method:'POST',headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.loginKey,'Content-Type':'application/json'},body:JSON.stringify({username,password})})}finally{$('password').value=''}
 const s=await r.json();if(!r.ok)throw Error(s.error||'Вход не выполнен.');
 saveSession({...s,expires_at:Date.now()+s.expires_in*1000});await load();
})};
$('logout').onclick=()=>exclusive(async()=>{try{if(session)await request('/auth/v1/logout',{method:'POST'})}finally{saveSession(null);showLogin();say('Вы вышли из аккаунта.')}});
$('reload').onclick=()=>exclusive(load);$('search').oninput=renderDishes;
function element(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el}
function statusSelect(value){const s=element('select');for(const [v,t] of [['yes','В наличии'],['no','Нет в наличии'],['later','Будет позже']]){const o=element('option',t);o.value=v;s.append(o)}s.value=value;return s}
function render(){
 $('sauces').replaceChildren();
 const labels=['Тар-тар','Барбекю','Кетчуп','Сырный','Сладкий чили','Шрирача'];
 for(const o of options.filter(x=>labels.includes(x.names.ru))){const row=element('div');row.className='row';const select=statusSelect(o.status),save=element('button','Сохранить');row.append(element('span',o.names.ru),select,save);save.onclick=()=>exclusive(async()=>{const v=await request('/rest/v1/menu_options?id=eq.'+o.id,{method:'PATCH',body:{status:select.value}});if(v?.length!==1)throw Error('Нет прав на изменение соуса.');o.status=select.value;say('Наличие соуса сохранено во всех связанных блюдах.')});$('sauces').append(row)}
 renderDishes();
}
function renderDishes(){
 const q=$('search').value.trim().toLowerCase();$('dishes').replaceChildren();
 for(const x of dishes.filter(x=>(x.id+' '+x.names.ru).toLowerCase().includes(q))){
 const card=element('article');card.className='card';card.append(element('h3',x.id+' · '+x.names.ru));
 const row=element('div');row.className='row';const price=element('input');price.type='number';price.min='0';price.max='99999999.99';price.step='.01';price.value=x.price;price.className='price';price.setAttribute('aria-label','Цена '+x.names.ru);
 const st=statusSelect(x.status);st.setAttribute('aria-label','Наличие '+x.names.ru);const save=element('button','Сохранить цену и наличие');row.append(price,element('span','₽'),st,save);card.append(row);
 save.onclick=()=>exclusive(async()=>{const n=Number(price.value);if(!price.value||!Number.isFinite(n)||n<0||n>99999999.99||Math.abs(n*100-Math.round(n*100))>0.00001)throw Error('Укажите корректную цену, максимум два знака после запятой.');const v=await request('/rest/v1/menu_items?id=eq.'+x.id,{method:'PATCH',body:{price:n,status:st.value}});if(v?.length!==1)throw Error('Нет прав на изменение блюда.');x.price=n;x.status=st.value;say(x.id+': цена и наличие сохранены.')});
 const photo=photos.find(p=>p.item_id===x.id);if(photo){const img=element('img');img.src=cfg.url+'/storage/v1/object/public/menu-photos/'+photo.storage_path.split('/').map(encodeURIComponent).join('/');img.alt=x.names.ru;img.loading='lazy';card.append(img)}
 const file=element('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.setAttribute('aria-label','Фото '+x.names.ru);card.append(file);
 file.onchange=()=>{const f=file.files[0];if(f)exclusive(async()=>{const blob=await resizePhoto(f),p=x.id+'/'+crypto.randomUUID()+'.jpg';await request('/storage/v1/object/menu-photos/'+p,{method:'POST',body:blob,raw:true});const existing=photos.find(p=>p.item_id===x.id);const saved=await request('/rest/v1/menu_photos'+(existing?'?item_id=eq.'+x.id:''),{method:existing?'PATCH':'POST',body:existing?{storage_path:p}:{item_id:x.id,storage_path:p}});if(saved?.length!==1)throw Error('Фото загружено, но не привязано к блюду. Обновите данные и повторите.');photos=photos.filter(p=>p.item_id!==x.id).concat(saved);renderDishes();say(x.id+': фотография сохранена.')})};
 if(photo){const remove=element('button','Убрать фото из меню');remove.onclick=()=>exclusive(async()=>{if(remove.dataset.confirmed!=='yes'){remove.dataset.confirmed='yes';remove.textContent='Нажмите ещё раз, чтобы убрать фото';say('Повторное нажатие уберёт фото '+x.id+' из меню. Файл останется в хранилище.');return;}const v=await request('/rest/v1/menu_photos?item_id=eq.'+x.id,{method:'DELETE'});if(v?.length!==1)throw Error('Не удалось убрать фото.');photos=photos.filter(p=>p.item_id!==x.id);renderDishes();say('Фото убрано из меню. Исходный файл сохранён в хранилище.')});card.append(remove)}
 $('dishes').append(card);
 }
}
async function resizePhoto(f){if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>20*1024*1024)throw Error('Выберите JPG, PNG или WebP до 20 МБ.');const img=await createImageBitmap(f);try{if(img.width*img.height>60000000)throw Error('Уменьшите фото до 60 мегапикселей.');const scale=Math.min(1,1200/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));const ctx=c.getContext('2d');ctx.fillStyle='#201b17';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Не удалось обработать фото.')),'image/jpeg',.82))}finally{img.close()}}
if(session)exclusive(load);
