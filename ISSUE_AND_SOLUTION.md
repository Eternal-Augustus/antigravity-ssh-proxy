# Antigravity SSH Proxy - DNS 污染问题排查与修复

## 问题概述

**现象**：Language Server 无法连接 Google API，出现 TLS 证书错误

```
tls: failed to verify certificate: x509: certificate is valid for 
antigravity-unleash.goog, not daily-cloudcode-pa.googleapis.com
```

**根本原因**：DNS 污染 + FakeDNS 功能未正常工作

---

## 问题分析

### 1. DNS 污染问题

在某些网络环境下，DNS 查询被污染，返回错误的 IP 地址：

```
请求: daily-cloudcode-pa.googleapis.com
被污染返回: 203.98.7.65 (实际是 antigravity-unleash.goog 的 IP)
正确应该是: 142.250.x.x
```

结果：TLS 握手时证书域名不匹配，连接失败。

### 2. 发现的三个 Bug

| # | Bug | 原因 | 影响 |
|---|-----|------|------|
| 1 | FakeDNS 库找不到 | 代码查找 `libdnsredir.so`，但文件名是 `libdnsredir-linux-amd64.so` | FakeDNS 功能完全失效 |
| 2 | 代理 Fallback 逻辑错误 | AutoSelectMode 下 SOCKS5 失败后直接 fallback 到 direct，跳过 HTTP 代理 | 即使配置了 HTTP 代理也不使用 |
| 3 | Wrapper 脚本使用错误的二进制 | 查找 `mgraftcp-linux-amd64` 而非 `mgraftcp-fakedns-linux-amd64` | 使用了不带 FakeDNS 的版本 |

### 3. Wrapper 脚本问题详解

**背景**：扩展通过 `setup-proxy.sh` 在远程服务器上创建一个 wrapper 脚本，替换原始的 `language_server_linux_x64`：

```
原始文件: language_server_linux_x64      → 重命名为 language_server_linux_x64.bak
新建脚本: language_server_linux_x64      → wrapper 脚本，调用 mgraftcp 启动 .bak
```

**Wrapper 脚本位置**：
```
~/.antigravity-server/bin/<version>/extensions/antigravity/bin/language_server_linux_x64
```

**问题**：旧版本的 `setup-proxy.sh` 生成的 wrapper 脚本查找错误的二进制：

```bash
# 旧版 wrapper 脚本中的代码（错误）
case "$arch" in
    x86_64|amd64) binary_name="mgraftcp-linux-amd64" ;;      # ❌ 不带 FakeDNS
    aarch64|arm64) binary_name="mgraftcp-linux-arm64" ;;     # ❌ 不带 FakeDNS
esac
```

**结果**：即使安装了新版本扩展（0.0.7），旧的 wrapper 脚本仍然调用不带 FakeDNS 功能的 `mgraftcp-linux-amd64`，导致 DNS 污染问题无法解决。

**诊断方法**：
```bash
# 查看当前使用的二进制
ps aux | grep language_server

# 如果看到 mgraftcp-linux-amd64 而不是 mgraftcp-fakedns-linux-amd64，说明 wrapper 脚本未更新
```

**修复方法**：

方法 A - 重新运行 Setup（推荐）：
```bash
# 1. 先恢复原始二进制
cd ~/.antigravity-server/bin/<version>/extensions/antigravity/bin/
mv language_server_linux_x64.bak language_server_linux_x64

# 2. 运行新版本的 setup
export PROXY_HOST=127.0.0.1
export PROXY_PORT=7890
bash ~/.antigravity-server/extensions/dinobot22.antigravity-ssh-proxy-0.0.7/scripts/setup-proxy.sh
```

方法 B - 直接修改现有 wrapper 脚本：
```bash
sed -i 's/mgraftcp-linux-amd64/mgraftcp-fakedns-linux-amd64/g; s/mgraftcp-linux-arm64/mgraftcp-fakedns-linux-arm64/g' \
  ~/.antigravity-server/bin/*/extensions/antigravity/bin/language_server_linux_x64
```

方法 C - 使用 Cursor 命令面板：
1. 按 `Ctrl+Shift+P`
2. 运行 `Antigravity SSH Proxy: Setup Remote Environment`

---

## 技术架构

### FakeDNS 工作原理

