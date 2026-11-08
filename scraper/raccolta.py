"""Contenitore dei dati raccolti: unisce senza perdere informazioni già note."""
from comune import slug
from urllib.parse import quote_plus


class Raccolta:
    def __init__(self, precedente: dict | None = None):
        p = precedente or {}
        self.campionati = {c["id"]: c for c in p.get("campionati", [])}
        self.squadre = dict(p.get("squadre", {}))
        self.palestre = dict(p.get("palestre", {}))
        self.gare = {g["id"]: g for g in p.get("gare", [])}

    @staticmethod
    def _unisci(dest: dict, nuovi: dict):
        """I valori nuovi vincono, ma un None non cancella un dato già noto."""
        for k, v in nuovi.items():
            if v is not None or k not in dest:
                dest[k] = v
        return dest

    def campionato(self, cid, **campi):
        c = self.campionati.setdefault(cid, {"id": cid, "classifica": []})
        # un girone già marcato "completo" resta completo anche se riletto dal filtro Virtus
        if c.get("tutte_le_gare"):
            campi["tutte_le_gare"] = True
        self._unisci(c, campi)

    def classifica(self, cid, righe):
        if righe:
            self.campionati[cid]["classifica"] = righe

    def squadra(self, sq_id, **campi):
        self._unisci(self.squadre.setdefault(sq_id, {}), campi)

    def palestra(self, nome, citta, prov="", via="", lat=None, lon=None):
        pid = "pal-" + slug(f"{nome} {citta}")
        query = " ".join(x for x in (nome, via, citta, prov) if x)
        self._unisci(self.palestre.setdefault(pid, {}), {
            "nome": nome, "citta": citta, "prov": prov, "via": via or None,
            "lat": lat, "lon": lon,
            "maps": "https://www.google.com/maps/search/?api=1&query=" + quote_plus(query),
        })
        return pid

    def gara(self, gid, **campi):
        self._unisci(self.gare.setdefault(gid, {"id": gid}), campi)

    def esporta(self):
        # marca i campionati in cui gioca la Virtus
        virtus_sq = {k for k, v in self.squadre.items() if v.get("virtus")}
        for c in self.campionati.values():
            c["virtus"] = any(g["campionato"] == c["id"] and (g["casa"] in virtus_sq or g["ospite"] in virtus_sq)
                              for g in self.gare.values()) or \
                          any(r["squadra"] in virtus_sq for r in c.get("classifica", []))
        gare = sorted(self.gare.values(), key=lambda g: (g.get("data") or "9999", g["id"]))
        campionati = sorted(self.campionati.values(),
                            key=lambda c: (c["fonte"] != "campania", c["nome"], c["girone"]))
        squadre = {k: {kk: vv for kk, vv in v.items() if kk != "logo_remoto"}
                   for k, v in sorted(self.squadre.items())}
        return campionati, squadre, dict(sorted(self.palestre.items())), gare
