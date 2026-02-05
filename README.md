<div align="center">
<img src="https://raw.githubusercontent.com/dinobot22/antigravity-ssh-proxy/main/ATP.jpg" width="128" />

# Antigravity SSH Proxy (ATP)

**简体中文** · [English](README.en.md)

[![Version](https://img.shields.io/open-vsx/v/dinobot22/antigravity-ssh-proxy)](https://open-vsx.org/extension/dinobot22/antigravity-ssh-proxy)
[![GitHub stars](https://img.shields.io/github/stars/dinobot22/antigravity-ssh-proxy)](https://github.com/dinobot22/antigravity-ssh-proxy)
[![GitHub issues](https://img.shields.io/github/issues/dinobot22/antigravity-ssh-proxy)](https://github.com/dinobot22/antigravity-ssh-proxy/issues)
[![License](https://img.shields.io/github/license/dinobot22/antigravity-ssh-proxy)](https://github.com/dinobot22/antigravity-ssh-proxy/blob/main/LICENSE)

</div>

这是一个专为 **Antigravity** 设计的扩展（[Open VSX 地址](https://open-vsx.org/extension/dinobot22/antigravity-ssh-proxy)），旨在简化 SSH 远程代理配置。ATP 通过安全路由绕过服务器防火墙，保障远程开发环境的连通性。

> ✨ **无需 root 权限** - 所有操作均在用户空间完成，安全便捷！

> **注意:** **当前版本**仅支持 **Linux 远程服务器 (x86_64)**。ARM 架构暂不支持。

> 本项目基于 [wang-muhan/antigravity-interface](https://github.com/wang-muhan/antigravity-interface) 进行二次开发，感谢原作者的出色工作！

---

## ⚠️ 重要：需要双端安装

此插件必须同时安装在 **本地** 和 **远程服务器** 上：

| 位置 | 职责 |
|------|------|
| **本地** | 管理 SSH 端口转发配置 (`~/.ssh/config.antigravity`) |
| **远程** | 配置 Language Server 代理包装器 (mgraftcp) |

---

## 功能特性

- **自动代理配置**：自动部署 `mgraftcp` 并配置代理。
- **SSH 反向隧道**：通过 SSH 端口转发将流量路由到本地代理。
- **进程重定向**：自动拦截并重定向语言服务器进程。
- **DNS 污染防护**：集成 FakeDNS 功能，有效解决 DNS 污染导致的连接问题，确保稳定连接。

## 快速开始

### 前置条件

在开始之前，请确保满足以下条件：

- ✅ 本地代理软件（如 Clash、V2Ray）已启动并正常运行
- ✅ 本地 Antigravity 的 AI 功能可以正常使用（这表明您的网络环境已正确配置）

---

### 配置步骤

**Step 1 — 本地安装与配置**

1. 在本地 Antigravity 中搜索并安装 **Antigravity SSH Proxy** 插件
2. 点击左下角 **ATP 面板**，配置 `localProxyPort` 为您本地代理端口（如 `7890`）
3. 检查面板状态，确认本地配置无异常

**Step 2 — 远程安装**

1. 使用 Antigravity SSH 连接到远程 Linux 服务器
2. 在插件视图的 **"SSH: [服务器名]"** 分类下，再次安装本插件

**Step 3 — 激活并验证**

1. 按照提示执行 **Reload Window** 重启窗口
2. 打开右下角 **ATP 面板**，运行 **连接诊断** 检查代理状态
3. 显示正常后，远程 AI 功能即可使用 🎉

---

### 故障排查

如果配置后仍无法正常使用，请检查以下日志：

| 日志频道 | 查看路径 |
|---------|---------|
| `Antigravity` | Output 面板 → Antigravity |
| `Antigravity SSH Proxy` | Output 面板 → Antigravity SSH Proxy |


## 扩展设置

| 设置 | 说明 |
|------|------|
| `enableLocalForwarding` | 启用 SSH 反向隧道转发。 |
| `localProxyPort` | 本地计算机上的代理端口。 |
| `remoteProxyHost` | 远程服务器上的代理主机地址。 |
| `remoteProxyPort` | 远程服务器上的代理端口。 |
| `showStatusOnStartup` | 连接远程服务器时显示状态通知。 |

## 卸载说明

卸载前，请先执行 **Antigravity SSH Proxy: Rollback Remote Environment** 命令以恢复原始的 Language Server。

## 环境要求

- 远程服务器的 SSH 访问权限。
- Linux 远程服务器（当前仅支持 x86_64 架构）。
- 本地运行的代理软件（如 Clash、V2Ray）。

## 致谢

特别感谢以下项目：

- [graftcp](https://github.com/hmgle/graftcp): 提供了核心代理功能。
- [antigravity-interface](https://github.com/wang-muhan/antigravity-interface): 提供了最初的插件实现。
