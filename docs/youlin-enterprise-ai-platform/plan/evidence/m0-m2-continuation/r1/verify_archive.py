"""Container-only frozen source/artifact verification; no product acceptance claim."""
import hashlib
import json
from pathlib import Path

assert Path('/.dockerenv').exists(), 'Run via the Docker docs runner'
root = Path('/workspace')
archive = root / 'docs/youlin-enterprise-ai-platform/plan/evidence/m0-m2-continuation/r1'
manifest = json.loads((archive / 'manifest.json').read_text())
for category, base in [('sourceHashes', root), ('artifactHashes', archive)]:
    for relative, expected in manifest[category].items():
        file = (base / relative).resolve()
        assert file.is_relative_to(base), f'Outside archive boundary: {relative}'
        assert hashlib.sha256(file.read_bytes()).hexdigest() == expected, relative
print(json.dumps({'sources': len(manifest['sourceHashes']), 'artifacts': len(manifest['artifactHashes']), 'status': 'verified'}))
