export const WORLD = { width: 960, height: 540, left: 74, right: 886, ground: 438 };

export const COMBAT = {
  roundSeconds: 60,
  jumpStart: 5 / 60,
  jumpVelocity: 620,
  gravity: 1600,
  forwardJumpSpeed: 175,
  backwardJumpSpeed: 150,
  jumpInputBuffer: 8 / 60,
  perfectGuardWindow: .09,
  perfectGuardEnergy: 12,
  chipRate: .10,
  comboScaleStep: .08,
  comboScaleFloor: .72,
  protectionRecoverDelay: 1.15,
  protectionRecoverRate: 32,
  protectionBreakReset: 70,
  protectionBreakInvulnerability: .55,
};

// Height tags guide AI and validation only. Runtime outcomes come from box overlap.
export const MOVES = {
  stand_p1: { total: .31, activeStart: .075, activeEnd: .145, damage: 6, yellowDamage: 14, energyGain: 7, hitstun: .285, blockstun: .202, hitstop: .048, blockstop: .030, pushback: 25, heightTag: "mid", box: [24, 72, 105, 130], cancel: [.115, .22], next: "stand_p2" },
  stand_p2: { total: .34, activeStart: .09, activeEnd: .165, damage: 7, yellowDamage: 17, energyGain: 8, hitstun: .30, blockstun: .20, hitstop: .052, blockstop: .032, pushback: 29, heightTag: "mid", box: [28, 66, 112, 126], cancel: [.13, .245], next: "stand_p3" },
  stand_p3: { total: .46, activeStart: .13, activeEnd: .225, damage: 10, yellowDamage: 23, energyGain: 11, hitstun: .33, blockstun: .23, hitstop: .068, blockstop: .040, pushback: 50, heightTag: "mid", box: [34, 62, 126, 132], cancel: [.185, .29] },
  stand_k:  { total: .60, activeStart: .18, activeEnd: .31, damage: 13, yellowDamage: 32, energyGain: 13, hitstun: .36, blockstun: .27, hitstop: .078, blockstop: .045, pushback: 55, heightTag: "mid", box: [30, 66, 145, 184], upperInvulStart: .05, upperInvulEnd: .30, antiAir: true },
  crouch_p: { total: .34, activeStart: .095, activeEnd: .17, damage: 5, yellowDamage: 14, energyGain: 6, hitstun: .278, blockstun: .212, hitstop: .043, blockstop: .028, pushback: 22, heightTag: "low", box: [24, 10, 102, 52] },
  crouch_k: { total: .72, activeStart: .27, activeEnd: .40, damage: 12, yellowDamage: 36, energyGain: 12, hitstun: .40, blockstun: .25, hitstop: .082, blockstop: .048, pushback: 65, heightTag: "low", box: [32, 4, 154, 40], knockdown: true },
  jump_p:   { total: .31, activeStart: .065, activeEnd: .16, damage: 7, yellowDamage: 18, energyGain: 8, hitstun: .225, blockstun: .14, hitstop: .048, blockstop: .030, pushback: 25, landingRecovery: .083, heightTag: "high", box: [20, 74, 108, 146] },
  jump_k:   { total: .46, activeStart: .125, activeEnd: .255, damage: 12, yellowDamage: 30, energyGain: 13, hitstun: .325, blockstun: .20, hitstop: .073, blockstop: .043, pushback: 49, landingRecovery: .117, heightTag: "high", box: [24, 68, 132, 152] },
  special:  { total: 1.38, activeStart: .30, activeEnd: 1.05, damage: 4, yellowDamage: 9, hitstun: .24, blockstun: .23, hitstop: .025, blockstop: .045, pushback: 82, heightTag: "special", box: [18, 0, 360, 260], energyCost: 50, hits: 5, hitInterval: .15 },
};

const FREE_STATES = new Set(["idle", "walk", "crouch", "stand_guard", "crouch_guard"]);
const ATTACK_STATES = new Set(Object.keys(MOVES));
const AIR_STATES = new Set(["jump", "jump_p", "jump_k"]);

