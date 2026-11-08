"""Disegna le icone dell'app (pallone arancio su blu notte): python strumenti/crea_icone.py"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

DEST = Path(__file__).resolve().parent.parent / "app" / "icone"
L = 1024
NAVY, BLU, ARANCIO, BIANCO = (10, 14, 31), (43, 58, 131), (240, 122, 42), (255, 255, 255)


def sfondo():
    img = Image.new("RGB", (L, L), NAVY)
    d = ImageDraw.Draw(img)
    for r in range(560, 0, -6):          # alone blu al centro
        t = (r / 560) ** 1.4
        col = tuple(int(NAVY[i] * t + BLU[i] * (1 - t)) for i in range(3))
        d.ellipse([L / 2 - r, L / 2 - r, L / 2 + r, L / 2 + r], fill=col)
    return img


def pallone(R=340, w=30):
    c = L / 2
    strato = Image.new("RGB", (L, L), ARANCIO)
    d = ImageDraw.Draw(strato)
    # tre cuciture: cerchi grandi che passano per il centro, a 120° l'uno dall'altro,
    # più una seconda curva parallela per ogni pannello
    for k, ang in enumerate((90, 210, 330)):
        a = math.radians(ang)
        D = R * 1.0
        cx, cy = c + D * math.cos(a), c + D * math.sin(a)
        inizio = ang + 180                    # il punto del cerchio che tocca il centro del pallone
        # solo mezzo arco: le tre cuciture girano nello stesso verso (girandola)
        d.arc([cx - D, cy - D, cx + D, cy + D], inizio, inizio + 180, fill=BIANCO, width=w)
        rr = D - R * 0.34                     # curva parallela del pannello
        d.arc([cx - rr, cy - rr, cx + rr, cy + rr], inizio - 70, inizio + 180, fill=BIANCO, width=w)
    maschera = Image.new("L", (L, L), 0)
    ImageDraw.Draw(maschera).ellipse([c - R, c - R, c + R, c + R], fill=255)
    return strato, maschera


def disegna():
    img = sfondo()
    strato, maschera = pallone()
    img.paste(strato, (0, 0), maschera)
    R, c = 340, L / 2
    ImageDraw.Draw(img).ellipse([c - R, c - R, c + R, c + R], outline=BIANCO, width=34)
    return img


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    img = disegna()
    for nome, lato in (("icona-512.png", 512), ("icona-192.png", 192), ("apple-touch-icon.png", 180)):
        img.resize((lato, lato), Image.LANCZOS).save(DEST / nome)
    print("Icone in", DEST)


if __name__ == "__main__":
    main()
