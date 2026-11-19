// Which activities need a Post Activity reminder, and the reminder emails. Plain JS so the node tests can use it.

export const POST_DELAY_MIN = 5;          // remind 5 minutes after the activity ends (BUILD-LIST: "fires 5 min after the activity syncs")
export const POST_MAX_AGE_H = 24;         // never remind about an activity that ended more than a day ago
export const MIN_SECS = 900;              // same 15-minute floor as the Post Activity picker

/** intervals.icu activities that ended at least 5 minutes ago (and within a day), started after the person switched
 *  reminders on, are 15 minutes or longer, and have no Post Activity answers yet. */
export function dueActivities(acts, { nowMs, sinceMs, logged }) {
  const out = [];
  for (const a of acts ?? []) {
    const id = String(a?.id ?? '');
    if (!id || logged.has(id)) continue;
    if (String(a.external_id ?? '').startsWith('aevigor-')) continue;   // logged in Aevigor itself
    const start = Date.parse(a.start_date ?? '');
    const secs = Number(a.elapsed_time ?? a.moving_time ?? 0);
    if (!Number.isFinite(start) || Number(a.moving_time ?? secs) < MIN_SECS) continue;
    const end = start + secs * 1000;
    if (start < sinceMs) continue;
    if (nowMs - end < POST_DELAY_MIN * 60000 || nowMs - end > POST_MAX_AGE_H * 3600000) continue;
    out.push({ id, name: a.name ? String(a.name).slice(0, 80) : 'your session', type: String(a.type ?? 'Other') });
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A short themed email: heading, a few lines, one button. Same colours as the invite email. */
export function reminderEmail({ heading, lines, button, url }) {
  const text = [heading, '', ...lines, '', button + ': ' + url, '', 'Turn these reminders off in Aevigor > Settings > Reminders.', 'Aevigor is a wellness log, not medical advice.'].join('\n');
  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px;color:#171615;background:#fffdf8">
  <h1 style="font-size:22px;letter-spacing:4px;margin:0 0 16px">AEVIGOR <span style="font-size:11px;border:1px solid #b4381f;color:#b4381f;padding:1px 4px;letter-spacing:2px">BETA</span></h1>
  <h2 style="font-size:18px;margin:0 0 8px">${esc(heading)}</h2>
  ${lines.map((l) => `<p style="font-size:16px;line-height:1.5;margin:8px 0">${esc(l)}</p>`).join('\n  ')}
  <p style="margin:24px 0"><a href="${esc(url)}" style="background:#b4381f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-family:Arial,sans-serif;font-weight:bold">${esc(button)}</a></p>
  <p style="font-size:12px;color:#8a8278">Turn these reminders off in Aevigor &gt; Settings &gt; Reminders. Aevigor is a wellness log, not medical advice.</p>
</div>`;
  return { html, text };
}
