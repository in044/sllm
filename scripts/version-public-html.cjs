/* Give each generated local script a version tied to its actual bytes. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const site = path.resolve(process.argv[2]);
for (const name of fs.readdirSync(site).filter(file => file.endsWith('.html'))) {
    const file = path.join(site, name);
    const html = fs.readFileSync(file, 'utf8').replace(/(<script\b[^>]*\bsrc=")([^"]+)(")/gi,
        (match, before, src, after) => {
            if (/^(?:[a-z]+:|\/\/)/i.test(src)) return match;
            const url = new URL(src, 'https://sllm.invalid/');
            const target = path.resolve(site, `.${url.pathname}`);
            if (!target.startsWith(`${site}${path.sep}`)) throw new Error(`Invalid script URL: ${src}`);
            const version = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex').slice(0, 16);
            url.searchParams.set('v', version);
            return `${before}${src.split(/[?#]/)[0]}${url.search}${url.hash}${after}`;
        });
    fs.writeFileSync(file, html);
}
console.log('Public HTML scripts versioned by SHA-256.');
