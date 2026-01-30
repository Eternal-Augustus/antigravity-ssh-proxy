# Change Log

All notable changes to the "Antigravity SSH Proxy" extension will be documented in this file.

## [0.0.2] - 2026-01-30

### Fixed

- Fixed mgraftcp binary permission issue on first install.
- Fixed proxy not working after Antigravity updates (now configures all Language Server versions).
- Fixed external connectivity diagnostic failing due to DNS resolution issues (now tries socks5h/http/socks5).
- Fixed rollback command only restoring one Language Server version (now restores all).

### Improved

- Smart reload prompt: only prompts when Language Server is not using proxy.
- Better compatibility with Clash/V2Ray mixed proxy ports.

## [0.0.1] - 2025-12-26

### Added

- Initial release.
- Automated proxy setup for Linux remote servers.
- SSH reverse tunnel forwarding via `~/.ssh/config.antigravity`.
- `mgraftcp` integration for process-level traffic redirection.
- Support for x86_64 and arm64 architectures.
