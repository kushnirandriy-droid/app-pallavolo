/* Virtus Caserta — PWA. Legge data.json (scritto dallo scraper) e disegna le tre schede. */
"use strict";

const TZ = "Europe/Rome";
const S = {
  dati: null,
  cal: { gruppo: "virtus", girone: null, soloVirtus: true },
  cla: { gruppo: null, girone: null },
  timer: null,
  vivoInCorso: false,
  fermaScorrimento: false,
  primaVolta: true,
};

/* ------------------------------------------------------------ utilità */
const $ = (sel) => document.querySelector(sel);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (opz) => new Intl.DateTimeFormat("it-IT", { timeZone: TZ, ...opz });
const fOra = fmt({ hour: "2-digit", minute: "2-digit" });
const fGiorno = fmt({ weekday: "long", day: "numeric", month: "long" });
const fGiornoBreve = fmt({ weekday: "short", day: "numeric", month: "short" });
// chiave del giorno AAAA-MM-GG (en-CA), confrontabile come testo; it-IT darebbe GG/MM/AAAA
const fChiave = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fAggiornato = fmt({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const sq = (id) => S.dati.squadre[id] || { nome: "?" };
const camp = (id) => S.dati.campionati.find((c) => c.id === id);
const isVirtus = (id) => !!sq(id).virtus;
const garaVirtus = (g) => isVirtus(g.casa) || isVirtus(g.ospite);
const giocata = (g) => g.set && g.set[0] !== null;
const quando = (g) => (g.data ? new Date(g.data) : null);

function nomeBreve(c) {
  if (!c) return "";
  let n = c.nome
    .replace(/^Serie D Femminile$/i, "Serie D")
    .replace(/Under (\d+)/i, "U$1")
    .replace(/ Femminile/i, " F")
    .replace(/ Maschile/i, " M")
    .replace(/^1 Divisione/i, "1ª Div");
  if (c.girone && c.girone !== "Unico" && c.fonte !== "campania") n += " " + c.girone;
  return n;
}
const maiuscola = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const nomeLungo =(c) => (c ? c.nome + (c.girone && c.girone !== "Unico" ? " — girone " + c.girone : "") : "");

function colore(testo) {
  let h = 0;
  for (const ch of testo) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 38%)`;
}
function iniziali(nome) {
  const scarta = new Set(["ASD", "A.S.D.", "SSD", "VOLLEY", "PALLAVOLO", "IL", "LA", "DI", "DEL", "SNC", "ACADEMY"]);
  const parole = nome.toUpperCase().split(/\s+/).filter((p) => p && !scarta.has(p));
  return ((parole[0] || nome)[0] + (parole[1] ? parole[1][0] : (parole[0] || "")[1] || "")).replace(/[^A-Z0-9]/g, "");
}
function logo(id, cls = "") {
  const s = sq(id);
  if (s.logo) return `<img class="logo ${cls}" src="${esc(s.logo)}" alt="" loading="lazy">`;
  return `<span class="logo iniziali ${cls}" style="background:${colore(s.nome)}">${esc(iniziali(s.nome))}</span>`;
}

/* ------------------------------------------------------------ dati */
// ora dell'ultimo dato: il giro del bot o l'ultima lettura dal vivo, se più recente
const ultimoDato = () => Math.max(Date.parse(S.dati.aggiornato) || 0, S.dati._dalvivo || 0);

function intestazione() {
  $("#testata-sotto").textContent = `Stagione ${S.dati.stagione} · aggiornato ${fAggiornato.format(new Date(ultimoDato()))}`;
}

/* Ridisegna senza far saltare lo scorrimento (serve quando arrivano dati dal vivo). */
function ridisegna() {
  const y = window.scrollY;
  S.fermaScorrimento = true;
  disegna();
  S.fermaScorrimento = false;
  window.scrollTo(0, y);
}

let avvisoTimer = null;
function avviso(testo) {
  const el = $("#avviso");
  el.textContent = testo;
  el.hidden = false;
  el.classList.remove("esce");
  clearTimeout(avvisoTimer);
  avvisoTimer = setTimeout(() => { el.classList.add("esce"); setTimeout(() => (el.hidden = true), 300); }, 3500);
}

/* forza = tasto Aggiorna: rilegge data.json e poi chiede tutto ai siti FIPAV. */
async function caricaDati(forza = false) {
  const bt = $("#bt-aggiorna");
  bt.classList.add("gira");
  try {
    const r = await fetch("data.json" + (forza ? "?t=" + Date.now() : ""), { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    const nuovi = await r.json();
    nuovi.gare.forEach((g) => (g._d = quando(g)));
    DalVivo.applica(nuovi);       // letture fatte dal telefono più recenti del bot
    S.dati = nuovi;
    intestazione();
    if (!S.cla.gruppo) {
      const ev = camp(S.dati.campionato_evidenza);
      S.cla.gruppo = ev ? ev.gruppo : S.dati.campionati[0].gruppo;
    }
    disegna();
  } catch (e) {
    if (!S.dati) $("#vista").innerHTML = `<div class="vuoto">Impossibile leggere i dati.<br>Controlla la connessione e riprova.</div>`;
  } finally {
    bt.classList.remove("gira");
  }
  if (!S.dati) return;
  if (forza) await dalVivo("tutto");
  else if (DalVivo.serve(S.dati)) dalVivo("partite");
}

/* Legge i siti FIPAV direttamente dal telefono (vedi dalvivo.js). */
async function dalVivo(modo) {
  if (S.vivoInCorso) return;
  S.vivoInCorso = true;
  const bt = $("#bt-aggiorna");
  bt.classList.add("gira");
  if (modo === "tutto") $("#testata-sotto").textContent = "Aggiorno dai siti FIPAV…";
  try {
    const esito = await DalVivo.aggiorna(S.dati, modo, (P) => {
      if (P.cambiate.size || P.classificheCambiate) ridisegna();
      if (modo === "tutto") $("#testata-sotto").textContent = "Serie D aggiornata · ora i campionati provinciali…";
    });
    intestazione();
    if (esito.cambiate || esito.classifiche) ridisegna();
    if (modo === "tutto") {
      if (esito.falliti === esito.richieste) {
        avviso("Siti FIPAV non raggiungibili: restano i dati delle " + fOra.format(new Date(ultimoDato())));
      } else {
        let t = esito.nuovi === 1 ? "1 risultato nuovo" : esito.nuovi > 1 ? `${esito.nuovi} risultati nuovi`
          : esito.cambiate || esito.classifiche ? "Dati aggiornati" : "Già tutto aggiornato";
        t += " · ore " + fOra.format(new Date(ultimoDato()));
        if (esito.falliti) t += " · un sito non ha risposto del tutto";
        avviso(t);
      }
    }
  } catch (e) {
    console.warn(e);
    intestazione();
    if (modo === "tutto") avviso("Aggiornamento non riuscito, riprova tra poco");
  } finally {
    S.vivoInCorso = false;
    bt.classList.remove("gira");
  }
}

/* gruppi = campionati con più gironi (es. Under 15 F: A, B, C, D) */
function gruppi() {
  const m = new Map();
  for (const c of S.dati.campionati) {
    if (!m.has(c.gruppo)) m.set(c.gruppo, []);
    m.get(c.gruppo).push(c);
  }
  return m;
}
function gironeDefault(lista) {
  return (lista.find((c) => c.virtus) || lista[0]).id;
}

/* ------------------------------------------------------------ riga gara */
function rigaGara(g, conCampionato = true) {
  const c = camp(g.campionato);
  const d = g._d;
  let centro;
  let esitoCasa = "", esitoOspite = "";
  if (giocata(g)) {
    centro = `<b>${g.set[0]} - ${g.set[1]}</b>`;
    if (g.set[0] !== g.set[1]) {
      esitoCasa = g.set[0] > g.set[1] ? "" : "perde";
      esitoOspite = g.set[1] > g.set[0] ? "" : "perde";
    }
  } else {
    centro = d ? `<span class="ora">${fOra.format(d)}</span><small>${g.stato === "da_disputare" ? "" : esc(g.stato_testo)}</small>` : "<small>da definire</small>";
  }
  let pallino = "";
  if (giocata(g) && garaVirtus(g)) {
    const virtusCasa = isVirtus(g.casa);
    const vinta = virtusCasa ? g.set[0] > g.set[1] : g.set[1] > g.set[0];
    pallino = `<span class="esito ${vinta ? "v" : "p"}"></span>`;
  }
  return `<a class="gara" href="#gara/${esc(g.id)}">
    <div class="gara-testa">
      <span>${pallino}${conCampionato ? `<span class="badge ${c && c.fonte === "campania" ? "d" : ""}">${esc(nomeBreve(c))}</span>` : `Giornata ${g.giornata ?? "?"}`}</span>
      <span>${d ? esc(fGiornoBreve.format(d)) : ""}</span>
    </div>
    <div class="sq ${isVirtus(g.casa) ? "virtus" : ""} ${esitoCasa}">${logo(g.casa)}<span class="sq-nome">${esc(sq(g.casa).nome)}</span></div>
    <div class="punteggio">${centro}</div>
    <div class="sq dx ${isVirtus(g.ospite) ? "virtus" : ""} ${esitoOspite}">${logo(g.ospite)}<span class="sq-nome">${esc(sq(g.ospite).nome)}</span></div>
  </a>`;
}

/* ------------------------------------------------------------ HOME */
function vistaHome() {
  const adesso = Date.now();
  const ev = S.dati.campionato_evidenza;
  const gareEv = S.dati.gare.filter((g) => g.campionato === ev && garaVirtus(g));
  // prossima (o in corso: iniziata da meno di 3 ore e ancora senza risultato)
  const prossima = gareEv.find((g) => !giocata(g) && g._d && g._d.getTime() > adesso - 3 * 3600e3);
  const ultima = [...gareEv].reverse().find(giocata);

  let html = "";
  const g = prossima || ultima;
  if (g) {
    const c = camp(g.campionato);
    const inCorso = prossima && g._d.getTime() <= adesso;
    html += `<a class="eroe ${S.primaVolta ? "anima" : ""}" href="#gara/${esc(g.id)}">
      <div class="lampo"></div>
      <div class="eroe-etichetta">${prossima ? (inCorso ? "In campo ora" : "Prossima partita") : "Ultima partita"}</div>
      <div class="eroe-campionato">${esc(nomeLungo(c))} · giornata ${g.giornata ?? "?"}</div>
      <div class="scontro">
        <div class="scontro-lato sx">${logo(g.casa)}<div class="scontro-nome ${isVirtus(g.casa) ? "virtus" : ""}">${esc(sq(g.casa).nome)}</div></div>
        <div class="scontro-vs">VS</div>
        <div class="scontro-lato dx">${logo(g.ospite)}<div class="scontro-nome ${isVirtus(g.ospite) ? "virtus" : ""}">${esc(sq(g.ospite).nome)}</div></div>
      </div>
      ${prossima && !inCorso ? `<div class="conto" id="conto"></div>` : ""}
      ${inCorso ? `<div class="eroe-stato">Partita in corso · risultato appena disponibile</div>` : ""}
      ${!prossima ? `<div class="eroe-punteggio">${g.set[0]} - ${g.set[1]}</div>` : ""}
      <div class="eroe-quando">${g._d ? `<b>${esc(fGiorno.format(g._d))}</b> ore ${fOra.format(g._d)}` : ""}${g.palestra && S.dati.palestre[g.palestra] ? `<br>${esc(S.dati.palestre[g.palestra].nome)} · ${esc(S.dati.palestre[g.palestra].citta)}` : ""}</div>
    </a>`;
    S.primaVolta = false;
  }

  const virtus = S.dati.gare.filter(garaVirtus);
  const risultati = virtus.filter(giocata).sort((a, b) => b._d - a._d).slice(0, 8);
  const prossime = virtus.filter((x) => !giocata(x) && x._d && x._d.getTime() > adesso - 3 * 3600e3 && x !== prossima).slice(0, 6);

  html += `<div class="sezione">Ultimi risultati</div>`;
  html += risultati.length ? risultati.map((x) => rigaGara(x)).join("") : `<div class="vuoto">Nessun risultato ancora.</div>`;
  html += `<div class="sezione">Prossime gare Virtus</div>`;
  html += prossime.length ? prossime.map((x) => rigaGara(x)).join("") : `<div class="vuoto">Nessuna gara in programma.</div>`;
  html += piede();
  $("#vista").innerHTML = html;

  if (prossima && $("#conto")) {
    const aggiorna = () => {
      const ms = Math.max(0, prossima._d.getTime() - Date.now());
      const gg = Math.floor(ms / 864e5), hh = Math.floor(ms / 36e5) % 24, mm = Math.floor(ms / 6e4) % 60, ss = Math.floor(ms / 1e3) % 60;
      const box = (n, t) => `<div><b>${String(n).padStart(2, "0")}</b><span>${t}</span></div>`;
      const el = $("#conto");
      if (!el) return clearInterval(S.timer);
      el.innerHTML = box(gg, "giorni") + box(hh, "ore") + box(mm, "min") + box(ss, "sec");
      if (ms === 0) { clearInterval(S.timer); disegna(); }
    };
    aggiorna();
    S.timer = setInterval(aggiorna, 1000);
  }
}

/* ------------------------------------------------------------ CALENDARIO */
function selettoreGruppo(valore, conVirtus) {
  let o = conVirtus ? `<option value="virtus" ${valore === "virtus" ? "selected" : ""}>Tutte le squadre Virtus</option>` : "";
  for (const [k, lista] of gruppi()) {
    o += `<option value="${esc(k)}" ${valore === k ? "selected" : ""}>${esc(lista[0].nome)}</option>`;
  }
  return `<select class="selettore" id="sel-gruppo">${o}</select>`;
}
function pilloleGironi(lista, scelto) {
  if (lista.length < 2) return "";
  return `<div class="pillole" id="pill-gironi">${lista
    .map((c) => `<button data-id="${esc(c.id)}" class="${c.id === scelto ? "on" : ""}">Girone ${esc(c.girone)}${c.virtus ? ' <span class="punto">●</span>' : ""}</button>`)
    .join("")}</div>`;
}

function vistaCalendario() {
  const f = S.cal;
  const gr = gruppi();
  let gare;
  let filtri = selettoreGruppo(f.gruppo, true);
  let mostraToggle = false;
  if (f.gruppo === "virtus" || !gr.has(f.gruppo)) {
    f.gruppo = "virtus";
    gare = S.dati.gare.filter(garaVirtus);
  } else {
    const lista = gr.get(f.gruppo);
    if (!f.girone || !lista.some((c) => c.id === f.girone)) f.girone = gironeDefault(lista);
    const c = camp(f.girone);
    filtri += pilloleGironi(lista, f.girone);
    gare = S.dati.gare.filter((g) => g.campionato === f.girone);
    mostraToggle = c.tutte_le_gare && c.virtus;
    if (mostraToggle && f.soloVirtus) gare = gare.filter(garaVirtus);
  }
  if (mostraToggle) {
    filtri += `<div class="pillole" id="pill-virtus">
      <button data-v="1" class="${f.soloVirtus ? "on" : ""}">Solo Virtus</button>
      <button data-v="0" class="${!f.soloVirtus ? "on" : ""}">Tutto il girone</button></div>`;
  }

  const oggi = fChiave.format(new Date());
  let html = `<div class="filtri">${filtri}</div>`;
  let ultimoGiorno = null, segnatoOggi = false;
  for (const g of gare) {
    const k = g._d ? fChiave.format(g._d) : "zz";
    if (k !== ultimoGiorno) {
      ultimoGiorno = k;
      // segnaposto NON sticky: la posizione di un'intestazione sticky agganciata è falsa
      if (!segnatoOggi && k >= oggi) { html += `<div id="da-oggi"></div>`; segnatoOggi = true; }
      html += `<div class="giorno ${k === oggi ? "oggi" : ""}">${g._d ? esc(maiuscola(fGiorno.format(g._d))) + (k === oggi ? " · oggi" : "") : "Data da definire"}</div>`;
    }
    html += rigaGara(g, f.gruppo === "virtus");
  }
  if (!gare.length) html += `<div class="vuoto">Nessuna gara.</div>`;
  html += piede();
  $("#vista").innerHTML = html;

  $("#sel-gruppo").onchange = (e) => { f.gruppo = e.target.value; f.girone = null; f.soloVirtus = true; disegna(); };
  document.querySelectorAll("#pill-gironi button").forEach((b) => (b.onclick = () => {
    f.girone = b.dataset.id;
    f.soloVirtus = camp(f.girone).virtus;   // girone senza Virtus: si vede tutto
    disegna();
  }));
  document.querySelectorAll("#pill-virtus button").forEach((b) => (b.onclick = () => { f.soloVirtus = b.dataset.v === "1"; disegna(); }));
  const ancora = $("#da-oggi");
  if (ancora && !S.fermaScorrimento) {
    const y = ancora.offsetTop - (parseFloat(getComputedStyle(document.body).paddingTop) || 0);
    window.scrollTo({ top: Math.max(0, y) });
  }
}

/* ------------------------------------------------------------ CLASSIFICHE */
function vistaClassifiche() {
  const f = S.cla;
  const gr = gruppi();
  if (!gr.has(f.gruppo)) f.gruppo = [...gr.keys()][0];
  const lista = gr.get(f.gruppo);
  if (!f.girone || !lista.some((c) => c.id === f.girone)) f.girone = gironeDefault(lista);
  const c = camp(f.girone);

  let html = `<div class="filtri">${selettoreGruppo(f.gruppo, false)}${pilloleGironi(lista, f.girone)}</div>`;
  if (!c.classifica.length) {
    html += `<div class="vuoto">Classifica non ancora disponibile.</div>`;
  } else {
    html += `<table class="tabella"><thead><tr>
      <th>#</th><th style="text-align:left">Squadra</th><th>Pt</th><th>G</th><th>V</th><th>P</th><th>Set</th></tr></thead><tbody>`;
    for (const r of c.classifica) {
      html += `<tr class="${isVirtus(r.squadra) ? "virtus" : ""}">
        <td>${r.pos ?? ""}</td>
        <td class="nome"><div>${logo(r.squadra)}<span>${esc(sq(r.squadra).nome)}</span></div></td>
        <td class="pt">${r.punti ?? 0}</td><td>${r.g ?? 0}</td><td>${r.v ?? 0}</td><td>${r.p ?? 0}</td>
        <td>${r.sf ?? 0}-${r.ss ?? 0}</td></tr>`;
    }
    html += `</tbody></table>`;
    if (c.classifica.some((r) => r.pen)) html += `<div class="nota">Alcune squadre hanno penalità in punti.</div>`;
  }
  html += piede();
  $("#vista").innerHTML = html;
  $("#sel-gruppo").onchange = (e) => { f.gruppo = e.target.value; f.girone = null; disegna(); };
  document.querySelectorAll("#pill-gironi button").forEach((b) => (b.onclick = () => { f.girone = b.dataset.id; disegna(); }));
}

