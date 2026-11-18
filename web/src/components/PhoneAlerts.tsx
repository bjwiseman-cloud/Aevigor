// Turns phone alerts (Web Push) on or off for this device. iPhone needs the app added to the Home Screen first (iOS 16.4+).
import { useEffect, useState } from 'react';
import { HelpButton } from '@/components/Help';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { callApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function toBytes(b64: string) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function PhoneAlerts() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supported()) return;
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setOn(!!s)).catch(() => {});
  }, []);

  const turnOn = async () => {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Alerts are blocked for this site. Allow notifications in your browser or phone settings, then try again.');
    const { publicKey } = await callApi<{ publicKey: string }>('push-key');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) });
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const { error } = await supabase.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: navigator.userAgent.slice(0, 120) }, { onConflict: 'endpoint' });
    if (error) throw error;
  };
  const turnOff = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  };
  const toggle = async (v: boolean) => {
    setBusy(true);
    try { if (v) await turnOn(); else await turnOff(); setOn(v); toast.success(v ? 'Phone alerts on for this device' : 'Phone alerts off'); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!supported()) {
    return <p className="text-muted-foreground">{isIos() && !standalone() ? 'On iPhone, add Aevigor to your Home Screen first (Share › Add to Home Screen), open it from there, then turn alerts on here.' : 'This browser cannot show phone alerts. In-app reminders still work.'}</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <span>Phone alerts on this device <HelpButton topic="phone-alerts" /><span className="block text-xs text-muted-foreground">Your reminders and appointment alerts, even when the app is closed</span></span>
        <Switch checked={on} disabled={busy} onCheckedChange={toggle} aria-label="Phone alerts on this device" />
      </div>
      {on && <Button variant="outline" size="sm" onClick={() => callApi('push-test').then(() => toast.success('Test alert sent')).catch((e) => toast.error(e.message))}>Send a test alert</Button>}
      <p className="text-xs text-muted-foreground">Alerts show the names you gave your items on your lock screen. Turn this off on shared phones.</p>
    </div>
  );
}
