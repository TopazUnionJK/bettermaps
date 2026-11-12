#!/usr/bin/env python3
"""Baut aus index.html + style.css + app.js + vendor/ eine einzelne, allein lauffähige HTML-Datei.

Aufruf:  python3 build.py   →  bettermaps-mobil.html
"""
import base64, pathlib, re

root = pathlib.Path(__file__).parent
read = lambda p: (root / p).read_text(encoding="utf-8")

def data_uri(name):
    return "data:image/png;base64," + base64.b64encode((root / "vendor" / name).read_bytes()).decode()

# index.html: Versionskennung an app.js/style.css hängen, damit Browser (v. a. Safari) nach
# einer Änderung nicht die alte Datei aus dem Zwischenspeicher nehmen.
import hashlib
idx = read("index.html")
for name in ("app.js", "style.css"):
    v = hashlib.sha1((root / name).read_bytes()).hexdigest()[:8]
    idx = re.sub(rf'{re.escape(name)}(\?v=\w+)?"', f'{name}?v={v}"', idx)
(root / "index.html").write_text(idx, encoding="utf-8")

leaflet_css = read("vendor/leaflet.css")
leaflet_css = leaflet_css.replace("url(images/layers.png)", f"url({data_uri('layers.png')})")
leaflet_css = leaflet_css.replace("url(images/layers-2x.png)", f"url({data_uri('layers-2x.png')})")
leaflet_css = leaflet_css.replace("url(images/marker-icon.png)", "none")  # Standard-Marker wird nicht benutzt

js = lambda p: read(p).replace("</script", "<\\/script")
html = read("index.html")

def sub(pattern, replacement):
    global html
    html, n = re.subn(pattern, lambda _: replacement, html)
    assert n == 1, pattern

sub(r'<link rel="stylesheet" href="https://unpkg\.com/leaflet[^"]*">', f"<style>\n{leaflet_css}\n</style>")
sub(r'<link rel="stylesheet" href="style\.css(\?v=\w+)?">', f"<style>\n{read('style.css')}\n</style>")
sub(r'<script src="https://unpkg\.com/leaflet@[^"]*"></script>', f"<script>\n{js('vendor/leaflet.js')}\n</script>")
sub(r'<script src="https://unpkg\.com/leaflet\.gridlayer[^"]*"></script>', f"<script>\n{js('vendor/googlemutant.js')}\n</script>")
sub(r'<script src="vendor/supabase\.js"></script>', f"<script>\n{js('vendor/supabase.js')}\n</script>")
sub(r'<script src="app\.js(\?v=\w+)?"></script>', f"<script>\n{js('app.js')}\n</script>")

out = root / "bettermaps-mobil.html"
out.write_text(html, encoding="utf-8")
print(f"{out.name}: {out.stat().st_size / 1024:.0f} kB")
