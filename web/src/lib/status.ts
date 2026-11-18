// Traffic light wording (live app v8, Ben 2026-11-18): GO and OK share green "Ready to train"; no Tron taglines. Classes are written out in full so Tailwind keeps them.
export const STATUS = {
  'GO': { cls: 'text-status-go border-status-go', icon: '🟢', head: 'Ready to train', tag: '',
    advice: 'Everything lines up. Do the planned session as written.',
    do: 'The hard session as planned, tests included', avoid: 'Adding unplanned extra volume just because you feel good',
    watch: 'Sleep tonight, and finish sessions by about 9 pm' },
  'OK': { cls: 'text-status-go border-status-go', icon: '🟢', head: 'Ready to train', tag: '',
    advice: 'Green light. Train as planned.',
    do: 'Train as planned, hard sessions included', avoid: 'Max tests if Feel or sleep are only so-so',
    watch: 'Sleep tonight, and finish sessions by about 9 pm' },
  'CAUTION': { cls: 'text-status-caution border-status-caution', icon: '🟡', head: 'Train with care', tag: '',
    advice: 'Train, but let the warm-up decide.',
    do: 'Full 15-min warm-up, then keep the hard work only if HR and effort feel normal',
    avoid: 'Max tests, PR attempts, very long threshold efforts',
    watch: 'HR higher than usual at the same power, or effort 1-2 RPE harder: switch to easy' },
  'GO EASY': { cls: 'text-status-easy border-status-easy', icon: '🔴', head: 'Go easy today', tag: '',
    advice: 'Recovery day. Swap the planned session for something easy.',
    do: 'Easy spin up to 60 min, walk or mobility', avoid: 'Intervals, tests, HIIT, competitive racket sports',
    watch: 'Sore throat, fever or unusual tiredness: rest fully. Extra sleep tonight' },
  'NO DATA': { cls: 'text-status-none border-status-none', icon: '⏳', head: 'Waiting for data', tag: '',
    advice: 'No reading yet today.',
    do: 'Sync your watch, do your check-in, then tap Sync', avoid: 'Guessing: go by feel and keep it moderate',
    watch: 'Wear your watch overnight so HRV and resting HR are recorded' }
} as const;

export const WEEKLY = {
  'OK': { cls: 'text-status-ok border-status-ok', icon: '✅', text: 'No deload needed.' },
  'WATCH': { cls: 'text-status-caution border-status-caution', icon: '👀', text: 'Watch the next 1-2 mornings. Avoid two hard days in a row.' },
  'DELOAD': { cls: 'text-status-deload border-status-deload', icon: '🔻', text: 'Make this an easier week: cut volume 30-40%, keep one short quality session.' },
  'DELOAD - STRONG': { cls: 'text-status-easy border-status-easy', icon: '🛑', text: 'Take 3-5 easy days, extra sleep, good food.' }
} as const;

export const DOT = { good: 'bg-status-ok', warn: 'bg-status-caution', bad: 'bg-status-warn', none: 'bg-status-none' } as const;
export type Dot = keyof typeof DOT;
