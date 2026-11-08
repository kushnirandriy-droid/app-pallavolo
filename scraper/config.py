"""Impostazioni dello scraper: cosa si scarica e da dove."""
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
APP = RADICE / "app"
DATA_JSON = APP / "data.json"
CARTELLA_LOGHI = APP / "loghi"
CACHE_GARE_CR = RADICE / "dati" / "cache_gare_campania.json"
LOGHI_MANUALI = Path(__file__).resolve().parent / "loghi_manuali.json"

STAGIONE = "2026/27"
FUSO = "Europe/Rome"

# --- FIPAV Caserta (portalefipav) ---
CE_BASE = "https://caserta.portalefipav.net"
CE_COMITATO = 19
CE_STAGIONE = 2399        # 2026/27
CE_PID = 7261             # obbligatorio: senza, il sito risponde con un redirect
CE_SOCIETA = 5150         # VIRTUS CASERTA
# Gironi scaricati per intero (tutte le gare, non solo quelle Virtus):
# Under 15 Femminile gir. A, B, C, D
CE_GIRONI_COMPLETI = [94233, 94300, 94301, 94302]

# --- FIPAV Campania (sito mobile) ---
CR_BASE = "https://www.fipavcampania.it/mobile"
CR_CAMPIONATI = [92747]   # Serie D Femminile girone C
CAMPIONATO_EVIDENZA = "cr-92747"

NOME_VIRTUS = "VIRTUS CASERTA"

# --- Rispetto dei siti ---
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
PAUSA_SECONDI = 1.5            # tra una richiesta e l'altra
ORE_TRA_GIRI_COMPLETI = 6      # giro completo al massimo ogni 6 ore
FINESTRA_PARTITA_ORE = (0.75, 5)  # giro "partite": da 45 min a 5 ore dopo l'inizio
GIORNI_RICONTROLLO_DETTAGLI = 10  # dettagli Campania: si ricontrollano le gare dei prossimi 10 giorni
ORE_VALIDITA_DETTAGLIO = 24       # ...al massimo una volta al giorno
