import { createGame, resetGame, setDirection, setButton, stepGame, getDebugGeometry, WORLD, MOVES } from "./engine.mjs";
import { createFeedPortrait } from "./feed-portrait.mjs?v=immersive-1";

const canvas = document.querySelector("#game"); let ctx = canvas.getContext("2d", { alpha: false });
const $ = selector => document.querySelector(selector);
const pageParams = new URLSearchParams(location.search);
const ui = {
  timer: $("#timer"), combo: $("#combo"), announce: $("#announce"), start: $("#start"),
  loading: $("#asset-loading"), progress: $("#asset-progress"),
  finish: $("#finish-cinematic"), finishKo: $("#finish-ko"), finishWinner: $("#finish-winner"), record: $("#record"),
  playerHp: $("#player-hp"), playerLag: $("#player-lag"), enemyHp: $("#enemy-hp"), enemyLag: $("#enemy-lag"),
  playerYellow: $("#player-yellow"), enemyYellow: $("#enemy-yellow"), playerEnergy: $("#player-energy"), enemyEnergy: $("#enemy-energy"),
  joystick: $("#joystick"), stick: $("#stick"), direction: $("#direction-label"), state: $("#state-readout"), debug: $("#debug-toggle"), sp: $("[data-action=sp]"),
  playerName: $("#player-name"), enemyName: $("#enemy-name"),
};

const images = {};
const loadImage = (name, src, attempt = 0) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => { images[name] = image; resolve(); };
  image.onerror = () => {
    if (attempt < 2) setTimeout(() => loadImage(name, src, attempt + 1).then(resolve, reject), 500 * (attempt + 1));
    else reject(new Error(`Unable to load asset: ${src}`));
  };
  image.src = attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src;
});
const safeAsset = path => {
  if (typeof path !== "string" || !/^assets\/[a-zA-Z0-9_./-]+$/.test(path) || path.includes("..")) throw new Error(`unsafe asset path: ${path}`);
  return path;
};
const defaultPackPath = "assets/packs/default/pack.json";
const fetchPack = path => fetch(`${path}?v=0.10.0`).then(response => { if (!response.ok) throw new Error(`content pack ${response.status}`); return response.json(); });
let spriteManifest, contentPack;
try {
  contentPack = await fetchPack(defaultPackPath);
  if (contentPack.schemaVersion !== 1 || !contentPack.fighters?.cat || !contentPack.fighters?.dog) throw new Error("unsupported content pack");
  ui.playerName.textContent = contentPack.fighters.cat.displayName || "PLAYER";
  ui.enemyName.textContent = contentPack.fighters.dog.displayName || "CPU";
  document.title = contentPack.title || "格斗游戏";
  const rootStyle = document.documentElement.style;
  const cssAssets = {
    "--stage-art": contentPack.stage.image,
    "--health-frame": contentPack.ui.healthFrame,
    "--meter-frame": contentPack.ui.meterFrame,
    "--joystick-art": contentPack.ui.joystick,
    "--guard-art": contentPack.ui.buttons.guard,
    "--p-art": contentPack.ui.buttons.p,
    "--k-art": contentPack.ui.buttons.k,
    "--sp-art": contentPack.ui.buttons.sp,
  };
  for (const [property,path] of Object.entries(cssAssets)) rootStyle.setProperty(property, `url("${new URL(safeAsset(path), location.href).href}")`);
  spriteManifest = await fetch(`${safeAsset(contentPack.spriteManifest)}?v=0.10.0`).then(response => { if (!response.ok) throw new Error(`sprite manifest ${response.status}`); return response.json(); });
  const paths = [...new Set(Object.values(spriteManifest.fighters).flatMap(fighter => Object.values(fighter.actions).flat()))];
  const vfxSources = { claw:safeAsset(contentPack.vfx.claw), bite:safeAsset(contentPack.vfx.bite) };
  const jobs = [
    ...paths.map(path => [path, `assets/characters/${path}`]),
    ...Object.entries(vfxSources).map(([name,src]) => [`vfx-${name}`,src]),
    ["stage-main", safeAsset(contentPack.stage.image)],
  ];
  let loaded = 0;
  let nextImage = 0;
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, async () => {
    while (nextImage < jobs.length) {
      const [name, src] = jobs[nextImage++];
      await loadImage(name, src);
      loaded += 1;
      ui.progress.textContent = `${Math.round(loaded / jobs.length * 100)}%`;
    }
  }));
  ui.loading.hidden = true;
  ui.start.hidden = false;
} catch (error) {
  console.error("asset boot failed", error);
  if(pageParams.get("feed")==="preview")parent.postMessage({type:"feed-preview-error"},location.origin);
  ui.loading.querySelector("strong").textContent = "素材加载失败";
  ui.progress.textContent = "请刷新重试";
  throw error;
}

