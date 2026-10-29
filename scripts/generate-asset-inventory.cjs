const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {execFileSync} = require('child_process');
const root = path.resolve(__dirname, '..');
let files;
try {
    files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).split('\0').filter(Boolean))];
} catch (_) {
    files = JSON.parse(fs.readFileSync(path.join(root, 'SOURCE_INFO.json'), 'utf8')).sourceFiles;
}
const local = files.filter(file => /\.(svg|png|jpe?g|gif|wav|mp3|ogg|ttf|otf|woff2?|sb[23])$/i.test(file))
    .map(file => ({path: file,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'),
        scope: /(^|\/)(test|fixtures)\//.test(file) ? 'test-fixture' : 'review-shipping-status',
        status: 'review-origin-and-license'}));
const external = new Map();
for (const file of files.filter(file => /^packages\/scratch-gui\/src\/lib\/libraries\/.*\.json$/.test(file))) {
    const walk = value => {
        if (!value || typeof value !== 'object') return;
        if (typeof value.md5ext === 'string') {
            const asset = external.get(value.md5ext) || {asset: value.md5ext, names: [], catalogs: [],
                status: 'review-origin-and-license'};
            if (value.name && !asset.names.includes(value.name)) asset.names.push(value.name);
            if (!asset.catalogs.includes(file)) asset.catalogs.push(file);
            external.set(value.md5ext, asset);
        }
        for (const nested of Object.values(value)) walk(nested);
    };
    walk(JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
}
const fonts = fs.readdirSync(path.join(root, 'node_modules/scratch-render-fonts/src'))
    .filter(file => /\.(ttf|otf)$/.test(file)).map(file => ({path: `node_modules/scratch-render-fonts/src/${file}`,
        package: 'scratch-render-fonts',
        status: file === 'Scratch.ttf' ? 'excluded-from-public-build-and-source-offer' : 'reviewed-unmodified-font',
        sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'node_modules/scratch-render-fonts/src', file))).digest('hex')}));
fs.mkdirSync(path.join(root, 'docs/licenses'), {recursive: true});
fs.writeFileSync(path.join(root, 'docs/licenses/asset-inventory.json'), `${JSON.stringify({
    scope: 'Tracked repository media, catalog md5ext references, and installed rendering fonts. Not a clearance report. Runtime uploads and other external URLs are outside this inventory.',
    local, external: [...external.values()].sort((a, b) => a.asset.localeCompare(b.asset)), fonts
}, null, 2)}\n`);
console.log(`${local.length} local files, ${external.size} catalog references, ${fonts.length} font files recorded.`);
