const USER_ID_KEY = "stem.userId";
const SAVED_ITEMS_KEY = "stem.savedItems";

export function getOrCreateUserId() {
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) {
    return existing;
  }
  const id = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, id);
  return id;
}

export function loadSavedItems() {
  const raw = localStorage.getItem(SAVED_ITEMS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

export function saveSavedItems(items) {
  localStorage.setItem(SAVED_ITEMS_KEY, JSON.stringify(items));
}
