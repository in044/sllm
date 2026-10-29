/* Verify the real webpack replacement, unchanged editor fonts and legacy SVG fallback. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const webpack = require('webpack');
const root = path.resolve(__dirname, '..');
process.env.SLLM_PUBLIC_RELEASE = '1';
const config = require('../packages/scratch-gui/webpack.config');
const plugins = config.plugins.filter(plugin => plugin instanceof webpack.NormalModuleReplacementPlugin);
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'sllm-font-test-'));
const entry = path.join(output, 'entry.cjs');
fs.writeFileSync(entry, `module.exports = {
    getFonts: require(${JSON.stringify(require.resolve('scratch-render-fonts'))}),
    inline: require(${JSON.stringify(path.join(root, 'packages/scratch-svg-renderer/src/font-inliner.js'))})
};`);
const compiler = webpack({mode: 'production', context: root, entry, target: 'node',
    output: {path: output, filename: 'fonts.cjs', library: {type: 'commonjs2'}},
    resolveLoader: {modules: [path.join(root, 'node_modules')]}, plugins});
compiler.run((error, stats) => {
    compiler.close(() => {});
    if (error || stats.hasErrors()) throw error || new Error(stats.toString('errors-only'));
    const bundle = fs.readFileSync(path.join(output, 'fonts.cjs'), 'utf8');
    const restricted = fs.readFileSync(path.join(root, 'node_modules/scratch-render-fonts/src/Scratch.ttf'));
    assert(!bundle.includes(restricted.toString('base64')), 'Restricted font embedded in bundle');
    let style;
    const sandbox = {module: {exports: {}}, document: {
        getElementById: () => style || null,
        createElement: () => ({textContent: ''}),
        body: {firstChild: null, insertBefore: node => { style = node; }}
    }};
    vm.runInNewContext(bundle, sandbox);
    const {getFonts, inline} = sandbox.module.exports;
    const fonts = getFonts();
    const expected = {'Sans Serif': 'NotoSans-Medium.ttf', Serif: 'SourceSerifPro-Regular.otf',
        Handwriting: 'handlee-regular.ttf', Marker: 'Knewave.ttf', Curly: 'Griffy-Regular.ttf',
        Pixel: 'Grand9K-Pixel.ttf', Scratch: 'NotoSans-Medium.ttf'};
    assert.deepEqual(Object.keys(fonts).sort(), Object.keys(expected).sort());
    for (const [family, filename] of Object.entries(expected)) {
        const base64 = fs.readFileSync(path.join(root, 'node_modules/scratch-render-fonts/src', filename)).toString('base64');
        assert(fonts[family].includes(`font-family: "${family}"`));
        assert(fonts[family].includes(base64), `${family} font bytes changed`);
    }
    assert.equal(getFonts(), fonts, 'Font cache changed');
    assert(style.textContent.includes(fonts.Scratch), 'Measurement fallback not injected');
    const svg = '<svg><text font-family="Scratch">Legacy text</text></svg>';
    const result = inline(svg);
    assert(result.includes(fonts.Scratch), 'Legacy font not inlined for SVG rendering');
    assert(result.includes('Legacy text'), 'SVG content changed');
    assert(!result.includes(restricted.toString('base64')));
    assert.equal(inline('<svg/>'), '<svg/>');
    console.log('Rendering fonts passed: six original fonts unchanged; legacy SVG and measurement use Noto Sans; restricted bytes absent.');
});
