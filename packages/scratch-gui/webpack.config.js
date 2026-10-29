/* S-LLM modification: public license, source and consent integration; 2026-10-29. */
const path = require('path');
const webpack = require('webpack');
const dotenv = require('dotenv');

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Plugins
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const {execFileSync} = require('child_process');
const publicRelease = process.env.SLLM_PUBLIC_RELEASE === '1';

// A clean build links to its exact source. Working copies are labelled explicitly.
const sourceRepository = 'https://github.com/in044/sllm';
let sourceUrl = sourceRepository;
let sourceVersion = '開発版';
try {
    const gitOptions = {cwd: path.resolve(__dirname, '../..'), encoding: 'utf8'};
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], gitOptions).trim();
    const changes = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], gitOptions).trim();
    sourceVersion = changes ? `${revision}（開発中の変更を含む）` : revision;
    if (!changes) sourceUrl = `${sourceRepository}/tree/${revision}`;
} catch (_) {
    // Source archives without .git retain the repository link and development label.
}
const sourceDirectory = process.env.SLLM_SOURCE_DIR;
if (publicRelease && sourceDirectory) {
    const sourceInfo = require(path.resolve(sourceDirectory, 'source-info.json'));
    sourceUrl = 'source/sllm-source.tar.gz';
    sourceVersion = `ソース一式 SHA-256: ${sourceInfo.sourceTreeSha256}`;
}

const ScratchWebpackConfigBuilder = require('scratch-webpack-configuration');

// const STATIC_PATH = process.env.STATIC_PATH || '/static';

const commonHtmlWebpackPluginOptions = {
    // Google Tag Manager ID
    // Looks like 'GTM-XXXXXXX'
    gtm_id: publicRelease ? '' : (process.env.GTM_ID || ''),

    // Google Tag Manager env & auth info for alterative GTM environments
    // Looks like '&gtm_auth=0123456789abcdefghijklm&gtm_preview=env-00&gtm_cookies_win=x'
    // Taken from the middle of: GTM -> Admin -> Environments -> (environment) -> Get Snippet
    // Blank for production
    gtm_env_auth: process.env.GTM_ENV_AUTH || ''
};

