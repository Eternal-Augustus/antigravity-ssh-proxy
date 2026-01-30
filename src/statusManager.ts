import * as vscode from 'vscode';
import * as net from 'net';

export interface ProxyStatus {
    runningLocation: 'local' | 'remote';
    sshConfigEnabled: boolean;
    localProxyPort: number;
    remoteProxyPort: number;
    remoteProxyHost: string;
    localProxyReachable: boolean;
    remoteProxyReachable: boolean;
    lastUpdated: Date;
    languageServerConfigured?: boolean;
}

type StatusUpdateCallback = (status: ProxyStatus) => void;
type ConfigChangeCallback = () => Promise<void>;

const REFRESH_INTERVAL_SEC = 30;

export class StatusManager {
    private statusBarItem: vscode.StatusBarItem;
    private currentStatus: ProxyStatus;
    private updateCallbacks: StatusUpdateCallback[] = [];
    private refreshInterval: NodeJS.Timeout | undefined;
    private statusPanel: vscode.WebviewPanel | undefined;
    private countdownInterval: NodeJS.Timeout | undefined;
    private secondsUntilRefresh: number = REFRESH_INTERVAL_SEC;
    private onConfigChange: ConfigChangeCallback | undefined;

    constructor(private isLocal: boolean, private context: vscode.ExtensionContext) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'antigravity-ssh-proxy.showStatusPanel';
        this.statusBarItem.name = 'ATP';

        const config = vscode.workspace.getConfiguration('antigravity-ssh-proxy');
        this.currentStatus = {
            runningLocation: isLocal ? 'local' : 'remote',
            sshConfigEnabled: false,
            localProxyPort: config.get<number>('localProxyPort', 7890),
            remoteProxyPort: config.get<number>('remoteProxyPort', 7890),
            remoteProxyHost: config.get<string>('remoteProxyHost', '127.0.0.1'),
            localProxyReachable: false,
            remoteProxyReachable: false,
            lastUpdated: new Date(),
        };

