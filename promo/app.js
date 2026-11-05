const $=s=>document.querySelector(s);
const themes={
 paw:{image:'assets/paw-play.png',alt:'爪爪擂台真实游戏画面',description:'摇杆、出拳、踢腿与必杀，一场猫狗之间的对决。'},
 meme:{image:'assets/meme-play.png',alt:'漫画恶搞人物的真实游戏画面',description:'同一套格斗玩法，换成夸张的漫画人物与主题表现。'},
 eva:{image:'assets/eva-play.png',alt:'绫波丽与明日香Q版对战的真实游戏画面',description:'第三东京市的黄昏，Q版角色与场景共同换装。'}
};
const tabs=[...document.querySelectorAll('[data-theme]')];
function chooseTheme(id,focus=false){
 const theme=themes[id];
 tabs.forEach(tab=>{const selected=tab.dataset.theme===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;if(selected&&focus)tab.focus();});
 $('#theme-image').src=theme.image;$('#theme-image').alt=theme.alt;
 $('#theme-description').textContent=theme.description;$('#theme-play').href='../#'+id;
 $('#theme-panel').setAttribute('aria-labelledby','theme-'+id);
}
tabs.forEach(tab=>{tab.addEventListener('click',()=>chooseTheme(tab.dataset.theme));tab.addEventListener('keydown',e=>{const index=tabs.indexOf(tab);let next;if(e.key==='ArrowRight')next=(index+1)%tabs.length;if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;if(next!==undefined){e.preventDefault();chooseTheme(tabs[next].dataset.theme,true);}});});
const poses={
 idle:['cat/idle/idle-00.webp','meme/musk/frame-00.png','待机'],
 punch:['cat/light/light-03.webp','meme/musk/frame-05.png','普通拳'],
 crouch:['cat/crouch_guard_v1/sprite-04.webp','meme/musk/frame-04.png','下蹲']
};
document.querySelectorAll('[data-pose]').forEach(button=>button.addEventListener('click',()=>{
 const pose=poses[button.dataset.pose];
 document.querySelectorAll('[data-pose]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 $('#original-frame').src='../games/paw/assets/characters/'+pose[0];$('#original-frame').alt='原始猫角色的'+pose[2]+'帧';
 $('#new-frame').src='../games/meme/assets/characters/'+pose[1];$('#new-frame').alt='漫画主题角色的'+pose[2]+'姿势';
}));
let liveFrame;
function stopDemo(){if(!liveFrame)return;liveFrame.remove();liveFrame=null;$('#load-demo').hidden=false;$('#close-demo').hidden=true;$('#demo-status').textContent='真实界面预览';}
$('#load-demo').addEventListener('click',()=>{
 if(liveFrame)return;
 liveFrame=document.createElement('iframe');liveFrame.title='可上下滑动的真实游戏发现页';liveFrame.allow='fullscreen';liveFrame.src='../?from=promo#paw';
 $('#demo-mount').append(liveFrame);$('#load-demo').hidden=true;$('#close-demo').hidden=false;$('#demo-status').textContent='窗口内上下滑动切换版本';
});
$('#close-demo').addEventListener('click',()=>{stopDemo();$('#load-demo').focus();});
new IntersectionObserver(entries=>{for(const entry of entries)if(!entry.isIntersecting)stopDemo();},{threshold:0}).observe($('#demo-mount'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopDemo();});
$('#copy-link').addEventListener('click',async()=>{
 const address=location.origin+location.pathname;
 try{await navigator.clipboard.writeText(address);$('#copy-status').textContent='宣传页链接已复制，可以发给朋友。';}
 catch{$('#copy-status').textContent='请复制浏览器地址栏中的宣传页链接。';}
});
