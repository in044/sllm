"""Read distribution metadata and license files; write JSON to stdout, without mutation."""
import importlib.metadata as metadata
import json
from pathlib import Path

records = []
for dist in sorted(metadata.distributions(), key=lambda item: item.metadata['Name'].lower()):
    name = dist.metadata['Name']
    if name.lower() in {'pip', 'setuptools', 'wheel'}:
        continue
    files = [file for file in (dist.files or []) if '.dist-info/' in str(file) and
             ('/licenses/' in str(file) or file.name.lower().startswith(('license', 'copying', 'notice', 'ofl')))]
    records.append({'name': name, 'version': dist.version,
                    'license': dist.metadata.get('License-Expression') or dist.metadata.get('License'),
                    'classifiers': dist.metadata.get_all('Classifier') or [],
                    'projectUrls': dist.metadata.get_all('Project-URL') or [],
                    'texts': [{'file': str(file), 'text': Path(dist.locate_file(file)).read_text(errors='replace')}
                              for file in files]})
print(json.dumps({'scope': 'Installed Python distributions; license text from distribution metadata.',
                  'packages': records}, ensure_ascii=False, indent=2))