function fighter(id, x, facing) {
  return {
    id, x, prevX: x, y: 0, facing, hp: 100, yellowProtection: 100, energy: 0,
    state: "idle", stateTime: 0, clock: 0, velocityX: 0, velocityY: 0,
    hitConfirmed: false, attackId: 0, combo: 0, maxCombo: 0, stunRemaining: 0,
    lastHitAt: -99, invulnerable: 0, breakoutPending: false, specialHits: 0, specialTargetValid: null, cinematicLocked: false,
    airAttackUsed: false, landingRecovery: .067, jumpBufferTime: 0,
    input: { axisX: 0, axisY: 0, guard: false, p: false, k: false, sp: false, jumpQueued: false },
    buffered: null, bufferTime: 0, guardPressedAt: -99, guardConsumed: false,
    aiThink: 0, debug: { frameAdvantage: 0 },
  };
}

export function createGame(random = Math.random) {
  return { phase: "intro", time: COMBAT.roundSeconds, elapsed: 0, hitstop: 0, superFreeze: 0, shake: 0, specialLock: null,
    player: fighter("cat", 310, 1), enemy: fighter("dog", 650, -1),
    winner: null, reason: null, roundEndTime: 0, events: [], random, debug: false };
}

export function resetGame(game) {
  const random = game.random, debug = game.debug;
  Object.assign(game, createGame(random));
  game.debug = debug; game.phase = "fighting";
  game.events.push({ type: "round-start" });
}

export function setDirection(target, axisX, axisY) {
  if (target.cinematicLocked) {
    if (axisX === 0 && axisY === 0) { target.input.axisX = 0; target.input.axisY = 0; }
    return;
  }
  const wasUp = target.input.axisY < -.5;
  target.input.axisX = Math.abs(axisX) < .25 ? 0 : Math.sign(axisX);
  target.input.axisY = Math.abs(axisY) < .25 ? 0 : Math.sign(axisY);
  if (target.input.axisY < -.5 && !wasUp) {
    target.input.jumpQueued = true;
    target.jumpBufferTime = COMBAT.jumpInputBuffer;
  }
}

export function setButton(target, button, down) {
  if (!(button in target.input) || ["axisX", "axisY", "jumpQueued"].includes(button)) return;
  if (target.cinematicLocked) { if (!down) target.input[button] = false; return; }
  const wasDown = target.input[button];
  target.input[button] = down;
  if (button === "guard" && down && !wasDown) {
    target.guardPressedAt = target.clock; target.guardConsumed = false;
  }
  if (!down || wasDown || button === "guard") return;
  target.buffered = button; target.bufferTime = .13;
}

export function setInput(target, action, down) {
  if (action === "left" || action === "right") {
    const left = action === "left" ? down : target.input.axisX < 0;
    const right = action === "right" ? down : target.input.axisX > 0;
    setDirection(target, Number(right) - Number(left), target.input.axisY); return;
  }
  setButton(target, { light: "p", heavy: "k" }[action] || action, down);
}

function startState(target, state) {
  if (target.state === state && FREE_STATES.has(state)) return;
  target.state = state; target.stateTime = 0; target.hitConfirmed = false;
  if (ATTACK_STATES.has(state)) target.attackId += 1;
  if (state === "special") { target.specialHits = 0; target.specialTargetValid = null; }
}

function clearCombatInput(target) {
  target.input.axisX = 0; target.input.axisY = 0; target.input.jumpQueued = false; target.jumpBufferTime = 0;
  for (const key of ["guard", "p", "k", "sp"]) target.input[key] = false;
  target.buffered = null; target.bufferTime = 0;
}