let game = createGame(), last = performance.now(), accumulator = 0, announcedEnd = false;
let feedPaused=false;
window.addEventListener("message",e=>{if(e.source===parent&&e.origin===location.origin&&pageParams.get("feed")==="preview"){if(e.data?.type==="feed-pause")feedPaused=true;if(e.data?.type==="feed-resume")feedPaused=false;}});
const feedPortrait=pageParams.get("feed")==="preview"&&pageParams.get("view")==="portrait"?createFeedPortrait({stage:images["stage-main"],ground:WORLD.ground,context:()=>ctx,useContext:value=>ctx=value,getGame:()=>game,drawActors:()=>{drawFighter(game.player);drawFighter(game.enemy);drawSpecialEffects(0);drawParticles(0);}}):null;
const FIXED = 1 / 120, particles = [], specialEffects = [], pointerButtons = new Map(), keys = new Set(), finishTimers = [];
const hitFlashUntil = { cat:0, dog:0 };
let cameraKick = 0, superFreezePulse = 0;
const QA_MODE = pageParams.get("qa") === "1", QA_ENEMY_SP = pageParams.get("qaEnemySp") === "1";
const records = JSON.parse(localStorage.getItem("eva-chibi-duel-v1") || '{"wins":0,"bestCombo":0}');
const DEBUG_ALLOWED = pageParams.get("debug") === "1", DEBUG_FULL_METER = DEBUG_ALLOWED && pageParams.get("meter") === "100";
ui.debug.hidden = !DEBUG_ALLOWED;
ui.state.hidden = !DEBUG_ALLOWED;

class Sound {
  unlock() { if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)(); if (this.context.state === "suspended") this.context.resume(); }
  tone(freq, duration, type = "square", gain = .035) {
    if (!this.context) return; const now = this.context.currentTime, osc = this.context.createOscillator(), amp = this.context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, now); osc.frequency.exponentialRampToValueAtTime(Math.max(50, freq * .55), now + duration);
    amp.gain.setValueAtTime(gain, now); amp.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(amp).connect(this.context.destination); osc.start(now); osc.stop(now + duration);
  }
}
const sound = new Sound();
function showAnnounce(text, ms = 650) { ui.announce.textContent = text; ui.announce.classList.add("show"); window.setTimeout(() => ui.announce.classList.remove("show"), ms); }
function clearFinishSequence() { while(finishTimers.length) window.clearTimeout(finishTimers.pop()); ui.finish.hidden=true; ui.finish.className="finish-cinematic"; }
function begin() { sound.unlock(); resetGame(game); if(DEBUG_FULL_METER){game.player.energy=100;game.enemy.energy=100;}if(QA_MODE){game.enemy.aiThink=999;game.player.x=400;game.enemy.x=525;if(QA_ENEMY_SP)window.setTimeout(()=>{setButton(game.enemy,"sp",true);setButton(game.enemy,"sp",false);},520);}announcedEnd = false; particles.length = 0; specialEffects.length = 0; cameraKick=0;superFreezePulse=0;clearFinishSequence(); ui.start.hidden = true; ui.start.classList.remove("rematch"); showAnnounce(contentPack.story?.startText || "开打！", 700); }
ui.start.addEventListener("click", begin);
if (DEBUG_ALLOWED) ui.debug.addEventListener("click", () => { game.debug = !game.debug; ui.debug.classList.toggle("active", game.debug); });

