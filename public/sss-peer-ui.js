/* Same map-first interaction shell as Jaran Mizumoto / Maruhan Kameari.
 * Reparents existing controls without changing seat placement, payouts or Suika labels.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const getBridge=()=>window.sssFloorBridge;
const THEME_KEY='sss-shared-theme-v1';
let popover=null,detailDialog=null,initialized=false,pinch=null;
function applyTheme(mode,save){
 const theme=mode==='light'?'light':'dark';
 document.body.classList.toggle('sss-peer-light',theme==='light');
 document.body.classList.toggle('sss-peer-dark',theme!=='light');
 const button=$('sss-theme-toggle');
 if(button){button.textContent=theme==='dark'?'☀ ライト':'☾ ダーク';button.setAttribute('aria-label',theme==='dark'?'ライト表示に切り替える':'ダーク表示に切り替える')}
 if(save){try{localStorage.setItem(THEME_KEY,theme)}catch(_){}}
}
function toggleDatePopover(force){
 if(!popover)return;
 const next=typeof force==='boolean'?force:popover.hidden;
 popover.hidden=!next;
 const btn=$('sss-date-label');if(btn)btn.setAttribute('aria-expanded',String(next));
 if(next)$('date')?.focus();
}
function makeDate(){
 const datebar=document.querySelector('.sss-datebar'),main=document.querySelector('main'),date=$('date');
 if(!datebar||!main||!date)return;
 document.body.insertBefore(datebar,main);
 const original=date.parentElement;
 popover=document.createElement('div');
 popover.id='sss-peer-date-popover';popover.className='sss-peer-date-popover';popover.hidden=true;
 const label=document.createElement('label');label.textContent='表示日';
 label.appendChild(date);popover.appendChild(label);
 document.body.appendChild(popover);
 if(original&&original.children.length===0)original.remove();
 const btn=$('sss-date-label');
 if(btn)btn.setAttribute('aria-expanded','false');
 date.addEventListener('change',()=>toggleDatePopover(false));
 document.addEventListener('click',event=>{
  if(!popover||popover.hidden)return;
  if(popover.contains(event.target)||datebar.contains(event.target))return;
  toggleDatePopover(false);
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape')toggleDatePopover(false)});
}
function rearrange(){
 const workspace=document.querySelector('.workspace'),main=document.querySelector('main');
 if(!workspace||!main)return;
 // Same 5 KPIs -> colored legend -> controls -> large map reading order as peers.
 const kpis=$('sss-kpis'),legend=$('sss-heatmap-legend');
 if(kpis&&legend){legend.classList.add('sss-peer-legend');kpis.after(legend)}
 const suika=$('sss-suika-panel');
 const quick=document.createElement('section');
 quick.className='sss-peer-quick';quick.id='sss-peer-quick';quick.setAttribute('aria-label','スイカの掲載表示');
 const headline=document.createElement('strong');headline.textContent='🍉 スイカ掲載';quick.appendChild(headline);
 const controls=suika?.querySelector('.sss-suika-controls');
 if(controls)quick.appendChild(controls);
 const status=$('sss-suika-status');if(status)quick.appendChild(status);
 workspace.before(quick);
 if(suika){
  const details=document.createElement('details');details.className='sss-peer-tools';details.id='sss-peer-suika-tools';
  const summary=document.createElement('summary');summary.textContent='🍉 スイカ掲載台の内訳・元投稿';details.appendChild(summary);
  details.appendChild(suika);workspace.after(details);
 }
 const provenance=document.querySelector('.sss-map-source-note'),sync=$('sss-sync-banner');
 const previous=$('sss-peer-suika-tools')||workspace;
 if(provenance){previous.after(provenance)}
 if(sync){(provenance||previous).after(sync)}
 // Pin the same zoom buttons in the same order as the other two apps.
 const less=$('less'),fit=$('fit'),more=$('more');
 if(less&&fit&&more){
  const zoom=document.createElement('div');zoom.className='sss-peer-zoom';
  zoom.id='sss-peer-zoom';zoom.setAttribute('role','group');zoom.setAttribute('aria-label','島図の拡大縮小');
  less.textContent='−';fit.textContent='幅Fit';more.textContent='＋';
  less.setAttribute('aria-label','縮小');fit.setAttribute('aria-label','幅に合わせる');more.setAttribute('aria-label','拡大');
  zoom.append(less,fit,more);document.body.appendChild(zoom);
 }
 const detail=$('detail');
 if(detail){
  detailDialog=document.createElement('dialog');detailDialog.className='sss-peer-detail-dialog';detailDialog.id='sss-peer-detail-dialog';
  detailDialog.setAttribute('aria-label','台番号別の詳細');
  const top=document.createElement('div');top.className='sss-peer-detail-top';
  const title=document.createElement('span');title.textContent='台データ・履歴';
  const close=document.createElement('button');close.type='button';close.textContent='×';close.id='sss-peer-detail-close';close.setAttribute('aria-label','閉じる');
  close.onclick=()=>closeSeat();top.append(title,close);
  detailDialog.append(top,detail);document.body.appendChild(detailDialog);
  detailDialog.addEventListener('click',event=>{if(event.target===detailDialog)closeSeat()});
 }
}
function onSeat(){
 if(!detailDialog)return;
 if(typeof detailDialog.showModal==='function'){
  if(!detailDialog.open)detailDialog.showModal();
 }else detailDialog.setAttribute('open','');
}
function closeSeat(){
 if(!detailDialog)return;
 if(typeof detailDialog.close==='function'&&detailDialog.open)detailDialog.close();
 else detailDialog.removeAttribute('open');
}
function onRender(){
 const zoom=getBridge()?.getZoom?.();
 const button=$('fit');
 if(button&&Number.isFinite(zoom))button.title='幅に合わせる（現在 '+Math.round(zoom*100)+'%）';
}
function wirePinch(){
 const viewport=$('scroll');if(!viewport)return;
 const distance=touches=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
 viewport.addEventListener('touchstart',event=>{
  if(event.touches.length!==2){pinch=null;return}
  const bridge=getBridge();if(!bridge?.getZoom||!bridge?.setZoom)return;
  const rect=viewport.getBoundingClientRect();
  pinch={distance:Math.max(1,distance(event.touches)),zoom:bridge.getZoom(),x:(event.touches[0].clientX+event.touches[1].clientX)/2-rect.left,y:(event.touches[0].clientY+event.touches[1].clientY)/2-rect.top};
 },{passive:true});
 viewport.addEventListener('touchmove',event=>{
  if(!pinch||event.touches.length!==2)return;
  const bridge=getBridge();if(!bridge?.setZoom)return;
  event.preventDefault();
  bridge.setZoom(pinch.zoom*Math.max(.3,Math.min(4,distance(event.touches)/pinch.distance)),pinch.x,pinch.y);
 },{passive:false});
 for(const name of ['touchend','touchcancel'])viewport.addEventListener(name,()=>{pinch=null},{passive:true});
 viewport.addEventListener('wheel',event=>{
  if(!event.ctrlKey&&!event.metaKey)return;
  const bridge=getBridge();if(!bridge?.setZoom||!bridge?.getZoom)return;
  event.preventDefault();
  const rect=viewport.getBoundingClientRect();
  bridge.setZoom(bridge.getZoom()*(event.deltaY>0?.9:1.1),event.clientX-rect.left,event.clientY-rect.top);
 },{passive:false});
}
function init(){
 if(initialized)return;
 if(!document.querySelector('.workspace')||!$('sss-date-label'))return;
 initialized=true;
 document.body.classList.add('sss-peer');
 let theme='dark';
 try{theme=localStorage.getItem(THEME_KEY)||'dark'}catch(_){}
 applyTheme(theme,false);
 const themeButton=$('sss-theme-toggle');
 if(themeButton)themeButton.onclick=()=>applyTheme(document.body.classList.contains('sss-peer-light')?'dark':'light',true);
 makeDate();rearrange();wirePinch();onRender();
}
window.sssPeerUI={init,onSeat,onRender,closeSeat,toggleDatePopover,applyTheme};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