function beginSpecialLock(game, attacker, defender) {
  if (game.specialLock) return;
  attacker.cinematicLocked = true; defender.cinematicLocked = true;
  attacker.velocityX = 0; attacker.velocityY = 0; defender.velocityX = 0; defender.velocityY = 0;
  clearCombatInput(attacker); clearCombatInput(defender);
  game.specialLock = { attacker: attacker.id, defender: defender.id };
  game.events.push({ type:"special-cinematic-start", attacker:attacker.id, defender:defender.id });
}

function endSpecialLock(game) {
  if (!game.specialLock) return;
  game.player.cinematicLocked = false; game.enemy.cinematicLocked = false;
  game.specialLock = null;
  game.events.push({ type:"special-cinematic-end" });
}

function desiredAttack(target, button = target.buffered) {
  if (button === "sp") return target.energy >= MOVES.special.energyCost ? "special" : null;
  if (button === "p") return target.y > 0 || AIR_STATES.has(target.state) ? "jump_p" : target.input.axisY > .5 ? "crouch_p" : "stand_p1";
  if (button === "k") return target.y > 0 || AIR_STATES.has(target.state) ? "jump_k" : target.input.axisY > .5 ? "crouch_k" : "stand_k";
  return null;
}

function consumeBufferedAttack(target) {
  if (!target.buffered || target.bufferTime <= 0 || target.input.guard) return false;
  const move = desiredAttack(target);
  target.buffered = null; target.bufferTime = 0;
  if (!move) return false;
  if (move === "special") target.energy -= MOVES.special.energyCost;
  startState(target, move); return true;
}

function consumeAirAttack(target) {
  if (target.airAttackUsed || !target.buffered || target.bufferTime <= 0 || target.input.guard) return false;
  const move = target.buffered === "p" ? "jump_p" : target.buffered === "k" ? "jump_k" : null;
  if (!move) return false;
  target.buffered = null; target.bufferTime = 0; target.airAttackUsed = true;
  target.landingRecovery = MOVES[move].landingRecovery;
  startState(target, move); return true;
}

function attackPhase(target) {
  const move = MOVES[target.state];
  if (!move) return null;
  if (target.stateTime < move.activeStart) return "startup";
  if (target.stateTime <= move.activeEnd) return "active";
  return "recovery";
}

function transitionNeutral(target) {
  if (!FREE_STATES.has(target.state)) return;
  if (target.input.jumpQueued && target.jumpBufferTime > 0) { target.input.jumpQueued = false; target.jumpBufferTime = 0; startState(target, "jump_start"); return; }
  if (target.input.guard) { startState(target, target.input.axisY > .5 ? "crouch_guard" : "stand_guard"); return; }
  if (consumeBufferedAttack(target)) return;
  if (target.input.axisY > .5) startState(target, "crouch");
  else if (target.input.axisX) startState(target, "walk");
  else startState(target, "idle");
}

function updateAttackCancel(target) {
  if (!ATTACK_STATES.has(target.state) || !target.buffered || target.bufferTime <= 0) return;
  const move = MOVES[target.state];
  if (!move.cancel || !target.hitConfirmed || target.stateTime < move.cancel[0] || target.stateTime > move.cancel[1]) return;
  let next = target.buffered === "p" ? move.next : null;
  if (target.buffered === "sp" && target.energy >= MOVES.special.energyCost) next = "special";
  if (!next) return;
  target.buffered = null; target.bufferTime = 0;
  if (next === "special") target.energy -= MOVES.special.energyCost;
  startState(target, next);
}

