const SAVE_KEY = "templeidle:save";

export async function loadSave() {
  try {
    await globalThis.PG.ready;
    const raw = await globalThis.PG.kv.get(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveSave(state, onError) {
  try {
    await globalThis.PG.kv.put(SAVE_KEY, JSON.stringify(state));
  } catch (error) {
    onError?.(error);
  }
}
