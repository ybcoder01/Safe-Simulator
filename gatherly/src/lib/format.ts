import { DUBAI } from "./copy";
import type { Activity, Venue } from "./types";

const OFFSET = 4 * 60 * 60 * 1000;

export function dubaiParts(date: Date) {
  const shifted = new Date(date.getTime() + OFFSET);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function dubaiKey(iso: string) {
  const parts = dubaiParts(new Date(iso));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function atDubai(now: Date, dayOffset: number, hour: number, minute = 0) {
  const parts = dubaiParts(now);
  return new Date(Date.UTC(parts.year, parts.month, parts.day + dayOffset, hour - 4, minute, 0)).toISOString();
}

export function hoursFrom(now: Date, hours: number) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function nextWeekday(now: Date, weekday: number, hour: number, minute = 0) {
  const parts = dubaiParts(now);
  let delta = (weekday - parts.weekday + 7) % 7;
  if (delta === 0 && (parts.hour > hour || (parts.hour === hour && parts.minute >= minute))) delta = 7;
  return atDubai(now, delta, hour, minute);
}

export function formatWhen(iso: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: DUBAI,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: DUBAI,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return { day, time, label: `${day} · ${time}` };
}

export function greeting(now = new Date()) {
  const hour = dubaiParts(now).hour;
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function money(price: number) {
  if (price <= 0) return "Free";
  return `AED ${price}`;
}

export function firstName(name: string) {
  return name.split(" ")[0] ?? name;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function travelLabel(km: number) {
  if (km < 0.4) return "A few minutes' walk";
  if (km < 1.6) return `${Math.max(4, Math.round(km * 12))} min walk`;
  if (km < 12) return `${Math.max(8, Math.round(km * 3.5))} min across town`;
  return `${Math.round(km)} km away`;
}

export function countdown(iso: string, now: Date) {
  const diff = new Date(iso).getTime() - now.getTime();
  if (diff <= 0) return "Started";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours < 36) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}

export function icsBody(activity: Activity, venue: Venue, exact: boolean) {
  const start = new Date(activity.startsAt);
  const end = new Date(start.getTime() + activity.durationMin * 60000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const where = exact ? `${venue.name}, ${venue.exactAddress}` : `${venue.neighborhood}, Dubai`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gatherly//EN",
    "BEGIN:VEVENT",
    `UID:${activity.id}@gatherly.app`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${activity.title.replace(/[,;]/g, " ")}`,
    `LOCATION:${where.replace(/[,;]/g, " ")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function project(lat: number, lng: number) {
  const minLat = 25.05;
  const maxLat = 25.29;
  const minLng = 55.12;
  const maxLng = 55.36;
  if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) return null;
  return {
    x: ((lng - minLng) / (maxLng - minLng)) * 100,
    y: (1 - (lat - minLat) / (maxLat - minLat)) * 100,
  };
}

export function toDatetimeLocal(iso: string) {
  const parts = dubaiParts(new Date(iso));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function fromDatetimeLocal(value: string) {
  const [date, time] = value.split("T");
  if (!date || !time) return new Date().toISOString();
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!year || !month || !day || hour == null || minute == null) return new Date().toISOString();
  return new Date(Date.UTC(year, month - 1, day, hour - 4, minute, 0)).toISOString();
}

export function checkInCode(activityId: string, userId: string) {
  let hash = 2166136261;
  const value = `${activityId}:${userId}`;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(4, "0").slice(0, 4);
}
