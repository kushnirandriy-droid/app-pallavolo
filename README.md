# App Pallavolo — Virtus Caserta

Risultati, calendario e classifiche delle squadre della Virtus Caserta, stagione 2026/27.
I dati vengono dai siti FIPAV Caserta e FIPAV Campania e si aggiornano da soli più
volte al giorno, anche a computer spento.

**Indirizzo dell'app:** https://kushnirandriy-droid.github.io/app-pallavolo/

## Installarla sull'iPhone

1. Apri l'indirizzo qui sopra con **Safari**. Con Chrome o altri browser non si installa.
2. Tocca il tasto **Condividi**, il quadrato con la freccia verso l'alto.
3. Scorri e scegli **Aggiungi alla schermata Home**.
4. Lascia il nome «Virtus» e tocca **Aggiungi**.

Sulla Home compare l'icona. L'app si apre a schermo intero, senza la barra di Safari.
Se manca la rete mostra gli ultimi dati scaricati.

**Aggiornare l'app:** non serve fare nulla. Se una novità non compare, chiudi l'app
(scorri verso l'alto dal fondo e togli la scheda) e riaprila.

**Toglierla:** tieni premuta l'icona, poi **Rimuovi app**.

## Come funziona

- Uno scraper Python legge le pagine FIPAV e scrive `data.json` più i loghi.
- GitHub Actions lo lancia a orari programmati: poche volte al giorno, più spesso
  nelle fasce delle partite.
- GitHub Pages pubblica l'app, che legge `data.json`.

Dettagli tecnici e note sulle fonti sono in `CLAUDE.md`. Il formato dei dati è in
`docs/FORMATO_DATI.md`.