const buttonElements = [...document.querySelectorAll("[data-action]")];
for (const button of buttonElements) {
  const action = button.dataset.action;
  button.addEventListener("pointerdown", event => { event.preventDefault(); sound.unlock(); button.setPointerCapture?.(event.pointerId); pointerButtons.set(event.pointerId, action); setButton(game.player, action, true); button.classList.add("pressed"); });
  const release = event => { const held = pointerButtons.get(event.pointerId); if (!held) return; pointerButtons.delete(event.pointerId); setButton(game.player, held, false); button.classList.remove("pressed"); };
  button.addEventListener("pointerup", release); button.addEventListener("pointercancel", release); button.addEventListener("lostpointercapture", release);
}

let joyPointer = null, joyAxisX = 0, joyAxisY = 0;
const directionNames = { "0,0":"中立", "0,-1":"上", "1,-1":"上前", "1,0":"前", "1,1":"下前", "0,1":"下", "-1,1":"下后", "-1,0":"后", "-1,-1":"上后" };
function updateJoystick(event) {
  event.preventDefault?.();
  const rect = ui.joystick.getBoundingClientRect(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  let dx = event.clientX - cx, dy = event.clientY - cy; const max = rect.width * .31, length = Math.hypot(dx, dy);
  if (length < rect.width * .12) { dx = 0; dy = 0; } else if (length > max) { dx *= max / length; dy *= max / length; }
  ui.stick.style.transform = `translate(${dx}px,${dy}px)`;
  const xThreshold = max * (joyAxisX ? .18 : .34);
  const downThreshold = max * (joyAxisY === 1 ? .12 : .24);
  const upThreshold = max * (joyAxisY === -1 ? .18 : .34);
  const sx = Math.abs(dx) < xThreshold ? 0 : Math.sign(dx);
  const sy = dy > downThreshold ? 1 : dy < -upThreshold ? -1 : 0;
  joyAxisX = sx; joyAxisY = sy;
  setDirection(game.player, sx, sy); ui.direction.textContent = directionNames[`${sx},${sy}`] || "中立";
}
function releaseJoystick(event) {
  if (event && joyPointer !== event.pointerId) return; joyPointer = null; joyAxisX = 0; joyAxisY = 0; setDirection(game.player, 0, 0); ui.stick.style.transform = "translate(0,0)"; ui.direction.textContent = "中立";
}
ui.joystick.addEventListener("pointerdown", event => { event.preventDefault(); sound.unlock(); joyPointer = event.pointerId; ui.joystick.setPointerCapture?.(event.pointerId); updateJoystick(event); });
window.addEventListener("pointermove", event => { if (event.pointerId === joyPointer) updateJoystick(event); }, { passive:false });
window.addEventListener("pointerup", releaseJoystick); window.addEventListener("pointercancel", releaseJoystick);

const keyButtons = { g:"guard", G:"guard", j:"p", J:"p", k:"k", K:"k", l:"sp", L:"sp", " ":"guard" };
function syncKeyboardDirection() {
  const x = Number(keys.has("ArrowRight") || keys.has("d") || keys.has("D")) - Number(keys.has("ArrowLeft") || keys.has("a") || keys.has("A"));
  const y = Number(keys.has("ArrowDown") || keys.has("s") || keys.has("S")) - Number(keys.has("ArrowUp") || keys.has("w") || keys.has("W"));
  setDirection(game.player, x, y);
}
window.addEventListener("keydown", event => { if (event.repeat) return; if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","a","A","d","D","w","W","s","S"].includes(event.key)) { event.preventDefault(); keys.add(event.key); syncKeyboardDirection(); } const button = keyButtons[event.key]; if (button) { event.preventDefault(); sound.unlock(); setButton(game.player, button, true); } });
window.addEventListener("keyup", event => { keys.delete(event.key); syncKeyboardDirection(); const button = keyButtons[event.key]; if (button) setButton(game.player, button, false); });
function releaseAll() { keys.clear(); releaseJoystick(); for (const action of ["guard","p","k","sp"]) setButton(game.player, action, false); pointerButtons.clear(); buttonElements.forEach(button => button.classList.remove("pressed")); }
window.addEventListener("blur", releaseAll); document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });

function actionKey(state) {
  if (spriteManifest.stateAliases?.[state]) return spriteManifest.stateAliases[state];
  if (["stand_p1","stand_p2","stand_p3"].includes(state)) return "light";
  if (["stand_k","crouch_p","crouch_k","jump_p","jump_k","special"].includes(state)) return "heavy";
  if (["stand_guard","crouch_guard","blockstun"].includes(state)) return "guard";
  if (["hit","hit_crouch","knockdown","wakeup","protection_breakout"].includes(state)) return "hit";
  if (state === "ko") return "ko";
  if (state === "victory") return "victory";
  if (state === "walk") return "move";
  return "idle";
}
function spriteFor(target) {
  const fighter = spriteManifest.fighters[target.id], key = fighter.actions[target.state] ? target.state : actionKey(target.state), frames = fighter.actions[key] || fighter.actions.idle;
  const fps = fighter.actionFps?.[key] || fighter.fps, loop = ["idle","move","guard"].includes(key), raw = Math.floor(target.stateTime * fps), index = loop ? raw % frames.length : Math.min(frames.length - 1, raw);
  return { image: images[frames[index]], canonicalFacing: fighter.canonicalFacing, generated: frames.length > 1, key, index };
}
function pose(target, sprite) {
  let x = target.x, y = WORLD.ground - target.y, rotation = 0, scaleX = 1, scaleY = 1; const t = target.stateTime;
  if (target.state === "idle" && !sprite.generated) y += Math.sin(performance.now() / 190) * 2;
  if (target.state === "walk" && !sprite.generated) { rotation = target.input.axisX * .035; y += Math.abs(Math.sin(t * 16)) * 3; }
  if ((target.state === "crouch" || target.state.startsWith("crouch_")) && !sprite.generated) { scaleY = .78; y += 2; }
  if (["stand_guard","crouch_guard","blockstun"].includes(target.state) && !sprite.generated) { scaleX = .95; scaleY *= .97; }
  if (target.state === "stand_k") { const move = MOVES[target.state], p = Math.min(1,t/move.total); x += target.facing * Math.sin(p*Math.PI) * 36; rotation = -target.facing * .08 * Math.sin(p*Math.PI); }
  if (target.state === "victory" && !sprite.generated) { y -= 4 + Math.sin(t * 6) * 3; scaleX = 1.025; scaleY = 1.025; }
  if (["hit","hit_crouch","knockdown","wakeup","protection_breakout"].includes(target.state) && !sprite.generated) rotation = -target.facing * Math.min(.18,target.stateTime*.7);
  if (target.state === "ko" && !sprite.generated) { const p = Math.min(1,t/.75); y += p*30; rotation = target.facing*p*1.2; scaleY = 1-p*.17; }
  return { x,y,rotation,scaleX,scaleY };
}

function drawBackground(time) {
  ctx.drawImage(images["stage-main"],0,0,960,540);
  const vignette=ctx.createRadialGradient(480,260,180,480,260,600);vignette.addColorStop(0,"rgba(8,10,22,0)");vignette.addColorStop(1,"rgba(5,7,18,.3)");ctx.fillStyle=vignette;ctx.fillRect(0,0,960,540);
  ctx.fillStyle="rgba(255,227,180,.18)";for(let i=0;i<8;i++){const x=(i*137+time*7)%1060-50;ctx.beginPath();ctx.arc(x,355+(i%3)*11,1.5,0,7);ctx.fill();}
}
function drawFighter(target) {
  const sprite=spriteFor(target),p=pose(target,sprite),flip=target.facing===sprite.canonicalFacing?1:-1,w=target.id==="cat"?310:306,h=w*sprite.image.height/sprite.image.width;
  const flash=performance.now()<hitFlashUntil[target.id];
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rotation);ctx.scale(flip*p.scaleX,p.scaleY);ctx.globalAlpha=target.invulnerable>0&&Math.floor(target.clock*24)%2?.55:1;
  ctx.drawImage(sprite.image,-w/2,-h,w,h);
  if(flash){ctx.globalAlpha=.72;ctx.globalCompositeOperation="screen";ctx.filter="brightness(3.8) saturate(0)";ctx.drawImage(sprite.image,-w/2,-h,w,h);ctx.globalCompositeOperation="source-over";ctx.filter="none";}ctx.restore();
  if (["stand_guard","crouch_guard","blockstun"].includes(target.state)){ctx.save();ctx.strokeStyle=target.id==="cat"?"rgba(116,226,255,.9)":"rgba(255,91,53,.9)";ctx.lineWidth=7;ctx.beginPath();ctx.arc(p.x+target.facing*43,p.y-(target.state==="crouch_guard"?62:96),target.state==="crouch_guard"?42:55,-Math.PI/2,Math.PI/2);ctx.stroke();ctx.restore();}
  if (target.state === "victory") { ctx.save(); const glow = ctx.createRadialGradient(p.x,p.y-110,8,p.x,p.y-110,105); glow.addColorStop(0,"rgba(255,223,100,.34)"); glow.addColorStop(1,"rgba(255,223,100,0)"); ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(p.x,p.y-110,105,0,Math.PI*2); ctx.fill(); ctx.restore(); }
}
function drawRect(box,color,label){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(box.x1,WORLD.ground-box.y2,box.x2-box.x1,box.y2-box.y1);ctx.fillStyle=color;ctx.font="9px system-ui";ctx.fillText(label,box.x1+2,WORLD.ground-box.y2+10);}
function drawArrow(x,y,dx,dy,color){ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y-dy);ctx.stroke();ctx.beginPath();ctx.arc(x+dx,y-dy,4,0,Math.PI*2);ctx.fill();}
function drawDebug(target){const g=getDebugGeometry(target);for(const b of g.pushbox)drawRect(b,"#fff","push");for(const b of g.hurtboxes)drawRect(b,"#55e6ff",b.id);for(const b of g.guardboxes)drawRect(b,"#6aff8c",b.id);for(const b of g.hitboxes)drawRect(b,"#ff5474",`${b.id}:${b.heightTag}`);drawArrow(target.x,WORLD.ground-target.y,target.facing*54,0,"#ffe45d");}

