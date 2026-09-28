"""Package only reviewed runtime files; submission mode requires a configured build."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile
root = Path(__file__).resolve().parent.parent
meta = json.loads((root / 'dist/extension-build.json').read_text())
preparation = '--preparation' in sys.argv
if not preparation and not meta['release']:
    raise SystemExit('Build with npm run build:extension:release first, or use --preparation explicitly.')
files = ['manifest.json', 'background.js', 'sidepanel.html', 'sidepanel.css', 'sidepanel.js', 'icons/icon-16.png', 'icons/icon-48.png', 'icons/icon-128.png']
files += [f'_locales/{locale}/messages.json' for locale in ['ja', 'en', 'fr']]
name = f"monku-fusion-{meta['version']}-{'preparation' if preparation else 'candidate'}.zip"
target = root / 'dist' / name
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        source = root / 'dist/extension' / file
        if source.is_symlink():
            raise SystemExit('Unexpected symlink')
        archive.write(source, file)
checksum = hashlib.sha256(target.read_bytes()).hexdigest()
(target.with_suffix('.zip.sha256')).write_text(f'{checksum}  {name}\n')
print(f'{target}\nSHA256 {checksum}')