        this.updateStatusBar();
        this.statusBarItem.show();
    }

    /**
     * 设置配置变更回调（用于重新应用 SSH 配置）
     */
    setConfigChangeCallback(callback: ConfigChangeCallback): void {
        this.onConfigChange = callback;
    }

    onStatusUpdate(callback: StatusUpdateCallback): vscode.Disposable {
        this.updateCallbacks.push(callback);
        return new vscode.Disposable(() => {
            const index = this.updateCallbacks.indexOf(callback);
            if (index >= 0) {
                this.updateCallbacks.splice(index, 1);
            }
        });
    }

    startAutoRefresh(): void {
        this.stopAutoRefresh();
        this.secondsUntilRefresh = REFRESH_INTERVAL_SEC;
        
        this.refreshInterval = setInterval(() => {
            this.refreshStatus();
            this.secondsUntilRefresh = REFRESH_INTERVAL_SEC;
        }, REFRESH_INTERVAL_SEC * 1000);

        this.countdownInterval = setInterval(() => {
            this.secondsUntilRefresh = Math.max(0, this.secondsUntilRefresh - 1);
            this.updatePanelCountdown();
        }, 1000);

        this.refreshStatus();
    }

    stopAutoRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = undefined;
        }
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = undefined;
        }
    }

    async refreshStatus(): Promise<void> {
        const config = vscode.workspace.getConfiguration('antigravity-ssh-proxy');
        
        this.currentStatus.localProxyPort = config.get<number>('localProxyPort', 7890);
        this.currentStatus.remoteProxyPort = config.get<number>('remoteProxyPort', 7890);
        this.currentStatus.remoteProxyHost = config.get<string>('remoteProxyHost', '127.0.0.1');

        if (this.isLocal) {
            this.currentStatus.localProxyReachable = await this.checkPort(
                '127.0.0.1',
                this.currentStatus.localProxyPort
            );
        } else {
            this.currentStatus.remoteProxyReachable = await this.checkPort(
                this.currentStatus.remoteProxyHost,
                this.currentStatus.remoteProxyPort
            );
        }

        this.currentStatus.lastUpdated = new Date();
        this.secondsUntilRefresh = REFRESH_INTERVAL_SEC;
        this.updateStatusBar();
        this.updatePanelIfOpen();
        this.notifyCallbacks();
    }

    updateSSHConfigStatus(enabled: boolean, port?: number): void {
        this.currentStatus.sshConfigEnabled = enabled;
        if (port !== undefined) {
            this.currentStatus.remoteProxyPort = port;
        }
        this.currentStatus.lastUpdated = new Date();
        this.updateStatusBar();
        this.updatePanelIfOpen();
        this.notifyCallbacks();
    }

    updateLanguageServerStatus(configured: boolean): void {
        this.currentStatus.languageServerConfigured = configured;
        this.currentStatus.lastUpdated = new Date();
        this.updateStatusBar();
        this.updatePanelIfOpen();
        this.notifyCallbacks();
    }

    getStatus(): ProxyStatus {
        return { ...this.currentStatus };
    }

    showStatusPanel(): void {
        if (this.statusPanel) {
            this.statusPanel.reveal();
            return;
        }

        this.statusPanel = vscode.window.createWebviewPanel(
            'atpStatus',
            'Antigravity SSH Proxy',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.statusPanel.webview.html = this.getPanelHtml();

        this.statusPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'refresh':
                        await this.refreshStatus();
                        break;
                    case 'saveConfig':
                        await this.saveConfig(message.config);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.statusPanel.onDidDispose(() => {
            this.statusPanel = undefined;
        });
    }

    /**
     * 保存配置
     */
    private async saveConfig(newConfig: {
        localProxyPort?: number;
        remoteProxyPort?: number;
        remoteProxyHost?: string;
        enableLocalForwarding?: boolean;
    }): Promise<void> {
        const config = vscode.workspace.getConfiguration('antigravity-ssh-proxy');
        
        try {
            if (newConfig.localProxyPort !== undefined) {
                await config.update('localProxyPort', newConfig.localProxyPort, vscode.ConfigurationTarget.Global);
            }
            if (newConfig.remoteProxyPort !== undefined) {
                await config.update('remoteProxyPort', newConfig.remoteProxyPort, vscode.ConfigurationTarget.Global);
            }
            if (newConfig.remoteProxyHost !== undefined) {
                await config.update('remoteProxyHost', newConfig.remoteProxyHost, vscode.ConfigurationTarget.Global);
            }
            if (newConfig.enableLocalForwarding !== undefined) {
                await config.update('enableLocalForwarding', newConfig.enableLocalForwarding, vscode.ConfigurationTarget.Global);
            }

            // 触发配置变更回调
            if (this.onConfigChange) {
                await this.onConfigChange();
            }

            await this.refreshStatus();
            vscode.window.showInformationMessage('Configuration saved');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save config: ${error}`);
        }
    }

    private updatePanelIfOpen(): void {
        if (this.statusPanel) {
            this.statusPanel.webview.html = this.getPanelHtml();
        }
    }

    private updatePanelCountdown(): void {
        if (this.statusPanel) {
            this.statusPanel.webview.postMessage({
                command: 'updateCountdown',
                seconds: this.secondsUntilRefresh
            });
        }
    }

    private updateStatusBar(): void {
        const status = this.currentStatus;
        let tooltip: string;

        if (this.isLocal) {
            if (status.sshConfigEnabled && status.localProxyReachable) {
                this.statusBarItem.color = '#3fb950';
                tooltip = 'Antigravity SSH Proxy (ATP)\n✅ Connected';
            } else if (status.sshConfigEnabled) {
                this.statusBarItem.color = '#d29922';
                tooltip = 'Antigravity SSH Proxy (ATP)\n⚠️ SSH configured, proxy unreachable';
            } else {
                this.statusBarItem.color = '#f85149';
                tooltip = 'Antigravity SSH Proxy (ATP)\n❌ Disconnected';
            }
        } else {
            if (status.remoteProxyReachable) {
                this.statusBarItem.color = '#3fb950';
                tooltip = 'Antigravity SSH Proxy (ATP)\n✅ Proxy OK';
            } else {
                this.statusBarItem.color = '#f85149';
                tooltip = 'Antigravity SSH Proxy (ATP)\n❌ Proxy unreachable';
            }
        }

        this.statusBarItem.text = '$(circle-large-filled) ATP';
        this.statusBarItem.tooltip = tooltip;
        this.statusBarItem.backgroundColor = undefined;
    }

    private checkPort(host: string, port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.on('connect', () => { socket.destroy(); resolve(true); });
            socket.on('timeout', () => { socket.destroy(); resolve(false); });
            socket.on('error', () => { socket.destroy(); resolve(false); });
            socket.connect(port, host);
        });
    }

    private notifyCallbacks(): void {
        const status = this.getStatus();
        for (const callback of this.updateCallbacks) {
            callback(status);
        }
    }

    private getPanelHtml(): string {
        const status = this.currentStatus;
        const isLocal = status.runningLocation === 'local';
        const config = vscode.workspace.getConfiguration('antigravity-ssh-proxy');
        const enableForwarding = config.get<boolean>('enableLocalForwarding', true);
        
        let statusColor: string;
        let statusText: string;

        if (isLocal) {
            if (status.sshConfigEnabled && status.localProxyReachable) {
                statusColor = '#3fb950';
                statusText = 'Connected';
            } else if (status.sshConfigEnabled) {
                statusColor = '#d29922';
                statusText = 'Partial';
            } else {
                statusColor = '#f85149';
                statusText = 'Disconnected';
            }
        } else {
            statusColor = status.remoteProxyReachable ? '#3fb950' : '#f85149';
            statusText = status.remoteProxyReachable ? 'Connected' : 'Disconnected';
        }

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
            font-size: 13px;
        }
        .container { max-width: 420px; margin: 0 auto; }
        
        .header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--vscode-editorWidget-border);
        }
        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: ${statusColor};
            box-shadow: 0 0 6px ${statusColor}80;
        }
        .title { font-size: 15px; font-weight: 600; }
        .status-badge {
            margin-left: auto;
            font-size: 10px;
            font-weight: 500;
            padding: 3px 8px;
            border-radius: 10px;
            background: ${statusColor}20;
            color: ${statusColor};
            text-transform: uppercase;
        }
        .env-tag {
            font-size: 9px;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            text-transform: uppercase;
        }
        
        .section {
            margin-bottom: 20px;
        }
        .section-title {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        
        .card {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 6px;
            overflow: hidden;
        }
        
        .row {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-editorWidget-border);
        }
        .row:last-child { border-bottom: none; }
        .row-label {
            flex: 1;
            color: var(--vscode-descriptionForeground);
        }
        .row-value {
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 12px;
        }
        .row-value.on { color: #3fb950; }
        .row-value.off { color: #f85149; }
        
        .input-row {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-editorWidget-border);
            gap: 8px;
        }
        .input-row:last-child { border-bottom: none; }
        .input-row label {
            flex: 1;
            color: var(--vscode-descriptionForeground);
        }
        .input-row input[type="text"],
        .input-row input[type="number"] {
            width: 120px;
            padding: 4px 8px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 12px;
        }
        .input-row input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .toggle {
            position: relative;
            width: 36px;
            height: 20px;
        }
        .toggle input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            inset: 0;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 10px;
            transition: 0.2s;
        }
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 2px;
            bottom: 2px;
            background: var(--vscode-descriptionForeground);
            border-radius: 50%;
            transition: 0.2s;
        }
        .toggle input:checked + .toggle-slider {
            background: #3fb950;
            border-color: #3fb950;
        }
        .toggle input:checked + .toggle-slider:before {
            transform: translateX(16px);
            background: white;
        }
        
        .actions {
            display: flex;
            gap: 8px;
            margin-top: 16px;
        }
        .btn {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px 12px;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: opacity 0.15s;
        }
        .btn:hover { opacity: 0.9; }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn svg { width: 14px; height: 14px; }
        
        .footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid var(--vscode-editorWidget-border);
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .countdown-num {
            font-family: 'SF Mono', Monaco, monospace;
            color: var(--vscode-editor-foreground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="status-dot"></div>
            <span class="title">Antigravity SSH Proxy</span>
            <span class="env-tag">${isLocal ? 'Local' : 'Remote'}</span>
            <span class="status-badge">${statusText}</span>
        </div>
        
        <div class="section">
            <div class="section-title">Status</div>
            <div class="card">
                ${isLocal ? `
                <div class="row">
                    <span class="row-label">SSH Forwarding</span>
                    <span class="row-value ${status.sshConfigEnabled ? 'on' : 'off'}">${status.sshConfigEnabled ? 'ON' : 'OFF'}</span>
                </div>
                <div class="row">
                    <span class="row-label">Local Proxy</span>
                    <span class="row-value ${status.localProxyReachable ? 'on' : 'off'}">${status.localProxyReachable ? 'Reachable' : 'Unreachable'}</span>
                </div>
                ` : `
                <div class="row">
                    <span class="row-label">Proxy</span>
                    <span class="row-value ${status.remoteProxyReachable ? 'on' : 'off'}">${status.remoteProxyReachable ? 'Reachable' : 'Unreachable'}</span>
                </div>
                ${status.languageServerConfigured !== undefined ? `
                <div class="row">
                    <span class="row-label">Language Server</span>
                    <span class="row-value ${status.languageServerConfigured ? 'on' : 'off'}">${status.languageServerConfigured ? 'Configured' : 'Not Configured'}</span>
                </div>
                ` : ''}
                `}
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">Configuration</div>
            <div class="card">
                ${isLocal ? `
                <div class="input-row">
                    <label>Enable Forwarding</label>
                    <label class="toggle">
                        <input type="checkbox" id="enableForwarding" ${enableForwarding ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="input-row">
                    <label>Local Proxy Port</label>
                    <input type="number" id="localProxyPort" value="${status.localProxyPort}" min="1" max="65535">
                </div>
                <div class="input-row">
                    <label>Remote Port</label>
                    <input type="number" id="remoteProxyPort" value="${status.remoteProxyPort}" min="1" max="65535">
                </div>
                ` : `
                <div class="input-row">
                    <label>Proxy Host</label>
                    <input type="text" id="remoteProxyHost" value="${status.remoteProxyHost}">
                </div>
                <div class="input-row">
                    <label>Proxy Port</label>
                    <input type="number" id="remoteProxyPort" value="${status.remoteProxyPort}" min="1" max="65535">
                </div>
                `}
            </div>
        </div>
        
        <div class="actions">
            <button class="btn btn-secondary" onclick="refresh()">
                <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.5 2a.5.5 0 0 0-.5.5V5h-2.5a.5.5 0 0 0 0 1H14a.5.5 0 0 0 .5-.5V2.5a.5.5 0 0 0-.5-.5z"/>
                    <path d="M8 3a5 5 0 1 0 4.546 7.086.5.5 0 0 0-.908-.417A4 4 0 1 1 8 4a.5.5 0 0 0 0-1z"/>
                </svg>
                Refresh
            </button>
            <button class="btn btn-primary" onclick="saveConfig()">
                <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                </svg>
                Save
            </button>
        </div>
        
        <div class="footer">
            <span>Auto refresh in <span class="countdown-num" id="countdown">${this.secondsUntilRefresh}</span>s</span>
            <span>Updated ${status.lastUpdated.toLocaleTimeString()}</span>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const isLocal = ${isLocal};
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        function saveConfig() {
            const config = {};
            if (isLocal) {
                config.enableLocalForwarding = document.getElementById('enableForwarding').checked;
                config.localProxyPort = parseInt(document.getElementById('localProxyPort').value);
                config.remoteProxyPort = parseInt(document.getElementById('remoteProxyPort').value);
            } else {
                config.remoteProxyHost = document.getElementById('remoteProxyHost').value;
                config.remoteProxyPort = parseInt(document.getElementById('remoteProxyPort').value);
            }
            vscode.postMessage({ command: 'saveConfig', config });
        }
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateCountdown') {
                const el = document.getElementById('countdown');
                if (el) el.textContent = message.seconds;
            }
        });
    </script>
</body>
</html>`;
    }

    dispose(): void {
        this.stopAutoRefresh();
        this.statusBarItem.dispose();
        this.statusPanel?.dispose();
        this.updateCallbacks = [];
    }
}
