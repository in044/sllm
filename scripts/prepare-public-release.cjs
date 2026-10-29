/* Produce local review artifacts only: no Git writes, publication, or deployment. */
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const root = path.resolve(__dirname, '..');
const required = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
if (process.version !== `v${required}`) throw new Error(`Use Node ${required} (.nvmrc), then run this command again.`);
const output = path.resolve(process.argv[2] || '/private/tmp/sllm-public-release');
if (output === root || output.startsWith(`${root}${path.sep}`)) throw new Error('Choose an output directory outside the source tree.');
const python = process.env.SLLM_PYTHON || 'python3';
const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, {cwd: root, stdio: 'inherit', ...options});
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
};
run(process.execPath, ['scripts/audit-public-build.cjs']);
run(process.execPath, ['scripts/generate-license-inventory.cjs']);
run(python, ['scripts/generate-python-license-inventory.py']);
run(process.execPath, ['scripts/generate-asset-inventory.cjs']);
run(process.execPath, ['scripts/verify-publication.cjs']);
run(python, ['scripts/prepare-source-bundle.py', '--output', path.join(output, 'sources')]);
run(process.execPath, [path.join(root, 'node_modules/webpack/bin/webpack.js'), '--config', 'webpack.config.js', '--stats', 'errors-warnings'], {
    cwd: path.join(root, 'packages/scratch-gui'),
    env: {...process.env, CI: '1', NODE_ENV: 'production', SLLM_PUBLIC_RELEASE: '1',
        SLLM_SOURCE_DIR: path.join(output, 'sources'), SLLM_OUTPUT_DIR: path.join(output, 'site')}
});
run(process.execPath, ['scripts/verify-publication.cjs', '--site', path.join(output, 'site')]);
console.log(`Review site: ${path.join(output, 'site')}. Nothing has been published or deployed.`);
