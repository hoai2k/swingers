#!/usr/bin/env python3
"""List the delivered art in wobblers/assets/manifest.json.

The game only requests images named in the manifest, so run this after
adding or removing files (reference/ art is never loaded by the game).
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'assets'
files = sorted(
    p.relative_to(root).as_posix()
    for p in root.rglob('*')
    if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')
    and not any(part.startswith('.') for part in p.relative_to(root).parts)
    and p.relative_to(root).parts[0] != 'reference'
)
(root / 'manifest.json').write_text(json.dumps(files, indent=1) + '\n')
print(f'{len(files)} image(s) listed in {root / "manifest.json"}')
