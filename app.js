import { TempleAudio } from "./audio.js";
import {
  BUILDINGS,
  applyOfflineProgress,
  buyBurner,
  burnerCost,
  canPrestige,
  claimOffline,
  createGame,
  doPrestige,
  formatNumber,
  normalizeSave,
  passiveRate,
  prestigeBonus,
  prestigeMultiplier,
  summarize,
  tapIncense,
  tapYield,
  tick,
  upgradeBuilding,
  upgradeCost,
} from "./game.js";
import { loadSave, saveSave } from "./persist.js";

const $ = (selector) => document.querySelector(selector);
const audio = new TempleAudio();

const TIER_NAMES = ["", "一階草廟", "二階小廟", "三階廟宇", "四階名剎", "五階香火長明"];

const intro = $("#intro");
const gameView = $("#game");
const toastEl = $("#toast");
const offlineBanner = $("#offline-banner");
const prestigeSheet = $("#prestige-sheet");
const aboutSheet = $("#about-sheet");

let state = createGame();
let tickTimer = null;
let saveTimer = null;
let toastTimer = null;
let saveWarning = false;
let prestigeArmed = false;

function showToast(text, ms = 2600) {
  if (!text) return;
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, ms);
}

function showSaveWarning(error) {
  if (saveWarning) return;
  saveWarning = true;
  const code = error?.code ?? "save_failed";
  showToast(code === "functions_no_leader" ? "存檔尚未就緒，仍可繼續玩。" : "存檔同步失敗，仍可繼續玩。");
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void saveSave(state, showSaveWarning);
  }, 900);
}

function flushSave() {
  clearTimeout(saveTimer);
  void saveSave(state, showSaveWarning);
}

function tierLabel(tier) {
  return TIER_NAMES[tier] ?? TIER_NAMES[1];
}

function renderBuildings() {
  const counts = {
    burner: state.buildings.burner.count,
    bell: state.buildings.bell.level,
    hall: state.buildings.hall.level,
    lantern: state.buildings.lantern.level,
  };
  $("#building-row").innerHTML = Object.entries(counts)
    .map(([id, level]) => {
      if (level <= 0) return "";
      const icon = BUILDINGS[id].name.slice(0, 1);
      return `<span class="building-chip" data-id="${id}">${icon}×${level}</span>`;
    })
    .join("");
}

function renderShop() {
  const list = $("#shop-list");
  list.innerHTML = "";

  const burnerCard = document.createElement("article");
  burnerCard.className = "shop-card";
  const buyCost = burnerCost(state);
  const upCost = upgradeCost("burner", state.buildings.burner.level);
  burnerCard.innerHTML = `
    <img src="./assets/images/burner.png" alt="" />
    <div class="shop-copy">
      <strong>${BUILDINGS.burner.name}</strong>
      <p>${BUILDINGS.burner.desc} · 已有 ${state.buildings.burner.count} 座 · Lv.${state.buildings.burner.level}</p>
    </div>
    <div class="shop-buttons">
      <button type="button" data-action="buy-burner" ${state.incense < buyCost ? "disabled" : ""}>
        建造 ${formatNumber(buyCost)}
      </button>
      <button type="button" data-action="upgrade-burner" ${state.incense < upCost ? "disabled" : ""}>
        升級 ${formatNumber(upCost)}
      </button>
    </div>
  `;
  list.append(burnerCard);

  for (const id of ["bell", "hall", "lantern"]) {
    const spec = BUILDINGS[id];
    const level = state.buildings[id].level;
    const cost = upgradeCost(id, level);
    const card = document.createElement("article");
    card.className = "shop-card";
    card.innerHTML = `
      <img src="./assets/images/${id}.png" alt="" />
      <div class="shop-copy">
        <strong>${spec.name}</strong>
        <p>${spec.desc} · Lv.${level}</p>
      </div>
      <button type="button" data-action="upgrade-${id}" ${state.incense < cost ? "disabled" : ""}>
        升級 ${formatNumber(cost)}
      </button>
    `;
    list.append(card);
  }
}