function spawnImpact(event){const target=event.defender==="cat"?game.player:game.enemy,perfect=event.type==="perfect-guard",heavy=event.finalHit||MOVES[event.move]?.damage>=14;hitFlashUntil[target.id]=performance.now()+(perfect?110:heavy?92:66);cameraKick=Math.max(cameraKick,event.finalHit?1:heavy?.72:perfect?.58:.38);for(let i=0;i<(perfect?22:event.move?.includes("k")?18:11);i++)particles.push({x:target.x,y:WORLD.ground-target.y-100,vx:(Math.random()-.5)*280,vy:(Math.random()-.65)*230,life:.22+Math.random()*.2,max:.42,type:event.type});sound.tone(perfect?620:event.type==="guard"?420:150,perfect?.16:heavy?.13:.1,"sawtooth",perfect?.05:heavy?.045:.035);if(perfect)showAnnounce("完美防反",420);}
function spawnSpecialEffect(event) {
  const target = event.defender === "cat" ? game.player : game.enemy;
  const duration=event.finalHit?.58:.4;
  specialEffects.push({ type:event.effect, x:target.x, y:WORLD.ground-target.y-96, life:duration, max:duration, index:event.hitIndex, final:event.finalHit, facing:(event.attacker === "cat" ? game.player : game.enemy).facing });
  for (let i=0;i<9;i++) particles.push({x:target.x+(Math.random()-.5)*50,y:WORLD.ground-target.y-96+(Math.random()-.5)*70,vx:(Math.random()-.5)*190,vy:(Math.random()-.5)*150,life:.18+Math.random()*.16,max:.34,type:event.effect});
  sound.tone(event.effect === "claw" ? 260 + event.hitIndex * 34 : 120 + event.hitIndex * 22, .085, event.effect === "claw" ? "sawtooth" : "square", .045);
}
function drawParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=430*dt;if(p.life<=0){particles.splice(i,1);continue;}ctx.globalAlpha=p.life/p.max;ctx.fillStyle=p.type==="claw"?"#8eeaff":p.type==="bite"?"#ff684c":p.type==="perfect-guard"?"#d78cff":p.type==="guard"?"#75c9ff":"#ffe17d";ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.fillRect(-10,-2,20,4);ctx.restore();}ctx.globalAlpha=1;}
function drawSpecialEffects(dt) {
  for (let i=specialEffects.length-1;i>=0;i--) {
    const fx=specialEffects[i]; fx.life-=dt; if(fx.life<=0){specialEffects.splice(i,1);continue;}
    const p=1-fx.life/fx.max, alpha=Math.min(1,p/.11)*(1-Math.max(0,(p-.62)/.38)), asset=images[`vfx-${fx.type}`];
    const punch=1+Math.sin(Math.min(1,p/.35)*Math.PI)*.13, size=(fx.final?292:218+(fx.index%3)*12)*punch;
    ctx.save(); ctx.translate(fx.x,fx.y); ctx.globalAlpha=alpha; ctx.globalCompositeOperation="screen";
    if(fx.type==="claw"){const pulse=.9+Math.sin(p*Math.PI)*.18;ctx.scale(pulse,pulse);}
    else {ctx.rotate((fx.index%2?-.11:.09)+(fx.index-3)*.025);ctx.scale((fx.index%2?-1:1)*fx.facing,1);}
    ctx.drawImage(asset,-size/2,-size/2,size,size);
    ctx.globalCompositeOperation="source-over";ctx.globalAlpha=alpha*.8;ctx.strokeStyle=fx.type==="claw"?"rgba(126,220,255,.92)":"rgba(255,92,48,.92)";ctx.lineWidth=fx.final?8:5;ctx.beginPath();ctx.arc(0,0,size*(.23+.25*p),0,Math.PI*2);ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha=1;
}

function scale(el,value){el.style.transform=`scaleX(${Math.max(0,Math.min(1,value))})`;}
function updateUI(){ui.timer.textContent=String(Math.ceil(game.time)).padStart(2,"0");ui.combo.textContent=`连击 ×${game.player.combo}`;scale(ui.playerHp,game.player.hp/100);scale(ui.playerLag,game.player.hp/100);scale(ui.enemyHp,game.enemy.hp/100);scale(ui.enemyLag,game.enemy.hp/100);scale(ui.playerYellow,game.player.yellowProtection/100);scale(ui.enemyYellow,game.enemy.yellowProtection/100);scale(ui.playerEnergy,game.player.energy/100);scale(ui.enemyEnergy,game.enemy.energy/100);ui.sp.classList.toggle("ready",game.player.energy>=MOVES.special.energyCost);ui.record.textContent=`FAN TEST · 胜场 ${records.wins}`;const move=MOVES[game.player.state],phase=!move?"":game.player.stateTime<move.activeStart?"STARTUP":game.player.stateTime<=move.activeEnd?"ACTIVE":"RECOVERY",adv=Math.round(game.player.debug.frameAdvantage*60);ui.state.textContent=`${game.player.state}${phase?` · ${phase}`:""} · 帧差${adv>=0?"+":""}${adv} · 黄${Math.round(game.player.yellowProtection)} · 气${Math.round(game.player.energy)}`;}
function finishRound(){
  if(announcedEnd)return;announcedEnd=true;releaseAll();clearFinishSequence();
  const title=game.winner==="cat"?`${ui.playerName.textContent} WINS`:game.winner==="dog"?`${ui.enemyName.textContent} WINS`:"DRAW";
  if(game.winner==="cat")records.wins+=1;records.bestCombo=Math.max(records.bestCombo,game.player.maxCombo);localStorage.setItem("eva-chibi-duel-v1",JSON.stringify(records));
  ui.finishKo.textContent=game.reason==="double_ko"?"DOUBLE K.O.":game.reason==="ko"?"K.O.":"TIME UP";ui.finishWinner.textContent=title;ui.finish.hidden=false;ui.finish.classList.add("ko-phase");
  finishTimers.push(window.setTimeout(()=>{ui.finish.classList.remove("ko-phase");ui.finish.classList.add("winner-phase");},1120));
  finishTimers.push(window.setTimeout(()=>{ui.finish.hidden=true;ui.finish.className="finish-cinematic";},3500));
  finishTimers.push(window.setTimeout(()=>{ui.start.textContent=contentPack.story?.rematchText||"再战一局";ui.start.classList.add("rematch");ui.start.hidden=false;},3850));
}
function frame(now){const raw=feedPaused?0:Math.min(.05,(now-last)/1000);last=now;accumulator+=raw;while(accumulator>=FIXED){stepGame(game,FIXED);for(const event of game.events){if(["hit","guard","perfect-guard"].includes(event.type))spawnImpact(event);if(event.type==="hit"&&event.antiAir)showAnnounce("ANTI-AIR",360);else if(event.type==="hit"&&event.counter)showAnnounce("COUNTER",360);else if(event.type==="hit"&&event.punish)showAnnounce("PUNISH",360);if(event.type==="special-hit"){spawnImpact(event);spawnSpecialEffect(event);}if(event.type==="special-lock"){cameraKick=Math.max(cameraKick,.22);}if(event.type==="special-cinematic-start"){cameraKick=Math.max(cameraKick,.7);superFreezePulse=.3;showAnnounce(event.attacker==="cat"?"A.T. FIELD · 零号机":"UNIT-02 · PROGRESSIVE SLASH",620);sound.tone(event.attacker==="cat"?330:170,.18,"sawtooth",.05);}if(event.type==="special-whiff"&&event.attacker==="cat")showAnnounce("跳跃闪避",360);if(event.type==="special-whiff"&&event.attacker==="dog")showAnnounce("下蹲闪避",360);}accumulator-=FIXED;}cameraKick=Math.max(0,cameraKick-raw*4.8);superFreezePulse=Math.max(0,superFreezePulse-raw);ctx.save();const zoom=1+cameraKick*.014;ctx.translate(480,270);ctx.scale(zoom,zoom);ctx.translate(-480,-270);if(game.shake>0){const strength=Math.min(1,game.shake/.18);ctx.translate((Math.random()-.5)*10*strength,(Math.random()-.5)*7*strength);}drawBackground(game.elapsed);const specialActive=game.player.state==="special"||game.enemy.state==="special";if(specialActive){ctx.fillStyle=game.specialLock?"rgba(4,6,18,.38)":"rgba(6,9,25,.26)";ctx.fillRect(0,0,960,540);}if(game.specialLock){ctx.fillStyle="rgba(0,0,0,.42)";ctx.fillRect(0,0,960,18);ctx.fillRect(0,522,960,18);}drawFighter(game.player);drawFighter(game.enemy);drawSpecialEffects(raw);drawParticles(raw);if(superFreezePulse>0){ctx.fillStyle=`rgba(220,238,255,${superFreezePulse*.48})`;ctx.fillRect(0,0,960,540);}if(game.debug){drawDebug(game.player);drawDebug(game.enemy);}ctx.restore();feedPortrait?.(raw);updateUI();if(game.phase==="round_end")finishRound();requestAnimationFrame(frame);}
requestAnimationFrame(frame);

// FEED_DEMO_BRIDGE
for(const [key,element] of [['player',ui.playerName],['enemy',ui.enemyName]]){
 const value=pageParams.get(key);if(value)element.textContent=value.slice(0,20);
}
if(pageParams.get('feed')==='preview'){
 sound.unlock=()=>{};
 begin();game.player.energy=100;game.enemy.energy=100;
 parent.postMessage({type:'feed-preview-ready'},location.origin);
 const specialClip=pageParams.get('clip')==='special';
 let restartAt=0;
 setInterval(()=>{
  if(feedPaused)return;
  if(game.phase==='round_end'){
   if(!restartAt)restartAt=performance.now()+2600;
   if(performance.now()>restartAt){begin();game.player.energy=100;game.enemy.energy=100;restartAt=0;}
   return;
  }
  const p=game.player,e=game.enemy;
  for(const action of ['p','k','sp','guard'])setButton(p,action,false);
  if(specialClip){p.energy=100;e.energy=100;}
  const distance=Math.abs(e.x-p.x);
  setDirection(p,distance>125?Math.sign(e.x-p.x):0,0);
  if(distance<170){const action=specialClip?'sp':p.energy>=100&&Math.random()<.3?'sp':Math.random()<.65?'p':'k';setButton(p,action,true);}
 },340);
}
