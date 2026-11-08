"""FIPAV Caserta — caserta.portalefipav.net (campionati provinciali)."""
import html as htmlmod
import re

from bs4 import BeautifulSoup

import config
from comune import scarica, pulisci, slug, data_iso, numero
from raccolta import Raccolta

# riempiti da leggi_elenco con le tendine della pagina
ultime_societa: dict[str, int] = {}   # nome società → id
ultimi_gironi: dict[int, str] = {}    # CId → "Under 15 Femminile - gir.A"

STATI = {
    "stato0": "da_disputare",
    "statodesignata": "da_disputare",
    "stato5": "omologata",
    "stato5gs": "omologata",
    "stato3": "documenti_mancanti",
}


def url_elenco(cid=None, sid=config.CE_SOCIETA):
    return (f"{config.CE_BASE}/risultati-classifiche.aspx?ComitatoId={config.CE_COMITATO}"
            f"&StId={config.CE_STAGIONE}&DataDa=&StatoGara=&CId={cid or ''}"
            f"&SId={sid or ''}&PId={config.CE_PID}&btFiltro=CERCA")


def url_classifica(cid):
    return f"{config.CE_BASE}/classifica.aspx?CId={cid}"


def _nome_e_girone(caption: str):
    """'Under 15 Femminile - gir.A' → ('Under 15 Femminile', 'A')."""
    if " - " in caption:
        nome, gir = caption.rsplit(" - ", 1)
    else:
        nome, gir = caption, ""
    gir = re.sub(r"^gir(one)?\.?\s*", "", gir.strip(), flags=re.I)
    return nome.strip(), gir or "Unico"


def _squadra(td, r: Raccolta):
    """Cella squadra: title = società, testo = nome squadra, img = logo società."""
    nome = pulisci(td.get_text())
    societa = pulisci(td.get("title", ""))
    img = td.find("img")
    sid, logo_remoto = None, None
    if img and img.get("src"):
        m = re.search(r"/img/(\d+)/Loghi/", img["src"])
        if m:
            sid = int(m.group(1))
            logo_remoto = config.CE_BASE + img["src"]
    sq_id = f"ce-{sid or 'x'}-{slug(nome)}"
    r.squadra(sq_id, nome=nome, societa=societa or None, societa_id=sid,
              logo_remoto=logo_remoto,
              virtus=(sid == config.CE_SOCIETA))
    return sq_id


