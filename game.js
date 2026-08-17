/** @typedef {"burner"|"bell"|"hall"|"lantern"} BuildingId */

export const SAVE_VERSION = 1;
export const MAX_OFFLINE_SECONDS = 14_400;
export const BASE_OFFLINE_SECONDS = 3_600;

export const BUILDINGS = Object.freeze({
  burner: {
    id: "burner",
    name: "香爐",
    action: "buy",
    desc: "自動聚攢香火",
    baseCost: 12,
    costGrowth: 1.13,
    upgradeBase: 25,
    upgradeGrowth: 1.45,
  },
  bell: {
    id: "bell",
    name: "鐘樓",
    action: "upgrade",
    desc: "提升自動香火倍率",
    upgradeBase: 40,
    upgradeGrowth: 1.55,
  },
  hall: {
    id: "hall",
    name: "正殿",
    action: "upgrade",
    desc: "強化點香收益",
    upgradeBase: 28,
    upgradeGrowth: 1.48,
  },
  lantern: {
    id: "lantern",
    name: "長明燈",
    action: "upgrade",
    desc: "延長離線收益效率",
    upgradeBase: 35,
    upgradeGrowth: 1.42,
  },
});

export const MILESTONES = Object.freeze([
  { id: "first_tap", need: (s) => s.totalTaps >= 1, label: "初炷點燃" },
  { id: "ten_burners", need: (s) => s.buildings.burner.count >= 10, label: "十爐同燃" },
  { id: "tier2", need: (s) => s.lifetime >= 250, label: "香火漸旺" },
  { id: "tier3", need: (s) => s.lifetime >= 2_500, label: "廟宇成形" },
  { id: "first_prestige", need: (s) => s.prestige >= 1, label: "金身初成" },
  { id: "prestige3", need: (s) => s.prestige >= 3, label: "香火長明" },
]);

const clone = (value) => structuredClone(value);

export function createGame(now = Date.now()) {
  return {
    version: SAVE_VERSION,
    incense: 8,
    lifetime: 0,
    buildings: {
      burner: { count: 0, level: 1 },
      bell: { level: 0 },
      hall: { level: 0 },
      lantern: { level: 0 },
    },
    prestige: 0,
    lastSeen: now,
    offlinePending: 0,
    offlineSeconds: 0,
    tier: 1,
    milestones: [],
    totalTaps: 0,
    message: "點香爐添一炷香，再建造香爐讓香火自動聚攢。",
    toast: "",
    ascended: false,
  };
}

export function formatNumber(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return Math.floor(n).toLocaleString("zh-Hant");
}

export function prestigeMultiplier(prestige) {
  return 1 + Math.max(0, prestige) * 0.35;
}

export function bellMultiplier(level) {
  return 1 + Math.max(0, level) * 0.22;
}

export function burnerRate(count, level) {
  if (count <= 0) return 0;
  return count * (0.65 + Math.max(1, level) * 0.35);
}

export function passiveRate(state) {
  const { count, level } = state.buildings.burner;
  const base = burnerRate(count, level);
  return base * bellMultiplier(state.buildings.bell.level) * prestigeMultiplier(state.prestige);
}

export function tapYield(state) {
  const hall = state.buildings.hall.level;
  const base = 1.5 + hall * 1.8 + Math.min(8, state.buildings.burner.count * 0.08);
  return base * prestigeMultiplier(state.prestige);
}

export function burnerCost(state) {
  const count = state.buildings.burner.count;
  return Math.ceil(BUILDINGS.burner.baseCost * BUILDINGS.burner.costGrowth ** count);
}

export function upgradeCost(id, level) {
  const spec = BUILDINGS[id];
  return Math.ceil(spec.upgradeBase * spec.upgradeGrowth ** Math.max(0, level));
}

export function offlineCapSeconds(state) {
  const bonus = state.buildings.lantern.level * 1_800;
  return Math.min(MAX_OFFLINE_SECONDS, BASE_OFFLINE_SECONDS + bonus);
}

export function offlineEfficiency(state) {
  return 0.45 + state.buildings.lantern.level * 0.12;
}

export function canAfford(state, cost) {
  return state.incense >= cost;
}

export function templeTier(state) {
  if (state.prestige >= 3) return 5;
  if (state.prestige >= 1) return 4;
  if (state.lifetime >= 2_500) return 3;
  if (state.lifetime >= 250) return 2;
  return 1;
}

export function tick(state, deltaSeconds) {
  const next = clone(state);
  if (deltaSeconds <= 0) return next;
  const gain = passiveRate(next) * deltaSeconds;
  if (gain > 0) {
    next.incense += gain;
    next.lifetime += gain;
  }
  next.lastSeen = Date.now();
  next.tier = templeTier(next);
  return applyMilestones(next);
}

export function tapIncense(state) {
  const next = clone(state);
  const gain = tapYield(next);
  next.incense += gain;
  next.lifetime += gain;
  next.totalTaps += 1;
  next.message = `添香 +${formatNumber(gain)}`;
  next.toast = "";
  next.tier = templeTier(next);
  return applyMilestones(next);
}

export function buyBurner(state) {
  const cost = burnerCost(state);
  if (!canAfford(state, cost)) {
    return { ...state, toast: `需要 ${formatNumber(cost)} 香火才能建香爐。` };
  }
  const next = clone(state);
  next.incense -= cost;
  next.buildings.burner.count += 1;
  next.message = `新香爐點燃，自動 +${formatNumber(burnerRate(1, next.buildings.burner.level))}/秒。`;
  next.toast = "";
  next.tier = templeTier(next);
  return applyMilestones(next);
}

