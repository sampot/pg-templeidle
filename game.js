/** pg-templeidle — 香火放置 (增量／放置) */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function deep(o) { return JSON.parse(JSON.stringify(o)); }


export function createGame({ seed = 1 } = {}) {
  return { seed, turn: 0, score: 0, level: 1, meter: 0, resources: 10, flags: {}, log: ["香火放置：升級"], outcome: "playing", msg: "香火放置：升級" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["collect","upgradeGen","upgradeCap","prestige"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const rnd = mulberry32(s.seed + s.turn * 19);
  s.turn++;
  
  s.flags.gen = s.flags.gen ?? 1;
  s.flags.bank = s.flags.bank ?? 0;
  s.flags.offline = s.flags.offline ?? 0;
  if (action === "collect") {
    const gain = s.flags.gen * (2 + s.level);
    s.flags.bank += gain;
    s.resources += gain;
    s.meter = clamp(s.flags.bank / 5, 0, 100);
    s.score = s.flags.bank;
    s.msg = "收取香火 +"+gain;
  } else if (action === "upgradeGen") {
    if (s.flags.bank >= 10 * s.flags.gen) { s.flags.bank -= 10 * s.flags.gen; s.flags.gen++; s.msg = "香爐升級 lv"+s.flags.gen; }
    else s.msg = "香火不足";
  } else if (action === "upgradeCap") { s.level = clamp(s.level+1,1,5); s.msg = "擴大廟埕"; s.meter += 10; }
  else { if (s.flags.gen >= 3) { s.flags.gen = 1; s.flags.bank = 0; s.score += 100; s.meter = 100; s.level = 5; s.msg = "轉生加乘"; } else s.msg = "尚未可轉生"; }

  if (s.resources < 0) s.resources = 0;
  if (s.outcome === "playing" && s.level >= 5 && s.meter >= 100) {
    s.outcome = "won";
    s.msg = "目標達成！";
  }
  if (s.outcome === "playing" && (s.resources <= 0 && s.meter < 20 && s.turn > 8)) {
    s.outcome = "lost";
    s.msg = "資源崩盤";
  }
  return s;
}
export function summarize(s) {
  return { turn: s.turn, level: s.level, meter: s.meter, score: s.score, resources: s.resources, msg: s.msg, outcome: s.outcome, flags: s.flags };
}
export function getOutcome(s) { return s.outcome; }

