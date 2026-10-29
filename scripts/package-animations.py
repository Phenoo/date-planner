"""Package editable local Lottie sources without a third-party build dependency."""

import json
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

for source in Path(sys.argv[1] if len(sys.argv) > 1 else "public/animations").rglob("*.json"):
    manifest = {
        "version": "1.0",
        "generator": "Date Atlas",
        "animations": [{"id": "animation"}],
    }
    with ZipFile(source.with_suffix(".lottie"), "w", ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("animations/animation.json", source.read_bytes())