```
┌─────────────────────────────────────────────────────────────────────┐
│                     mgraftcp-fakedns                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐    │
│  │   FakeDNS    │◄───│ libdnsredir  │    │   graftcp-local    │    │
│  │   Server     │    │  (LD_PRELOAD)│    │  (代理连接处理)     │    │
│  └──────┬───────┘    └──────────────┘    └─────────┬──────────┘    │
│         │                                          │               │
│         │  映射表: 198.18.0.1 → www.google.com     │               │
│         └──────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

**工作流程**：
1. FakeDNS 拦截 DNS 查询，返回假 IP (198.18.0.0/15 范围)
2. 记录 假IP → 域名 映射
3. graftcp-local 拦截 connect() 调用
4. 检测假 IP，反查域名，通过代理使用域名连接
5. 代理在远端解析真实 IP，绕过 DNS 污染

---

## 代码修复

### 修复 1: libdnsredir 库名称 (`mgraftcp-fakedns/main.go`)

```go
// 修复前
libName := "libdnsredir.so"

// 修复后
libName := "libdnsredir-linux-amd64.so"
```

### 修复 2: AutoSelectMode Fallback 逻辑 (`local/local.go`)

```go
// 修复前：SOCKS5 失败 → 直接 direct
if err != nil && l.selectMode == AutoSelectMode {
    destConn, err = net.Dial("tcp", destAddr)  // 跳过了 HTTP 代理！
}

// 修复后：SOCKS5 失败 → HTTP 代理 → direct
if err != nil && l.selectMode == AutoSelectMode {
    // 先尝试 HTTP 代理
    if l.httpProxyDialer != nil && dialer != l.httpProxyDialer {
        log.Infof("SOCKS5 failed, trying HTTP proxy for %s", destAddr)
        destConn, err = l.httpProxyDialer.Dial("tcp", destAddr)
    }
    // 都失败才 direct
    if err != nil {
        destConn, err = net.Dial("tcp", destAddr)
    }
}
```

### 修复 3: setup-proxy.sh 使用正确的二进制

```bash
# 修复前
binary_name="mgraftcp-linux-amd64"

# 修复后
binary_name="mgraftcp-fakedns-linux-amd64"
```

---

## 部署步骤

### 1. 重新编译 mgraftcp-fakedns

```bash
cd /home/ubuntu/main/graftcp/local
make mgraftcp-fakedns
```

### 2. 复制到扩展目录

```bash
cp mgraftcp-fakedns /home/ubuntu/main/antigravity-ssh-proxy/resources/bin/mgraftcp-fakedns-linux-amd64
```

### 3. 构建扩展包

```bash
cd /home/ubuntu/main/antigravity-ssh-proxy
source ~/miniconda3/bin/activate node_env
npm run package
npx vsce package --no-dependencies
```

### 4. 安装新版本

用户安装 `antigravity-ssh-proxy-0.0.7.vsix` 后，需要：
1. 运行 `Antigravity SSH Proxy: Setup Remote Environment`
2. 或手动修复现有 wrapper 脚本

---

## 验证方法

### 测试 FakeDNS 是否工作

```bash
./mgraftcp-fakedns-linux-amd64 \
  --http_proxy 127.0.0.1:7890 \
  --enable-debug-log \
  curl -v https://play.googleapis.com
```

**成功标志**：
```
FakeDNS started on 127.0.0.1:xxxxx
[FakeDNS] Allocated play.googleapis.com -> 198.18.0.1
FakeDNS: Resolved 198.18.0.1 -> play.googleapis.com
Request PID: xxx, Dest Addr: play.googleapis.com:443  ← 域名而非 IP
```

**失败标志**（无 FakeDNS）：
```
dial 216.239.38.223:443 direct  ← 被污染的 IP
```

---

## 待办事项

- [ ] 将修复合并到主分支
- [ ] 发布 v0.0.7 到 VS Code Marketplace
- [ ] 添加 arm64 架构的 `libdnsredir-linux-arm64.so` 支持
- [x] ~~考虑在 `setup-proxy.sh` 中自动检测并更新旧的 wrapper 脚本~~ ✅ 已完成

---

## 文件清单

| 文件 | 说明 |
|------|------|
| `graftcp/local/cmd/mgraftcp-fakedns/main.go` | FakeDNS 集成的 mgraftcp 主程序 |
| `graftcp/local/local.go` | 代理连接处理逻辑 |
| `graftcp/local/fakedns/fakedns.go` | FakeDNS 服务器实现 |
| `graftcp/local/dnsredir/dnsredir.c` | DNS 劫持库 (LD_PRELOAD) |
| `antigravity-ssh-proxy/scripts/setup-proxy.sh` | Language Server wrapper 脚本生成器 |

---

*文档日期: 2026-02-04*
*版本: 0.0.7*

