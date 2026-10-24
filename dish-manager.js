'use strict';
let draftId=null;
const manager=element('section');manager.id='dishManager';
manager.innerHTML=`<h2>Новые блюда</h2><button id="newDish">＋ Добавить блюдо</button>
<form id="dishForm" class="card" hidden><h3>Новое блюдо</h3>
<label>Раздел меню <select id="dishCategory" required></select></label>
<label>Код блюда <input id="dishCode" maxlength="16" pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,15}" placeholder="Например, K080" required></label>
<p class="small">От 1 до 16 латинских букв, цифр, дефисов или подчёркиваний. Код должен быть уникальным, включая архив.</p>
<label>Название по-русски <input id="dishRu" maxlength="160" required></label>
<label>Название по-английски <input id="dishEn" maxlength="160"></label>
<label>Название по-китайски <input id="dishZh" maxlength="160"></label>
<label><input id="translationLater" type="checkbox"> Переводы добавим позже: показывать русское название вместо отсутствующих переводов</label>
<label>Описание RU <textarea id="descRu" maxlength="3000" rows="3"></textarea></label>
<label>Описание EN <textarea id="descEn" maxlength="3000" rows="3"></textarea></label>
<label>Описание 中文 <textarea id="descZh" maxlength="3000" rows="3"></textarea></label>
<label>Цена, ₽ <input id="dishPrice" type="number" min="0" max="99999999.99" step="0.01" required></label>
<label>Наличие <select id="dishStatus"><option value="no">Нет в наличии</option><option value="yes">В наличии</option><option value="later">Будет позже</option></select></label>
<details><summary>Варианты: соусы, начинки и другое</summary><div id="dishOptions"></div>
<label><input id="dishMulti" type="checkbox"> Разрешить выбрать несколько вариантов</label>
<label><input id="dishOptional" type="checkbox"> Можно заказать без выбора варианта</label></details>
<p class="small">Фото можно добавить после создания, в карточке блюда. Блюдо появится у гостей после подтверждения. По умолчанию оно недоступно для заказа.</p>
<div class="row"><button type="submit">Проверить карточку</button><button type="button" id="cancelDish">Отмена</button></div></form>
<div id="dishConfirmation" class="card" hidden aria-live="polite"></div>
<details id="archive"><summary>Архив блюд — можно вернуть в меню</summary><div id="archivedDishes"></div></details>`;
$('panel').insertBefore(manager,$('search'));
function renderDishManager(){
 const old=$('dishCategory').value;$('dishCategory').replaceChildren();
 const placeholder=element('option','Выберите раздел меню');placeholder.value='';placeholder.disabled=true;$('dishCategory').append(placeholder);
 for(const c of categories){const o=element('option',c.names.ru);o.value=c.id;$('dishCategory').append(o)}
 if(categories.some(c=>c.id===old))$('dishCategory').value=old;
 if($('dishForm').hidden){$('dishOptions').replaceChildren();for(const o of options){const label=element('label'),box=element('input');box.type='checkbox';box.value=o.id;label.append(box,document.createTextNode(' '+o.names.ru));$('dishOptions').append(label)}}
 $('archivedDishes').replaceChildren();
 for(const x of dishes.filter(x=>x.archived)){const row=element('div');row.className='card';row.append(element('p',dishCode(x)+' · '+x.names.ru));addCodeEditor(row,x);const restore=element('button','Вернуть в меню');restore.onclick=()=>confirmArchive(x,false);row.append(restore);$('archivedDishes').append(row)}
}
$('newDish').onclick=()=>{if(busy)return;if(!$('dishForm').hidden){$('dishForm').scrollIntoView();return}draftId='N'+crypto.randomUUID().replaceAll('-','');$('dishForm').reset();renderDishManager();$('dishForm').hidden=false;$('dishConfirmation').hidden=true;$('dishRu').focus()};
$('cancelDish').onclick=()=>{$('dishForm').hidden=true;$('dishConfirmation').hidden=true;draftId=null;};
function collectDraft(){
 const publicCode=$('dishCode').value.trim().toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9_-]{0,15}$/.test(publicCode))throw Error('Укажите код: 1–16 латинских букв, цифр, дефисов или подчёркиваний.');
 if(dishes.some(x=>dishCode(x)===publicCode))throw Error('Этот код уже используется, возможно в архиве. Укажите другой.');
 const ru=$('dishRu').value.trim(),en=$('dishEn').value.trim(),zh=$('dishZh').value.trim(),later=$('translationLater').checked;
 if(!ru)throw Error('Введите название блюда.');
 if((!en||!zh)&&!later)throw Error('Добавьте переводы или явно отметьте «Переводы добавим позже».');
 const raw=$('dishPrice').value,p=Number(raw);
 if(!raw||!Number.isFinite(p)||p<0||p>99999999.99||Math.abs(p*100-Math.round(p*100))>.00001)throw Error('Проверьте цену: число от 0, максимум два знака после запятой.');
 if(!categories.some(c=>c.id===$('dishCategory').value))throw Error('Выберите раздел меню.');
 const ids=[...$('dishOptions').querySelectorAll('input:checked')].map(e=>e.value);
 return {p_code:publicCode,p_id:draftId,p_category:$('dishCategory').value,p_names:{ru,en:en||ru,zh:zh||ru},p_descriptions:{ru:$('descRu').value.trim(),en:$('descEn').value.trim()||$('descRu').value.trim(),zh:$('descZh').value.trim()||$('descRu').value.trim()},p_price:p,p_status:$('dishStatus').value,p_options:ids,p_multi:!!ids.length&&$('dishMulti').checked,p_optional:!!ids.length&&$('dishOptional').checked};
}
function confirmation(title,lines,action){
 const box=$('dishConfirmation');box.replaceChildren(element('h3',title));
 for(const line of lines)box.append(element('p',line));
 const label=element('label'),check=element('input');check.type='checkbox';label.append(check,document.createTextNode(' Я проверил(а), всё правильно'));
 const save=element('button','Да, подтверждаю'),cancel=element('button','Отмена');save.disabled=true;
 check.onchange=()=>{save.disabled=!check.checked};save.onclick=()=>{if(!check.checked||busy)return;exclusive(action)};
 cancel.onclick=()=>{box.hidden=true};box.append(label,save,cancel);box.hidden=false;box.scrollIntoView({block:'center'});
}
$('dishForm').onsubmit=e=>{e.preventDefault();if(busy)return;try{
 const d=collectDraft(),cat=categories.find(c=>c.id===d.p_category);
 const duplicate=dishes.some(x=>!x.archived&&x.names.ru.trim().toLowerCase()===d.p_names.ru.toLowerCase());
 confirmation('А ты точно всё проверил(а)?',[
 'Добавляем: '+d.p_names.ru,'Код: '+d.p_code,'Раздел: '+cat.names.ru,'Цена: '+d.p_price+' ₽',
 'EN: '+d.p_names.en,'中文: '+d.p_names.zh,'Описание: '+(d.p_descriptions.ru||'не указано'),
 'Наличие: '+({yes:'В наличии',no:'Нет в наличии',later:'Будет позже'}[d.p_status]),
 'Варианты: '+(d.p_options.map(id=>options.find(o=>o.id===id).names.ru).join(', ')||'нет'),
 ...(duplicate?['Внимание: блюдо с таким названием уже существует. Проверьте, не создаёте ли вы дубль.']:[]),
 ...(d.p_price===0?['Внимание: цена 0 ₽. Убедитесь, что это намеренно.']:[])
 ],async()=>{
 // A preview is a snapshot: edits to the form must be checked again.
 if(JSON.stringify(collectDraft())!==JSON.stringify(d))throw Error('Карточка изменилась. Нажмите «Проверить карточку» ещё раз.');
 const existing=await request('/rest/v1/menu_items?id=eq.'+d.p_id+'&select=id');
 if(existing.length){$('dishForm').hidden=true;$('dishConfirmation').hidden=true;await load();say('Это блюдо уже было создано. Второй экземпляр не добавлен.');return;}
 await request('/rest/v1/rpc/create_coded_menu_dish',{method:'POST',body:{p_payload:d,p_code:d.p_code}});
 $('dishForm').hidden=true;$('dishConfirmation').hidden=true;draftId=null;await load();say('Блюдо «'+d.p_names.ru+'» добавлено в раздел «'+cat.names.ru+'». Фото можно загрузить в его карточке.');
 });
 }catch(err){say(err.message)}};
