import { cleanDisplayName, isValidGuestId } from "@whiteboard/shared";

const STORAGE_KEY = "whiteboard:guest-name";
const ID_STORAGE_KEY = "whiteboard:guest-id";

const ADJECTIVES = ["Teal", "Amber", "Coral", "Indigo", "Mint", "Ruby", "Sky", "Golden", "Violet", "Jade"];
const ANIMALS = ["Otter", "Fox", "Panda", "Koala", "Heron", "Lynx", "Robin", "Gecko", "Bison", "Moth"];

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

/** A friendly random guest name, e.g. "Guest Teal Otter". */
export function randomGuestName(): string {
  return `Guest ${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}

/** This browser's guest name, created and remembered the first time. */
export function getGuestName(): string {
  try {
    const saved = cleanDisplayName(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
    const name = randomGuestName();
    localStorage.setItem(STORAGE_KEY, name);
    return name;
  } catch {
    return randomGuestName();
  }
}

/** Save a new guest name. Returns the cleaned name, or null if it was empty or invalid. */
export function setGuestName(name: string): string | null {
  const cleaned = cleanDisplayName(name);
  if (!cleaned) return null;
  try {
    localStorage.setItem(STORAGE_KEY, cleaned);
  } catch {
    // Not remembered after a refresh, but still used for this session.
  }
  return cleaned;
}

/** A random ID this browser keeps as a guest, so a refresh keeps your role on a board. */
export function getGuestId(): string {
  try {
    const saved = localStorage.getItem(ID_STORAGE_KEY);
    if (isValidGuestId(saved)) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(ID_STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
