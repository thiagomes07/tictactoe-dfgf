"use client";

import type { SessionTicket } from "@/lib/api/contracts";

export type IdentitySlot = "default" | "guest" | "room_host" | "room_guest";
export type RoomRole = "host" | "guest";

export interface PlayerIdentity {
  playerId: string;
  displayName: string;
}

export interface RoomSessionRecord {
  roomCode: string;
  role: RoomRole;
  playerId: string;
  displayName: string;
  session: SessionTicket;
  updatedAt: string;
}

const IDENTITY_KEY_PREFIX = "dfgf:identity:v1:";
const ROOM_SESSIONS_KEY = "dfgf:room-sessions:v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function makePlayerId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function normalizeDisplayName(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function identityKey(slot: IdentitySlot): string {
  return `${IDENTITY_KEY_PREFIX}${slot}`;
}

function loadRoomSessions(): RoomSessionRecord[] {
  if (!isBrowser()) return [];

  const raw = window.localStorage.getItem(ROOM_SESSIONS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as RoomSessionRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveRoomSessions(items: RoomSessionRecord[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(ROOM_SESSIONS_KEY, JSON.stringify(items));
}

export function getOrCreateIdentity(slot: IdentitySlot, fallbackDisplayName: string): PlayerIdentity {
  if (!isBrowser()) {
    return {
      playerId: makePlayerId(slot === "default" ? "estagiario" : slot === "room_host" ? "host-remoto" : "convidado"),
      displayName: normalizeDisplayName(fallbackDisplayName, "Estagiário(a)")
    };
  }

  const key = identityKey(slot);
  const raw = window.localStorage.getItem(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PlayerIdentity;
      if (parsed.playerId && parsed.displayName) return parsed;
    } catch {
      // Ignore invalid payload.
    }
  }

  const created: PlayerIdentity = {
    playerId: makePlayerId(slot === "default" ? "estagiario" : slot === "room_host" ? "host-remoto" : "convidado"),
    displayName: normalizeDisplayName(fallbackDisplayName, "Estagiário(a)")
  };

  window.localStorage.setItem(key, JSON.stringify(created));
  return created;
}

export function updateIdentityDisplayName(slot: IdentitySlot, displayName: string): PlayerIdentity {
  const current = getOrCreateIdentity(slot, displayName);
  const next: PlayerIdentity = {
    ...current,
    displayName: normalizeDisplayName(displayName, current.displayName)
  };

  if (isBrowser()) {
    window.localStorage.setItem(identityKey(slot), JSON.stringify(next));
  }

  return next;
}

export function saveRoomSession(record: RoomSessionRecord): void {
  const normalizedRoomCode = record.roomCode.toUpperCase();
  const current = loadRoomSessions();

  const filtered = current.filter((item) => !(item.roomCode === normalizedRoomCode && item.role === record.role));
  filtered.unshift({
    ...record,
    roomCode: normalizedRoomCode,
    updatedAt: record.updatedAt || new Date().toISOString()
  });

  saveRoomSessions(filtered.slice(0, 30));
}

export function getRoomSession(roomCode: string, role: RoomRole): RoomSessionRecord | null {
  const normalized = roomCode.toUpperCase();
  const sessions = loadRoomSessions();
  return sessions.find((item) => item.roomCode === normalized && item.role === role) ?? null;
}

export function getAnyRoomSession(roomCode: string): RoomSessionRecord | null {
  const normalized = roomCode.toUpperCase();
  const sessions = loadRoomSessions();
  return sessions.find((item) => item.roomCode === normalized) ?? null;
}

export function removeRoomSessions(roomCode: string): void {
  if (!isBrowser()) return;
  const normalized = roomCode.toUpperCase();
  const sessions = loadRoomSessions();
  const filtered = sessions.filter((item) => item.roomCode !== normalized);
  saveRoomSessions(filtered);
}
