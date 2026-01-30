import * as vscode from 'vscode';
import { DiagnosticCheck, DiagnosticReport, runDiagnostics, generateReportText } from './diagnosticRunner';

export class DiagnosticPanel {
    private panel: vscode.WebviewPanel | undefined;
    private currentReport: DiagnosticReport | undefined;
    private isRunning: boolean = false;

    constructor(private context: vscode.ExtensionContext) {}

    async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'atpDiagnostics',
            'ATP Diagnostics',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'runDiagnostics':
                        await this.runDiagnosticsWithProgress();
                        break;
                    case 'copyReport':
                        if (this.currentReport) {
                            const text = generateReportText(this.currentReport);
                            await vscode.env.clipboard.writeText(text);
                            vscode.window.showInformationMessage('Diagnostic report copied to clipboard');
                        }
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // Run diagnostics immediately
        await this.runDiagnosticsWithProgress();
    }

    private async runDiagnosticsWithProgress(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.updatePanel([]);

        try {
            this.currentReport = await runDiagnostics((checks) => {
                this.updatePanel(checks);
            });
        } finally {
            this.isRunning = false;
        }
        
        // Update panel after isRunning is reset so the button is re-enabled
        if (this.currentReport) {
            this.updatePanel(this.currentReport.checks, this.currentReport);
        }
    }

    private updatePanel(checks: DiagnosticCheck[], report?: DiagnosticReport): void {
        if (!this.panel) {
            return;
        }
        this.panel.webview.html = this.getHtml(checks, report);
    }

    private getHtml(checks: DiagnosticCheck[], report?: DiagnosticReport): string {
        const isLocal = !vscode.env.remoteName;
        
        let overallColor = 'var(--vscode-descriptionForeground)';
        let overallText = 'Running...';
        
        if (report) {
            switch (report.overallStatus) {
                case 'healthy':
                    overallColor = '#3fb950';
                    overallText = 'Healthy';
                    break;
                case 'degraded':
                    overallColor = '#d29922';
                    overallText = 'Degraded';
                    break;
                case 'broken':
                    overallColor = '#f85149';
                    overallText = 'Broken';
                    break;
            }
        }

        const checksHtml = checks.map(check => {
            let icon: string;
            let iconColor: string;
            
            switch (check.status) {
                case 'success':
                    icon = '✓';
                    iconColor = '#3fb950';
                    break;
                case 'warning':
                    icon = '⚠';
                    iconColor = '#d29922';
                    break;
                case 'error':
                    icon = '✗';
                    iconColor = '#f85149';
                    break;
                case 'running':
                    icon = '◌';
                    iconColor = 'var(--vscode-descriptionForeground)';
                    break;
                default:
                    icon = '○';
                    iconColor = 'var(--vscode-descriptionForeground)';
            }

            return `
                <div class="check-item ${check.status}">
                    <div class="check-header">
                        <span class="check-icon" style="color: ${iconColor}">${icon}</span>
                        <span class="check-name">${check.name}</span>
                        <span class="check-status">${check.status}</span>
                    </div>
                    ${check.message ? `<div class="check-message">${check.message}</div>` : ''}
                    ${check.suggestion ? `<div class="check-suggestion">${check.suggestion}</div>` : ''}
                </div>
            `;
        }).join('');

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
        .container { max-width: 520px; margin: 0 auto; }
        
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
        .status-badge {
            margin-left: auto;
            font-size: 10px;
            font-weight: 500;
            padding: 3px 8px;
            border-radius: 10px;
            background: ${overallColor}20;
            color: ${overallColor};
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
        
        .checks-list {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 6px;
            overflow: hidden;
        }
        
        .check-item {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-editorWidget-border);
        }
        .check-item:last-child { border-bottom: none; }
        
        .check-header {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .check-icon {
            font-size: 14px;
            width: 18px;
            text-align: center;
        }
        .check-name {
            flex: 1;
            font-weight: 500;
        }
        .check-status {
            font-size: 10px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
        }
        
        .check-message {
            margin-top: 6px;
            margin-left: 26px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        
        .check-suggestion {
            margin-top: 6px;
            margin-left: 26px;
            font-size: 11px;
            padding: 6px 10px;
            background: var(--vscode-inputValidation-infoBackground);
            border-left: 3px solid var(--vscode-inputValidation-infoBorder);
            border-radius: 0 4px 4px 0;
        }
        
        .check-item.running .check-icon {
            animation: pulse 1s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
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
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
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
            <span class="title">Diagnostics</span>
            <span class="env-tag">${isLocal ? 'Local' : 'Remote'}</span>
            <span class="status-badge">${overallText}</span>
        </div>
        
        <div class="section">
            <div class="section-title">Diagnostic Checks</div>
            <div class="checks-list">
                ${checksHtml || '<div class="check-item"><div class="check-message">Initializing...</div></div>'}
            </div>
        </div>
        
        <div class="actions">
            <button class="btn btn-secondary" onclick="runDiagnostics()" ${this.isRunning ? 'disabled' : ''}>
                <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.5 2a.5.5 0 0 0-.5.5V5h-2.5a.5.5 0 0 0 0 1H14a.5.5 0 0 0 .5-.5V2.5a.5.5 0 0 0-.5-.5z"/>
                    <path d="M8 3a5 5 0 1 0 4.546 7.086.5.5 0 0 0-.908-.417A4 4 0 1 1 8 4a.5.5 0 0 0 0-1z"/>
                </svg>
                Re-diagnose
            </button>
            <button class="btn btn-primary" onclick="copyReport()" ${!report ? 'disabled' : ''}>
                <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                    <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                </svg>
                Copy Report
            </button>
        </div>
        
        <div class="footer">
            ${report ? `Last run: ${report.timestamp.toLocaleTimeString()}` : 'Running diagnostics...'}
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function runDiagnostics() {
            vscode.postMessage({ command: 'runDiagnostics' });
        }
        
        function copyReport() {
            vscode.postMessage({ command: 'copyReport' });
        }
    </script>
</body>
</html>`;
    }

    dispose(): void {
        this.panel?.dispose();
    }
}

