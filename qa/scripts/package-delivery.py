"""Create the requested full-source Markdown and portable ZIP; no application mutation."""
from pathlib import Path
import hashlib, json, zipfile
root = Path(__file__).resolve().parents[1]
out = root.parent / 'delivery'
out.mkdir(exist_ok=True)
source_dirs = {'fixtures', 'pages', 'helpers', 'data', 'tests', 'docs', 'scripts', '.github'}
source_root_files = {'package.json', 'package-lock.json', 'tsconfig.json', 'playwright.config.ts', 'README.md', '.gitignore'}
files = sorted(p for p in root.rglob('*') if p.is_file() and (p.relative_to(root).parts[0] in source_dirs or str(p.relative_to(root)) in source_root_files))
manifest = [{'file': 'qa/' + str(p.relative_to(root)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'bytes': p.stat().st_size} for p in files]
with zipfile.ZipFile(out / 'Gandengyan_Playwright_QA.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files: z.write(p, 'qa/' + str(p.relative_to(root)))
    z.writestr('SHA256_MANIFEST.json', json.dumps(manifest, indent=2))
parts = ['# Gandengyan — complete QA plan and source files\n', 'Copy the files below into the repository using the shown paths. The ZIP preserves this exact tree. Read qa/README.md and qa/docs/VALIDATION.md before execution.\n']
for p in files:
    suffix = p.suffix.lower()
    language = {'.ts':'typescript','.json':'json','.yml':'yaml','.md':'markdown','.py':'python'}.get(suffix,'text')
    text = p.read_text()
    fence = '`' * max(4, max((len(run) for run in __import__('re').findall(r'`+', text)), default=0) + 1)
    parts.append(f'## qa/{p.relative_to(root)}\n\n{fence}{language}\n{text.rstrip()}\n{fence}\n')
(out / 'Gandengyan_Complete_Test_Suite.md').write_text('\n'.join(parts))
(out / 'Gandengyan_Manual_Test_Plan.md').write_text((root / 'docs/MANUAL_TEST_PLAN.md').read_text())
(out / 'delivery-manifest.json').write_text(json.dumps(manifest, indent=2))
print(json.dumps({p.name:p.stat().st_size for p in out.iterdir() if p.is_file()}, indent=2))
