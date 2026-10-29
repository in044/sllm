/* Generate an evidence inventory; this does not certify license compatibility. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const output = path.join(root, 'docs/licenses');
fs.mkdirSync(output, {recursive: true});
const records = [];
const reviewed = JSON.parse(fs.readFileSync(path.join(output, 'reviewed-packages.json'), 'utf8'));
const browser = JSON.parse(fs.readFileSync(path.join(output, 'browser-packages.json'), 'utf8'));
const shipped = new Set(browser.packages.map(pkg => pkg.location));
const licenseFileNames = dir => fs.readdirSync(dir)
    .filter(file => /^(licen[sc]e|copying|notice|ofl|copyright)([._-]|$)/i.test(file) &&
        fs.statSync(path.join(dir, file)).isFile()).sort();
// npm's bundled tools sometimes omit license files in one of several identical copies.
const licenseCopies = new Map();
for (const location of Object.keys(lock.packages).filter(item => item.includes('node_modules/'))) {
    const dir = path.join(root, location);
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        const files = licenseFileNames(dir);
        if (files.length) licenseCopies.set(`${pkg.name}@${pkg.version.replace(/^v/, '')}`, {location, files});
    } catch (_) { /* optional or absent package */ }
}
const notices = ['S-LLM — third-party npm license texts',
    'Public browser dependencies, identified by the public production webpack module graph.',
    'Individual licenses apply to their respective components. Asset licenses require separate review.',
    'Python notices are provided separately. This inventory is not a compatibility assessment.\n'];
for (const [location, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (!location.includes('node_modules/') || entry.link) continue;
    const dir = path.join(root, location);
    let installed;
    try { installed = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch (_) { /* recorded below */ }
    const name = entry.name || location.split('node_modules/').pop();
    const issues = [];
    if (!installed) issues.push('not-installed');
    else if (installed.version.replace(/^v/, '') !== entry.version.replace(/^v/, '')) {
        issues.push('installed-version-mismatch');
    }
    const review = reviewed[`${name}@${entry.version}`];
    const license = review?.license || entry.license || installed?.license || installed?.licenses || 'UNKNOWN';
    if (license === 'UNKNOWN' || typeof license !== 'string' || /SEE LICENSE|UNLICENSED|LicenseRef/i.test(license)) {
        issues.push('review-license');
    }
    let textLocation = location;
    let files = installed && !issues.includes('installed-version-mismatch') ? licenseFileNames(dir) : [];
    if (!files.length && installed && !issues.includes('installed-version-mismatch')) {
        const copy = licenseCopies.get(`${installed.name}@${installed.version.replace(/^v/, '')}`);
        if (copy) {
            textLocation = copy.location;
            files = copy.files;
        }
    }
    if (!files.length) issues.push('no-root-license-text');
    const texts = files.map(file => ({file, text: fs.readFileSync(path.join(root, textLocation, file), 'utf8')}));
    if (review?.files?.length) {
        for (const file of review.files) texts.push({file, text: fs.readFileSync(path.join(root, file), 'utf8')});
        for (const issue of ['review-license', 'no-root-license-text']) {
            const index = issues.indexOf(issue);
            if (index !== -1) issues.splice(index, 1);
        }
    }
    const repository = installed?.repository;
    records.push({name, version: entry.version, location, license,
        developmentOnly: Boolean(entry.dev), optional: Boolean(entry.optional),
        source: typeof repository === 'string' ? repository : repository?.url || entry.resolved || null,
        licenseFiles: [...files, ...(review?.files || [])], licenseTextSource: files.length ? textLocation : null,
        reviewDisposition: review?.disposition || null, issues});
    if (shipped.has(location)) {
        if (issues.length) console.warn(`License review remains open: ${name}@${entry.version}: ${issues}`);
        notices.push(`\n${'='.repeat(72)}\n${name}@${entry.version}\nLicense: ${license}\n`);
        for (const {file, text} of texts) notices.push(`--- ${file} ---\n${text}\n`);
    }
}
const report = {
    scope: 'All npm lockfile packages, including development tools; not a bundle membership report.',
    lockfileSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'package-lock.json'))).digest('hex'),
    packages: records
};
fs.writeFileSync(path.join(output, 'npm-inventory.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n'));
const issues = records.filter(record => record.issues.length);
fs.writeFileSync(path.join(output, 'npm-review.json'), `${JSON.stringify(issues, null, 2)}\n`);
console.log(`${records.length} npm packages; ${issues.length} require review. See docs/licenses/npm-review.json.`);
