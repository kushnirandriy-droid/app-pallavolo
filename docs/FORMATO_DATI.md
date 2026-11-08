# Formato di `data.json` — approvato l'08/11/2026

Campi in più rispetto alla proposta: `ultimo_giro_completo` (in testa, serve allo
scraper per decidere quando rifare il giro completo) e `golden_set` (su ogni gara).

Un solo file, prodotto dallo scraper e letto dalla PWA. Le date sono in ISO con fuso
italiano. Gli identificativi hanno il prefisso della fonte, così le due fonti non si
pestano: `ce-` = FIPAV Caserta (portalefipav), `cr-` = FIPAV Campania.

```jsonc
{
  "versione": 1,
  "aggiornato": "2026-11-08T11:40:00+01:00",   // ultimo giro dello scraper
  "stagione": "2026/27",
  "societa_principale": { "nome": "VIRTUS CASERTA", "ce_id": 5150, "logo": "loghi/ce-5150.png" },
  "campionato_evidenza": "cr-92747",           // Serie D F gir. C → Home

  "campionati": [
    {
      "id": "ce-94233",
      "fonte": "caserta",                        // caserta | campania
      "nome": "Under 15 Femminile",
      "girone": "A",
      "gruppo": "U15F",                          // per il selettore dei gironi
      "virtus": true,                            // ci gioca una squadra Virtus
      "tutte_le_gare": false,                    // true = scaricato tutto il girone, false = solo gare Virtus
      "url": "https://caserta.portalefipav.net/classifica.aspx?CId=94233",
      "classifica": [
        { "pos": 1, "squadra": "ce-2624-amici-del-volley-macerata",
          "punti": 0, "g": 0, "v": 0, "p": 0, "sf": 0, "ss": 0, "pf": 0, "ps": 0, "pen": 0 }
      ]
    }
  ],

  "squadre": {
    "ce-5150-virtus-caserta": {
      "nome": "VIRTUS CASERTA",                  // nome squadra (spesso lo sponsor)
      "societa": "VIRTUS CASERTA",               // nome società
      "societa_id": 5150,                        // null per le squadre solo Campania
      "logo": "loghi/ce-5150.png",               // null → l'app disegna le iniziali
      "virtus": true
    }
  },

  "palestre": {
    "pal-isis-a-manzoni-caserta": {
      "nome": "PALESTRA ISIS A.MANZONI",
      "citta": "CASERTA", "prov": "CE",
      "via": "VIA DE GASPERI",
      "lat": 41.0782817, "lon": 14.3379557,      // solo se la fonte li dà (Campania sì)
      "maps": "https://www.google.com/maps/search/?api=1&query=PALESTRA+ISIS+A.MANZONI+VIA+DE+GASPERI+CASERTA+CE"
    }
  },

  "gare": [
    {
      "id": "ce-131675108",
      "campionato": "ce-94233",
      "numero": 602,
      "giornata": 1,
      "data": "2026-11-15T11:00:00+01:00",       // null se non ancora fissata
      "casa": "ce-725-mc-automotive-succivo",
      "ospite": "ce-5150-virtus-caserta",
      "set": [null, null],                         // [casa, ospite] → es. [3, 1]
      "parziali": [],                              // es. [[22,25],[25,19],[25,18],[25,18]]
      "stato": "da_disputare",                     // vedi tabella sotto
      "stato_testo": "da disputare",               // testo originale della fonte
      "arbitro": false,                            // arbitro designato
      "palestra": "pal-palavolley-franco-papa-succivo",
      "url": "https://www.fipavcampania.it/mobile/risultati.asp?CampionatoId=92747&GaraId=…"  // solo Campania
    }
  ]
}
```

## Stati gara

| Codice app      | Fonte Caserta (icona)                 | Fonte Campania            |
|-----------------|---------------------------------------|---------------------------|
| `da_disputare`  | `stato0.png`, `statodesignata.png`    | set vuoti                 |
| `disputata`     | —                                     | set presenti              |
| `omologata`     | `stato5.png`, `stato5gs.png` (golden set) | —                     |
| `documenti_mancanti` | `stato3.png`                     | —                         |
| `altro`         | qualunque icona nuova (testo originale in `stato_testo`) | —      |

## Scelte da confermare

1. **Una squadra = società + nome squadra.** La Virtus ha più squadre nella stessa
   categoria (es. «VIRTUS CASERTA MANZONI» la stagione scorsa): il nome della società
   da solo non basta.
2. **Loghi della Serie D.** Il sito Campania non ne ha. Proposta: si cerca la
   società per nome tra quelle del portale Caserta (le casertane si trovano); per le
   altre l'app mostra un tondo con le iniziali. Un file `loghi_manuali.json` permette
   di aggiungerne a mano.
3. **Quozienti** (set e punti) non salvati: li calcola l'app da sf/ss e pf/ps.
4. **Gironi completi** solo per l'Under 15 F (A, B, C, D). Negli altri campionati le
   gare sono solo quelle Virtus, ma la classifica è sempre completa.
5. **Dimensione stimata**: circa 330 gare → 150-200 KB. Va bene per un solo file.
