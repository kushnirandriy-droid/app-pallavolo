"""FIPAV Campania — sito mobile (Serie D).

L'elenco ha solo squadre e set vinti: data, parziali e palestra stanno nella pagina
di ogni gara. Quei dettagli si tengono in una cache e si riscaricano solo se servono.
"""
import re
from datetime import timedelta

from bs4 import BeautifulSoup

import config
from comune import scarica, pulisci, slug, data_iso, numero, ora, leggi_iso
from raccolta import Raccolta


def url_elenco(camp):
    return f"{config.CR_BASE}/risultati.asp?CampionatoId={camp}"


def url_gara(camp, gara):
    return f"{config.CR_BASE}/risultati.asp?CampionatoId={camp}&GaraId={gara}"


def url_classifica(camp):
    return f"{config.CR_BASE}/risultati.asp?CampionatoId={camp}&vis=classifica"


def _testo_diretto(div):
    """Testo del div senza quello dei figli (il nome squadra senza i set)."""
    return pulisci("".join(div.find_all(string=True, recursive=False)))


def _sq_id(nome):
    return "cr-" + slug(nome)


def _registra_squadra(nome, r: Raccolta):
    sq = _sq_id(nome)
    r.squadra(sq, nome=nome, societa=None, societa_id=None,
              virtus=config.NOME_VIRTUS in nome.upper())
    return sq


def leggi_dettaglio(camp, gara_id):
    s = BeautifulSoup(scarica(url_gara(camp, gara_id)), "html.parser")
    c = s.find(id="contenitorePagina") or s
    testo = pulisci(c.get_text(" "))
    d = {"numero": None, "giornata": None, "data": None, "parziali": [], "palestra": None}
    m = re.search(r"Giornata\s+(\d+)\s*-\s*Gara\s+N\S*\s*(\d+)", testo)
    if m:
        d["giornata"], d["numero"] = int(m[1]), int(m[2])
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})(?:\s+ore\s+(\d{1,2})[:.](\d{2}))?", testo)
    if m:
        d["data"] = data_iso(int(m[1]), int(m[2]), int(m[3]), int(m[4] or 0), int(m[5] or 0))
        d["ora_nota"] = m[4] is not None
    pc = [numero(x.get_text()) for x in c.select("#risultatoCasa .parziale")]
    po = [numero(x.get_text()) for x in c.select("#risultatoOspite .parziale")]
    d["parziali"] = [[a, b] for a, b in zip(pc, po) if a is not None and b is not None]
    imp = c.select_one("div.divImpianto")
    if imp:
        righe = [pulisci(x) for x in imp.find_all(string=True) if pulisci(x)]
        prima = imp.find_all(string=True)[0] if imp.find_all(string=True) else ""
        # "NOME PALESTRA&nbsp;CITTA PR" — il &nbsp; separa il nome dalla città
        if "\xa0" in prima:
            nome, citta_pr = prima.rsplit("\xa0", 1)
        else:
            nome, citta_pr = prima, ""
        m2 = re.match(r"(.*?)\s+([A-Z]{2})$", pulisci(citta_pr))
        citta, prov = (m2[1], m2[2]) if m2 else (pulisci(citta_pr), "")
        via = righe[1] if len(righe) > 1 else ""
        lat = lon = None
        a = imp.find_parent("a")
        if a and a.get("href"):
            mg = re.search(r"q=(-?\d+\.\d+),(-?\d+\.\d+)", a["href"])
            if mg:
                lat, lon = round(float(mg[1]), 6), round(float(mg[2]), 6)
        d["palestra"] = {"nome": pulisci(nome), "citta": citta, "prov": prov,
                         "via": via, "lat": lat, "lon": lon}
    return d


def _serve_dettaglio(gid, set_, cache, adesso, forza):
    """Decide se riscaricare la pagina della gara."""
    c = cache.get(gid)
    if c is None or forza:
        return True
    if c.get("set") != set_:
        return True                      # è comparso o cambiato il risultato
    if set_[0] is not None:
        return False                     # gara giocata e già letta: non cambia più
    letto = leggi_iso(c.get("letto"))
    data = leggi_iso(c["dati"].get("data"))
    vecchio = letto is None or adesso - letto > timedelta(hours=config.ORE_VALIDITA_DETTAGLIO)
    vicina = data is None or data - adesso < timedelta(days=config.GIORNI_RICONTROLLO_DETTAGLI)
    return vecchio and vicina            # date che si possono spostare: una volta al giorno