const baseConfig = new ScratchWebpackConfigBuilder(
    {
        rootPath: path.resolve(__dirname),
        enableReact: true,
        enableTs: true,
        shouldSplitChunks: false
    })
    .setTarget('browserslist')
    .addPlugin(new HtmlWebpackPlugin({
        filename: 'credits.html',
        template: 'src/playground/credits.ejs',
        inject: false,
        sourceUrl,
        sourceVersion
    }))
    .addPlugin(new HtmlWebpackPlugin({
        filename: 'terms.html',
        template: 'src/playground/policy.ejs',
        inject: false,
        policyTitle: '利用規約',
        policyContent: require('fs').readFileSync(path.resolve(__dirname, 'src/playground/terms.html'), 'utf8')
    }))
    .addPlugin(new HtmlWebpackPlugin({
        filename: 'privacy.html',
        template: 'src/playground/policy.ejs',
        inject: false,
        policyTitle: 'プライバシー・外部送信',
        policyContent: require('fs').readFileSync(path.resolve(__dirname, 'src/playground/privacy.html'), 'utf8')
    }))
    .addPlugin(new CopyWebpackPlugin({
        patterns: [
            ...['LICENSE', 'NOTICE', 'TRADEMARK'].map(name => ({
                from: path.resolve(__dirname, '../..', name),
                to: `legal/${name}.txt`
            })),
            ...['THIRD_PARTY_NOTICES.txt', 'PYTHON_THIRD_PARTY_NOTICES.txt', 'FONT_NOTICES.txt', 'ASSET_NOTICES.md'].map(name => ({
                from: path.resolve(__dirname, '../..', name),
                to: name === 'ASSET_NOTICES.md' ? 'legal/ASSET_NOTICES.txt' : `legal/${name}`
            })),
            ...['scratch-gui', 'scratch-vm', 'scratch-render', 'scratch-svg-renderer'].map(name => ({
                from: path.resolve(__dirname, '..', name, 'NOTICE'),
                to: `legal/package-notices/${name}.txt`
            }))
        ]
    }))
    .merge({
        output: {
            assetModuleFilename: 'static/assets/[name].[hash][ext][query]',
            library: {
                name: 'GUI',
                type: 'umd2'
            },
            // Do not clean the JS files before building as we have two outputs to the same
            // dist directory (the regular and the standalone version)
            clean: false
        },
        resolve: {
            fallback: {
                Buffer: require.resolve('buffer/'),
                stream: require.resolve('stream-browserify')
            }
        }
    })
    .addModuleRule({
        test: /\.(svg|png|wav|mp3|gif|jpg)$/,
        resourceQuery: /^$/, // reject any query string
        type: 'asset' // let webpack decide on the best type of asset
    })
    .addPlugin(new webpack.DefinePlugin({
        'process.env.DEBUG': Boolean(process.env.DEBUG),
        'process.env.SLLM_PUBLIC_RELEASE': JSON.stringify(publicRelease),
        'process.env.SLLM_SOURCE_URL': JSON.stringify(sourceUrl),
        'process.env.GA_ID': `"${process.env.GA_ID || 'UA-000000-01'}"`,
        'process.env.GTM_ENV_AUTH': `"${process.env.GTM_ENV_AUTH || ''}"`,
        'process.env.GTM_ID': process.env.GTM_ID ? `"${process.env.GTM_ID}"` : null,
        'process.env.REACT_APP_API_BASE_URL': JSON.stringify(publicRelease ? '' : (process.env.REACT_APP_API_BASE_URL || '')),
        'process.env.REACT_APP_AUTO_SPRITE_ADD_ENABLED':
            `"${process.env.REACT_APP_AUTO_SPRITE_ADD_ENABLED || ''}"`,
        'process.env.REACT_APP_AUTO_COSTUME_ADD_ENABLED':
            `"${process.env.REACT_APP_AUTO_COSTUME_ADD_ENABLED || ''}"`,
        'process.env.REACT_APP_AUTO_SOUND_ADD_ENABLED':
            `"${process.env.REACT_APP_AUTO_SOUND_ADD_ENABLED || ''}"`,
        'process.env.REACT_APP_SPRITE_JAPANESE_NAMES_ENABLED':
            `"${process.env.REACT_APP_SPRITE_JAPANESE_NAMES_ENABLED || ''}"`,
        'process.env.REACT_APP_BACKDROP_JAPANESE_NAMES_ENABLED':
            `"${process.env.REACT_APP_BACKDROP_JAPANESE_NAMES_ENABLED || ''}"`,
        'process.env.REACT_APP_COSTUME_JAPANESE_NAMES_ENABLED':
            `"${process.env.REACT_APP_COSTUME_JAPANESE_NAMES_ENABLED || ''}"`,
        'process.env.REACT_APP_SOUND_JAPANESE_NAMES_ENABLED':
            `"${process.env.REACT_APP_SOUND_JAPANESE_NAMES_ENABLED || ''}"`,
        'process.env.REACT_APP_AUTO_BACKDROP_ADD_ENABLED':
            `"${process.env.REACT_APP_AUTO_BACKDROP_ADD_ENABLED || ''}"`
    }))
    .addPlugin(new webpack.NormalModuleReplacementPlugin(
        /(?:^|[!\\/])Scratch\.ttf$/,
        resource => {
            // S-LLM 2026-10-29: preserve the six editor fonts, but do not
            // redistribute the legacy font (scratch-render-fonts issue #23).
            // The existing "Scratch" family becomes an alias of Sans Serif.
            if (path.resolve(resource.context) === path.dirname(require.resolve('scratch-render-fonts'))) {
                resource.request = resource.request.replace(/Scratch\.ttf$/, 'NotoSans-Medium.ttf');
            }
        }
    ))
    .addPlugin(new webpack.NormalModuleReplacementPlugin(
        /^microee$/,
        path.resolve(__dirname, 'src/lib/log-events.js')
    ))
    .addPlugin(new webpack.NormalModuleReplacementPlugin(
        /scratch-audio[\\/]src[\\/]StartAudioContext\.js$/,
        path.resolve(__dirname, 'src/lib/audio/deferred-start-audio-context.js')
    ))
    .addPlugin(new CopyWebpackPlugin({
        patterns: [
            {
                from: '../../node_modules/scratch-blocks/media',
                to: 'static/blocks-media/default'
            },
            {
                from: '../../node_modules/scratch-blocks/media',
                to: 'static/blocks-media/high-contrast'
            },
            {
                // overwrite some of the default block media with high-contrast versions
                // this entry must come after copying scratch-blocks/media into the high-contrast directory
                from: 'src/lib/themes/high-contrast/blocks-media',
                to: 'static/blocks-media/high-contrast',
                force: true
            },
            {
                context: '../../node_modules/@scratch/scratch-vm/dist/web',
                from: 'extension-worker.{js,js.map}',
                noErrorOnMissing: true
            },
            {
                context: '../../node_modules/scratch-storage/dist/web',
                from: 'chunks/fetch-worker.*.{js,js.map}',
                noErrorOnMissing: true
            }
        ]
    }));

if (publicRelease) {
    if (sourceDirectory) {
        baseConfig.addPlugin(new CopyWebpackPlugin({patterns: [
            {from: path.resolve(sourceDirectory, 'sllm-source.tar.gz'), to: 'source/sllm-source.tar.gz'},
            {from: path.resolve(sourceDirectory, 'source-info.json'), to: 'source/source-info.json'}
        ]}));
    }
}

if (!process.env.CI) {
    baseConfig.addPlugin(new webpack.ProgressPlugin());
}

