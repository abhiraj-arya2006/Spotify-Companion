/**
 * Dayparts — what you probably want to hear at this hour.
 * Together the slots cover all 24 hours; `start`/`end` are local hours, and a
 * slot may wrap past midnight (start > end).
 */
import type { DiscoveryLevel } from '../api/client';

export interface Daypart {
  id: string;
  title: string;
  hours: string;      // shown to the user
  start: number;      // inclusive local hour
  end: number;        // exclusive local hour
  description: string;
  prompt: string;     // sent to the playlist generator
  discovery: DiscoveryLevel;
}

export const SESSION_TRACK_COUNT = 15;

export const DAYPARTS: Daypart[] = [
  {
    id: 'morning',
    title: 'Morning focus',
    hours: '7–10am',
    start: 7,
    end: 10,
    description: 'Gentle acoustics to ease into the day.',
    prompt:
      'A calm, focused morning: gentle acoustic guitar, soft indie and warm folk. Unhurried to start, building slowly in energy. No harsh or aggressive tracks.',
    discovery: 'balanced',
  },
  {
    id: 'deep-work',
    title: 'Deep work',
    hours: '10am–4pm',
    start: 10,
    end: 16,
    description: 'Instrumental flow with nothing pulling at your attention.',
    prompt:
      'Deep focused work: instrumental or near-instrumental tracks only. Post-rock, ambient electronica, modern classical and downtempo with a steady tempo. Avoid prominent vocals and sudden changes.',
    discovery: 'balanced',
  },
  {
    id: 'move',
    title: 'Workout or commute',
    hours: '4–7pm',
    start: 16,
    end: 19,
    description: 'High energy to get you moving.',
    prompt:
      'High-energy workout or commute: driving rhythms, big choruses and rising intensity. Keep the energy high throughout with a peak near the end.',
    discovery: 'familiar',
  },
  {
    id: 'evening',
    title: 'Evening wind-down',
    hours: '7–10pm',
    start: 19,
    end: 22,
    description: 'Mellow grooves for dinner and slowing down.',
    prompt:
      'A relaxed evening: mellow grooves, soul, warm indie and soft electronic. Easygoing and conversational, gradually getting calmer.',
    discovery: 'balanced',
  },
  {
    id: 'midnight',
    title: 'Midnight melancholy',
    hours: '10pm–1am',
    start: 22,
    end: 1,
    description: 'Ambient and lo-fi for the late hours.',
    prompt:
      'Midnight melancholy: ambient, lo-fi, slowcore and introspective songs. Slow tempos, soft textures, a little sad but comforting.',
    discovery: 'adventurous',
  },
  {
    id: 'small-hours',
    title: 'Small hours',
    hours: '1–7am',
    start: 1,
    end: 7,
    description: 'Near-silent ambient for sleep or a very quiet night.',
    prompt:
      'Very calm, sleep-friendly music: ambient, drone, soft piano and minimal percussion. Nothing that would wake you up.',
    discovery: 'adventurous',
  },
];

function inSlot(hour: number, d: Daypart): boolean {
  return d.start < d.end ? hour >= d.start && hour < d.end : hour >= d.start || hour < d.end;
}

export function daypartAt(date: Date = new Date()): Daypart {
  const hour = date.getHours();
  return DAYPARTS.find(d => inSlot(hour, d)) ?? DAYPARTS[0];
}

/** Router state handed to the Playlist Architect to start a session immediately. */
export interface SessionRequest {
  daypartId: string;
  prompt: string;
  discovery: DiscoveryLevel;
}