def leggi_campionato(camp: int, r: Raccolta, cache: dict, gare_forzate=frozenset()):
    adesso = ora()
    s = BeautifulSoup(scarica(url_elenco(camp)), "html.parser")
    c = s.find(id="contenitorePagina") or s
    titolo = c.select_one("#divCampionato")
    nome_completo = pulisci(titolo.get_text()) if titolo else f"Campionato {camp}"
    nome, gir = (nome_completo.rsplit(" - ", 1) + [""])[:2]
    gir = re.sub(r"^girone\s*", "", gir, flags=re.I).strip()
    camp_id = f"cr-{camp}"
    r.campionato(camp_id, fonte="campania", nome=nome.strip().title(),
                 girone=gir or "Unico", gruppo=slug(nome), tutte_le_gare=True,
                 url=url_elenco(camp))

    giornata = None
    letti = 0
    for el in c.find_all(["div", "a"]):
        if el.name == "div" and "divGiornata" in (el.get("class") or []):
            m = re.search(r"(\d+)", el.get_text())
            giornata = int(m[1]) if m else None
            continue
        if el.name != "a" or "gara" not in (el.get("class") or []):
            continue
        m = re.search(r"GaraId=(\d+)", el.get("href", ""))
        if not m:
            continue
        gara_num = m[1]
        gid = f"cr-{gara_num}"
        dc, do = el.select_one(".squadraCasa"), el.select_one(".squadraOspite")
        casa = _registra_squadra(_testo_diretto(dc), r)
        ospite = _registra_squadra(_testo_diretto(do), r)
        sc, so = numero(el.select_one(".setCasa").get_text()), numero(el.select_one(".setOspite").get_text())
        set_ = [sc, so] if sc is not None and so is not None else [None, None]

        if _serve_dettaglio(gid, set_, cache, adesso, gid in gare_forzate):
            try:
                cache[gid] = {"letto": adesso.isoformat(), "set": set_,
                              "dati": leggi_dettaglio(camp, gara_num)}
                letti += 1
            except Exception as e:  # una gara illeggibile non ferma tutto
                print(f"  ! dettaglio {gid}: {e}")
        det = cache.get(gid, {}).get("dati", {})
        pal = det.get("palestra")
        r.gara(gid, campionato=camp_id,
               numero=det.get("numero"),
               giornata=giornata or det.get("giornata"),
               data=det.get("data"),
               casa=casa, ospite=ospite,
               set=set_, parziali=det.get("parziali") or [],
               stato="disputata" if set_[0] is not None else "da_disputare",
               stato_testo="disputata" if set_[0] is not None else "da disputare",
               golden_set=False, arbitro=False,
               palestra=r.palestra(**pal) if pal and (pal.get("nome") or pal.get("citta")) else None,
               url=url_gara(camp, gara_num))
    print(f"  {camp_id}: dettagli gara scaricati {letti}")
    return camp_id


def leggi_classifica(camp: int, r: Raccolta):
    s = BeautifulSoup(scarica(url_classifica(camp)), "html.parser")
    righe = []
    for tr in s.select("table.tabellaClassifica tr"):
        def v(cls):
            td = tr.select_one(f"td.{cls}")
            return numero(td.get_text()) if td else None
        nome_td = tr.select_one("td.claSquadra")
        if not nome_td:
            continue
        righe.append({
            "pos": v("claPosizione"), "squadra": _registra_squadra(pulisci(nome_td.get_text()), r),
            "punti": v("claPunti"), "g": v("claGareGiocate"), "v": v("claGareVinte"),
            "p": v("claGarePerse"), "sf": v("claSetFatti"), "ss": v("claSetSubiti"),
            "pf": v("claPuntiFatti"), "ps": v("claPuntiSubiti"), "pen": v("claPenalita"),
        })
    r.classifica(f"cr-{camp}", righe)