function updateState(target, dt) {
  target.clock += dt; target.stateTime += dt;
  target.invulnerable = Math.max(0, target.invulnerable - dt);
  target.jumpBufferTime = Math.max(0, target.jumpBufferTime - dt);
  if (target.jumpBufferTime === 0) target.input.jumpQueued = false;
  target.bufferTime = Math.max(0, target.bufferTime - dt);
  if (target.bufferTime === 0) target.buffered = null;
  if (target.state === "hit" || target.state === "hit_crouch" || target.state === "blockstun") {
    target.stunRemaining = Math.max(0, target.stunRemaining - dt);
    if (!target.stunRemaining) {
      if (target.breakoutPending) { target.breakoutPending = false; target.invulnerable = COMBAT.protectionBreakInvulnerability; startState(target, "protection_breakout"); }
      else { startState(target, "idle"); transitionNeutral(target); }
    }
    return;
  }
  if (target.state === "knockdown") {
    target.stunRemaining = Math.max(0, target.stunRemaining - dt);
    if (!target.stunRemaining) {
      if (target.breakoutPending) { target.breakoutPending = false; target.invulnerable = COMBAT.protectionBreakInvulnerability; startState(target, "protection_breakout"); }
      else { target.invulnerable = .25; startState(target, "wakeup"); }
    }
    return;
  }
  if (target.state === "air_hit") return;
  if (target.state === "wakeup") { if (target.stateTime >= .25) { startState(target, "idle"); transitionNeutral(target); } return; }
  if (target.state === "protection_breakout") {
    if (target.stateTime >= COMBAT.protectionBreakInvulnerability) { target.yellowProtection = Math.max(COMBAT.protectionBreakReset, target.yellowProtection); startState(target, "idle"); }
    return;
  }
  if (target.state === "jump_start") {
    if (target.stateTime >= COMBAT.jumpStart) {
      const jumpSpeed = target.input.axisX === target.facing ? COMBAT.forwardJumpSpeed : COMBAT.backwardJumpSpeed;
      target.velocityY = COMBAT.jumpVelocity; target.velocityX = target.input.axisX * jumpSpeed; startState(target, "jump");
      consumeAirAttack(target);
    }
    return;
  }
  if (target.state === "jump") { consumeAirAttack(target); return; }
  if (target.state === "landing") { if (target.stateTime >= target.landingRecovery) { target.airAttackUsed = false; target.landingRecovery = .067; startState(target, "idle"); transitionNeutral(target); } return; }
  if (target.state === "victory" || target.state === "ko") return;
  if (ATTACK_STATES.has(target.state)) {
    updateAttackCancel(target);
    const move = MOVES[target.state];
    if (target.stateTime >= move.total) startState(target, target.y > 0 ? "jump" : "idle");
    return;
  }
  transitionNeutral(target);
}

function applyMovement(target, dt) {
  target.prevX = target.x;
  if (target.cinematicLocked) { target.velocityX = 0; target.velocityY = 0; return; }
  if (target.state === "walk") target.x += target.input.axisX * 215 * dt;
  if (target.state === "stand_guard" && target.input.axisX && Math.sign(target.input.axisX) !== target.facing) target.x += target.input.axisX * 86 * dt;
  if (target.y > 0 || AIR_STATES.has(target.state)) {
    target.x += target.velocityX * dt; target.y += target.velocityY * dt; target.velocityY -= COMBAT.gravity * dt;
    if (target.y <= 0 && target.velocityY < 0) {
      target.y = 0; target.velocityY = 0; target.velocityX = 0;
      if (AIR_STATES.has(target.state)) startState(target, "landing");
      else if (target.state === "air_hit") { target.stunRemaining = .55; startState(target, "knockdown"); }
    }
  }
  if (Math.abs(target.velocityX) > .1 && !AIR_STATES.has(target.state)) {
    target.x += target.velocityX * dt; target.velocityX *= Math.exp(-9 * dt);
  }
  target.x = Math.max(WORLD.left, Math.min(WORLD.right, target.x));
}

function localRect(target, [x1, y1, x2, y2]) {
  return target.facing > 0
    ? { x1: target.x + x1, x2: target.x + x2, y1: target.y + y1, y2: target.y + y2 }
    : { x1: target.x - x2, x2: target.x - x1, y1: target.y + y1, y2: target.y + y2 };
}

