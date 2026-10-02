#!/usr/bin/env python3
"""Garmin Connect -> Pep's, run by .github/workflows/garmin.yml (see docs/GARMIN.md).

Reads the last N days from Garmin Connect (unofficial `garminconnect` library: Garmin's
official API is for businesses only) and writes them ENCRYPTED into the user's secret gist,
next to the app's encrypted backup. The app downloads the file and decrypts it on the phone.

Gist files (same gist as the backup 'cap-maldives-backup.json', else one created here):
  peps-garmin.enc.json       {app:'peps-garmin', v:1, updatedAt, iv, data}
  peps-garmin-auth.enc.json  {app:'peps-garmin-auth', v:1, updatedAt, iv, data}  (Garmin tokens)
`data` = base64(AES-GCM-256(GARMIN_SYNC_KEY, 12-byte iv, utf-8 JSON)), the 16-byte tag appended
at the end: exactly what WebCrypto's AES-GCM encrypt/decrypt produce and expect.

Decrypted Garmin data:
  {"days": {"YYYY-MM-DD": {"sleepH", "bodyBattery", "stress", "restingHr", "steps"}},
   "activities": [{"id", "date", "time", "type", "minutes", "distanceKm", "avgHr", "calories"}],
   "run": {"at", "from", "to", "days", "activities"}}
Merged with the previous file so older days stay (last 60 days kept).

Body Battery "at wake-up": Garmin's daily summary field `bodyBatteryAtWakeTime` when present;
else the reading closest after the end of the night's sleep (body battery report); else the
highest reading before noon. That is the morning charge the app's recovery flag expects.

THE REPO IS PUBLIC: logs only ever print counts ("3 jours, 2 activités") and error kinds,
never values, dates of activities, names or Garmin error texts.

Env: GARMIN_EMAIL, GARMIN_PASSWORD, GARMIN_SYNC_KEY (base64 32 bytes, generated in the app),
GIST_TOKEN (fine-grained token, Gists read/write), DAYS (optional, default 3).
Exit 0 when secrets are missing or Garmin is temporarily unreachable/rate-limited (no noisy
red runs); exit 1 on a real failure (wrong password, bad key, refused GitHub token).
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import os
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

TZ_NAME = "Europe/Paris"
API = "https://api.github.com"
BACKUP_FILE = "cap-maldives-backup.json"
DATA_FILE = "peps-garmin.enc.json"
AUTH_FILE = "peps-garmin-auth.enc.json"
GIST_DESCRIPTION = "Pep’s — Garmin"
KEEP_DAYS = 60
MAX_DAYS = 30

GH = bool(os.environ.get("GITHUB_ACTIONS"))


# ---------- logging (counts only) ----------

def _annot(kind: str, msg: str) -> None:
    print(f"::{kind}::{msg}" if GH else msg, flush=True)


def notice(msg: str) -> None:
    _annot("notice", msg)


def warn(msg: str) -> None:
    _annot("warning", msg if GH else f"Attention : {msg}")


def error(msg: str) -> None:
    _annot("error", msg if GH else f"Erreur : {msg}")


def summary(msg: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        try:
            with open(path, "a", encoding="utf-8") as f:
                f.write(msg + "\n")
        except OSError:
            pass


def silence_libraries() -> None:
    """garminconnect logs exceptions (URLs, server texts): keep every library quiet."""
    logging.getLogger().addHandler(logging.NullHandler())
    for name in ("garminconnect", "urllib3", "requests", "curl_cffi"):
        lg = logging.getLogger(name)
        lg.setLevel(logging.CRITICAL + 1)
        lg.propagate = False
        lg.addHandler(logging.NullHandler())


class Fail(Exception):
    """Real failure: exit 1 with this (personal-data-free) message."""


class Skip(Exception):
    """Temporary problem: exit 0 with a warning."""


# ---------- crypto (WebCrypto compatible) ----------

def parse_key(b64: str) -> bytes:
    s = "".join(b64.split())
    s = s.replace("-", "+").replace("_", "/")
    s += "=" * (-len(s) % 4)
    try:
        raw = base64.b64decode(s, validate=True)
    except (binascii.Error, ValueError) as e:
        raise Fail("GARMIN_SYNC_KEY n’est pas une clé valide : recopie-la depuis l’app (Plus → Garmin Connect).") from e
    if len(raw) != 32:
        raise Fail("GARMIN_SYNC_KEY doit faire 32 octets : recopie-la depuis l’app (Plus → Garmin Connect).")
    return raw


def encrypt_json(obj: Any, key: bytes, app: str) -> dict[str, Any]:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    iv = os.urandom(12)
    plain = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ct = AESGCM(key).encrypt(iv, plain, None)  # ciphertext || 16-byte tag, like WebCrypto
    return {
        "app": app,
        "v": 1,
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "iv": base64.b64encode(iv).decode("ascii"),
        "data": base64.b64encode(ct).decode("ascii"),
    }


def decrypt_json(payload: dict[str, Any], key: bytes, app: str) -> Any:
    """Decrypted JSON, or None when the file is not ours / was made with another key."""
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    if not isinstance(payload, dict) or payload.get("app") != app or payload.get("v") != 1:
        return None
    try:
        iv = base64.b64decode(payload["iv"])
        ct = base64.b64decode(payload["data"])
        return json.loads(AESGCM(key).decrypt(iv, ct, None).decode("utf-8"))
    except (InvalidTag, KeyError, ValueError, TypeError):
        return None


# ---------- GitHub gist ----------

class Gist:
    def __init__(self, token: str):
        import requests

        self.s = requests.Session()
        self.s.headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "peps-garmin-sync",
        })

    def _req(self, method: str, path: str, **kw: Any) -> Any:
        import requests

        try:
            r = self.s.request(method, API + path, timeout=30, **kw)
        except requests.RequestException as e:
            raise Skip(f"GitHub injoignable ({type(e).__name__}) : on réessaie au prochain passage.") from e
        if r.status_code == 401:
            raise Fail("GitHub refuse GIST_TOKEN (401) : le code est expiré ou mal copié. Remets le même code github_pat_ que pour la sauvegarde.")
        if r.status_code in (403, 404):
            if r.status_code == 403 and r.headers.get("x-ratelimit-remaining") == "0":
                raise Skip("Limite de l’API GitHub atteinte : on réessaie au prochain passage.")
            raise Fail(f"GIST_TOKEN n’a pas le droit d’accéder aux Gists ({r.status_code}). Il faut la permission « Gists : Read and write ».")
        if r.status_code >= 500:
            raise Skip(f"GitHub a une panne passagère ({r.status_code}) : on réessaie au prochain passage.")
        if not r.ok:
            raise Fail(f"GitHub a refusé la demande ({r.status_code}).")
        return r.json()

    def find(self) -> dict[str, Any] | None:
        """Backup gist (most recent), else a gist already holding the Garmin file."""
        gists: list[dict[str, Any]] = []
        for page in range(1, 4):
            batch = self._req("GET", f"/gists?per_page=100&page={page}")
            gists.extend(batch)
            if len(batch) < 100:
                break
        for name in (BACKUP_FILE, DATA_FILE):
            hits = [g for g in gists if name in (g.get("files") or {})]
            if hits:
                hits.sort(key=lambda g: g.get("updated_at", ""), reverse=True)
                return hits[0]
        return None

    def get(self, gist_id: str) -> dict[str, Any]:
        return self._req("GET", f"/gists/{gist_id}")

    def file_json(self, gist: dict[str, Any], name: str) -> Any:
        f = (gist.get("files") or {}).get(name)
        if not f:
            return None
        text = f.get("content") or ""
        if f.get("truncated") and f.get("raw_url"):
            import requests

            try:
                r = self.s.get(f["raw_url"], timeout=30)
                r.raise_for_status()
                text = r.text
            except requests.RequestException:
                return None
        try:
            return json.loads(text)
        except ValueError:
            return None

    def create(self, files: dict[str, str]) -> dict[str, Any]:
        body = {"description": GIST_DESCRIPTION, "public": False, "files": {k: {"content": v} for k, v in files.items()}}
        return self._req("POST", "/gists", json=body)

    def update(self, gist_id: str, files: dict[str, str]) -> dict[str, Any]:
        # Only the listed files change: the app's backup file is left untouched.
        return self._req("PATCH", f"/gists/{gist_id}", json={"files": {k: {"content": v} for k, v in files.items()}})


# ---------- Garmin ----------

def _status_of(e: BaseException) -> int | None:
    resp = getattr(e, "response", None)
    code = getattr(resp, "status_code", None)
    if isinstance(code, int):
        return code
    text = str(e)
    for c in (429, 403, 401):
        if str(c) in text:
            return c
    return None


def garmin_login(email: str, password: str, tokens: str | None) -> tuple[Any, str]:
    """Logged-in Garmin client and how ('tokens' or 'password'). Raises Fail / Skip."""
    from garminconnect import (
        Garmin,
        GarminConnectAuthenticationError,
        GarminConnectConnectionError,
        GarminConnectTooManyRequestsError,
    )

    if tokens:
        tmp = Path(tempfile.mkdtemp(prefix="peps-garmin-"))
        path = tmp / "garmin_tokens.json"
        path.write_text(tokens, encoding="utf-8")
        os.chmod(path, 0o600)
        try:
            g = Garmin(email, password)
            g.login(tokenstore=str(path))
            return g, "tokens"
        except GarminConnectTooManyRequestsError as e:
            raise Skip("Garmin limite les connexions (429) : on réessaie au prochain passage.") from e
        except Exception:  # expired / revoked tokens: log in again below
            notice("Jetons Garmin expirés : nouvelle connexion avec l’e-mail et le mot de passe.")

    try:
        g = Garmin(email, password)
        g.login()
        return g, "password"
    except GarminConnectTooManyRequestsError as e:
        raise Skip("Garmin limite les connexions (429). Rien de cassé : on réessaie au prochain passage (évite de relancer à la main tout de suite).") from e
    except GarminConnectAuthenticationError as e:
        if "mfa" in str(e).lower():
            raise Fail("Garmin demande un code de validation (2FA) : cette synchro ne marche que sans 2FA sur le compte Garmin.") from e
        raise Fail("Garmin refuse la connexion : vérifie GARMIN_EMAIL et GARMIN_PASSWORD (et que le compte n’est pas bloqué sur connect.garmin.com).") from e
    except GarminConnectConnectionError as e:
        code = _status_of(e)
        raise Skip(f"Garmin bloque la connexion pour l’instant{f' ({code})' if code else ''} (protection anti-robots probable) : on réessaie au prochain passage.") from e


def _num(v: Any) -> float | None:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _paris(ts_ms: float, tz: Any) -> datetime:
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).astimezone(tz)


def body_battery_at_wake(g: Any, day: str, summary_: dict[str, Any], sleep_end_ms: float | None, tz: Any) -> int | None:
    at_wake = _num(summary_.get("bodyBatteryAtWakeTime"))
    if at_wake is not None and at_wake >= 0:
        return int(round(at_wake))
    try:
        report = g.get_body_battery(day) or []
    except Exception:
        report = []
    values: list[tuple[float, float]] = []
    for item in report if isinstance(report, list) else []:
        for pair in item.get("bodyBatteryValuesArray") or []:
            if isinstance(pair, list) and len(pair) >= 2 and _num(pair[0]) is not None and _num(pair[1]) is not None:
                values.append((float(pair[0]), float(pair[1])))
    if not values:
        hi = _num(summary_.get("bodyBatteryHighestValue"))
        return int(round(hi)) if hi is not None and hi >= 0 else None
    values.sort()
    if sleep_end_ms:
        after = [v for t, v in values if t >= sleep_end_ms - 5 * 60_000]
        if after:
            return int(round(after[0]))
    morning = [v for t, v in values if _paris(t, tz).hour < 12]
    return int(round(max(morning))) if morning else None


_FATAL = ("GarminConnectTooManyRequestsError", "GarminConnectAuthenticationError")


def fetch_day(g: Any, day: str, tz: Any) -> dict[str, Any]:
    out: dict[str, Any] = {}
    try:
        s = g.get_user_summary(day) or {}
    except Exception as e:
        if type(e).__name__ in _FATAL:
            raise
        s = {}
    sleep_end = None
    try:
        sleep = (g.get_sleep_data(day) or {}).get("dailySleepDTO") or {}
        secs = _num(sleep.get("sleepTimeSeconds"))
        if secs and secs > 0:
            out["sleepH"] = round(secs / 3600, 1)
        sleep_end = _num(sleep.get("sleepEndTimestampGMT"))
    except Exception as e:
        if type(e).__name__ in _FATAL:
            raise
    stress = _num(s.get("averageStressLevel"))
    if stress is not None and stress >= 0:  # -1 / -2 = not enough data
        out["stress"] = int(round(stress))
    rhr = _num(s.get("restingHeartRate"))
    if rhr and rhr > 0:
        out["restingHr"] = int(round(rhr))
    steps = _num(s.get("totalSteps"))
    if steps and steps > 0:
        out["steps"] = int(steps)
    bb = body_battery_at_wake(g, day, s, sleep_end, tz)
    if bb is not None:
        out["bodyBattery"] = bb
    return out


def _act_list(v: Any) -> list[Any]:
    """Garmin answers a list, or sometimes an object wrapping it."""
    if isinstance(v, list):
        return v
    if isinstance(v, dict):
        for k in ("activityList", "activities"):
            if isinstance(v.get(k), list):
                return v[k]
    return []


def raw_activities(g: Any, start: str, end: str) -> list[dict[str, Any]]:
    """The date search first; when it comes back empty, the latest activities filtered by date
    (the search endpoint has returned nothing for some accounts). Logs counts only."""
    by_date = [a for a in _act_list(g.get_activities_by_date(start, end)) if isinstance(a, dict)]
    if by_date:
        print(f"Activités Garmin : {len(by_date)} par la recherche par date.", flush=True)
        return by_date
    recent = [a for a in _act_list(g.get_activities(0, 30)) if isinstance(a, dict)]
    kept = [a for a in recent if start <= str(a.get("startTimeLocal") or "")[:10] <= end]
    print(f"Activités Garmin : 0 par date, {len(kept)} sur {len(recent)} récentes dans la période.", flush=True)
    return kept


def fetch_activities(g: Any, start: str, end: str) -> list[dict[str, Any]]:
    out = []
    for a in raw_activities(g, start, end):
        aid = a.get("activityId")
        local = str(a.get("startTimeLocal") or "")
        if not aid or len(local) < 16:
            continue
        dur = _num(a.get("duration")) or _num(a.get("movingDuration")) or 0
        item: dict[str, Any] = {
            "id": str(aid),
            "date": local[:10],
            "time": local[11:16],
            "type": str(((a.get("activityType") or {}).get("typeKey")) or "other"),
            "minutes": max(1, int(round(dur / 60))) if dur else 0,
        }
        dist = _num(a.get("distance"))
        if dist and dist > 0:
            item["distanceKm"] = round(dist / 1000, 2)
        hr = _num(a.get("averageHR"))
        if hr and hr > 0:
            item["avgHr"] = int(round(hr))
        kcal = _num(a.get("calories"))
        if kcal and kcal > 0:
            item["calories"] = int(round(kcal))
        out.append(item)
    return out


# ---------- merge ----------

def merge(prev: dict[str, Any] | None, days: dict[str, dict[str, Any]], acts: list[dict[str, Any]],
          start: str, end: str, today_s: str) -> dict[str, Any]:
    """New data on top of the previous file; keeps the last KEEP_DAYS days."""
    prev = prev if isinstance(prev, dict) else {}
    cutoff = (date.fromisoformat(today_s) - timedelta(days=KEEP_DAYS - 1)).isoformat()
    out_days: dict[str, dict[str, Any]] = {}
    for d, v in (prev.get("days") or {}).items():
        if isinstance(v, dict) and d >= cutoff:
            out_days[d] = dict(v)
    for d, v in days.items():
        if v:
            # Fresh values win; a field missing this time (fetch hiccup) keeps the old one.
            out_days[d] = {**out_days.get(d, {}), **v}
    by_id: dict[str, dict[str, Any]] = {}
    for a in prev.get("activities") or []:
        if isinstance(a, dict) and a.get("id") and str(a.get("date", "")) >= cutoff:
            # Activities inside the fetched range are replaced by what Garmin returns now.
            if not (start <= str(a.get("date", "")) <= end):
                by_id[str(a["id"])] = a
    for a in acts:
        if a["date"] >= cutoff:
            by_id[a["id"]] = a
    activities = sorted(by_id.values(), key=lambda a: (a.get("date", ""), a.get("time", "")))
    return {"days": dict(sorted(out_days.items())), "activities": activities}


# ---------- main ----------

def plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def run() -> int:
    silence_libraries()
    env = os.environ
    email = env.get("GARMIN_EMAIL", "").strip()
    password = env.get("GARMIN_PASSWORD", "")
    key_b64 = env.get("GARMIN_SYNC_KEY", "").strip()
    token = env.get("GIST_TOKEN", "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    missing = [n for n, v in (("GARMIN_EMAIL", email), ("GARMIN_PASSWORD", password),
                              ("GARMIN_SYNC_KEY", key_b64), ("GIST_TOKEN", token)) if not v]
    if missing:
        notice(f"Secrets absents ({', '.join(missing)}) : synchro Garmin non configurée, rien à faire (voir docs/GARMIN.md).")
        return 0

    try:
        n_days = int(env.get("DAYS") or 3)
    except ValueError:
        n_days = 3
    n_days = max(1, min(MAX_DAYS, n_days))

    from zoneinfo import ZoneInfo

    tz = ZoneInfo(TZ_NAME)
    key = parse_key(key_b64)
    today_d = datetime.now(tz).date()
    start = (today_d - timedelta(days=n_days - 1)).isoformat()
    end = today_d.isoformat()

    gh = Gist(token)
    found = gh.find()
    gist = gh.get(found["id"]) if found else None
    prev_auth = decrypt_json(gh.file_json(gist, AUTH_FILE), key, "peps-garmin-auth") if gist else None
    prev_data_raw = gh.file_json(gist, DATA_FILE) if gist else None
    prev_data = decrypt_json(prev_data_raw, key, "peps-garmin") if prev_data_raw else None
    if prev_data_raw and prev_data is None:
        notice("Le fichier Garmin précédent n’est pas lisible avec cette clé (nouvelle clé ?) : il est remplacé.")
    stored_tokens = prev_auth.get("tokens") if isinstance(prev_auth, dict) else None

    g, how = garmin_login(email, password, stored_tokens if isinstance(stored_tokens, str) else None)
    print("Connexion Garmin : " + ("jetons réutilisés." if how == "tokens" else "e-mail et mot de passe (jetons renouvelés)."), flush=True)

    from garminconnect import GarminConnectAuthenticationError, GarminConnectTooManyRequestsError

    days: dict[str, dict[str, Any]] = {}
    acts: list[dict[str, Any]] = []
    try:
        for i in range(n_days):
            d = (today_d - timedelta(days=i)).isoformat()
            days[d] = fetch_day(g, d, tz)
        try:
            acts = fetch_activities(g, start, end)
        except GarminConnectTooManyRequestsError:
            raise
        except GarminConnectAuthenticationError:
            raise
        except Exception:
            warn("Activités Garmin indisponibles pour ce passage : les chiffres du jour sont quand même enregistrés.")
            acts = []
    except GarminConnectTooManyRequestsError as e:
        raise Skip("Garmin limite les requêtes (429) : on réessaie au prochain passage.") from e
    except GarminConnectAuthenticationError as e:
        raise Fail("Garmin a refusé l’accès aux données : vérifie GARMIN_EMAIL / GARMIN_PASSWORD.") from e

    filled = sum(1 for v in days.values() if v)
    merged = merge(prev_data, days, acts, start, end, end)
    merged["run"] = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "from": start, "to": end,
                     "days": filled, "activities": len(acts)}

    files = {DATA_FILE: json.dumps(encrypt_json(merged, key, "peps-garmin"), separators=(",", ":"))}
    new_tokens = None
    try:
        new_tokens = g.client.dumps()
    except Exception:
        pass
    if new_tokens and new_tokens != stored_tokens:
        files[AUTH_FILE] = json.dumps(encrypt_json({"tokens": new_tokens}, key, "peps-garmin-auth"), separators=(",", ":"))

    if gist:
        gh.update(gist["id"], files)
        where = "dans le Gist de la sauvegarde" if BACKUP_FILE in (gist.get("files") or {}) else "dans le Gist Garmin"
    else:
        gh.create(files)
        where = "dans un nouveau Gist secret « Pep’s — Garmin » (aucune sauvegarde de l’app trouvée)"

    msg = f"Synchro Garmin : {plural(filled, 'jour', 'jours')}, {plural(len(acts), 'activité', 'activités')}, enregistrés {where}."
    print(msg, flush=True)
    summary(msg)
    return 0


def main() -> int:
    scheduled = os.environ.get("GITHUB_EVENT_NAME") == "schedule"
    try:
        return run()
    except Skip as e:
        warn(str(e))
        summary(str(e))
        return 0
    except Fail as e:
        error(str(e))
        summary(str(e))
        return 1
    except Exception as e:  # never print the message: it could hold personal data
        error(f"Erreur inattendue ({type(e).__name__}). Relance le workflow plus tard ; si ça continue, Garmin a peut-être changé quelque chose.")
        return 0 if scheduled and type(e).__name__.startswith("GarminConnect") else 1


if __name__ == "__main__":
    sys.exit(main())
