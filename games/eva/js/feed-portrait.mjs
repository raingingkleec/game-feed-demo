// Presentation camera only. Physics, damage and playable viewport are unchanged.
export function createFeedPortrait({stage,ground,context,useContext,getGame,drawActors}) {
 const canvas=document.createElement('canvas');canvas.className='feed-portrait';canvas.setAttribute('aria-label','竖屏实机演示');document.body.append(canvas);
 const style=document.createElement('style');style.textContent='#app{visibility:hidden}.feed-portrait{position:fixed;inset:0;width:100%;height:100%;z-index:100;pointer-events:none}';document.head.append(style);
 const ctx=canvas.getContext('2d',{alpha:false});let cameraX=480,cameraScale=0;
 return dt=>{
  const width=innerWidth,height=innerHeight,dpr=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#15141f';ctx.fillRect(0,0,width,height);
  const cover=Math.max(width/stage.width,height/stage.height),sw=stage.width*cover,sh=stage.height*cover;
  const floor=height*.70;
  ctx.drawImage(stage,(width-sw)/2,floor-ground/540*sh,sw,sh);
  const game=getGame(),distance=Math.abs(game.player.x-game.enemy.x),targetX=(game.player.x+game.enemy.x)/2;
  const targetScale=Math.min((width-24)/(distance+300),height*.52/300,1.5);
  const smooth=Math.min(1,dt*9);cameraX+=(targetX-cameraX)*smooth;
  cameraScale=!cameraScale?targetScale:targetScale<cameraScale?targetScale:cameraScale+(targetScale-cameraScale)*smooth;
  ctx.save();ctx.translate(width/2,floor);ctx.scale(cameraScale,cameraScale);ctx.translate(-cameraX,-ground);
  const previous=context();useContext(ctx);
  try{drawActors();}finally{useContext(previous);ctx.restore();}
  const shade=ctx.createLinearGradient(0,0,0,height);shade.addColorStop(0,'rgba(0,0,0,.20)');shade.addColorStop(.42,'rgba(0,0,0,0)');shade.addColorStop(.75,'rgba(0,0,0,.05)');shade.addColorStop(1,'rgba(0,0,0,.5)');ctx.fillStyle=shade;ctx.fillRect(0,0,width,height);
 };
}