function hurtboxes(target) {
  const crouched = target.state === "crouch" || target.state === "crouch_guard" || target.state.startsWith("crouch_");
  const boxes = crouched
    ? [["legs", -32, 0, 34, 42], ["torso", -31, 24, 30, 82], ["head", -24, 74, 24, 112]]
    : [["legs", -29, 0, 30, 62], ["torso", -32, 48, 31, 126], ["head", -25, 118, 25, 174]];
  const move = MOVES[target.state];
  const upperInvulnerable = move?.upperInvulStart != null && target.stateTime >= move.upperInvulStart && target.stateTime <= move.upperInvulEnd;
  return boxes.filter(([id]) => !upperInvulnerable || id === "legs").map(([id, ...rect]) => ({ id, ...localRect(target, rect) }));
}

function guardboxes(target) {
  if (target.state === "stand_guard") return [{ id: "guard_stand", ...localRect(target, [25, 58, 57, 166]) }];
  if (target.state === "crouch_guard") return [{ id: "guard_crouch", ...localRect(target, [24, 5, 58, 102]) }];
  return [];
}

function attackboxes(target) {
  const move = MOVES[target.state];
  if (!move || target.stateTime < move.activeStart || target.stateTime > move.activeEnd) return [];
  const box = localRect(target, move.box), dx = target.x - target.prevX;
  box.x1 = Math.min(box.x1, box.x1 - dx); box.x2 = Math.max(box.x2, box.x2 - dx);
  return [{ id: target.state, attackNormal: [target.facing, 0], heightTag: move.heightTag, ...box }];
}

function isCrouched(target) {
  return target.state === "crouch" || target.state === "crouch_guard" || target.state === "hit_crouch" || target.state.startsWith("crouch_");
}

function specialTargetEligible(attacker, defender) {
  const airborne = defender.y > 18 || AIR_STATES.has(defender.state);
  return attacker.id === "cat" ? !airborne : airborne || !isCrouched(defender);
}

function overlaps(a, b) { return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1; }
function frontOf(defender, attacker) { const d = Math.sign(attacker.x - defender.x) || defender.facing; return defender.facing * d >= .2; }

function detectOutcome(attacker, defender) {
  if (!ATTACK_STATES.has(attacker.state) || defender.state === "ko" || defender.invulnerable > 0) return null;
  if (attacker.state === "special") {
    const move = MOVES.special, nextHitAt = move.activeStart + attacker.specialHits * move.hitInterval;
    if (attacker.specialTargetValid !== true || attacker.specialHits >= move.hits || attacker.stateTime < nextHitAt || attacker.stateTime > move.activeEnd) return null;
    const hitbox = attackboxes(attacker)[0];
    if (!hitbox) return null;
    for (const hurtbox of hurtboxes(defender)) if (overlaps(hitbox, hurtbox)) return { type: "special-hit", moveName: "special", hitbox, hurtbox };
    return null;
  }
  if (attacker.hitConfirmed) return null;
  const attacks = attackboxes(attacker);
  if (!attacks.length) return null;
  const guards = frontOf(defender, attacker) ? guardboxes(defender) : [];
  for (const hitbox of attacks) for (const guardbox of guards) if (overlaps(hitbox, guardbox)) return { type: "guard", moveName: attacker.state, hitbox, guardbox };
  for (const hitbox of attacks) for (const hurtbox of hurtboxes(defender)) if (overlaps(hitbox, hurtbox)) return { type: "hit", moveName: attacker.state, hitbox, hurtbox };
  return null;
}