// build the shipping library in `dist/`
const distConfig = baseConfig.clone()
    .merge({
        entry: {
            'scratch-gui': path.join(__dirname, 'src/index.ts')
        },
        output: {
            // We need the public path to be relative, because of scratch-desktop and scratch-android
            // - if the publicPath is static here (defaults to `/`), they are unable to load their assets,
            // which depend on a relative path resolution.
            // (e.g. `/tmp/*path-to-packaged-dist*/static/assets` in scratch-desktop)
            publicPath: 'auto',
            path: path.resolve(__dirname, 'dist')
        }
    })
    .addExternals(['react', 'react-dom', 'redux', 'react-redux'])
    .addPlugin(
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'src/lib/libraries/*.json',
                    to: 'libraries',
                    flatten: true
                }
            ]
        })
    );

// build the shipping library in `dist/` bundled with react, react-dom, redux, etc.
const distStandaloneConfig = baseConfig.clone()
    .merge({
        entry: {
            'scratch-gui-standalone': path.join(__dirname, 'src/index-standalone.tsx')
        },
        output: {
            path: path.resolve(__dirname, 'dist')
        }
    });

// build the examples and debugging tools in `build/`
const buildConfig = baseConfig.clone()
    .enableDevServer(process.env.PORT || 8601)
    .merge({
        devServer: {
            server: 'http',
            proxy: [
                ...(publicRelease ? [{
                    context: ['/api'],
                    target: 'http://127.0.0.1:3001',
                    changeOrigin: true
                }] : []),
                {
                    context: ['/cdn-assets'],
                    target: 'https://cdn.assets.scratch.mit.edu',
                    changeOrigin: true,
                    pathRewrite: { '^/cdn-assets': '' },
                    secure: false
                }
            ]
        }
    })
    .merge({
        entry: {
            gui: './src/playground/index.jsx',
            guistandalone: './src/playground/standalone.jsx',
            blocksonly: './src/playground/blocks-only.jsx',
            compatibilitytesting: './src/playground/compatibility-testing.jsx',
            player: './src/playground/player.jsx'
        },
        output: {
            path: path.resolve(__dirname, 'build'),

            // This output is loaded using a file:// scheme from the local file system.
            // Having `publicPath: '/'` (the default) means the `gui.js` file in `build/index.html`
            // would be looked for at the root of the filesystem, which is incorrect.
            // Hence, we're resetting the public path to be relative.
            publicPath: ''
        }
    })
    .addPlugin(new HtmlWebpackPlugin({
        ...commonHtmlWebpackPluginOptions,
        chunks: ['gui'],
        template: 'src/playground/index.ejs',
        title: 'S-LLM'
    }))
    .addPlugin(new HtmlWebpackPlugin({
        ...commonHtmlWebpackPluginOptions,
        chunks: ['guistandalone'],
        filename: 'standalone.html',
        template: 'src/playground/index.ejs',
        title: 'S-LLM: Standalone Mode'
    }))
    .addPlugin(new HtmlWebpackPlugin({
        ...commonHtmlWebpackPluginOptions,
        chunks: ['blocksonly'],
        filename: 'blocks-only.html',
        template: 'src/playground/index.ejs',
        title: 'S-LLM: Blocks Only Example'
    }))
    .addPlugin(new HtmlWebpackPlugin({
        ...commonHtmlWebpackPluginOptions,
        chunks: ['compatibilitytesting'],
        filename: 'compatibility-testing.html',
        template: 'src/playground/index.ejs',
        title: 'S-LLM: Compatibility Testing'
    }))
    .addPlugin(new HtmlWebpackPlugin({
        ...commonHtmlWebpackPluginOptions,
        chunks: ['player'],
        filename: 'player.html',
        template: 'src/playground/index.ejs',
        title: 'S-LLM: Player Example'
    }))
    .addPlugin(new CopyWebpackPlugin({
        patterns: [
            {
                from: 'static',
                to: 'static'
            },
            {
                from: 'extensions/**',
                to: 'static',
                context: 'src/examples'
            }
        ]
    }));

// Skip building `dist/` unless explicitly requested
// It roughly doubles build time and isn't needed for `scratch-gui` development
// If you need non-production `dist/` for local dev, such as for `scratch-www` work, you can run something like:
// `BUILD_MODE=dist npm run build`
const buildDist = process.env.NODE_ENV === 'production' || process.env.BUILD_MODE === 'dist';

let config;
switch (process.env.BUILD_TYPE) {
    case 'dist': config = distConfig.get(); break;
    case 'dist-standalone': config = distStandaloneConfig.get(); break;
    default: config = buildConfig.get(); break;
}

module.exports = buildDist ? config : buildConfig.get();
if (process.env.SLLM_OUTPUT_DIR) {
    module.exports.output.path = path.resolve(process.env.SLLM_OUTPUT_DIR);
    if (publicRelease) module.exports.output.clean = true;
}
