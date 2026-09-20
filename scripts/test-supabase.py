"""Optional Python connectivity check for the existing Supabase project.

Reads SUPABASE_URL and SUPABASE_ANON_KEY from server/.env or the process
environment. Does not print secret values. Does not create or delete tables.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_CANDIDATES = [ROOT / "server" / ".env", ROOT / ".env"]


def load_env() -> None:
    for path in ENV_CANDIDATES:
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def ping(url: str, headers: dict | None = None, timeout: int = 12) -> tuple[int | None, str]:
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, "ok"
    except urllib.error.HTTPError as err:
        return err.code, str(err.reason)
    except Exception as err:  # noqa: BLE001 - report any network failure
        return None, str(err)


def main() -> None:
    load_env()
    url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_ANON_KEY") or ""
    report = {
        "urlConfigured": bool(url),
        "keyConfigured": bool(key),
        "auth": {},
        "postgres": {},
    }
    if not url:
        report["message"] = "Add SUPABASE_URL to server/.env"
        print(json.dumps(report, indent=2))
        return
    status, detail = ping(f"{url}/auth/v1/health")
    report["auth"] = {"status": status, "detail": detail, "ok": status == 200}
    if not key:
        report["message"] = "Add SUPABASE_ANON_KEY to server/.env"
        print(json.dumps(report, indent=2))
        return
    status, detail = ping(
        f"{url}/rest/v1/",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    report["postgres"] = {"status": status, "detail": detail, "ok": status == 200}
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
