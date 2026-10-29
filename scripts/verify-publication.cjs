/* Check the concrete source, notice and asset invariants of the public profile. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {execFileSync} = require('child_process');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const hash = (file, algorithm = 'sha256') => crypto.createHash(algorithm).update(fs.readFileSync(file)).digest('hex');
const fail = message => { throw new Error(message); };
const graph = read('docs/licenses/browser-packages.json');
const inventory = read('docs/licenses/npm-inventory.json');
const fontReview = read('docs/licenses/render-fonts-review.json');
const fontRoot = 'node_modules/scratch-render-fonts/';
const shippedFonts = graph.sources.filter(file => file.startsWith(fontRoot) && /\.(ttf|otf)$/i.test(file));
if (shippedFonts.length !== Object.keys(fontReview.fonts).length) fail('Unexpected rendering font set.');
for (const file of shippedFonts) {
    const reviewed = fontReview.fonts[file.slice(fontRoot.length)];
    if (!reviewed || hash(path.join(root, file)) !== reviewed.sha256) fail(`Unreviewed rendering font: ${file}`);
}
if (graph.sources.some(file => /(?:^|\/)Scratch\.ttf$/i.test(file))) fail('Restricted legacy font in public module graph.');
if (graph.lockfileSha256 !== hash(path.join(root, 'package-lock.json'))) fail('Stale public dependency graph.');
if (inventory.lockfileSha256 !== graph.lockfileSha256) fail('Stale license inventory.');
const choices = {
    '(MIT OR Apache-2.0)': 'MIT', '(MPL-2.0 OR Apache-2.0)': 'Apache-2.0',
    '(MIT OR GPL-3.0-or-later)': 'MIT', '(Unlicense OR Apache-2.0)': 'Apache-2.0'
};
const allowed = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0', 'OFL-1.1', 'AGPL-3.0-only']);
for (const pkg of graph.packages) {
    const record = inventory.packages.find(item => item.location === pkg.location);
    if (!record || record.version !== pkg.version || record.issues.length) fail(`Unreviewed package ${pkg.name}.`);
    const reviewedFontSubset = pkg.name === 'scratch-render-fonts' &&
        record.license === '(Apache-2.0 AND OFL-1.1 AND CC-BY-SA-3.0)' &&
        record.reviewDisposition === 'reviewed-shipped-subset';
    if (!reviewedFontSubset && !allowed.has(choices[record.license] || record.license)) {
        fail(`Review license compatibility: ${pkg.name}: ${record.license}`);
    }
}
for (const [file, digest] of Object.entries(graph.sourceHashes || {})) {
    if (hash(path.join(root, file)) !== digest) fail(`Source graph is stale: ${file}`);
}
if (read('docs/licenses/python-inventory.json').packages.some(pkg => pkg.issues.length)) fail('Unreviewed Python package.');
let files;
try {
    files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).split('\0').filter(Boolean);
} catch (_) {
    files = read('SOURCE_INFO.json').sourceFiles;
}
for (const file of files) {
    if (!fs.existsSync(path.join(root, file))) continue;
    if (['.env', 'backend.env'].includes(path.basename(file))) fail(`Secret configuration in source list: ${file}`);
    const data = fs.readFileSync(path.join(root, file));
    if (data.length < 2e6 && /(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}|AIza[0-9A-Za-z_-]{35})/.test(data.toString('utf8'))) {
        fail(`Possible credential in source list: ${file}`);
    }
}
const siteIndex = process.argv.indexOf('--site');
if (siteIndex !== -1) {
    const site = path.resolve(process.argv[siteIndex + 1]);
    // Fonts use base64-loader, so absence of a standalone .ttf is insufficient.
    const restricted = fs.readFileSync(path.join(root, fontRoot, 'src/Scratch.ttf'));
    const scan = dir => {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) scan(file);
            else if (/\.(js|css|ttf|otf|map)$/i.test(entry.name)) {
                const content = fs.readFileSync(file);
                if (content.includes(restricted) || content.includes(Buffer.from(restricted.toString('base64')))) {
                    fail(`Restricted legacy font bytes in ${file}`);
                }
            }
        }
    };
    scan(site);
    for (const page of fs.readdirSync(site).filter(file => file.endsWith('.html'))) {
        const html = fs.readFileSync(path.join(site, page), 'utf8');
        for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)) {
            if (/^(?:[a-z]+:|\/\/)/i.test(match[1])) continue;
            const url = new URL(match[1], 'https://sllm.invalid/');
            const target = path.resolve(site, `.${url.pathname}`);
            if (!target.startsWith(`${site}${path.sep}`) ||
                url.searchParams.get('v') !== hash(target).slice(0, 16)) {
                fail(`Unversioned or stale script URL in ${page}: ${match[1]}`);
            }
        }
    }
    for (const page of ['index.html', 'credits.html', 'terms.html', 'privacy.html']) {
        const html = fs.readFileSync(path.join(site, page), 'utf8');
        if (html.includes('googletagmanager.com/gtm.js')) fail('Analytics must be disabled in public profile.');
        for (const match of html.matchAll(/href="([^"]+)"/g)) {
            if (/^(https?:|mailto:|#)/.test(match[1])) continue;
            if (!fs.existsSync(path.join(site, match[1].split(/[?#]/)[0]))) fail(`Missing local link ${page}: ${match[1]}`);
        }
    }
    for (const [source, destination] of [
        ['LICENSE', 'LICENSE.txt'], ['NOTICE', 'NOTICE.txt'], ['TRADEMARK', 'TRADEMARK.txt'],
        ['THIRD_PARTY_NOTICES.txt', 'THIRD_PARTY_NOTICES.txt'], ['PYTHON_THIRD_PARTY_NOTICES.txt', 'PYTHON_THIRD_PARTY_NOTICES.txt'],
        ['FONT_NOTICES.txt', 'FONT_NOTICES.txt'], ['ASSET_NOTICES.md', 'ASSET_NOTICES.txt']
    ]) {
        if (hash(path.join(root, source)) !== hash(path.join(site, 'legal', destination))) fail(`Stale notice ${destination}`);
    }
    const info = JSON.parse(fs.readFileSync(path.join(site, 'source/source-info.json')));
    const fontsArchive = info.dependencies.filter(item => /\/scratch-render-fonts-/.test(item.file));
    if (fontsArchive.length !== 1 ||
        !fontsArchive[0].file.endsWith('-sllm-filtered.tgz') ||
        JSON.stringify(fontsArchive[0].removedFiles) !== JSON.stringify(['package/src/Scratch.ttf'])) {
        fail('Source offer must contain the filtered font dependency.');
    }
    const tree = crypto.createHash('sha256');
    for (const file of info.sourceFiles) tree.update(`${file}\0${hash(path.join(root, file))}\n`);
    if (tree.digest('hex') !== info.sourceTreeSha256) fail('Source offer differs from the reviewed working tree.');
    const html = fs.readFileSync(path.join(site, 'credits.html'), 'utf8');
    if (!html.includes(info.sourceTreeSha256)) fail('Credits do not identify the corresponding source archive.');

}
console.log(`Automated public build checks passed: ${graph.packages.length} browser dependencies, 30 Python dependencies. Individual asset/trademark review remains separate.`);
