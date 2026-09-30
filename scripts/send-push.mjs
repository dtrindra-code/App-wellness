// Sends one content-less push {"slot": "..."} to the phone(s) subscribed in the app.
// Run by .github/workflows/push.yml. The service worker turns the slot into the
// personalised message the app pre-computed on the phone: no personal data here.
//
// Env:
//   VAPID_PRIVATE_KEY  (secret)  private half of the key pair whose public half is in src/lib/notify.ts
//   PUSH_SUBSCRIPTION  (secret)  the JSON copied from the app (Plus → Notifications); an array works too
//   SLOT               optional: matin | midi | aprem | soir | bilan | auto (manual runs)
//   SCHEDULE           optional: the cron that triggered the run (github.event.schedule)
//
// Slots in Europe/Paris local time: matin 8 h, midi 12 h, aprem 16 h, soir 20 h
// (not on Sunday), bilan Sunday 19 h. Crons run at both candidate UTC hours (summer
// UTC+2 / winter UTC+1); this script sends only when the Paris hour matches.

const VAPID_PUBLIC_KEY =
  'BIwA6s2biy2_PJaKcEvSIq6GDByJKcLG1UAf2uhXq3thppGonD6t_CXNdABbsWPavrRsyxYfn1N6kkhq4jBZ1mk';
const SLOTS = ['matin', 'midi', 'aprem', 'soir', 'bilan'];
const TZ = 'Europe/Paris';

const env = process.env;
const notice = (msg) => console.log(env.GITHUB_ACTIONS ? `::notice::${msg}` : msg);
const warn = (msg) => console.log(env.GITHUB_ACTIONS ? `::warning::${msg}` : `Attention : ${msg}`);
const fail = (msg) => console.log(env.GITHUB_ACTIONS ? `::error::${msg}` : `Erreur : ${msg}`);

/** Paris local weekday (0 = Sunday) and hour at `date`. */
function parisTime(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { weekday: wd, hour: Number(parts.hour), minute: Number(parts.minute) };
}

function slotForParis({ weekday, hour }) {
  if (weekday === 0 && hour === 19) return 'bilan';
  if (hour === 8) return 'matin';
  if (hour === 12) return 'midi';
  if (hour === 16) return 'aprem';
  if (hour === 20 && weekday !== 0) return 'soir'; // Sunday evening: the bilan replaces it
  return null;
}

/**
 * The instant the run was scheduled for. GitHub often starts cron jobs late, so we use
 * the cron's own hour (github.event.schedule) rather than the clock when it is known.
 */
function scheduledInstant(now, schedule) {
  const m = /^\s*(\d+)\s+(\d+)\s/.exec(schedule || '');
  if (!m) return now;
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Number(m[2]), Number(m[1])));
  if (at.getTime() > now.getTime() + 5 * 60_000) at.setUTCDate(at.getUTCDate() - 1); // started after midnight UTC
  return at;
}

function pickSlot(now) {
  const manual = (env.SLOT || '').trim();
  if (manual && manual !== 'auto') {
    if (!SLOTS.includes(manual)) {
      fail(`Moment inconnu « ${manual} » (attendu : ${SLOTS.join(', ')}).`);
      process.exit(1);
    }
    return manual;
  }
  const at = scheduledInstant(now, env.SCHEDULE);
  const lateMin = (now.getTime() - at.getTime()) / 60_000;
  const paris = parisTime(at);
  const slot = slotForParis(paris);
  const hh = `${String(paris.hour).padStart(2, '0')}:${String(paris.minute).padStart(2, '0')}`;
  if (!slot) {
    notice(`Il est ${hh} à Paris pour ce créneau : pas de notification prévue (l’autre horaire UTC couvre l’heure d’été/d’hiver).`);
    return null;
  }
  if (lateMin > 150) {
    warn(`Le cron a démarré avec ${Math.round(lateMin)} min de retard : notification « ${slot} » ignorée pour ne pas arriver à contretemps.`);
    return null;
  }
  return slot;
}

function parseSubscriptions(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    fail('PUSH_SUBSCRIPTION n’est pas un JSON valide : recopie-le depuis l’app (Plus → Notifications → Copier).');
    process.exit(1);
  }
  const list = (Array.isArray(data) ? data : [data]).filter((s) => s && typeof s.endpoint === 'string' && s.keys?.p256dh && s.keys?.auth);
  if (!list.length) {
    fail('PUSH_SUBSCRIPTION ne contient pas d’abonnement valide (endpoint + keys).');
    process.exit(1);
  }
  return list;
}

async function main() {
  const privateKey = (env.VAPID_PRIVATE_KEY || '').trim();
  const rawSub = (env.PUSH_SUBSCRIPTION || '').trim();
  if (!privateKey || !rawSub) {
    notice('Secrets VAPID_PRIVATE_KEY / PUSH_SUBSCRIPTION absents : rien à envoyer (voir docs/NOTIFICATIONS.md).');
    return;
  }

  const slot = pickSlot(new Date());
  if (!slot) return;

  const subs = parseSubscriptions(rawSub);
  const { default: webpush } = await import('web-push');
  const repo = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}` : null;
  const subject = repo || 'mailto:cap-maldives@example.com';
  try {
    webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY, privateKey);
  } catch (e) {
    fail(`Clé VAPID invalide : ${e.message}. Vérifie le secret VAPID_PRIVATE_KEY.`);
    process.exit(1);
  }

  const payload = JSON.stringify({ slot });
  let expired = 0;
  let failed = 0;
  for (const [i, sub] of subs.entries()) {
    const who = subs.length > 1 ? ` (appareil ${i + 1})` : '';
    const host = (() => { try { return new URL(sub.endpoint).host; } catch { return '?'; } })();
    try {
      const res = await webpush.sendNotification(sub, payload, { TTL: 3 * 3600, urgency: 'normal' });
      console.log(`Notification « ${slot} » envoyée${who} via ${host} (HTTP ${res.statusCode}).`);
    } catch (e) {
      const code = e.statusCode;
      if (code === 404 || code === 410) {
        expired++;
        fail(`Abonnement expiré${who} (HTTP ${code}) : dans l’app, Plus → Notifications → « Activer les notifications », puis remplace le secret PUSH_SUBSCRIPTION par le nouveau JSON.`);
      } else {
        failed++;
        fail(`Envoi impossible${who} via ${host}${code ? ` (HTTP ${code})` : ''} : ${e.body || e.message}`);
      }
    }
  }
  if (expired || failed) process.exit(1);
}

main().catch((e) => {
  fail(e?.stack || String(e));
  process.exit(1);
});
