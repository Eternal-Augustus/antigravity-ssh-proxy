# Change Log

All notable changes to the "Antigravity SSH Proxy" extension will be documented in this file.

## [0.0.7] - 2026-02-04

### Fixed

- **FakeDNS Library Detection**: Fixed `libdnsredir-linux-amd64.so` not being found (was looking for `libdnsredir.so`).
- **Proxy Fallback Logic**: Fixed AutoSelectMode fallback - now tries HTTP proxy before falling back to direct connection when SOCKS5 fails.
- **HTTP Proxy Support**: Changed default from SOCKS5 to HTTP proxy for better compatibility with common proxy tools (Clash, etc.).

### Improved

- **Connection Reliability**: More robust proxy connection handling with proper fallback chain (SOCKS5 → HTTP Proxy → Direct).

## [0.0.6] - 2026-02-03

### Added

- **DNS Pollution Prevention**: Integrated FakeDNS and DNS hijacking mechanism to resolve connection issues in DNS-polluted environments.
- **Enhanced mgraftcp**: Upgraded to `mgraftcp-fakedns` which includes built-in FakeDNS server and `libdnsredir.so` for intercepting DNS calls.
- **Go Application Support**: Added `GODEBUG=netdns=cgo` to force Go applications (like the Antigravity Language Server) to use the cgo resolver, enabling DNS redirection.

### Improved

- **Connection Stability**: Significantly improved connection success rate for Google APIs by bypassing polluted DNS results.

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
