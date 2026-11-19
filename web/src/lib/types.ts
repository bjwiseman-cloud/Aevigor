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
  athlete?: Athlete | null;
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

// Thresholds and zones per sport, copied from intervals.icu Sport Settings at each sync
export type SportSettings = {
  id?: number | null; types: string[]; ftp: number | null; indoor_ftp: number | null; w_prime: number | null; p_max: number | null;
  lthr: number | null; max_hr: number | null; threshold_pace: number | null; pace_units: string | null;
  power_zones: number[] | null; power_zone_names: string[] | null; hr_zones: number[] | null; hr_zone_names: string[] | null;
  pace_zones: number[] | null; pace_zone_names: string[] | null;
};
export type Athlete = { weight: number | null; resting_hr: number | null; sports: SportSettings[] };
