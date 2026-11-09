"""Genera las imagenes de marca optimizadas a partir del logotipo original.

    python tools/generar_imagenes_marca.py RUTA_AL_LOGO_ORIGINAL.png [FUENTE.ttf] [FUENTE_NEGRITA.ttf]

POR QUE EXISTE (auditoria 2026-11-09)

  logo-zenstay.png pesaba 375 KiB (2000x2000) y se muestra como mucho a 56 px.
  Era el recurso mas pesado de la portada. Este script deja:

    frontend/public/logo-zenstay.png      128x128, PNG optimizado (la SPA,
                                          los correos y el fallback de <picture>)
    backend/landing/logo-zenstay.webp     128x128 WebP (landing y checkout)
    backend/landing/og-zenstay.png        1200x630 para Open Graph / Twitter

  128 px cubre el tamano mayor mostrado (56 px) en pantallas 2x.

  La imagen social lleva solo la marca y el lema del sitio: nada de cifras,
  precios ni promesas que puedan quedarse viejas en una vista previa cacheada.
  Necesita Pillow (viene con reportlab en el venv del backend).
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parents[1]
FONDO = (12, 18, 16)        # --fondo de backend/landing/estilo.css
TEXTO = (233, 240, 236)     # --texto
SUAVE = (147, 168, 156)     # --texto-suave
TURQUESA = (0, 192, 168)    # --turquesa


def main(origen: Path, fuente: str, negrita: str) -> None:
    logo = Image.open(origen).convert("RGBA")

    chico = logo.resize((128, 128), Image.LANCZOS)
    chico.save(RAIZ / "frontend/public/logo-zenstay.png", optimize=True)
    chico.save(RAIZ / "backend/landing/logo-zenstay.webp", "WEBP", quality=90, method=6)

    og = Image.new("RGB", (1200, 630), FONDO)
    dibujo = ImageDraw.Draw(og)
    marca = logo.resize((260, 260), Image.LANCZOS)
    og.paste(marca, (110, 185), marca)
    titulo = ImageFont.truetype(negrita, 120)
    lema = ImageFont.truetype(fuente, 40)
    dibujo.text((420, 200), "ZenStay", font=titulo, fill=TEXTO)
    dibujo.rectangle((424, 345, 560, 351), fill=TURQUESA)
    dibujo.text((424, 380), "Gestión para hoteles, hostales", font=lema, fill=SUAVE)
    dibujo.text((424, 430), "y hospedajes del Perú", font=lema, fill=SUAVE)
    og.save(RAIZ / "backend/landing/og-zenstay.png", optimize=True)


if __name__ == "__main__":
    main(Path(sys.argv[1]),
         sys.argv[2] if len(sys.argv) > 2 else "C:/Windows/Fonts/segoeui.ttf",
         sys.argv[3] if len(sys.argv) > 3 else "C:/Windows/Fonts/segoeuib.ttf")
