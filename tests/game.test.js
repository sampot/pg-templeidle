import { describe, expect, it } from "vitest";
import {
  BUILDINGS,
  applyMilestones,
  applyOfflineProgress,
  burnerCost,
  burnerRate,
  buyBurner,
  canAfford,
  canPrestige,
  claimOffline,
  computeOfflineGain,
  createGame,
  doPrestige,
  formatDuration,
  formatNumber,
  normalizeSave,
  offlineCapSeconds,
  offlineEfficiency,
  passiveRate,
  prestigeBonus,
  prestigeMultiplier,
  tapIncense,
  tapYield,
  templeTier,
  tick,
  upgradeBuilding,
  upgradeCost,
} from "../game.js";

describe("temple idle core", () => {
  it("creates a playable starting state", () => {
    const state = createGame();
    expect(state.incense).toBeGreaterThan(0);
    expect(state.buildings.burner.count).toBe(0);
    expect(state.prestige).toBe(0);
    expect(state.message).toMatch(/點香/);
  });

  it("formats large numbers for HUD display", () => {
    expect(formatNumber(950)).toBe("950");
    expect(formatNumber(12_500)).toBe("12.5K");
    expect(formatNumber(2_500_000)).toBe("2.50M");
  });

  it("increases tap yield when the hall is upgraded", () => {
    const base = createGame();
    const upgraded = upgradeBuilding(
      { ...base, incense: 9999 },
      "hall",
    );
    expect(tapYield(upgraded)).toBeGreaterThan(tapYield(base));
  });

  it("awards incense and lifetime on each tap", () => {
    const next = tapIncense(createGame());
    expect(next.totalTaps).toBe(1);
    expect(next.incense).toBeGreaterThan(createGame().incense);
    expect(next.lifetime).toBeGreaterThan(0);
  });

  it("scales burner purchase cost with ownership", () => {
    const state = createGame();
    const first = burnerCost(state);
    state.buildings.burner.count = 5;
    expect(burnerCost(state)).toBeGreaterThan(first);
  });

  it("refuses burner purchase when incense is insufficient", () => {
    const poor = { ...createGame(), incense: 0 };
    const result = buyBurner(poor);
    expect(result.buildings.burner.count).toBe(0);
    expect(result.toast).toMatch(/需要/);
  });

  it("adds passive income from owned burners over time", () => {
    let state = createGame();
    state.buildings.burner.count = 4;
    state.buildings.bell.level = 1;
    const before = state.incense;
    state = tick(state, 10);
    expect(state.incense).toBeGreaterThan(before);
    expect(passiveRate(state)).toBeGreaterThan(0);
  });

  it("applies bell multiplier to passive rate", () => {
    const plain = createGame();
    plain.buildings.burner.count = 3;
    const boosted = structuredClone(plain);
    boosted.buildings.bell.level = 2;
    expect(passiveRate(boosted)).toBeGreaterThan(passiveRate(plain));
  });

  it("applies prestige multiplier to tap and passive gains", () => {
    const base = createGame();
    base.buildings.burner.count = 2;
    const reborn = structuredClone(base);
    reborn.prestige = 2;
    expect(prestigeMultiplier(2)).toBeGreaterThan(1);
    expect(tapYield(reborn)).toBeGreaterThan(tapYield(base));
    expect(passiveRate(reborn)).toBeGreaterThan(passiveRate(base));
  });

  it("computes bounded offline gain from lastSeen", () => {
    const state = createGame(1_000_000);
    state.buildings.burner.count = 6;
    state.buildings.lantern.level = 2;
    state.lastSeen = 1_000_000;
    const { seconds, gain } = computeOfflineGain(state, 1_000_000 + 8 * 3600 * 1000);
    expect(seconds).toBeLessThanOrEqual(offlineCapSeconds(state));
    expect(gain).toBeGreaterThan(0);
  });

  it("stores offline earnings until the player claims them", () => {
    const loaded = applyOfflineProgress(createGame(0), 7200_000);
    expect(loaded.offlinePending).toBe(0);
    const rich = createGame(0);
    rich.buildings.burner.count = 8;
    rich.lastSeen = 0;
    const pending = applyOfflineProgress(rich, 3_600_000);
    expect(pending.offlinePending).toBeGreaterThan(0);
    const claimed = claimOffline(pending);
    expect(claimed.offlinePending).toBe(0);
    expect(claimed.incense).toBeGreaterThan(pending.incense - pending.offlinePending);
  });

  it("requires minimum progress before prestige", () => {
    expect(canPrestige(createGame())).toBe(false);
    const ready = createGame();
    ready.lifetime = 600;
    ready.buildings.burner.count = 6;
    expect(canPrestige(ready)).toBe(true);
  });

  it("resets buildings but keeps prestige after rebirth", () => {
    const ready = createGame();
    ready.incense = 999;
    ready.lifetime = 700;
    ready.buildings.burner.count = 6;
    ready.buildings.bell.level = 2;
    const reborn = doPrestige(ready);
    expect(reborn.prestige).toBe(1);
    expect(reborn.buildings.burner.count).toBe(0);
    expect(reborn.buildings.bell.level).toBe(0);
    expect(reborn.incense).toBeGreaterThan(0);
  });

  it("marks ascension after three prestige rebirths", () => {
    let state = createGame();
    state.lifetime = 700;
    state.buildings.burner.count = 6;
    state = doPrestige(state);
    state.lifetime = 700;
    state.buildings.burner.count = 6;
    state = doPrestige(state);
    state.lifetime = 700;
    state.buildings.burner.count = 6;
    state = doPrestige(state);
    expect(state.prestige).toBe(3);
    expect(state.ascended).toBe(true);
  });

  it("unlocks milestones as progress grows", () => {
    let state = tapIncense(createGame());
    state = applyMilestones(state);
    expect(state.milestones).toContain("first_tap");
  });

  it("advances temple tier with lifetime incense", () => {
    const state = createGame();
    state.lifetime = 300;
    expect(templeTier(state)).toBe(2);
    state.lifetime = 3000;
    expect(templeTier(state)).toBe(3);
  });

  it("raises upgrade costs per building level", () => {
    expect(upgradeCost("hall", 2)).toBeGreaterThan(upgradeCost("hall", 0));
    expect(BUILDINGS.bell.upgradeBase).toBeGreaterThan(0);
  });

  it("normalizes corrupt saves back to a safe shape", () => {
    const restored = normalizeSave({ incense: "bad", buildings: { burner: { count: 2 } } });
    expect(restored.buildings.burner.count).toBe(2);
    expect(typeof restored.incense).toBe("number");
  });

  it("formats offline duration for the claim banner", () => {
    expect(formatDuration(90)).toMatch(/分/);
    expect(formatDuration(7200)).toMatch(/小時/);
  });

  it("increases offline efficiency with lantern upgrades", () => {
    const base = offlineEfficiency(createGame());
    const lit = createGame();
    lit.buildings.lantern.level = 3;
    expect(offlineEfficiency(lit)).toBeGreaterThan(base);
  });

  it("computes burner rate from count and level", () => {
    expect(burnerRate(0, 1)).toBe(0);
    expect(burnerRate(4, 2)).toBeGreaterThan(burnerRate(2, 1));
  });

  it("blocks upgrades when incense is too low", () => {
    const broke = createGame();
    broke.incense = 0;
    const result = upgradeBuilding(broke, "bell");
    expect(result.buildings.bell.level).toBe(0);
    expect(result.toast).toMatch(/需要/);
  });

  it("uses canAfford helper consistently", () => {
    const state = createGame();
    expect(canAfford(state, state.incense)).toBe(true);
    expect(canAfford(state, state.incense + 1)).toBe(false);
  });

  it("estimates prestige starting bonus from lifetime progress", () => {
    const rich = createGame();
    rich.lifetime = 1200;
    rich.buildings.burner.count = 8;
    expect(prestigeBonus(rich)).toBeGreaterThan(prestigeBonus(createGame()));
  });
});
