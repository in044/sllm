"""Generate notices from a captured, versioned runtime license snapshot."""
import argparse,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--snapshot',default=str(ROOT/'docs/licenses/python-runtime-snapshot.json'));args=parser.parse_args()
snapshot=json.loads(Path(args.snapshot).read_text());records=[]
notices=['S-LLM — Python runtime third-party license texts','Versions match server/requirements-lock.txt. Source license files are retained verbatim.\n']
normalized={'annotated-types':'MIT','blinker':'MIT','itsdangerous':'BSD-3-Clause','Jinja2':'BSD-3-Clause','jiter':'MIT','distro':'Apache-2.0'}
locked={line.split('==')[0]:line.split('==')[1] for line in (ROOT/'server/requirements-lock.txt').read_text().splitlines() if '==' in line}
actual={p['name']:p['version'] for p in snapshot['packages']}
if locked!=actual:raise SystemExit('Runtime snapshot differs from requirements-lock.txt; capture the intended environment again.')
for pkg in snapshot['packages']:
 license_name=normalized.get(pkg['name']) or pkg['license']
 texts=list(pkg['texts'])
 if pkg['name']=='flask-cors' and pkg['version']=='6.0.2':
  texts.append({'file':'docs/licenses/supplemental/flask-cors-6.0.2-LICENSE','text':(ROOT/'docs/licenses/supplemental/flask-cors-6.0.2-LICENSE').read_text()})
 if not license_name or not texts:raise SystemExit('Missing license evidence for '+pkg['name'])
 records.append({'name':pkg['name'],'version':pkg['version'],'license':license_name,'projectUrls':pkg['projectUrls'],'licenseFiles':[t['file'] for t in texts],'issues':[]})
 notices.append(f"\n{'='*72}\n{pkg['name']}=={pkg['version']}\nLicense: {license_name}\n")
 for item in texts:notices.append(f"--- {item['file']} ---\n{item['text']}\n")
(ROOT/'docs/licenses/python-inventory.json').write_text(json.dumps({'scope':'Pinned public server dependencies; snapshot captured from the running environment on 2026-10-29.','packages':records},ensure_ascii=False,indent=2)+'\n')
(ROOT/'PYTHON_THIRD_PARTY_NOTICES.txt').write_text('\n'.join(notices))
print(f'{len(records)} pinned Python distributions verified; no missing license texts.')
