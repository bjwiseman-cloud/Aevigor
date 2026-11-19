export type Profile = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  time_zone: string;
  consent_version: string | null;
  consent_at: string | null;
  intervals_athlete_id: string | null;
  intervals_connected_at: string | null;
  last_sync: string | null;
  last_sync_error: string | null;
  is_admin?: boolean;
  health_consent_at?: string | null;
  libido_log?: boolean;
  sex?: 'female' | 'male' | 'unspecified' | null;
};

export type Signals = {
  hrv: number | null; restingHR: number | null; sleepHours: number | null;
  feel: number | null; feelNormal: number | null; worst: boolean; sick: 'Mild' | 'Yes' | null;
  hrv7: number | null; hrvNormal: number | null; hrvLow: number | null; hrvHigh: number | null;
  rhr7: number | null; rhrNormal: number | null; rhrHigh: number | null;
};

export type DailyStatus = {
  day: string;
  status: 'GO' | 'OK' | 'CAUTION' | 'GO EASY' | 'NO DATA';
  weekly: 'OK' | 'WATCH' | 'DELOAD' | 'DELOAD - STRONG';
  weekly_why: string | null;
  reasons: string[];
  signals: Signals;
  load: { act: number; plan: number; ratio: number | null; alert: boolean } | null;
};

export type Checkin = {
  day: string;
  sleep_quality: number | null; fatigue: number | null; soreness: number | null;
  stress: number | null; mood: number | null; motivation: number | null;
  sick: 'No' | 'Mild' | 'Yes' | null; notes: string | null;
  clarity?: number | null; libido?: number | null; caffeine?: number | null; alcohol?: number | null; body_temp?: number | null;
  body?: Record<string, { sore?: number; injury?: number }> | null;
};

export const CONSENT_VERSION = 'beta-2026-11';
