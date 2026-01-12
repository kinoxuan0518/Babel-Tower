# Babel Tower v3

Cognitive Translation Layer Chrome Extension - Optimized Edition

## Key Improvements over v2

### 1. Security Hardening
- **LLM API Proxy**: All LLM calls now go through the background service worker, keeping API keys secure and avoiding CSP issues
- **DOMPurify Integration**: All LLM responses are sanitized before rendering to prevent XSS attacks
- **Content Security Policy**: Explicit CSP in manifest

### 2. Architecture Refactoring
- **Modular Structure**: Code split into logical modules:
  - `src/shared/` - Constants, utilities, types
  - `src/content/parsers/` - Price, currency, size parsing
  - `src/content/heuristics/` - Price, size, context analysis
  - `src/content/overlay/` - Safe DOM rendering
  - `src/content/llm/` - LLM client with caching
  - `src/content/state/` - Centralized state management
  - `src/background/` - Service worker
  - `src/options/` - Settings page
- **Rollup Bundling**: Modern build system with tree-shaking

### 3. Performance Optimization
- **Precompiled Regex**: Currency and price patterns compiled once at module load
- **Response Caching**: LLM responses cached with 24h TTL to avoid duplicate calls
- **State Caching**: Settings loaded once and updated incrementally via storage listeners
- **Debounced Selection**: Selection events debounced to reduce processing

## Project Structure

```
babel_tower_v3/
├── dist/                 # Built files (load this in Chrome)
├── public/               # Static assets
│   ├── manifest.json     # Extension manifest (MV3)
│   ├── profile.json      # Default user config
│   └── icons/            # Extension icons
├── src/
│   ├── shared/           # Shared utilities
│   │   ├── constants.js  # All constants centralized
│   │   └── utils.js      # Helper functions
│   ├── content/          # Content script
│   │   ├── parsers/      # Price, currency, size parsing
│   │   ├── heuristics/   # Analysis without LLM
│   │   ├── overlay/      # Safe DOM rendering
│   │   ├── llm/          # LLM client
│   │   ├── state/        # State management
│   │   ├── styles.css    # Overlay styles
│   │   └── index.js      # Entry point
│   ├── background/       # Service worker
│   │   └── index.js      # FX rates, LLM proxy
│   └── options/          # Settings page
│       ├── options.html
│       └── index.js
├── package.json
└── rollup.config.js      # Build configuration
```

## Installation

### Development

```bash
cd babel_tower_v3
npm install
npm run build
```

Then load `dist/` folder in Chrome:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder

### Watch Mode

```bash
npm run watch
```

## Usage

1. **Quiet Mode (default)**: Right-click selected text → "Babel Tower: Explain Selection" or click toolbar icon
2. **Auto Mode**: Disable quiet mode in settings to show overlay on text selection

## Configuration

Open extension settings (click toolbar icon when not in quiet mode):

- **Target Currency**: Display currency for price conversions
- **LLM Provider**: Configure OpenAI/DeepSeek/Gemini/etc.
- **Custom Anchor**: Define personal cognitive anchors (e.g., "milk tea: 20 CNY")
- **Body Data**: For size/fit estimation (stored locally only)

## Security Notes

- API keys stored in `chrome.storage.local` (browser only)
- All LLM requests proxied through background script
- LLM responses sanitized with DOMPurify
- No external analytics or data collection
