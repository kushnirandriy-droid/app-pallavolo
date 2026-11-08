"""Strumenti condivisi: richieste gentili, nomi normalizzati, date."""
import re
import time
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

import config

TZ = ZoneInfo(config.FUSO)

_sessione = requests.Session()
_sessione.headers.update({"User-Agent": config.USER_AGENT,
                          "Accept-Language": "it-IT,it;q=0.9"})
_ultima_richiesta = 0.0
contatore_richieste = 0


def scarica(url: str, binario: bool = False):
    """GET con pausa minima fra le richieste e un solo nuovo tentativo."""
    global _ultima_richiesta, contatore_richieste
    for tentativo in (1, 2):
        attesa = config.PAUSA_SECONDI - (time.monotonic() - _ultima_richiesta)
        if attesa > 0:
            time.sleep(attesa)
        _ultima_richiesta = time.monotonic()
        contatore_richieste += 1
        try:
            r = _sessione.get(url, timeout=30)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.content if binario else decodifica(r.content)
        except requests.RequestException as e:
            if tentativo == 2:
                raise
            print(f"  ! {e} — riprovo fra 10 s")
            time.sleep(10)


def decodifica(b: bytes) -> str:
    """I siti dichiarano utf-8 ma alcune pagine sono in Windows-1252."""
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        return b.decode("cp1252", errors="replace")


def pulisci(t: str) -> str:
    return re.sub(r"\s+", " ", (t or "").replace("\xa0", " ")).strip()


def slug(t: str) -> str:
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def ora() -> datetime:
    return datetime.now(TZ).replace(microsecond=0)


def data_iso(gg: int, mm: int, aaaa: int, hh: int = 0, mi: int = 0) -> str:
    if aaaa < 100:
        aaaa += 2000
    return datetime(aaaa, mm, gg, hh, mi, tzinfo=TZ).isoformat()


def leggi_iso(s):
    return datetime.fromisoformat(s) if s else None


def numero(t):
    t = pulisci(t).replace(",", ".")
    try:
        return int(t)
    except ValueError:
        try:
            return float(t)
        except ValueError:
            return None
