#!/usr/bin/env python3
"""Build Wobbly Battles UI art from preserved imagegen originals (needs Pillow).

Run from any directory: python3 tools/build_battles_assets.py
Reference sheets stay at their generated resolution in battles/reference/.
"""
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent / "battles"
SIZES = {"logo": (1200, 525), "icon": (512, 512), "loading": (1920, 1080)}
FACTIONS = ("tribal", "farmer", "medieval", "legacy", "viking", "ancient",
            "dynasty", "wildwest", "spooky", "pirate", "renaissance", "prehistoric",
            "good", "evil", "secret")
SIZES.update({f"faction-{name}": (128, 128) for name in FACTIONS})
SIZES.update({f"map-{name}": (640, 360) for name in ("grass", "desert", "winter", "autumn")})
SIZES.update({f"victory-{name}": (1200, 400) for name in ("blue", "red")})

built = set()
for name, size in SIZES.items():
    source = ROOT / "assets/originals/ui" / f"{name}.png"
    if not source.exists():
        print(f"  (not delivered yet: {source.name})")
        continue
    built.add(name)
    with Image.open(source) as image:
        opaque = name.startswith("map-") or name == "loading"
        if opaque:
            result = ImageOps.fit(image.convert("RGB"), size, Image.Resampling.LANCZOS)
        else:
            result = ImageOps.pad(image.convert("RGBA"), size, Image.Resampling.LANCZOS,
                                  color=(0, 0, 0, 0))
        # opaque art ships as JPEG (a fraction of the PNG size); transparent art stays PNG
        ext = "jpg" if opaque else "png"
        options = {"quality": 86, "optimize": True, "progressive": True} if opaque else {"optimize": True}
        result.save(ROOT / "assets/ui" / f"{name}.{ext}", **options)

# Preloaded at boot (src/assets.js). loading.jpg is used by the loading screen itself,
# before the manifest is read, so it is not listed.
files = [f"assets/ui/{n}.png" for n in ("logo", "icon") if n in built]
files += [f"assets/ui/faction-{name}.png" for name in FACTIONS if f"faction-{name}" in built]
files += [f"assets/ui/map-{name}.jpg" for name in ("grass", "desert", "winter", "autumn") if f"map-{name}" in built]
files += [f"assets/ui/victory-{name}.png" for name in ("blue", "red") if f"victory-{name}" in built]
(ROOT / "assets/manifest.json").write_text(json.dumps({"files": files}, indent=2) + "\n")
print(f"Built {len(built)} UI images; registered {len(files)} in the preload manifest.")
