/* Aggiornamento "dal vivo": il telefono legge direttamente i siti FIPAV.

   Entrambi i siti rispondono con Access-Control-Allow-Origin: *, quindi il browser può
   leggerli senza aspettare il bot di GitHub (i cui giri programmati GitHub può ritardare
   di ore). È la stessa lettura di scraper/campania.py e scraper/caserta.py, ridotta a
   ciò che cambia durante la stagione: risultati, parziali, stato, data, classifiche.
   Gare, palestre e loghi nuovi restano compito del bot.
   >>> SE CAMBIA IL PARSER PYTHON, ALLINEARE ANCHE QUESTO FILE. <<<

   Ciò che si legge viene salvato nel telefono (localStorage) con l'ora della lettura e
   applicato sopra data.json finché il bot non l'ha raggiunto. */
"use strict";

const DalVivo = (() => {
  const CE_BASE = "https://caserta.portalefipav.net";
  const CE = { comitato: 19, stagione: 2399, pid: 7261, societa: 5150 };
  const CR_BASE = "https://www.fipavcampania.it/mobile";
  const CHIAVE = "virtus-dalvivo-v1";
  const PARALLELE = 2;                       // richieste contemporanee al massimo
  const SCADENZA_MS = 3 * 864e5;             // letture più vecchie di 3 giorni: via
  const FINESTRA = [40 * 6e4, 6 * 36e5];     // gara iniziata da 40 min a 6 ore fa
  const PAUSA_AUTO_MS = 5 * 6e4;             // controllo automatico al massimo ogni 5 min
  const STATI = { stato0: "da_disputare", statodesignata: "da_disputare", stato5: "omologata",
    stato5gs: "omologata", stato3: "documenti_mancanti" };

  /* ---------------------------------------------------------- utilità (come comune.py) */
  const pulisci = (t) => String(t ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const slug = (t) => String(t).normalize("NFKD").replace(/[^\x00-\x7f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  function numero(t) {
    t = pulisci(t).replace(",", ".");
    if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
    return t !== "" && Number.isFinite(Number(t)) ? Number(t) : null;
  }
  // testo con uno spazio fra i pezzi, come get_text(" ") di BeautifulSoup
  function testo(el) {
    const parti = [];
    (function giro(n) {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) parti.push(c.nodeValue);
        else if (c.nodeType === 1 && c.nodeName !== "SCRIPT" && c.nodeName !== "STYLE") giro(c);
      }
    })(el);
    return pulisci(parti.join(" "));
  }
  const testoDiretto = (el) => pulisci([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(""));
  const testoDaHtml = (h) => testo(new DOMParser().parseFromString(h, "text/html").body);
  const figliTd = (tr) => [...tr.children].filter((x) => x.nodeName === "TD");

  // data italiana → ISO con fuso di Roma, come data_iso() in comune.py
  let fOff = null;
  function offsetRoma(ms) {
    fOff = fOff || new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", timeZoneName: "shortOffset" });
    const p = fOff.formatToParts(new Date(ms)).find((x) => x.type === "timeZoneName");
    const m = /GMT([+-]\d+)/.exec(p ? p.value : "");
    return m ? +m[1] : 1;
  }
  function isoRoma(gg, mm, aaaa, hh = 0, mi = 0) {
    if (aaaa < 100) aaaa += 2000;
    const base = Date.UTC(aaaa, mm - 1, gg, hh, mi);
    let off = 1;
    try { off = offsetRoma(base - 36e5); off = offsetRoma(base - off * 36e5); } catch { off = 1; }
    const z = (n) => String(n).padStart(2, "0");
    return `${aaaa}-${z(mm)}-${z(gg)}T${z(hh)}:${z(mi)}:00${off < 0 ? "-" : "+"}${z(Math.abs(off))}:00`;
  }

  /* ---------------------------------------------------------- rete */
  async function scarica(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: "no-store", credentials: "omit" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const b = await r.arrayBuffer();
      let h;   // i siti dichiarano utf-8 ma alcune pagine sono in Windows-1252
      try { h = new TextDecoder("utf-8", { fatal: true }).decode(b); }
      catch { h = new TextDecoder("windows-1252").decode(b); }
      return new DOMParser().parseFromString(h, "text/html");
    } finally {
      clearTimeout(t);
    }
  }
  // esegue i lavori al massimo PARALLELE alla volta; un errore non ferma gli altri
  async function aGruppi(lavori) {
    const esiti = [];
    let i = 0;
    const operaio = async () => {
      while (i < lavori.length) {
        const k = i++;
        try { esiti[k] = { ok: true, v: await lavori[k]() }; }
        catch (e) { esiti[k] = { ok: false, e }; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLELE, lavori.length) }, operaio));
    return esiti;
  }

  /* ---------------------------------------------------------- memoria nel telefono */
  function leggiMemoria() {
    try {
      const m = JSON.parse(localStorage.getItem(CHIAVE) || "null");
      if (m && m.gare && m.classifiche && m.squadre) return m;
    } catch { /* memoria assente o illeggibile */ }
    return { ultimo: 0, ultimoAuto: 0, gare: {}, classifiche: {}, squadre: {} };
  }
  function salvaMemoria(m) {
    try { localStorage.setItem(CHIAVE, JSON.stringify(m)); } catch { /* piena o bloccata: pazienza */ }
  }

  /* ---------------------------------------------------------- applicazione delle letture */
  const conRisultato = (s) => Array.isArray(s) && s[0] !== null && s[0] !== undefined;
  const sommaG = (righe) => (righe || []).reduce((t, r) => t + (r.g || 0), 0);
  const gara = (dati, id) => dati._indice?.get(id) || dati.gare.find((g) => g.id === id);

  function assegnaGara(g, campi) {
    for (const [k, v] of Object.entries(campi)) {
      if (k === "t" || v === null || v === undefined) continue;  // un null non cancella un dato noto
      g[k] = v;
      if (k === "data") g._d = new Date(v);
    }
  }

  /* Applica sopra data.json le letture salvate. Una lettura vince se è più recente del
     giro del bot, oppure se porta un risultato che il bot non ha ancora. */
  function applica(dati) {
    const m = leggiMemoria();
    const adesso = Date.now();
    const bot = Date.parse(dati.aggiornato) || 0;
    dati._indice = new Map(dati.gare.map((g) => [g.id, g]));
    let utili = 0;
    for (const [id, s] of Object.entries(m.squadre)) {
      if (!dati.squadre[id]) dati.squadre[id] = s;
    }
    for (const [id, l] of Object.entries(m.gare)) {
      const g = gara(dati, id);
      if (!g || adesso - l.t > SCADENZA_MS) { delete m.gare[id]; continue; }
      if (l.t > bot || (conRisultato(l.set) && !conRisultato(g.set))) { assegnaGara(g, l); utili++; }
      else delete m.gare[id];                   // il bot l'ha raggiunta
    }
    for (const [cid, l] of Object.entries(m.classifiche)) {
      const c = dati.campionati.find((x) => x.id === cid);
      if (!c || adesso - l.t > SCADENZA_MS) { delete m.classifiche[cid]; continue; }
      if (l.t > bot || sommaG(l.righe) > sommaG(c.classifica)) { c.classifica = l.righe; utili++; }
      else delete m.classifiche[cid];
    }
    salvaMemoria(m);
    dati._dalvivo = utili ? m.ultimo : 0;
    return utili;
  }

  /* ---------------------------------------------------------- lettura delle fonti */
  function nuovaPassata(dati) {
    return { dati, t: Date.now(), gare: {}, classifiche: {}, squadre: {}, cambiate: new Set(), classificheCambiate: 0 };
  }
  const CAMPI_RISULTATO = ["set", "parziali"];
  function mettiGara(P, id, campi) {
    const g = gara(P.dati, id);
    if (!g) return;                             // gara nuova: la aggiungerà il bot
    for (const k of CAMPI_RISULTATO) {
      if (campi[k] != null && JSON.stringify(g[k]) !== JSON.stringify(campi[k])) P.cambiate.add(id);
    }
    assegnaGara(g, campi);
    P.gare[id] = { ...(P.gare[id] || {}), ...campi, t: P.t };
  }
  function mettiClassifica(P, cid, righe) {
    const c = P.dati.campionati.find((x) => x.id === cid);
    if (!c || !righe.length) return;
    if (JSON.stringify(c.classifica) !== JSON.stringify(righe)) P.classificheCambiate++;
    c.classifica = righe;
    P.classifiche[cid] = { righe, t: P.t };
  }
  function mettiSquadra(P, id, s) {
    if (P.dati.squadre[id]) return;
    // stessa società già nota: si riusa il suo logo
    if (!s.logo && s.societa_id) {
      const gemella = Object.values(P.dati.squadre).find((x) => x.societa_id === s.societa_id && x.logo);
      if (gemella) s.logo = gemella.logo;
    }
    P.dati.squadre[id] = s;
    P.squadre[id] = s;
  }

  // ---- FIPAV Campania (come campania.py)
  async function dettaglioCampania(camp, garaNum) {
    const d = await scarica(`${CR_BASE}/risultati.asp?CampionatoId=${camp}&GaraId=${garaNum}`);
    const c = d.getElementById("contenitorePagina") || d.body;
    const t = testo(c);
    const out = {};
    let m = /Giornata\s+(\d+)\s*-\s*Gara\s+N\S*\s*(\d+)/.exec(t);
    if (m) { out.giornata = +m[1]; out.numero = +m[2]; }
    m = /(\d{2})\/(\d{2})\/(\d{4})(?:\s+ore\s+(\d{1,2})[:.](\d{2}))?/.exec(t);
    if (m) out.data = isoRoma(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0));
    const pc = [...c.querySelectorAll("#risultatoCasa .parziale")].map((x) => numero(x.textContent));
    const po = [...c.querySelectorAll("#risultatoOspite .parziale")].map((x) => numero(x.textContent));
    out.parziali = pc.map((a, i) => [a, po[i]]).filter(([a, b]) => a !== null && b !== null && b !== undefined);
    return out;
  }

  async function campania(P, campId) {
    const num = campId.slice(3);
    const d = await scarica(`${CR_BASE}/risultati.asp?CampionatoId=${num}`);
    const c = d.getElementById("contenitorePagina") || d.body;
    const dettagli = [];
    let giornata = null;
    for (const el of c.querySelectorAll("div.divGiornata, a.gara")) {
      if (el.matches("div.divGiornata")) { const m = /(\d+)/.exec(el.textContent); giornata = m ? +m[1] : null; continue; }
      const m = /GaraId=(\d+)/.exec(el.getAttribute("href") || "");
      if (!m) continue;
      const id = "cr-" + m[1];
      const g = gara(P.dati, id);
      if (!g) continue;
      const sc = numero(el.querySelector(".setCasa")?.textContent);
      const so = numero(el.querySelector(".setOspite")?.textContent);
      const set = sc !== null && so !== null ? [sc, so] : [null, null];
      const giocata = set[0] !== null;
      // risultato nuovo, cambiato o senza parziali: serve la pagina della gara
      if (giocata && (JSON.stringify(g.set) !== JSON.stringify(set) || !(g.parziali || []).length)) {
        dettagli.push({ id, num: m[1] });
      }
      mettiGara(P, id, {
        set, giornata,
        stato: giocata ? "disputata" : "da_disputare",
        stato_testo: giocata ? "disputata" : "da disputare",
        ...(giocata ? {} : { parziali: [] }),
      });
    }
    const esiti = await aGruppi(dettagli.map((x) => () => dettaglioCampania(num, x.num)));
    esiti.forEach((e, i) => { if (e.ok) mettiGara(P, dettagli[i].id, e.v); });

    const dc = await scarica(`${CR_BASE}/risultati.asp?CampionatoId=${num}&vis=classifica`);
    const righe = [];
    for (const tr of dc.querySelectorAll("table.tabellaClassifica tr")) {
      const td = tr.querySelector("td.claSquadra");
      if (!td) continue;
      const v = (cls) => { const x = tr.querySelector("td." + cls); return x ? numero(x.textContent) : null; };
      const nome = pulisci(td.textContent);
      const sq = "cr-" + slug(nome);
      mettiSquadra(P, sq, { nome, societa: null, societa_id: null, logo: null, virtus: nome.toUpperCase().includes("VIRTUS CASERTA") });
      righe.push({
        pos: v("claPosizione"), squadra: sq, punti: v("claPunti"), g: v("claGareGiocate"),
        v: v("claGareVinte"), p: v("claGarePerse"), sf: v("claSetFatti"), ss: v("claSetSubiti"),
        pf: v("claPuntiFatti"), ps: v("claPuntiSubiti"), pen: v("claPenalita"),
      });
    }
    mettiClassifica(P, campId, righe);
  }

  // ---- FIPAV Caserta (come caserta.py)
  const urlElencoCE = (cid, sid) => `${CE_BASE}/risultati-classifiche.aspx?ComitatoId=${CE.comitato}` +
    `&StId=${CE.stagione}&DataDa=&StatoGara=&CId=${cid || ""}&SId=${sid || ""}&PId=${CE.pid}&btFiltro=CERCA`;

  function squadraCaserta(P, td) {
    const nome = pulisci(td.textContent);
    const societa = pulisci(td.getAttribute("title") || "");
    const img = td.querySelector("img");
    const m = img && /\/img\/(\d+)\/Loghi\//.exec(img.getAttribute("src") || "");
    const sid = m ? +m[1] : null;
    const id = `ce-${sid || "x"}-${slug(nome)}`;
    mettiSquadra(P, id, { nome, societa: societa || null, societa_id: sid, logo: null, virtus: sid === CE.societa });
    return id;
  }

  async function elencoCaserta(P, cid, sid) {
    const d = await scarica(urlElencoCE(cid, sid));
    const perTitolo = {};
    d.querySelectorAll('select[name="CId"] option').forEach((o) => {
      if (/^\d+$/.test(o.value)) perTitolo[pulisci(o.textContent)] = +o.value;
    });
    for (const t of d.querySelectorAll("table.tbl-risultati")) {
      const cap = t.querySelector("caption");
      if (!cap || !t.tBodies[0]) continue;
      const link = cap.querySelector("a.link_classifica");
      const mc = link && /CId=(\d+)/.exec(link.getAttribute("href") || "");
      const cId = mc ? +mc[1] : (perTitolo[pulisci(cap.textContent)] ?? cid);
      if (!cId) continue;
      for (const tr of t.tBodies[0].children) {
        if (tr.nodeName !== "TR") continue;
        const td = figliTd(tr);
        if (td.length < 8) continue;
        const ris = td[5];
        const garaId = (ris.id || "").replace(/\D/g, "");
        if (!garaId) continue;
        let data = null;
        const md = /^(\d{2})\/(\d{2})\/(\d{2,4})\s*(\d{1,2}):(\d{2})?/.exec(pulisci(td[2].textContent));
        if (md) data = isoRoma(+md[1], +md[2], +md[3], +md[4], +(md[5] || 0));
        let set = [null, null];
        const ms = /^(\d+)\s*-\s*(\d+)/.exec(pulisci(ris.textContent));
        if (ms) set = [+ms[1], +ms[2]];
        const parziali = [...td[6].querySelectorAll("span.parziali")]
          .map((sp) => /^(\d+)\s*-\s*(\d+)/.exec(pulisci(sp.textContent))).filter(Boolean).map((x) => [+x[1], +x[2]]);
        const img = td[7].querySelector('span[id^="StatoGara"] img');
        const codice = img ? (img.getAttribute("src") || "").split("/").pop().split(".")[0] : "";
        const statoTesto = img ? testoDaHtml(img.getAttribute("title") || "") : "";
        let stato = STATI[codice] || (codice ? "altro" : "da_disputare");
        if (stato === "da_disputare" && set[0] !== null) stato = "disputata";
        const info = [...td[7].querySelectorAll("img")].find((x) => /info_16/.test(x.getAttribute("src") || ""));
        const arbitro = codice === "statodesignata" || !!(info && (info.getAttribute("title") || "").toLowerCase().includes("designato"));
        mettiGara(P, "ce-" + garaId, {
          numero: numero(td[0].textContent), giornata: numero(td[1].textContent), data, set, parziali,
          stato, stato_testo: statoTesto, golden_set: codice.endsWith("gs"), arbitro,
        });
      }
    }
  }

  async function classificaCaserta(P, campId) {
    const d = await scarica(`${CE_BASE}/classifica.aspx?CId=${campId.slice(3)}`);
    const t = d.querySelector("table.tbl-classifica");
    if (!t) return;
    const righe = [];
    for (const tr of t.querySelectorAll("tr")) {
      const td = figliTd(tr);
      if (td.length < 13) continue;
      const n = (i) => numero(td[i].textContent);
      righe.push({
        pos: n(0), squadra: squadraCaserta(P, td[1]), punti: n(2), g: n(3), v: n(4), p: n(5),
        sf: n(6), ss: n(7), pf: n(9), ps: n(10), pen: n(12),
      });
    }
    mettiClassifica(P, campId, righe);
  }

  /* ---------------------------------------------------------- regia */
  function inFinestra(dati, adesso = Date.now()) {
    return dati.gare.filter((g) => {
      const t = g._d ? g._d.getTime() : Date.parse(g.data);
      return t && !conRisultato(g.set) && adesso - t >= FINESTRA[0] && adesso - t <= FINESTRA[1];
    });
  }

  /* C'è una gara appena finita senza risultato e l'ultimo controllo automatico è vecchio? */
  function serve(dati) {
    return inFinestra(dati).length > 0 && Date.now() - leggiMemoria().ultimoAuto > PAUSA_AUTO_MS;
  }

  /* modo "tutto": ogni campionato dell'app; modo "partite": solo quelli con una gara
     appena finita. dopoPrimaParte(): chiamata quando la Serie D è già aggiornata. */
  async function aggiorna(dati, modo = "tutto", dopoPrimaParte = () => {}) {
    const P = nuovaPassata(dati);
    let camp = dati.campionati;
    if (modo === "partite") {
      const ids = new Set(inFinestra(dati).map((g) => g.campionato));
      camp = camp.filter((c) => ids.has(c.id));
    }
    const cr = camp.filter((c) => c.fonte === "campania");
    const ce = camp.filter((c) => c.fonte === "caserta");

    // 1) Campania (la Serie D, in evidenza) per prima
    const e1 = await aGruppi(cr.map((c) => () => campania(P, c.id)));
    if (cr.length) dopoPrimaParte(P);

    // 2) Caserta: un elenco per le gare Virtus + un elenco per ogni girone completo, poi le classifiche
    const lavori = [];
    if (ce.some((c) => !c.tutte_le_gare)) lavori.push(() => elencoCaserta(P, null, CE.societa));
    for (const c of ce.filter((x) => x.tutte_le_gare)) lavori.push(() => elencoCaserta(P, +c.id.slice(3), null));
    const e2 = await aGruppi(lavori);
    const e3 = await aGruppi(ce.map((c) => () => classificaCaserta(P, c.id)));

    const tutti = [...e1, ...e2, ...e3];
    const falliti = tutti.filter((e) => !e.ok);
    falliti.forEach((e) => console.warn("Dal vivo:", e.e));

    const m = leggiMemoria();
    if (modo === "partite") m.ultimoAuto = P.t;
    if (falliti.length < tutti.length) {
      Object.assign(m.gare, P.gare);
      Object.assign(m.classifiche, P.classifiche);
      Object.assign(m.squadre, P.squadre);
      m.ultimo = P.t;
      dati._dalvivo = P.t;
    }
    salvaMemoria(m);
    return {
      richieste: tutti.length, falliti: falliti.length,
      nuovi: [...P.cambiate].filter((id) => conRisultato(gara(dati, id)?.set)).length,
      cambiate: P.cambiate.size, classifiche: P.classificheCambiate,
    };
  }

  return { applica, aggiorna, serve, inFinestra, _prova: { isoRoma, slug, numero } };
})();
