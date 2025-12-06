# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2025-12-07

### Changed

- **BREAKING**: Package name changed from `reactscan` to `@minagishl/reactscan`
  - Install command is now `npm install -g @minagishl/reactscan`
  - CLI command remains `reactscan`

### Added

- Git hooks management with husky ([2badd70](https://github.com/minagishl/reactscan/commit/2badd70))
  - pre-commit: Runs linter and formatter checks before committing
  - pre-push: Builds the project to ensure it compiles before pushing
- Comprehensive documentation ([69b2153](https://github.com/minagishl/reactscan/commit/69b2153))
  - README.md with full usage examples
  - Configuration examples in multiple formats
  - Plugin API documentation
- MIT License ([a4b8d99](https://github.com/minagishl/reactscan/commit/a4b8d99))
- Added `typecheck` script to package.json
- Added `husky@^9.1.7` to devDependencies

## [1.1.0] - 2025-12-07

### Added

- Cache mechanism to improve execution speed on large projects ([2434dda](https://github.com/minagishl/reactscan/commit/2434dda))
  - Cache directory: `.reactscan/cache`
  - Default TTL: 30 minutes (configurable via `cache.ttl`)
  - Applies to `scan`, `rsc`, and `deps` commands
  - Added to `.gitignore`
- `--no-cache` flag to disable cache for all commands
- `--quiet` flag for minimal output (errors only)
- Fast file exploration using `globby` for parallel search
  - Automatic exclusion of large directories (`node_modules`, `.next`, `dist`, `build`, `.turbo`, `.cache`, `out`, `.git`)
  - Respects `.gitignore` patterns
- HTML parser (`node-html-parser`) for accurate DOM analysis
  - Detects `data-nextjs-flight` attributes
  - Prevents false positives from script/style tags
  - Graceful fallback to string search on parse failure
- Error classification system
  - Network errors (HTTP, timeouts, fetch failures)
  - Filesystem errors (ENOENT, EACCES, EPERM)
  - Parse errors (JSON, HTML syntax errors)
  - Config errors
  - Full stack trace display with `--debug` flag
- Execution time display (ms) for all commands
- Configuration options for cache and performance
  - `cache.enabled` - Enable/disable cache functionality (default: `true`)
  - `cache.ttl` - Cache expiration time in milliseconds (default: `1800000`)
  - `performance.ignoreLargeDirs` - Automatically exclude large directories (default: `true`)
  - `remote.timeout` - Remote scan timeout in milliseconds (default: `8000`)
- Support for multiple configuration file formats ([b33ef66](https://github.com/minagishl/reactscan/commit/b33ef66))
  - `.reactscanrc.json`
  - `.reactscanrc`
  - `reactscan.config.json`
  - `reactscan.config.js` / `.mjs` / `.cjs`
  - `reactscan` field in `package.json`
  - Prioritized search order with config loading

### Changed

- Improved remote RSC scan stability
  - Default timeout increased from 5 seconds to 8 seconds
  - Better error messages for HTTP errors with error classification
  - Graceful fallback for response decoding failures
  - Enhanced compression handling (gzip/br) with error recovery
  - Added `User-Agent: reactscan/1.1.0` header
- Enhanced CLI output formatting
  - Errors and warnings displayed in separate sections with headings
  - Improved `--quiet` mode for CI/CD integration
  - Consistent formatting across all commands
  - Elapsed time shown at the end of each command
- File search performance improvements
  - Parallel file reading with `Promise.all`
  - Optimized glob patterns
  - Better ignore pattern handling
- Updated dependencies
  - Added `globby@^14.0.2`
  - Added `node-html-parser@^6.1.13`

### Fixed

- Script/style tag false positives in HTML detection
- Error handling in remote scan response decoding
- Type safety issues in file iteration

## [1.0.0] - 2025-12-07

### Added

- Plugin system for custom checks ([4076e82](https://github.com/minagishl/reactscan/commit/4076e82))
  - Plugin directory configurable via `pluginsDir` option
  - Automatic plugin loading from project root
  - Plugin API with context and result types
  - Example plugin: `simple-metadata-plugin`
- Configuration file support
  - `reactscan.config.json` in project root
  - `ignore` patterns for file exclusion
  - `remote.timeout` configuration
- Structured output with `renderResult` utility
- Logging system with levels (info, warn, error, success, debug)
  - Colored output using chalk
  - Debug mode with `--debug` flag
  - Formatted labels and values
- Context-based architecture
  - `ScanContext` type for sharing state
  - `ScanResult` type for consistent results
- Suggestion system for actionable recommendations

### Changed

- Refactored all commands to use plugin system
  - `scan`, `rsc`, `deps` now integrate with plugins
  - Plugin results merged with base results
- Improved error handling across all commands
- Enhanced report formatting
- Better separation of concerns with utility modules

### Fixed

- Consistent error propagation
- Type safety improvements

## [0.3.0] - 2025-12-07

### Added

- Network-based dependency version checking ([063b0d4](https://github.com/minagishl/reactscan/commit/063b0d4))
  - Fetch latest versions from npm registry
  - Compare installed vs latest versions
  - Detect outdated packages
- Structured result types for better error handling
- Enhanced init command with better scaffolding

### Changed

- Improved `deps` command with actual version comparison
  - Added semver-based version normalization
  - Network-aware fallback for offline scenarios
- Refactored `rsc` command for better modularity
  - Separated local and remote analysis
  - Improved marker detection
- Better report formatting with categorized output
- Enhanced error messages across all commands

### Fixed

- Version string parsing edge cases
- Error handling in network requests

## [0.2.0] - 2025-12-07

### Added

- Remote RSC scanning capability ([eb0e108](https://github.com/minagishl/reactscan/commit/eb0e108))
  - HTTP/HTTPS URL support
  - Header inspection (X-React-Flight, Content-Type)
  - Body marker detection (\_\_next_f, react-server-dom-webpack)
  - Server Action marker detection
  - User confirmation for external sites
  - Localhost detection
- `init` command for project scaffolding
- `report` command for generating analysis reports
  - JSON and text output formats
  - Comprehensive project analysis
  - File output support
- User prompt utility for interactive confirmations
- File writing utilities with directory creation

### Changed

- Enhanced `scan` command with better detection logic
  - Improved version detection
  - Better RSC likelihood scoring
- Improved `rsc` command with local file analysis
  - Server Action file detection
  - Router marker detection
- Better separation between local and remote analysis
- Enhanced error messages with context

### Fixed

- Package.json reading edge cases
- Version detection for edge cases

## [0.1.0] - 2025-12-06

### Added

- Initial project setup ([954af13](https://github.com/minagishl/reactscan/commit/954af13))
- Core commands
  - `scan` - Detect React/Next.js projects
  - `rsc` - Basic RSC detection
  - `deps` - Dependency version checking
  - `check` - Basic validation
- File system utilities
  - Read package.json
  - Path existence checking
  - File search functionality
- Logger utility with colored output
- Basic CLI with commander.js
- TypeScript configuration
- ESLint and Prettier setup
- Development environment setup

### Changed

- Updated version to 0.1.0 ([b2ec280](https://github.com/minagishl/reactscan/commit/b2ec280))

[unreleased]: https://github.com/minagishl/reactscan/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/minagishl/reactscan/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/minagishl/reactscan/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/minagishl/reactscan/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/minagishl/reactscan/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/minagishl/reactscan/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/minagishl/reactscan/releases/tag/v0.1.0