/* ------------------------------------------------------------ SCHEDA PARTITA */
function vistaGara(id) {
  const g = S.dati.gare.find((x) => x.id === id);
  if (!g) { $("#vista").innerHTML = `<a class="indietro" href="#home">‹ Indietro</a><div class="vuoto">Gara non trovata.</div>`; return; }
  const c = camp(g.campionato);
  const p = g.palestra ? S.dati.palestre[g.palestra] : null;

  let html = `<a class="indietro" href="javascript:history.back()">‹ Indietro</a>
  <div class="eroe">
    <div class="eroe-etichetta">${esc(nomeLungo(c))}</div>
    <div class="eroe-campionato">Giornata ${g.giornata ?? "?"}${g.numero ? " · gara n° " + g.numero : ""}</div>
    <div class="scontro">
      <div class="scontro-lato sx">${logo(g.casa)}<div class="scontro-nome ${isVirtus(g.casa) ? "virtus" : ""}">${esc(sq(g.casa).nome)}</div></div>
      <div class="scontro-vs">${giocata(g) ? "" : "VS"}</div>
      <div class="scontro-lato dx">${logo(g.ospite)}<div class="scontro-nome ${isVirtus(g.ospite) ? "virtus" : ""}">${esc(sq(g.ospite).nome)}</div></div>
    </div>
    ${giocata(g) ? `<div class="eroe-punteggio">${g.set[0]} - ${g.set[1]}</div>` : ""}
    ${g.parziali && g.parziali.length ? `<div class="scheda-set">${g.parziali
      .map((s, i) => `<span>${i + 1}° set ${s[0] > s[1] ? `<b>${s[0]}</b>-${s[1]}` : `${s[0]}-<b>${s[1]}</b>`}</span>`).join("")}</div>` : ""}
  </div>
  <div class="dati">
    <div><span>Data</span><b>${g._d ? esc(fGiorno.format(g._d)) : "da definire"}</b></div>
    <div><span>Ora</span><b>${g._d ? fOra.format(g._d) : "—"}</b></div>
    <div><span>Stato</span><b>${esc(g.stato_testo || g.stato)}${g.arbitro && !/arbitro/i.test(g.stato_testo || "") ? " · arbitro designato" : ""}${g.golden_set ? " · golden set" : ""}</b></div>
  </div>`;

  if (p) {
    const dove = p.lat ? `${p.lat},${p.lon}` : [p.nome, p.via, p.citta, p.prov].filter(Boolean).join(" ");
    const mappa = `https://maps.google.com/maps?q=${encodeURIComponent(dove)}&z=15&output=embed`;
    html += `<div class="palestra">
      <div class="palestra-testo">
        <div class="palestra-nome">${esc(p.nome)}</div>
        <div class="palestra-via">${esc([p.via, [p.citta, p.prov].filter(Boolean).join(" ")].filter(Boolean).join(" · "))}</div>
      </div>
      <iframe class="mappa" src="${esc(mappa)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Mappa"></iframe>
      <button class="bt-grande" id="bt-portami">Portami lì</button>
    </div>`;
  }
  if (g.url) html += `<a class="link-fonte" href="${esc(g.url)}" target="_blank" rel="noopener">Vedi la gara sul sito FIPAV</a>`;
  else if (c && c.url) html += `<a class="link-fonte" href="${esc(c.url)}" target="_blank" rel="noopener">Vedi il girone sul sito FIPAV</a>`;
  $("#vista").innerHTML = html;
  window.scrollTo(0, 0);

  if (p) $("#bt-portami").onclick = () => apriPortami(p);
}

