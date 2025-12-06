# React Scan

Non-intrusive CLI to statically inspect React / Next.js projects.

## Features

- Project scanning for React/Next.js detection and RSC usage analysis
- Remote inspection to detect RSC markers in production environments (read-only, safe)
- Dependency checking to identify risky version combinations
- Fast file exploration with parallel search
- Cache mechanism to improve execution speed on large projects
- Plugin system for custom checks
- Error classification for network, filesystem, and parse errors

## Installation

```bash
npm install -g reactscan
# or
pnpm add -g reactscan
# or
yarn global add reactscan
```

## Usage

### Basic Commands

#### `scan` - Project Scan

Detect React/Next.js projects and check for RSC signals:

```bash
reactscan scan
```

**Options:**

- `--debug` - Enable debug logging
- `--no-cache` - Disable cache
- `--quiet` - Minimal output (errors only)

**Example output:**

```
reactscan results:
  framework  React: yes
  framework  Next.js: yes
  version    react: 19.0.0
  version    next: 15.1.0
  ...

  elapsed    125ms
```

---

#### `rsc` - RSC Diagnosis

Diagnose local or remote RSC usage:

```bash
# Inspect local project
reactscan rsc

# Inspect specific directory
reactscan rsc ./my-project

# Inspect remote site (read-only)
reactscan rsc https://example.com
```

**Options:**

- `--debug` - Enable debug logging
- `--no-cache` - Disable cache
- `--quiet` - Minimal output

**Example output (local):**

```
RSC diagnosis:
  next.js         found
  app dir         present
  rsc pkgs        found
  server actions  3 file(s)
  router marker   5 file(s) with __NEXT_ROUTER_APP

✓ App Router directory detected. RSC support is likely enabled.
✓ Server Actions detected via "use server".

  elapsed    342ms
```

**Example output (remote):**

```
Remote RSC signals for https://example.com
  status              200
  header              X-React-Flight: present
  header              Content-Type text/x-component: missing
  header hints        x-vercel-id: ...

✓ Body markers detected: __next_f, react-server-dom-webpack
✓ Server Action markers detected: __SERVER_ACTIONS__

  elapsed    1523ms
```

---

#### `deps` - Dependency Check

Inspect versions of React and RSC-related packages:

```bash
reactscan deps
```

**Options:**

- `--debug` - Enable debug logging
- `--no-cache` - Disable cache
- `--quiet` - Minimal output

**Example output:**

```
Warnings:
  react 19.0.0 is behind latest 19.0.4.

Dependency issues:
  - react 19.0.0 combined with react-server-dom-webpack may be unsafe. Review compatibility.

✓ No known risky dependency combinations detected.

  elapsed    2341ms
```

---

## Configuration

You can create a configuration file in your project root. The following formats are supported:

- `.reactscanrc.json`
- `.reactscanrc`
- `reactscan.config.json`
- `reactscan.config.js` / `.mjs` / `.cjs`
- `reactscan` field in `package.json`

### Configuration Examples

#### JSON format (`.reactscanrc.json`)

```json
{
  "ignore": ["node_modules", "dist", ".next"],
  "pluginsDir": "plugins",
  "cache": {
    "enabled": true,
    "ttl": 1800000
  },
  "performance": {
    "ignoreLargeDirs": true
  },
  "remote": {
    "timeout": 8000
  }
}
```

#### JavaScript format (`reactscan.config.js`)

```javascript
export default {
  ignore: ["node_modules", "dist"],
  pluginsDir: "custom-plugins",
  cache: {
    enabled: true,
    ttl: 30 * 60 * 1000, // 30 minutes
  },
  performance: {
    ignoreLargeDirs: true,
  },
  remote: {
    timeout: 10000, // 10 seconds
  },
};
```

#### package.json

```json
{
  "name": "my-app",
  "reactscan": {
    "ignore": ["build"],
    "cache": {
      "enabled": false
    }
  }
}
```

### Configuration Options

