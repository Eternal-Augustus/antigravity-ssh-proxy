<div align="center">
<img src="https://raw.githubusercontent.com/dinobot22/antigravity-ssh-proxy/main/ATP.jpg" width="128" />

# Antigravity SSH Proxy (ATP)

**English** · [简体中文](README.zh-CN.md)

[![Version](https://img.shields.io/visual-studio-marketplace/v/dinobot22.antigravity-ssh-proxy)](https://marketplace.visualstudio.com/items?itemName=dinobot22.antigravity-ssh-proxy)
[![GitHub stars](https://img.shields.io/github/stars/dinobot22/antigravity-ssh-proxy)](https://github.com/dinobot22/antigravity-ssh-proxy)
[![GitHub issues](https://img.shields.io/github/issues/dinobot22/antigravity-ssh-proxy)](https://github.com/dinobot22/antigravity-ssh-proxy/issues)
[![License](https://img.shields.io/github/license/dinobot22/antigravity-ssh-proxy)](https://github.com/dinobot22/antigravity-ssh-proxy/blob/main/LICENSE)

</div>

Proxy interface for Antigravity. ATP bypasses server firewalls by securely routing remote traffic through local or designated gateways.

> **Note:** This version only supports **Linux remote servers**.

> This project is a fork of [wang-muhan/antigravity-interface](https://github.com/wang-muhan/antigravity-interface). Thanks to the original author for the excellent work!

---

## Features

- **Automated Proxy Setup**: Deploys `mgraftcp` and configures proxies automatically.
- **SSH Reverse Tunnel**: Routes traffic through your local proxy via SSH port forwarding.
- **Process Redirection**: Automatically intercepts and redirects language server processes.

## Quick Start

1. Install the **Antigravity SSH Proxy** extension on your local Antigravity.
2. Connect to your remote Linux server using Antigravity Remote - SSH.
3. Install the extension again **on the remote server** (found in the Extensions view under the SSH section).
4. Execute the **Developer: Reload Window** command (or restart Antigravity) to ensure all services are properly initialized.
5. Configure your `localProxyPort` in settings (e.g., 7890) to match your local proxy service.

## Extension Settings

| Setting | Description |
|---------|-------------|
| `enableLocalForwarding` | Enable SSH reverse tunnel forwarding. |
| `localProxyPort` | Local proxy port on your computer. |
| `remoteProxyHost` | Proxy host address on the remote server. |
| `remoteProxyPort` | Proxy port on the remote server. |

## Requirements

- SSH access to the remote server.
- Linux remote server (x86_64 or arm64).
- A local proxy running on your computer (e.g., Clash, V2Ray).