function apriPortami(p) {
  const testo = [p.nome, p.via, p.citta, p.prov].filter(Boolean).join(", ");
  const dest = p.lat ? `${p.lat},${p.lon}` : testo;
  $("#vai-google").href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  $("#vai-apple").href = p.lat
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}&q=${encodeURIComponent(p.nome)}`
    : `https://maps.apple.com/?daddr=${encodeURIComponent(testo)}`;
  $("#foglio").hidden = false;
}
function chiudiPortami() { $("#foglio").hidden = true; }

function piede() {
  return `<div class="piede">Dati: FIPAV Caserta e FIPAV Campania · aggiornati ${esc(fAggiornato.format(new Date(ultimoDato())))}${S.dati._dalvivo && S.dati._dalvivo > Date.parse(S.dati.aggiornato) ? " (letti dal telefono)" : ""}</div>`;
}

/* ------------------------------------------------------------ router */
function disegna() {
  if (!S.dati) return;
  clearInterval(S.timer);
  const [vista, arg] = (location.hash.slice(1) || "home").split("/");
  document.querySelectorAll(".schede a").forEach((a) =>
    a.classList.toggle("attiva", a.dataset.vista === (vista === "gara" ? "" : vista)));
  if (vista === "calendario") vistaCalendario();
  else if (vista === "classifiche") vistaClassifiche();
  else if (vista === "gara") vistaGara(decodeURIComponent(arg || ""));
  else vistaHome();
}

window.addEventListener("hashchange", () => { chiudiPortami(); S.primaVolta = true; disegna(); if (!location.hash.startsWith("#calendario")) window.scrollTo(0, 0); });
$("#bt-aggiorna").onclick = () => caricaDati(true);
$("#vai-annulla").onclick = chiudiPortami;
$("#foglio").onclick = (e) => { if (e.target.id === "foglio") chiudiPortami(); };
["vai-google", "vai-apple"].forEach((id) => ($("#" + id).onclick = () => setTimeout(chiudiPortami, 300)));
// tornando all'app dopo un po', rilegge i dati
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.dati) caricaDati(); });

// app aperta durante una partita: ogni minuto guarda se è il momento di un controllo
// (dalvivo.js lo fa al massimo ogni 5 minuti, e solo se c'è una gara appena finita)
setInterval(() => {
  if (document.visibilityState === "visible" && S.dati && !S.vivoInCorso && DalVivo.serve(S.dati)) dalVivo("partite");
}, 60e3);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
caricaDati();
