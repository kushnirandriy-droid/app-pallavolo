# App Pallavolo — Virtus Caserta 2026/27

PWA per iPhone che segue le partite della società VIRTUS CASERTA. Squadra in evidenza:
**Serie D femminile girone C** (FIPAV Campania).

## Regole
- Repository **pubblico** `kushnirandriy-droid/app-pallavolo`, servito da GitHub Pages.
  Mai dati aziendali, password, token o percorsi di rete nel repo.
- Le modifiche al codice si committano solo quando l'utente lo chiede. GitHub Actions
  committa da solo soltanto `data.json` e `loghi/`.
- Rispetto dei siti FIPAV: User-Agent da browser normale, pausa di 1-2 s tra le
  richieste, pochi giri al giorno (più fitti solo intorno agli orari delle gare), i
  loghi si scaricano una volta sola, i dettagli gara Campania solo quando servono.
- Il formato di `data.json` è in `docs/FORMATO_DATI.md`: se cambia, si aggiornano
  insieme scraper, app e documento.

## Architettura
- `scraper/aggiorna.py` — punto d'ingresso (`auto` | `completo` | `partite`); `caserta.py`,
  `campania.py` leggono le fonti, `raccolta.py` unisce, `config.py` ha id e cortesie.
  Scrive `app/data.json`, `app/loghi/` e la cache `dati/cache_gare_campania.json`.
  - `auto`: giro completo se l'ultimo ha più di 6 ore; altrimenti giro "partite" solo
    per i campionati con una gara iniziata da 45 min a 5 ore fa senza risultato;
    altrimenti nessuna richiesta.
  - Giro completo con cache piena: circa 18 richieste. Il primo in assoluto, circa 200,
    perché scarica i 156 dettagli della Serie D.
- `scraper/loghi_manuali.json` — loghi trovati a mano (Serie D: il sito Campania non ne
  ha). Vince su ogni abbinamento automatico. File in `app/loghi/manuali/` (≤256 px).
- `.github/workflows/aggiorna.yml` — ogni 20 minuti lancia `auto`; se i dati cambiano
  committa e pubblica `app/` su GitHub Pages (sorgente Pages = "GitHub Actions").
  A ogni push su `app/**` ripubblica. Il bot committa su main: prima di pushare,
  `git pull --rebase`.
- `app/` — PWA senza build: `index.html`, `style.css`, `app.js`, `sw.js`, manifest,
  `icone/` (generate da `strumenti/crea_icone.py`). **Dopo ogni modifica a
  index/app/style alzare `VERSIONE` in `sw.js`**, altrimenti l'iPhone tiene la vecchia.
- Prova in locale: `python -m http.server 8765` dentro `app/`. Su Windows Chrome headless
  non scende sotto ~500 px di larghezza: per vedere l'app a misura di iPhone serve
  l'emulazione via DevTools Protocol (`Emulation.setDeviceMetricsOverride` 390×844).

## Trappole già pagate
- Griglie a tre colonne (casa | punteggio | ospite): `minmax(0, 1fr)`, non `1fr`,
  altrimenti un nome lungo allarga la riga oltre lo schermo.
- Confronto tra giorni: chiave `AAAA-MM-GG` (Intl `en-CA`), mai il formato italiano
  `GG/MM/AAAA` che come testo si ordina male.
- Mai misurare la posizione di un elemento `position: sticky`: agganciato, mente.
- Abbinamento loghi per nome: «FMF VOLALTO SNC» è il nome di due squadre diverse
  (Serie D = Volalto S. Nicola 1855; Under 19 = F.M.F. Soccer 5773). Da qui la
  precedenza di `loghi_manuali.json`.

## Fonti: cosa si è scoperto analizzando le pagine (08/11/2026)

### FIPAV Caserta — caserta.portalefipav.net
- Elenco gare: `risultati-classifiche.aspx?ComitatoId=19&StId=2399&PId=7261&SId=5150&CId=…`
  - `StId=2399` = stagione 2026/27 (2281 = 2025/26). `SId=5150` = Virtus Caserta.
  - **`PId=7261` va sempre messo**: senza, il sito risponde con un redirect.
  - Per un girone completo: `CId=<id girone>` e `SId=` vuoto.
  - La tendina `CId` elenca tutti i gironi della provincia: U15 F gir. A-D =
    94233, 94300, 94301, 94302.
- Una `<table class="tbl tbl-risultati">` per girone; il `<caption>` ha il nome
  («Under 15 Femminile - gir.A») e il link `classifica.aspx?CId=…`.
- Riga gara: numero, giornata, «gg/mm/aa hh:mm», casa, ospite, risultato («3 - 0»
  oppure «-»), parziali (`span.parziali` «25-15»), stato, info palestra.
  - Nella cella della squadra il **`title` è la società**, il testo è il **nome
    squadra** (spesso lo sponsor). Il logo è `/mngArea/Societa/img/{id}/Loghi/LogoS{id}.jpg|png`.
  - Stato: `span#StatoGara_{id} img` → `stato0` da disputare, `statodesignata`
    arbitro designato, `stato5` omologata, `stato5gs` omologata con golden set,
    `stato3` documenti mancanti.
  - Palestra: attributo `title` di `img[src*=info_16]`, HTML con escape:
    `<b>NOME</b><br /> CITTÀ PR<br />VIA` (+ eventuale `<p class="designazione">`).
- Classifica: `classifica.aspx?CId=…`, tabella `tbl-classifica` con logo, punti,
  PG PV PP SF SS QS PF PS QP Penal.

### FIPAV Campania — www.fipavcampania.it/mobile
- Elenco: `risultati.asp?CampionatoId=92747` → blocchi `div.divGiornata` +
  `a.gara` (link con `GaraId`), solo nomi squadre e set vinti. **Niente data,
  palestra né parziali**: stanno nella pagina gara.
- Gara: `risultati.asp?CampionatoId=92747&GaraId=…` → «Giornata N - Gara N° X»,
  «Dom 18/10/2026 ore 20:00», parziali in `#risultatoCasa/.parziale` e
  `#risultatoOspite/.parziale`, palestra in `div.divImpianto` con **coordinate**
  nel link Google Maps (`maps?q=lat,lon`).
- Classifica: `risultati.asp?CampionatoId=92747&vis=classifica`, `table.tabellaClassifica`.
- Nessun logo sul sito.
- 26 giornate, 156 gare: i dettagli si scaricano una volta e si riscaricano solo
  per le gare cambiate o in programma nei giorni successivi.

## Colori Virtus (dal logo, 38×50 px)
Blu `#2b3a83`, blu scuro `#2a2c71`, arancio volpe `#b75c28` (da ravvivare), bianco.
