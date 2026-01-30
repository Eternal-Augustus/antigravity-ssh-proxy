import * as vscode from 'vscode';
import { TrafficCollector, TrafficStats } from './trafficCollector';

export class TrafficPanel {
    private panel: vscode.WebviewPanel | undefined;
    private collector: TrafficCollector;
    private updateDisposable: vscode.Disposable | undefined;

    constructor(private context: vscode.ExtensionContext) {
        this.collector = new TrafficCollector();
    }

    show(): void {
        // Check if running in remote environment
        if (!this.collector.isRemote()) {
            vscode.window.showWarningMessage(
                'Traffic Monitor is only available in remote environments.',
                'OK'
            );
            return;
        }

        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'atpTraffic',
            'ATP Traffic Monitor',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'refresh':
                        await this.collector.refresh();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.collector.stop();
            this.updateDisposable?.dispose();
        });

        // Start collecting and register for updates
        this.collector.start();
        this.updateDisposable = this.collector.onUpdate((stats) => {
            this.updatePanel(stats);
        });

        // Initial render
        this.updatePanel(this.collector.getStats());
    }

    private updatePanel(stats: TrafficStats): void {
        if (!this.panel) {
            return;
        }
        this.panel.webview.html = this.getHtml(stats);
    }

    private getHtml(stats: TrafficStats): string {
        const statusColor = stats.proxyReachable ? '#3fb950' : '#f85149';
        const statusText = stats.proxyReachable ? 'Reachable' : 'Unreachable';
        const sessionDuration = this.collector.getSessionDuration();

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
        .title { font-size: 15px; font-weight: 600; }
        .env-tag {
            font-size: 9px;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            text-transform: uppercase;
        }
        .live-indicator {
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }
        .live-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #3fb950;
            animation: blink 1s infinite;
        }
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 20px;
        }
        
        .stat-card {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 8px;
            padding: 16px;
            text-align: center;
        }
        .stat-value {
            font-size: 28px;
            font-weight: 600;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            margin-bottom: 4px;
        }
        .stat-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .stat-card.connections .stat-value { color: #58a6ff; }
        .stat-card.requests .stat-value { color: #a371f7; }
        .stat-card.duration .stat-value { 
            color: var(--vscode-editor-foreground); 
            font-size: 22px;
        }
        .stat-card.status .stat-value { 
            color: ${statusColor}; 
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: ${statusColor};
            box-shadow: 0 0 6px ${statusColor}80;
        }
        
        .actions {
            display: flex;
            gap: 8px;
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
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn svg { width: 14px; height: 14px; }
        
        .footer {
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid var(--vscode-editorWidget-border);
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <span class="title">Traffic Monitor</span>
            <span class="env-tag">Remote</span>
            <span class="live-indicator">
                <span class="live-dot"></span>
                LIVE
            </span>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card connections">
                <div class="stat-value">${stats.activeConnections}</div>
                <div class="stat-label">Active Connections</div>
            </div>
            <div class="stat-card requests">
                <div class="stat-value">${stats.totalConnectionsSeen}</div>
                <div class="stat-label">Total Requests</div>
            </div>
            <div class="stat-card duration">
                <div class="stat-value">${sessionDuration}</div>
                <div class="stat-label">Session Duration</div>
            </div>
            <div class="stat-card status">
                <div class="stat-value">
                    <span class="status-dot"></span>
                    ${statusText}
                </div>
                <div class="stat-label">Proxy Status</div>
            </div>
        </div>
        
        <div class="actions">
            <button class="btn btn-secondary" onclick="refresh()">
                <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.5 2a.5.5 0 0 0-.5.5V5h-2.5a.5.5 0 0 0 0 1H14a.5.5 0 0 0 .5-.5V2.5a.5.5 0 0 0-.5-.5z"/>
                    <path d="M8 3a5 5 0 1 0 4.546 7.086.5.5 0 0 0-.908-.417A4 4 0 1 1 8 4a.5.5 0 0 0 0-1z"/>
                </svg>
                Refresh Now
            </button>
        </div>
        
        <div class="footer">
            Auto-refresh every 2s · Last updated: ${stats.lastUpdated.toLocaleTimeString()}
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
    }

    dispose(): void {
        this.panel?.dispose();
        this.collector.dispose();
        this.updateDisposable?.dispose();
    }
}

