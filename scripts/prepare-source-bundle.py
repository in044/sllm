"""Export the reviewed working tree and exact dependency sources; never pushes or deploys.
Only Git-tracked or non-ignored files are exported. Credentials and build outputs stay excluded.
"""
import argparse,base64,concurrent.futures,hashlib,io,json,re,subprocess,tarfile,urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
output=Path(args.output).resolve();output.mkdir(parents=True,exist_ok=True)
if output.is_relative_to(ROOT):raise SystemExit('Choose an output directory outside the source tree.')
graph=json.loads((ROOT/'docs/licenses/browser-packages.json').read_text())
lock=json.loads((ROOT/'package-lock.json').read_text())['packages']
copyleft=json.loads((ROOT/'docs/licenses/copyleft-sources.json').read_text())

def download(item):
    filename,url,integrity=item
    if filename.startswith('python/'):
        with urllib.request.urlopen(url,timeout=30) as response:metadata=json.load(response)
        sdist=next((file for file in metadata['urls'] if file['packagetype']=='sdist'),None)
        if not sdist:raise RuntimeError('No Python source distribution: '+filename)
        filename='python/'+sdist['filename'];url=sdist['url']
        integrity='sha256-'+base64.b64encode(bytes.fromhex(sdist['digests']['sha256'])).decode()
    target=output/'dependencies'/filename;target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists(): data=target.read_bytes()
    else:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'S-LLM-source-offer'}),timeout=60) as response:data=response.read()
    if integrity:
        algorithm,expected=integrity.split('-',1)
        if base64.b64encode(hashlib.new(algorithm,data).digest()).decode()!=expected:raise RuntimeError('Integrity mismatch: '+filename)
    target.write_bytes(data)
    return {'file':str(target.relative_to(output)),'url':url,'sha256':hashlib.sha256(data).hexdigest()}

items=[]
for pkg in graph['packages']:
    entry=lock[pkg['location']]
    if not entry.get('resolved') or not entry.get('integrity'):raise RuntimeError('No immutable source: '+pkg['name'])
    filename='npm/'+pkg['name'].replace('/','__')+'-'+pkg['version']+'.tgz'
    items.append((filename,entry['resolved'],entry['integrity']))
for pkg in copyleft:
    items.append(('upstream/'+pkg['name']+'-'+pkg['commit']+'.tar.gz',pkg['sourceArchive'],None))
for pkg in json.loads((ROOT/'docs/licenses/python-inventory.json').read_text())['packages']:
    items.append(('python/'+pkg['name']+'-'+pkg['version'],
                  'https://pypi.org/pypi/'+pkg['name']+'/'+pkg['version']+'/json',None))
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:dependencies=list(pool.map(download,items))

# Do not redistribute the restricted legacy font inside an otherwise useful
# dependency source archive. Verify the downloaded original first, then create
# a separately identified archive. Only selected records are packed below.
for dependency in dependencies:
    if dependency['file'] != 'dependencies/npm/scratch-render-fonts-1.0.197.tgz':continue
    original=output/dependency['file']
    filtered=original.with_name('scratch-render-fonts-1.0.197-sllm-filtered.tgz')
    removed=[]
    review=json.loads((ROOT/'docs/licenses/render-fonts-review.json').read_text())['fonts']
    with tarfile.open(original,'r:gz') as source,tarfile.open(filtered,'w:gz') as destination:
        font_files={member.name.removeprefix('package/') for member in source.getmembers()
                    if member.isfile() and member.name.lower().endswith(('.ttf','.otf'))}
        if font_files != set(review)|{'src/Scratch.ttf'}:
            raise RuntimeError('Unexpected upstream font archive contents')
        for member in source.getmembers():
            if member.name == 'package/src/Scratch.ttf':
                removed.append(member.name);continue
            data=source.extractfile(member) if member.isfile() else None
            if member.name.removeprefix('package/') in review:
                content=data.read()
                if hashlib.sha256(content).hexdigest()!=review[member.name.removeprefix('package/')]['sha256']:
                    raise RuntimeError('Reviewed font differs from archive: '+member.name)
                data=io.BytesIO(content)
            destination.addfile(member,data)
    if removed != ['package/src/Scratch.ttf']:raise RuntimeError('Restricted font exclusion failed')
    dependency.update({'upstreamSha256':dependency['sha256'],
                       'file':str(filtered.relative_to(output)),
                       'sha256':hashlib.sha256(filtered.read_bytes()).hexdigest(),
                       'removedFiles':removed,
                       'modification':'S-LLM: omit non-redistributable legacy font; webpack aliases its family to Noto Sans.'})

try:
    files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT,stderr=subprocess.DEVNULL).decode().split('\0')
    commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip()
except subprocess.CalledProcessError:
    original=json.loads((ROOT/'SOURCE_INFO.json').read_text());files=original['sourceFiles'];commit=original['baseCommit']
files=sorted({p for p in files if p and (ROOT/p).is_file()})
for file in files:
    if Path(file).name in ['.env','backend.env'] or file.startswith(('.git/','.venv/','node_modules/')):
        raise RuntimeError('Sensitive or generated path in source list: '+file)
    if (ROOT/file).is_symlink():raise RuntimeError('Review symbolic link before export: '+file)
tree=hashlib.sha256()
for file in files:tree.update((file+'\0'+hashlib.sha256((ROOT/file).read_bytes()).hexdigest()+'\n').encode())
info={'project':'S-LLM','sourceTreeSha256':tree.hexdigest(),'baseCommit':commit,'dependencies':dependencies,'sourceFiles':files}
(output/'source-info.json').write_text(json.dumps(info,indent=2)+'\n')
with tarfile.open(output/'sllm-source.tar.gz','w:gz') as archive:
    for file in files:archive.add(ROOT/file,arcname='sllm/'+file,recursive=False)
    archive.add(output/'source-info.json',arcname='sllm/SOURCE_INFO.json')
    # Cached files from older builds are not part of this source offer.
    for dependency in dependencies:
        archive.add(output/dependency['file'],
                    arcname='sllm/vendor-sources/'+dependency['file'].removeprefix('dependencies/'),recursive=False)
print(f'Source bundle prepared: {len(files)} project files, {len(dependencies)} dependency archives, tree {tree.hexdigest()}')