def _palestra(img_info, r: Raccolta):
    if not img_info or not img_info.get("title"):
        return None
    frag = BeautifulSoup(htmlmod.unescape(img_info["title"]), "html.parser")
    p = frag.find("p")
    if not p:
        return None
    b = p.find("b")
    nome = pulisci(b.get_text()) if b else ""
    righe = [pulisci(x) for x in p.find_all(string=True)
             if x.parent.name != "b" and pulisci(x)]
    citta, prov, via = "", "", ""
    if righe:
        m = re.match(r"(.*?)\s+([A-Z]{2})$", righe[0])
        citta, prov = (m.group(1), m.group(2)) if m else (righe[0], "")
        # la fonte scrive "località comune": "ALVIGNANO ALVIGNANO" → "ALVIGNANO"
        p_ = citta.split()
        if len(p_) % 2 == 0 and p_[:len(p_) // 2] == p_[len(p_) // 2:]:
            citta = " ".join(p_[:len(p_) // 2])
    if len(righe) > 1:
        via = righe[1]
    if not nome and not citta:
        return None
    return r.palestra(nome=nome, citta=citta, prov=prov, via=via)


def leggi_elenco(cid=None, sid=config.CE_SOCIETA, r: Raccolta = None, completo=False):
    """Legge una pagina di risultati: una tabella per girone. Restituisce i CId trovati."""
    pagina = scarica(url_elenco(cid, sid))
    s = BeautifulSoup(pagina, "html.parser")
    for nome_sel, dest in (("SId", ultime_societa), ("CId", ultimi_gironi)):
        sel = s.find("select", attrs={"name": nome_sel})
        for o in (sel.find_all("option") if sel else []):
            if o.get("value", "").isdigit():
                if nome_sel == "SId":
                    dest[pulisci(o.get_text())] = int(o["value"])
                else:
                    dest[int(o["value"])] = pulisci(o.get_text())
    trovati = []
    for t in s.select("table.tbl-risultati"):
        cap = t.find("caption")
        if not cap:
            continue
        titolo = pulisci(cap.get_text())
        # il link alla classifica c'è solo col filtro sulla società: altrimenti
        # si cerca il titolo nella tendina dei gironi, o si usa il CId richiesto
        link = cap.find("a", class_="link_classifica")
        m = re.search(r"CId=(\d+)", link["href"]) if link else None
        per_titolo = {v: k for k, v in ultimi_gironi.items()}
        c_id = int(m.group(1)) if m else per_titolo.get(titolo, cid)
        if not c_id:
            continue
        nome, gir = _nome_e_girone(titolo)
        camp_id = f"ce-{c_id}"
        r.campionato(camp_id, fonte="caserta", nome=nome, girone=gir,
                     gruppo=slug(nome), tutte_le_gare=completo,
                     url=url_classifica(c_id))
        trovati.append(c_id)
        for tr in t.tbody.find_all("tr", recursive=False):
            td = tr.find_all("td", recursive=False)
            if len(td) < 8:
                continue
            ris = td[5]
            gara_id = re.sub(r"\D", "", ris.get("id", ""))
            if not gara_id:
                continue
            data = None
            md = re.match(r"(\d{2})/(\d{2})/(\d{2,4})\s*(\d{1,2}):(\d{2})?", pulisci(td[2].get_text()))
            if md:
                data = data_iso(int(md[1]), int(md[2]), int(md[3]), int(md[4]), int(md[5] or 0))
            set_ = [None, None]
            ms = re.match(r"(\d+)\s*-\s*(\d+)", pulisci(ris.get_text()))
            if ms:
                set_ = [int(ms[1]), int(ms[2])]
            parziali = []
            for sp in td[6].select("span.parziali"):
                mp = re.match(r"(\d+)\s*-\s*(\d+)", pulisci(sp.get_text()))
                if mp:
                    parziali.append([int(mp[1]), int(mp[2])])
            img_stato = td[7].select_one("span[id^=StatoGara] img")
            codice = img_stato["src"].rsplit("/", 1)[-1].split(".")[0] if img_stato else ""
            stato_testo = pulisci(BeautifulSoup(img_stato.get("title", ""), "html.parser").get_text(" ")) if img_stato else ""
            stato = STATI.get(codice, "altro" if codice else "da_disputare")
            if stato == "da_disputare" and set_[0] is not None:
                stato = "disputata"
            info = td[7].find("img", src=re.compile("info_16"))
            arbitro = (codice == "statodesignata") or bool(info and "designato" in info.get("title", "").lower())
            r.gara(f"ce-{gara_id}",
                   campionato=camp_id,
                   numero=numero(td[0].get_text()),
                   giornata=numero(td[1].get_text()),
                   data=data,
                   casa=_squadra(td[3], r),
                   ospite=_squadra(td[4], r),
                   set=set_, parziali=parziali,
                   stato=stato, stato_testo=stato_testo,
                   golden_set=codice.endswith("gs"),
                   arbitro=arbitro,
                   palestra=_palestra(info, r),
                   url=None)
    return trovati


def leggi_classifica(cid: int, r: Raccolta):
    pagina = scarica(url_classifica(cid))
    s = BeautifulSoup(pagina, "html.parser")
    t = s.select_one("table.tbl-classifica")
    righe = []
    if t:
        for tr in t.find_all("tr"):
            td = tr.find_all("td", recursive=False)
            if len(td) < 13:
                continue
            sq = _squadra(td[1], r)
            righe.append({
                "pos": numero(td[0].get_text()), "squadra": sq,
                "punti": numero(td[2].get_text()), "g": numero(td[3].get_text()),
                "v": numero(td[4].get_text()), "p": numero(td[5].get_text()),
                "sf": numero(td[6].get_text()), "ss": numero(td[7].get_text()),
                "pf": numero(td[9].get_text()), "ps": numero(td[10].get_text()),
                "pen": numero(td[12].get_text()),
            })
    r.classifica(f"ce-{cid}", righe)