function resolveOutcome(game, attacker, defender, outcome) {
  const move = MOVES[outcome.moveName];
  if (outcome.type === "special-hit") {
    const firstHit = attacker.specialHits === 0;
    const chained = game.elapsed - defender.lastHitAt <= .9;
    if (firstHit) beginSpecialLock(game, attacker, defender);
    attacker.specialHits += 1; attacker.hitConfirmed = true;
    const finalHit = attacker.specialHits >= move.hits;
    defender.hp = Math.max(0, defender.hp - move.damage);
    defender.yellowProtection = Math.max(0, defender.yellowProtection - move.yellowDamage);
    defender.lastHitAt = game.elapsed;
    attacker.combo = chained ? attacker.combo + 1 : 1;
    attacker.maxCombo = Math.max(attacker.maxCombo, attacker.combo);
    defender.energy = Math.min(100, defender.energy + 2);
    defender.stunRemaining = finalHit ? .72 : move.hitstun;
    if (finalHit) defender.velocityX = attacker.facing * move.pushback;
    startState(defender, defender.hp <= 0 ? "ko" : finalHit ? "knockdown" : isCrouched(defender) ? "hit_crouch" : "hit");
    game.hitstop = Math.max(game.hitstop, finalHit ? .095 : firstHit ? .075 : move.hitstop); game.shake = finalHit ? .22 : firstHit ? .14 : .09;
    if (finalHit) endSpecialLock(game);
    game.events.push({ type: "special-hit", attacker: attacker.id, defender: defender.id, damage: move.damage, move: "special", hitIndex: attacker.specialHits, finalHit, effect: attacker.id === "cat" ? "claw" : "bite" });
    return;
  }
  attacker.hitConfirmed = true;
  const defenderWasCrouched = isCrouched(defender);
  const perfect = outcome.type === "guard" && !defender.guardConsumed && defender.clock - defender.guardPressedAt <= COMBAT.perfectGuardWindow;
  if (outcome.type === "guard") defender.guardConsumed = true;
  if (perfect) {
    attacker.stunRemaining = .19; startState(attacker, "hit");
    defender.energy = Math.min(100, defender.energy + COMBAT.perfectGuardEnergy); defender.debug.frameAdvantage = .11;
    game.hitstop = .10; game.shake = .08;
    game.events.push({ type: "perfect-guard", attacker: attacker.id, defender: defender.id, move: outcome.moveName, damage: 0 }); return;
  }
  const guarded = outcome.type === "guard";
  const defenderAirborne = defender.y > 18 || AIR_STATES.has(defender.state) || defender.state === "air_hit";
  const defenderPhase = attackPhase(defender);
  const counter = !guarded && defenderPhase === "startup";
  const punish = !guarded && (defenderPhase === "recovery" || defender.state === "landing");
  const chained = game.elapsed - defender.lastHitAt <= .9;
  const hitNumber = chained ? attacker.combo + 1 : 1;
  const scale = Math.max(COMBAT.comboScaleFloor, 1 - (hitNumber - 1) * COMBAT.comboScaleStep);
  const damage = guarded ? Math.max(1, Math.ceil(move.damage * COMBAT.chipRate)) : Math.max(1, Math.round(move.damage * scale * (counter ? 1.1 : 1)));
  defender.hp = Math.max(0, defender.hp - damage);
  defender.velocityX = attacker.facing * move.pushback * (guarded ? .35 : 1);
  if ((attacker.facing > 0 && defender.x >= WORLD.right - 12) || (attacker.facing < 0 && defender.x <= WORLD.left + 12)) attacker.velocityX = -attacker.facing * move.pushback * .7;
  game.hitstop = guarded ? move.blockstop : defender.hp <= 0 ? Math.max(.11, move.hitstop) : move.hitstop; game.shake = guarded ? .08 : defender.hp <= 0 ? .24 : move.damage >= 14 ? .2 : .12;
  if (guarded) {
    defender.stunRemaining = move.blockstun; startState(defender, "blockstun");
    const advantage = move.blockstun - Math.max(0, move.total - attacker.stateTime);
    attacker.debug.frameAdvantage = advantage; defender.debug.frameAdvantage = -advantage;
    attacker.combo = 0;
    defender.energy = Math.min(100, defender.energy + 2);
  } else {
    attacker.combo = hitNumber;
    attacker.maxCombo = Math.max(attacker.maxCombo, attacker.combo); defender.lastHitAt = game.elapsed;
    defender.yellowProtection = Math.max(0, defender.yellowProtection - move.yellowDamage);
    defender.breakoutPending ||= defender.yellowProtection === 0; defender.stunRemaining = move.hitstun + (counter ? .05 : 0);
    if (defenderAirborne) {
      defender.velocityY = move.antiAir ? 300 : Math.min(defender.velocityY, 120);
      startState(defender, "air_hit");
    } else startState(defender, move.knockdown ? "knockdown" : defender.hp <= 0 ? "ko" : defenderWasCrouched ? "hit_crouch" : "hit");
    attacker.energy = Math.min(100, attacker.energy + move.energyGain + (punish ? 5 : 0));
    defender.energy = Math.min(100, defender.energy + Math.max(1, Math.ceil(damage * .25)));
    const advantage = move.hitstun - Math.max(0, move.total - attacker.stateTime);
    attacker.debug.frameAdvantage = advantage; defender.debug.frameAdvantage = -advantage;
  }
  game.events.push({ type: guarded ? "guard" : "hit", attacker: attacker.id, defender: defender.id, damage, move: outcome.moveName, heightTag: move.heightTag, counter, punish, antiAir: !guarded && move.antiAir && defenderAirborne });
}

