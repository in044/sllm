/* Build the public profile and record its actual module graph. No network requests. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
process.chdir(path.join(root, 'packages/scratch-gui'));
process.env.SLLM_PUBLIC_RELEASE = '1';
process.env.NODE_ENV = 'production';
process.env.CI = '1';
const webpack = require(path.join(root, 'node_modules/webpack'));
const config = require(path.join(root, 'packages/scratch-gui/webpack.config'));
config.optimization = {...config.optimization, minimize: false};
config.output.path = '/private/tmp/sllm-public-audit-build';
config.output.clean = true;
webpack(config, (error, stats) => {
    if (error || stats.hasErrors()) {
        console.error(error || stats.toString('errors-only'));
        process.exitCode = 1;
        return;
    }
    const data = stats.toJson({all: false, modules: true, nestedModules: true, assets: true});
    const packages = new Map();
    const sources = new Set();
    const visit = modules => {
        for (const module of modules) {
            const resource = module.nameForCondition?.split('?')[0];
            if (resource && path.isAbsolute(resource)) {
                sources.add(path.relative(root, resource));
                let dir = path.dirname(resource);
                while (dir !== path.dirname(dir)) {
                    const manifest = path.join(dir, 'package.json');
                    if (fs.existsSync(manifest)) {
                        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
                        if (!pkg.name || !pkg.version) {
                            dir = path.dirname(dir);
                            continue;
                        }
                        const location = path.relative(root, dir);
                        if (location.includes('node_modules/')) {
                            packages.set(location, {name: pkg.name, version: pkg.version, location});
                        }
                        break;
                    }
                    dir = path.dirname(dir);
                }
            }
            visit(module.modules || []);
        }
    };
    visit(data.modules || []);
    sources.add('packages/scratch-gui/webpack.config.js');
    const report = {
        scope: 'Public production webpack graph; minification disabled to retain conservative evidence before pruning.',
        lockfileSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'package-lock.json'))).digest('hex'),
        packages: [...packages.values()].sort((a, b) => a.location.localeCompare(b.location)),
        sources: [...sources].sort(),
        sourceHashes: Object.fromEntries([...sources].sort().filter(file => fs.existsSync(path.join(root, file)))
            .map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])),
        assets: data.assets.map(asset => ({name: asset.name, source: asset.info?.sourceFilename || null}))
    };
    fs.writeFileSync(path.join(root, 'docs/licenses/browser-packages.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Public graph verified: ${packages.size} package locations; existing application assets preserved.`);
});