function render() {
  const view = summarize(state);
  $("#incense-value").textContent = formatNumber(view.incense);
  $("#rate-value").textContent = `${formatNumber(view.rate)}/秒`;
  $("#tier-value").textContent = tierLabel(view.tier);
  $("#prestige-value").textContent = `×${prestigeMultiplier(state.prestige).toFixed(2)}`;
  $("#tap-yield").textContent = `+${formatNumber(tapYield(state))}`;
  $("#scene-message").textContent = view.message;
  $("#status-line").textContent = view.ascended
    ? "香火長明已達成，仍可繼續擴建廟宇。"
    : `里程碑 ${view.milestones}/${6} · 累積 ${formatNumber(state.lifetime)} 香火`;

  if (view.offlinePending > 0) {
    offlineBanner.hidden = false;
    $("#offline-text").textContent = `離線 ${view.offlineSeconds} 秒，待收 ${formatNumber(view.offlinePending)} 香火。`;
  } else {
    offlineBanner.hidden = true;
  }

  $("#prestige-button").disabled = !canPrestige(state);
  renderBuildings();
  renderShop();

  if (view.toast) showToast(view.toast);
}

function bindShopActions() {
  $("#shop-list").onclick = (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === "buy-burner") {
      state = buyBurner(state);
      audio.play("upgrade");
    } else if (action === "upgrade-burner") {
      state = upgradeBuilding(state, "burner");
      audio.play("upgrade");
    } else if (action.startsWith("upgrade-")) {
      const id = action.replace("upgrade-", "");
      state = upgradeBuilding(state, id);
      audio.play("click");
    }
    scheduleSave();
    render();
  };
}

function startLoop() {
  stopLoop();
  let last = performance.now();
  tickTimer = setInterval(() => {
    const now = performance.now();
    const delta = Math.min(0.25, (now - last) / 1000);
    last = now;
    state = tick(state, delta);
    render();
  }, 200);
}

function stopLoop() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

function suspend() {
  stopLoop();
  audio.suspend();
  flushSave();
}

function resume() {
  if (gameView.hidden) return;
  state = applyOfflineProgress(state);
  startLoop();
  audio.resume();
  render();
  scheduleSave();
}

async function boot() {
  await globalThis.PG.ready;

  const saved = await loadSave();
  if (saved) {
    state = normalizeSave(saved);
    state = applyOfflineProgress(state);
  }

  $("#sound-toggle").onclick = () => {
    audio.setEnabled(!audio.enabled);
    const on = audio.enabled;
    $("#sound-toggle").setAttribute("aria-pressed", String(on));
    $("#sound-toggle").textContent = on ? "♪ 音樂開" : "♪ 靜音";
  };

  $("#about-link").onclick = () => aboutSheet.showModal();
  $("#start-button").onclick = async () => {
    await audio.start();
    intro.hidden = true;
    gameView.hidden = false;
    render();
    startLoop();
    scheduleSave();
  };

  $("#tap-button").onclick = () => {
    state = tapIncense(state);
    audio.play("tap");
    scheduleSave();
    render();
  };

  $("#claim-offline").onclick = () => {
    state = claimOffline(state);
    audio.play("coin");
    scheduleSave();
    render();
  };

  $("#prestige-button").onclick = () => {
    prestigeArmed = false;
    const bonus = prestigeBonus(state);
    $("#prestige-copy").textContent = canPrestige(state)
      ? `將重置香爐與建築，取得永久倍率。重修後起點約 ${formatNumber(10 + bonus)} 香火。`
      : "需累積 500 香火且至少 5 座香爐，才能重修金身。";
    prestigeSheet.showModal();
  };

  $("#prestige-form").addEventListener("close", () => {
    if (prestigeSheet.returnValue !== "confirm") return;
    state = doPrestige(state);
    audio.play("incense");
    scheduleSave();
    render();
  });

  bindShopActions();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") suspend();
    else resume();
  });
  window.addEventListener("pagehide", suspend);
}

boot();
