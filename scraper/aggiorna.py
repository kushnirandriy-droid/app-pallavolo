"""Aggiorna app/data.json e app/loghi/ dai siti FIPAV.

    python scraper/aggiorna.py            # auto: decide da solo se e cosa scaricare
    python scraper/aggiorna.py completo   # giro completo subito
    python scraper/aggiorna.py partite    # solo i campionati con gare appena finite

Regola "auto" (è quella che usa GitHub Actions, lanciato ogni 20 minuti):
- giro completo se l'ultimo ha più di ORE_TRA_GIRI_COMPLETI ore;
- altrimenti giro "partite" se c'è una gara iniziata da 45 min a 5 ore fa ancora senza risultato;
- altrimenti nessuna richiesta ai siti.
"""
import json
import sys
from collections import defaultdict
from datetime import timedelta

import config
import caserta
import campania
from comune import ora, leggi_iso, scarica, slug, pulisci
import comune
from raccolta import Raccolta


def carica_json(percorso, vuoto):
    try:
        return json.loads(percorso.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return vuoto


def salva_json(percorso, dati):
    percorso.parent.mkdir(parents=True, exist_ok=True)
    percorso.write_text(json.dumps(dati, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def gare_in_finestra(dati, adesso):
    da, a = config.FINESTRA_PARTITA_ORE
    for g in dati.get("gare", []):
        inizio = leggi_iso(g.get("data"))
        if inizio and g["set"][0] is None and \
                timedelta(hours=da) <= adesso - inizio <= timedelta(hours=a):
            yield g


# ----------------------------------------------------------------- loghi
def _salva_logo(nome_base, url):
    """Scarica un logo una volta sola. Restituisce il percorso relativo all'app o None."""
    for f in config.CARTELLA_LOGHI.glob(nome_base + ".*"):
        return f"loghi/{f.name}"
    if not url or "no-image" in url:
        return None
    b = scarica(url, binario=True)
    if not b:
        return None
    est = url.rsplit(".", 1)[-1].lower()
    config.CARTELLA_LOGHI.mkdir(parents=True, exist_ok=True)
    (config.CARTELLA_LOGHI / f"{nome_base}.{est}").write_bytes(b)
    print(f"  logo nuovo: {nome_base}.{est}")
    return f"loghi/{nome_base}.{est}"


def sistema_loghi(r: Raccolta, societa_ce: dict):
    manuali = carica_json(config.LOGHI_MANUALI, {})
    manuali = {k: v for k, v in manuali.items() if not k.startswith("_")}
    assenti_f = config.CACHE_GARE_CR.parent / "loghi_assenti.json"
    assenti = set(carica_json(assenti_f, []))
    per_nome = {slug(n): i for n, i in societa_ce.items()}   # società casertane per nome
    for sq in r.squadre.values():                             # ...e squadre casertane per nome
        if sq.get("societa_id"):
            per_nome.setdefault(slug(sq["nome"]), sq["societa_id"])

    for sq_id, sq in r.squadre.items():
        if sq.get("logo"):
            continue
        logo = None
        # 1) logo indicato a mano (file in app/loghi/ oppure "ce-<id società>")
        man = manuali.get(sq["nome"])
        if isinstance(man, str) and man.startswith("ce-"):
            sq["societa_id"] = sq.get("societa_id") or int(man[3:])
        elif man:
            logo = man
        # 2) società del portale Caserta
        sid = sq.get("societa_id") or per_nome.get(slug(sq["nome"]))
        if not logo and sid:
            if sq.get("logo_remoto"):
                logo = _salva_logo(f"ce-{sid}", sq["logo_remoto"])
            elif f"ce-{sid}" not in assenti:
                for est in ("png", "jpg"):
                    logo = _salva_logo(f"ce-{sid}", f"{config.CE_BASE}/mngArea/Societa/img/{sid}/Loghi/LogoS{sid}.{est}")
                    if logo:
                        break
                if not logo:
                    assenti.add(f"ce-{sid}")
            else:
                logo = _salva_logo(f"ce-{sid}", None)
        sq["logo"] = logo
    salva_json(assenti_f, sorted(assenti))


# ----------------------------------------------------------------- giri
def giro_completo(cache):
    r = Raccolta()
    societa_ce = {}
    print("FIPAV Caserta — gironi della Virtus")
    trovati = caserta.leggi_elenco(sid=config.CE_SOCIETA, r=r)
    societa_ce.update(caserta.ultime_societa)
    for cid in config.CE_GIRONI_COMPLETI:
        print(f"FIPAV Caserta — girone completo {cid}")
        trovati += caserta.leggi_elenco(cid=cid, sid=None, r=r, completo=True)
    for cid in config.CE_GIRONI_COMPLETI:
        if cid not in trovati:      # girone senza gare in calendario: ci vuole almeno la classifica
            nome, gir = caserta._nome_e_girone(caserta.ultimi_gironi.get(cid, f"Girone {cid}"))
            r.campionato(f"ce-{cid}", fonte="caserta", nome=nome, girone=gir, gruppo=slug(nome),
                         tutte_le_gare=True, url=caserta.url_classifica(cid))
            trovati.append(cid)
    for cid in dict.fromkeys(trovati):
        caserta.leggi_classifica(cid, r)
    for camp in config.CR_CAMPIONATI:
        print(f"FIPAV Campania — campionato {camp}")
        campania.leggi_campionato(camp, r, cache)
        campania.leggi_classifica(camp, r)
    return r, societa_ce


def giro_partite(precedente, cache, gare):
    r = Raccolta(precedente)
    per_camp = defaultdict(set)
    for g in gare:
        per_camp[g["campionato"]].add(g["id"])
    for camp_id, ids in per_camp.items():
        fonte, num = camp_id.split("-", 1)
        num = int(num)
        print(f"Giro partite: {camp_id} ({len(ids)} gare)")
        if fonte == "ce":
            completo = r.campionati[camp_id].get("tutte_le_gare")
            caserta.leggi_elenco(cid=num, sid=None if completo else config.CE_SOCIETA,
                                 r=r, completo=completo)
            caserta.leggi_classifica(num, r)
        else:
            campania.leggi_campionato(num, r, cache, gare_forzate=frozenset(ids))
            campania.leggi_classifica(num, r)
    return r


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else "auto"
    adesso = ora()
    precedente = carica_json(config.DATA_JSON, None)
    cache = carica_json(config.CACHE_GARE_CR, {})
    ultimo_completo = leggi_iso((precedente or {}).get("ultimo_giro_completo"))

    if modo == "auto":
        if not precedente or not ultimo_completo or \
                adesso - ultimo_completo >= timedelta(hours=config.ORE_TRA_GIRI_COMPLETI):
            modo = "completo"
        elif list(gare_in_finestra(precedente, adesso)):
            modo = "partite"
        else:
            print("Niente da fare: nessuna gara appena finita e giro completo recente.")
            return 0

    if modo == "completo":
        r, societa_ce = giro_completo(cache)
        ultimo_completo = adesso
    else:
        gare = list(gare_in_finestra(precedente or {}, adesso))
        if not gare:
            print("Nessuna gara in finestra.")
            return 0
        r = giro_partite(precedente, cache, gare)
        societa_ce = {}

    sistema_loghi(r, societa_ce)
    campionati, squadre, palestre, gare = r.esporta()
    salva_json(config.DATA_JSON, {
        "versione": 1,
        "aggiornato": adesso.isoformat(),
        "ultimo_giro_completo": ultimo_completo.isoformat(),
        "stagione": config.STAGIONE,
        "societa_principale": {"nome": config.NOME_VIRTUS, "ce_id": config.CE_SOCIETA,
                               "logo": squadre.get(f"ce-{config.CE_SOCIETA}-virtus-caserta", {}).get("logo")},
        "campionato_evidenza": config.CAMPIONATO_EVIDENZA,
        "campionati": campionati,
        "squadre": squadre,
        "palestre": palestre,
        "gare": gare,
    })
    salva_json(config.CACHE_GARE_CR, dict(sorted(cache.items())))
    print(f"Fatto ({modo}): {len(campionati)} campionati, {len(squadre)} squadre, "
          f"{len(gare)} gare, {len(palestre)} palestre — {comune.contatore_richieste} richieste.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