function addArchiveButton(card,x){const b=element('button','Удалить блюдо из меню');b.onclick=()=>{if(!busy)confirmArchive(x,true)};card.append(b)}
function confirmArchive(x,archived){
 confirmation(archived?'Точно удалить блюдо из меню?':'Точно вернуть блюдо в меню?',[
 dishCode(x)+' · '+x.names.ru,
 archived?'Гости перестанут видеть блюдо. Фото и данные останутся в архиве — их можно вернуть.':'Блюдо снова появится у гостей со статусом «Нет в наличии».',
 'Для подтверждения введите код блюда ниже.'
 ],async()=>{
 if(code.value.trim().toUpperCase()!==dishCode(x))throw Error('Код не совпадает. Изменения не сохранены.');
 const rows=await request('/rest/v1/menu_items?id=eq.'+x.id,{method:'PATCH',body:{archived,status:'no'}});
 if(rows?.length!==1)throw Error('Не удалось изменить блюдо. Обновите данные и проверьте доступ.');
 $('dishConfirmation').hidden=true;await load();say(archived?'Блюдо убрано в архив. Его можно вернуть.':'Блюдо возвращено. Проверьте наличие перед продажей.');
 });
 const code=element('input');code.placeholder=dishCode(x);code.setAttribute('aria-label','Код блюда для подтверждения');$('dishConfirmation').insertBefore(code,$('dishConfirmation').querySelector('label'));
}
function addCodeEditor(container,x){
 const row=element('div');row.className='row';const label=element('label','Код блюда '),input=element('input');input.value=dishCode(x);input.maxLength=16;input.setAttribute('aria-label','Код блюда '+x.names.ru);label.append(input);
 const save=element('button','Сохранить код');save.onclick=()=>{if(busy)return;const value=input.value.trim().toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9_-]{0,15}$/.test(value)){say('Код: 1–16 латинских букв, цифр, дефисов или подчёркиваний.');return;}
 if(dishes.some(d=>d.id!==x.id&&dishCode(d)===value)){say('Этот код уже занят, включая архив.');return;}
 confirmation('Точно изменить код блюда?',[x.names.ru,dishCode(x)+' → '+value,'Фото, варианты и место в меню сохранятся.'],async()=>{
 const result=await request('/rest/v1/menu_items?id=eq.'+x.id,{method:'PATCH',body:{display_code:value}});
 if(result?.length!==1)throw Error('Код не сохранён. Проверьте доступ.');$('dishConfirmation').hidden=true;await load();say('Код блюда изменён на '+value+'.');});};
 row.append(label,save);container.append(row);
}