| Option                        | Type       | Default     | Description                                  |
| ----------------------------- | ---------- | ----------- | -------------------------------------------- |
| `ignore`                      | `string[]` | `[]`        | Directory/file patterns to exclude           |
| `pluginsDir`                  | `string`   | `"plugins"` | Plugin directory (absolute or relative path) |
| `cache.enabled`               | `boolean`  | `true`      | Enable/disable cache functionality           |
| `cache.ttl`                   | `number`   | `1800000`   | Cache expiration time (milliseconds)         |
| `performance.ignoreLargeDirs` | `boolean`  | `true`      | Automatically exclude large directories      |
| `remote.timeout`              | `number`   | `8000`      | Remote scan timeout (milliseconds)           |

---

## Plugins

Provides a plugin system to add custom checks.

### Creating a Plugin

Create a `plugins` folder in your project root (or the directory specified in configuration):

```
your-project/
├── plugins/
│   └── my-plugin.js
└── reactscan.config.json
```

**Plugin example** (`plugins/my-plugin.js`):

```javascript
export default {
  name: "my-custom-check",
  run: async (context) => {
    const warnings = [];
    const errors = [];

    // Custom check logic
    if (/* some condition */) {
      warnings.push("Custom warning message");
    }

    return {
      ok: errors.length === 0,
      warnings,
      errors,
      meta: {
        customData: "...",
      },
    };
  },
};
```

### Plugin API

#### Context Object

```typescript
interface ScanContext {
  cwd: string; // Execution directory
  command: string; // Executed command name
  config: ReactscanConfig; // Loaded configuration
  debug: boolean; // Whether debug mode is enabled
  baseResult?: ScanResult; // Base command result
}
```

#### Return Value

```typescript
interface ScanResult {
  ok: boolean; // Whether successful
  warnings: string[]; // Warning messages
  errors: string[]; // Error messages
  meta?: Record<string, unknown>; // Custom metadata
}
```

---

## Cache

The cache mechanism improves performance on large projects.

### Cache Location

```
.reactscan/
└── cache/
    ├── scan_path_hash.json
    ├── deps_path_hash.json
    └── local-rsc_path_hash.json
```

### Cache Control

```bash
# Use cache (default)
reactscan scan

# Disable cache
reactscan scan --no-cache

# Completely disable cache in configuration
# reactscan.config.json
{
  "cache": {
    "enabled": false
  }
}
```

## Error Handling

Errors are classified and displayed by type:

- **[Network Error]**: HTTP requests and timeouts
- **[Filesystem Error]**: File reading and access permissions
- **[Parse Error]**: JSON or HTML parsing failures
- **[Config Error]**: Configuration file issues
- **[Error]**: Other errors

Using the `--debug` flag will display the full stack trace.

---

## Examples

### Usage in CI/CD

```yaml
# .github/workflows/check.yml
name: React/Next.js Check
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install -g reactscan
      - run: reactscan scan
      - run: reactscan deps
```

### Usage in pre-commit hooks

```json
// package.json
{
  "scripts": {
    "precommit": "reactscan scan --quiet && reactscan deps --quiet"
  }
}
```

---

## Development

### Git Hooks

This project uses [husky](https://typicode.github.io/husky/) to manage Git hooks:

- **pre-commit**: Runs linter and formatter checks before committing
- **pre-push**: Builds the project to ensure it compiles before pushing

When you run `pnpm install`, husky will automatically set up these hooks.

### Manual Setup

If hooks are not set up automatically:

```bash
pnpm install
pnpm run prepare
```

### Running Checks Manually

```bash
# Run linter
pnpm run lint

# Fix linting issues
pnpm run lint:fix

# Check formatting
pnpm run format

# Fix formatting
pnpm run format:write

# Build the project
pnpm run build
```

---

## Contributing

Issues and Pull Requests are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## Support

- [GitHub Issues](https://github.com/minagishl/reactscan/issues)
- [Documentation](https://github.com/minagishl/reactscan#readme)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
