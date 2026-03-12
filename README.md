# Excalidraw Desktop Client

A desktop application built with Electron and React, bundled with webpack, running the Excalidraw drawing application locally without external CDN dependencies.

## Quick Start

### Installation

```bash
# Install dependencies
yarn install
# or
npm install
```

### Development

```bash
# Start webpack dev server and Electron in parallel
yarn run dev
# or
npm run dev
```

The dev server runs on port 3000 and hot-reloads when you make code changes.

### Production Build

```bash
# Build the webpack bundle
yarn run build

# Run the production build
yarn run prod
```

## Project Structure

```text
excalidraw-x/
├── index.html                    # HTML template for webpack
├── main.js                       # Electron main process
├── preload.js                    # Electron preload script (IPC)
├── webpack.config.js             # Webpack configuration
├── package.json                  # Dependencies and scripts
│
├── public/                       # Static assets
│   └── fonts/                    # Self-hosted font files
│       ├── Assistant/
│       ├── Cascadia/
│       ├── ComicShanns/
│       ├── Excalifont/
│       ├── Liberation/
│       ├── Lilita/
│       ├── Nunito/
│       ├── Virgil/
│       └── Xiaolai/
│
├── src/                          # React source code
│   ├── index.jsx                 # React entry point
│   └── App.jsx                   # Main App component with Excalidraw
│
└── build/                        # Webpack output (generated)
    ├── index.html                # Generated HTML
    ├── bundle.js                 # Bundled JavaScript
    └── fonts/                    # Copied font files
```

### Technology Stack

- **Frontend Framework**: React 19.2.4
- **Desktop Framework**: Electron 40.8.0
- **Bundler**: Webpack 5.88.0
- **Drawing Library**: Excalidraw 0.18.0
- **Language**: JSX/JavaScript
- **Development Server**: Webpack Dev Server with HMR

### Key Files

| File | Purpose |
|------|---------|
| `index.html` | Webpack template - provides root div and configures window globals |
| `main.js` | Electron main process - creates window and loads URL from dev server or build |
| `src/index.jsx` | React entry point - mounts App component to DOM |
| `src/App.jsx` | Main React component - renders Excalidraw component |
| `webpack.config.js` | Webpack configuration - handles bundling, CSS, fonts, dev server |
| `public/fonts/` | Self-hosted font files for Excalidraw |

## Dependencies

### Production Dependencies

- `@excalidraw/excalidraw` - Drawing library
- `react` - UI framework
- `react-dom` - React DOM renderer
- `electron-is-dev` - Development environment detector

### Dev Dependencies

- `webpack` - Module bundler
- `webpack-dev-server` - Development server with HMR
- `webpack-cli` - Webpack CLI
- `@babel/core`, `@babel/preset-env`, `@babel/preset-react` - JavaScript transpilation
- `babel-loader` - Babel loader for webpack
- `html-webpack-plugin` - HTML template processing
- `copy-webpack-plugin` - Asset copying
- `css-loader`, `style-loader` - CSS processing
- `electron` - Desktop framework
- `concurrently` - Run multiple commands in parallel

## Configuration

### Webpack

- **Mode**: Development (for dev), Production (for build)
- **Entry**: `./src/index.jsx`
- **Output**: `./build/bundle.js`
- **Dev Server Port**: 3000
- **Asset Limits**: 512KB (increased for large bundles)

### Content Security Policy

```text
default-src 'self' 'unsafe-inline'
img-src 'self' data:
font-src 'self' data: https:
```

Allows:

- Self-hosted resources
- Inline styles (required by Excalidraw)
- Data URIs for images and fonts
- HTTPS fonts (for CDN fonts as fallback)

### Module Aliases

Webpack aliases handle roughjs module resolution:

```javascript
'roughjs/bin/*' -> resolved to local bin files
```

## Notes

- **React 19 Compatibility**: Some deprecation warnings from @excalidraw library due to React 19 changes. These don't affect functionality.
- **Unload Event Listeners**: Deprecation warning from excalidraw lib - will be fixed in future library updates.
- **Development Only**: Some security features (ContentSecurityPolicy) are lenient for development. They can be tightened for production.

## License

MIT
