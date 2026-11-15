'use strict';
const backupStatus=document.createElement('p');backupStatus.className='small';backupStatus.id='backupStatus';backupStatus.setAttribute('role','status');
document.getElementById('panel').prepend(backupStatus);
let backupStatusTimer=null,backupChecking=false;
function backupPending(){
 backupStatus.textContent='Изменения сохранены в базе. Резервная версия обновится автоматически после проверки GitHub (обычно через несколько минут).';
 clearTimeout(backupStatusTimer);backupStatusTimer=setTimeout(checkBackup,5000);
}
async function checkBackup(){
 if(!session||backupChecking)return;backupChecking=true;
 try{
  const timedFetch=(url,options={})=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),10000);fetch(url,options).then(resolve,reject).finally(()=>clearTimeout(timer));});
  const tools=window.TORTUGA_BACKUP_TOOLS,data={};
  const manifestResponse=await timedFetch('backup-manifest.json?check='+Date.now(),{cache:'no-store'});
  if(!manifestResponse.ok)throw Error('No manifest');const manifest=await manifestResponse.json();
  await Promise.all(tools.tables.map(async t=>{const r=await timedFetch(cfg.url+'/rest/v1/'+t+'?select=*',{headers:{apikey:cfg.key},cache:'no-store'});if(!r.ok)throw Error('Read failed');data[t]=await r.json();}));
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(tools.sourceText(data)));
  const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  backupStatus.replaceChildren(document.createTextNode(digest===manifest.source_hash?'Резервная версия актуальна, включая фотографии. Публикация: '+new Date(manifest.built_at).toLocaleString('ru-RU')+'. ':'Изменения сохранены в базе. Резервная версия ожидает автоматической публикации. '));
  if(digest!==manifest.source_hash){const link=document.createElement('a');link.href='https://github.com/kulakovsk/tortuga-menu/actions/workflows/refresh-menu.yml';link.target='_blank';link.rel='noopener';link.textContent='Проверить публикацию / запустить повторно';backupStatus.append(link);}
 }catch{backupStatus.textContent='Не удалось проверить резервную публикацию. Сохранённые изменения остаются в базе; статус можно проверить позже.';}
 finally{backupChecking=false;clearTimeout(backupStatusTimer);backupStatusTimer=setTimeout(checkBackup,30000);}
}
const backupRequest=request;
request=async function(route,options={}){
 const result=await backupRequest(route,options);
 if(route.startsWith('/rest/v1/')&&['PATCH','POST','DELETE'].includes(options.method))backupPending();
 return result;
};
setTimeout(checkBackup,1000);
document.getElementById('login').addEventListener('submit',()=>setTimeout(checkBackup,2000));