export function upgradeBuilding(state, id) {
  if (!BUILDINGS[id]) return state;
  const building = state.buildings[id];
  const level = id === "burner" ? building.level : building.level;
  const cost = upgradeCost(id, level);
  if (!canAfford(state, cost)) {
    return { ...state, toast: `需要 ${formatNumber(cost)} 香火。` };
  }

  const next = clone(state);
  next.incense -= cost;
  if (id === "burner") {
    next.buildings.burner.level += 1;
    next.message = `香爐升級至 Lv.${next.buildings.burner.level}，產速提升。`;
  } else {
    next.buildings[id].level += 1;
    next.message = `${BUILDINGS[id].name} 升級至 Lv.${next.buildings[id].level}。`;
  }
  next.toast = "";
  next.tier = templeTier(next);
  return applyMilestones(next);
}

export function computeOfflineGain(state, now = Date.now()) {
  const elapsed = Math.max(0, Math.floor((now - state.lastSeen) / 1000));
  const seconds = Math.min(offlineCapSeconds(state), elapsed);
  const rate = passiveRate(state);
  const gain = rate * seconds * offlineEfficiency(state);
  return { seconds, gain: Math.floor(gain * 100) / 100 };
}

export function applyOfflineProgress(state, now = Date.now()) {
  const next = clone(state);
  const { seconds, gain } = computeOfflineGain(next, now);
  if (gain <= 0 || seconds < 30) {
    next.offlinePending = 0;
    next.offlineSeconds = 0;
    next.lastSeen = now;
    return next;
  }
  next.offlinePending = gain;
  next.offlineSeconds = seconds;
  next.message = `離線 ${formatDuration(seconds)}，可收取 ${formatNumber(gain)} 香火。`;
  return next;
}

export function claimOffline(state) {
  if (state.offlinePending <= 0) {
    return { ...state, toast: "目前沒有可收的離線香火。" };
  }
  const next = clone(state);
  next.incense += next.offlinePending;
  next.lifetime += next.offlinePending;
  next.message = `收取離線香火 +${formatNumber(next.offlinePending)}。`;
  next.toast = "";
  next.offlinePending = 0;
  next.offlineSeconds = 0;
  next.lastSeen = Date.now();
  next.tier = templeTier(next);
  return applyMilestones(next);
}

export function prestigeBonus(state) {
  return Math.floor(Math.sqrt(state.lifetime / 120) + state.buildings.burner.count * 0.4);
}

export function canPrestige(state) {
  return state.lifetime >= 500 && state.buildings.burner.count >= 5;
}

export function doPrestige(state) {
  if (!canPrestige(state)) {
    return {
      ...state,
      toast: "需累積 500 香火且至少 5 座香爐，才能重修金身。",
    };
  }
  const next = clone(state);
  const bonus = prestigeBonus(next);
  next.prestige += 1;
  next.incense = 10 + bonus;
  next.buildings = {
    burner: { count: 0, level: 1 },
    bell: { level: 0 },
    hall: { level: 0 },
    lantern: { level: 0 },
  };
  next.offlinePending = 0;
  next.offlineSeconds = 0;
  next.lastSeen = Date.now();
  next.message = `金身重修完成！永久倍率 +35%，起點香火 ${formatNumber(next.incense)}。`;
  next.toast = "";
  next.tier = templeTier(next);
  if (next.prestige >= 3) next.ascended = true;
  return applyMilestones(next);
}

export function applyMilestones(state) {
  const next = clone(state);
  const unlocked = new Set(next.milestones);
  for (const milestone of MILESTONES) {
    if (!unlocked.has(milestone.id) && milestone.need(next)) {
      unlocked.add(milestone.id);
      next.toast = `達成：${milestone.label}`;
    }
  }
  next.milestones = [...unlocked];
  next.tier = templeTier(next);
  if (next.prestige >= 3) next.ascended = true;
  return next;
}

export function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours} 小時 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分`;
  return `${totalSeconds} 秒`;
}

export function summarize(state) {
  return {
    incense: state.incense,
    rate: passiveRate(state),
    tap: tapYield(state),
    tier: state.tier,
    prestige: state.prestige,
    ascended: state.ascended,
    offlinePending: state.offlinePending,
    offlineSeconds: state.offlineSeconds,
    milestones: state.milestones.length,
    message: state.message,
    toast: state.toast,
  };
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeSave(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") return createGame(now);
  const base = createGame(now);
  const merged = {
    ...base,
    incense: asNumber(raw.incense, base.incense),
    lifetime: asNumber(raw.lifetime, base.lifetime),
    prestige: asNumber(raw.prestige, base.prestige),
    lastSeen: asNumber(raw.lastSeen, now),
    offlinePending: asNumber(raw.offlinePending, base.offlinePending),
    offlineSeconds: asNumber(raw.offlineSeconds, base.offlineSeconds),
    totalTaps: asNumber(raw.totalTaps, base.totalTaps),
    message: typeof raw.message === "string" ? raw.message : base.message,
    toast: typeof raw.toast === "string" ? raw.toast : "",
    ascended: Boolean(raw.ascended),
    buildings: {
      burner: {
        count: asNumber(raw.buildings?.burner?.count, base.buildings.burner.count),
        level: asNumber(raw.buildings?.burner?.level, base.buildings.burner.level),
      },
      bell: { level: asNumber(raw.buildings?.bell?.level, base.buildings.bell.level) },
      hall: { level: asNumber(raw.buildings?.hall?.level, base.buildings.hall.level) },
      lantern: {
        level: asNumber(raw.buildings?.lantern?.level, base.buildings.lantern.level),
      },
    },
    milestones: Array.isArray(raw.milestones) ? raw.milestones : [],
  };
  merged.tier = templeTier(merged);
  merged.ascended = merged.prestige >= 3;
  return applyMilestones(merged);
}