function separate(a, b) {
  const gap = b.x - a.x, overlap = 68 - Math.abs(gap);
  if (overlap <= 0 || a.y > 30 || b.y > 30) return;
  const n = gap >= 0 ? 1 : -1, aRoom = a.x - WORLD.left, bRoom = WORLD.right - b.x;
  const moveA = Math.min(overlap / 2, aRoom), moveB = Math.min(overlap - moveA, bRoom);
  a.x -= moveA * n; b.x += moveB * n;
  const rest = overlap - moveA - moveB;
  if (rest > 0) { if (aRoom > bRoom) a.x -= rest * n; else b.x += rest * n; }
}

function updateFacing(a, b) {
  const locked = t => ATTACK_STATES.has(t.state) || ["hit", "hit_crouch", "knockdown", "wakeup", "ko"].includes(t.state);
  if (!locked(a)) a.facing = a.x <= b.x ? 1 : -1;
  if (!locked(b)) b.facing = b.x <= a.x ? 1 : -1;
}

function clearAiInput(ai) { setDirection(ai, 0, 0); for (const k of ["guard", "p", "k", "sp"]) setButton(ai, k, false); }
function updateAI(game, dt) {
  const ai = game.enemy, player = game.player; ai.aiThink -= dt;
  if (ai.aiThink > 0 || !FREE_STATES.has(ai.state)) return;
  clearAiInput(ai); const distance = Math.abs(player.x - ai.x), roll = game.random(); ai.aiThink = .17 + game.random() * .16;
  const incoming = MOVES[player.state];
  if (incoming && player.stateTime < incoming.activeStart && roll < .34) {
    setDirection(ai, 0, incoming.heightTag === "low" ? 1 : 0); setButton(ai, "guard", true);
    ai.guardPressedAt = ai.clock - (game.random() < .08 ? .04 : .12);
  }
  else if (distance > 145) setDirection(ai, player.x < ai.x ? -1 : 1, 0);
  else if (roll < .18) { setDirection(ai, 0, 1); setButton(ai, "guard", true); }
  else if (roll < .58) setButton(ai, "p", true);
  else if (roll < .82) setButton(ai, "k", true);
  else if (ai.energy >= MOVES.special.energyCost && roll < .94) setButton(ai, "sp", true);
  else setDirection(ai, player.x < ai.x ? 1 : -1, 0);
}

function recoverProtection(target, dt, now) {
  if (now - target.lastHitAt > COMBAT.protectionRecoverDelay && !["hit", "hit_crouch", "knockdown", "protection_breakout"].includes(target.state)) target.yellowProtection = Math.min(100, target.yellowProtection + COMBAT.protectionRecoverRate * dt);
}
function endRound(game, winner, reason) {
  if (game.phase !== "fighting") return;
  endSpecialLock(game);
  game.phase = "round_end"; game.winner = winner; game.reason = reason; game.roundEndTime = 0;
  if (winner === "cat" && game.enemy.state !== "ko") startState(game.enemy, "ko");
  if (winner === "dog" && game.player.state !== "ko") startState(game.player, "ko");
  if (winner === "draw") { startState(game.player, "ko"); startState(game.enemy, "ko"); }
  game.events.push({ type: "round-end", winner, reason });
}

