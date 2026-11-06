const cast={
 paw:['cat/idle/idle-00.webp','dog/idle_v1/sprite-00.webp'],
 meme:['meme/musk/frame-00.png','meme/trump/frame-00.png'],
 eva:['eva/rei/frame-00.png','eva/asuka/frame-00.png']
};
export function cardMarkup(g){return `<div class="scene"></div><div class="shade"></div><div class="card-content">
 <div class="category"><i></i> ${g.id==='paw'?'原始母体':'主题定制'} <span>· 横版格斗</span></div>
 <div class="preview">
  <img class="cover" alt="${g.title}实机截图" src="${g.image}">
  <div class="poster-cast ${g.id}" aria-label="${g.names.join('对战')}"><img class="cast-left" src="games/${g.id}/assets/characters/${cast[g.id][0]}" alt="${g.names[0]}"><img class="cast-right" src="games/${g.id}/assets/characters/${cast[g.id][1]}" alt="${g.names[1]}"><span class="versus">VS</span></div>
  <button class="preview-trigger" aria-label="预览${g.title}"><span class="preview-icon" aria-hidden="true">▶</span><strong>点一下，看他们打起来</strong><small>12 秒实机片段</small></button>
  <button class="tap-pause" hidden aria-label="暂停预览"><span class="pause-mark">▶</span></button>
  <div class="preview-loading" hidden role="status">正在进入演示…</div><div class="preview-clock" hidden></div>
 </div>
 <div class="preview-status"><span class="preview-message" role="status">点击画面预览</span><span>实机内容 · 可试玩</span></div>
 <div class="clip-controls" hidden aria-label="演示片段"><button data-clip="battle" aria-pressed="true">对战</button><button data-clip="special" aria-pressed="false">必杀</button><button class="close-preview" aria-label="关闭预览">结束预览 ×</button></div>
 <aside class="social-rail" aria-label="这个游戏的操作"><button class="save rail-action" aria-label="收藏${g.title}"><span class="icon">♡</span><small>收藏</small></button><button class="share rail-action" aria-label="分享${g.title}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4 21 11 14 18V14C8 14 5 16 3 20 3 11 7 8 14 8Z"/></svg><small>分享</small></button></aside>
 <div class="card-meta"><div class="author"><span class="creator-dot">想</span>随想游实验室 <span class="creator-tag">母体创作</span></div><h2>${g.title}</h2><p class="tagline">${g.line}</p><div class="description">${g.desc}</div><div class="modules">人物 · 场景 · 界面 · 技能表现</div><div class="actions"><button class="play">直接玩</button><button class="primary customize">✦ 定制我的版本</button></div><div class="swipe-hint">上滑发现下一个</div></div>
 <div class="preview-progress" aria-hidden="true"><span></span></div>
 </div>`;}
