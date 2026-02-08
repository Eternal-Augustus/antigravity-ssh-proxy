## Step 1 — 简单重试（请务必先完成）

当发现功能无法正常使用时，请 **严格按照以下顺序重试一次**：

### 1️⃣ 关闭所有 Antigravity 窗口
- 包括 **本地窗口**
- 以及 **所有远程（SSH）窗口**

---

### 2️⃣ 重新打开本地 Antigravity
1. 先打开 **本地 Antigravity 窗口**
2. 等待本地插件启动完成  
   - 左下角 **ATP 状态变为绿色** ✅

---

### 3️⃣ 重新连接远程服务器（关键步骤）
点击左侧 **SSH 链接** 连接远程服务器，连接时通常会看到两个选项：

- ❌ 在当前窗口连接远程服务  
  `Connect SSH Host in Current Window`
- ✅ **打开新窗口连接远程服务（请选择这个）**  
  `Connect SSH Host in New Window`

> ⚠️ 请务必选择 **打开新窗口** 的方式进行连接

---

### 4️⃣ 重试功能
- 在新的远程窗口中重试相关功能
- 观察是否恢复正常

---

### 5️⃣ 重启窗口提示
如果系统提示需要 **重启窗口**：
- 请直接重启  
- 以确保插件和环境状态完全刷新

---

## Step 2 — 故障排查（仍无法使用时）

如果在 **完成配置 + 以上重试步骤后** 功能仍无法正常使用，  
请在提交 Bug 时 **务必附带以下信息**。

---

### 📌 必需日志信息

#### 1️⃣ ATP 诊断信息
- 打开 **左下角的ATP 页面(远程)**
- 运行 **诊断(Diagnose)**
- 复制并附上完整诊断结果

---

#### 2️⃣ Antigravity Output 日志
在 Antigravity 的 **Output 面板** 中获取以下内容：

| 日志频道 | 查看路径 |
|--------|---------|
| Antigravity | Output 面板 → Antigravity |
| Antigravity SSH Proxy | Output 面板 → Antigravity SSH Proxy |

请完整复制相关日志内容。

---

### 📌 额外系统信息（请直接粘贴命令输出）

```bash
uname -a                          # 内核版本
uname -m                          # 架构 (x86_64 / aarch64)
ps -aux | grep language_server    # 查看实际启动的 language_server
cat /proc/sys/kernel/yama/ptrace_scope  # Ptrace 权限信息
ls -la /.dockerenv                # 是否运行在 Docker 中
```

如果有一些其他的截图信息,请一并附上.