export function getDebugGeometry(target) {
  return { pushbox: [{ id: "pushbox", ...localRect(target, [-34, 0, 34, 168]) }], hurtboxes: hurtboxes(target), guardboxes: guardboxes(target), hitboxes: attackboxes(target), facingNormal: [target.facing, 0] };
}

export function stepGame(game, dt) {
  game.events.length = 0; dt = Math.min(.05, Math.max(0, dt));
  if (game.phase !== "fighting") {
    if (game.phase === "round_end") {
      if (game.hitstop > 0) { game.hitstop = Math.max(0, game.hitstop - dt); return; }
      game.roundEndTime += dt; game.shake = Math.max(0, game.shake - dt);
      updateState(game.player, dt); updateState(game.enemy, dt);
      applyMovement(game.player, dt); applyMovement(game.enemy, dt);
      const winner = game.winner === "cat" ? game.player : game.winner === "dog" ? game.enemy : null;
      if (winner && game.roundEndTime >= .95 && winner.y === 0 && winner.state !== "victory") startState(winner, "victory");
    }
    return;
  }
  if (game.superFreeze > 0) { game.superFreeze = Math.max(0, game.superFreeze - dt); return; }
  if (game.hitstop > 0) { game.hitstop = Math.max(0, game.hitstop - dt); return; }
  game.elapsed += dt; game.time = Math.max(0, COMBAT.roundSeconds - game.elapsed); game.shake = Math.max(0, game.shake - dt);
  if (game.specialLock) {
    const owner = game.specialLock.attacker === "cat" ? game.player : game.enemy;
    if (owner.state !== "special") endSpecialLock(game);
  }
  updateAI(game, dt); updateState(game.player, dt); updateState(game.enemy, dt);
  applyMovement(game.player, dt); applyMovement(game.enemy, dt); separate(game.player, game.enemy); updateFacing(game.player, game.enemy);
  let startedSpecialFreeze = false;
  for (const [attacker, defender] of [[game.player, game.enemy], [game.enemy, game.player]]) {
    if (attacker.state !== "special" || attacker.specialTargetValid !== null || attacker.stateTime < MOVES.special.activeStart) continue;
    attacker.specialTargetValid = specialTargetEligible(attacker, defender);
    if (attacker.specialTargetValid) { game.superFreeze = Math.max(game.superFreeze, .12); startedSpecialFreeze = true; }
    game.events.push({ type: attacker.specialTargetValid ? "special-lock" : "special-whiff", attacker: attacker.id, defender: defender.id });
  }
  if (startedSpecialFreeze) return;
  const playerOutcome = detectOutcome(game.player, game.enemy), enemyOutcome = detectOutcome(game.enemy, game.player);
  if (playerOutcome) resolveOutcome(game, game.player, game.enemy, playerOutcome);
  if (enemyOutcome) resolveOutcome(game, game.enemy, game.player, enemyOutcome);
  if (game.player.hp <= 0 || game.enemy.hp <= 0) {
    const winner = game.player.hp <= 0 && game.enemy.hp <= 0 ? "draw" : game.enemy.hp <= 0 ? "cat" : "dog";
    endRound(game, winner, winner === "draw" ? "double_ko" : "ko");
  }
  recoverProtection(game.player, dt, game.elapsed); recoverProtection(game.enemy, dt, game.elapsed);
  if (game.time <= 0) endRound(game, game.player.hp === game.enemy.hp ? "draw" : game.player.hp > game.enemy.hp ? "cat" : "dog", "time");
}
