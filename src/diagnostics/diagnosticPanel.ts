import * as vscode from 'vscode';
import { runDiagnostics, DiagnosticReport, generateReportText } from './diagnosticRunner';

/**
 * DiagnosticPanel - Wrapper for backwards compatibility
 * The main functionality is now integrated into the unified StatusManager panel.
 * This class redirects to the main status panel when show() is called.
 */
export class DiagnosticPanel {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Show diagnostics - redirects to main status panel
     */
    async show(): Promise<void> {
        // Redirect to the main unified status panel
        await vscode.commands.executeCommand('antigravity-ssh-proxy.showStatusPanel');
    }

    /**
     * Run diagnostics and return report
     */
    async runDiagnostics(): Promise<DiagnosticReport> {
        return await runDiagnostics();
    }

    /**
     * Generate text report for copying
     */
    generateReportText(report: DiagnosticReport): string {
        return generateReportText(report);
    }

    dispose(): void {
        // Nothing to dispose - the main panel handles everything
    }
}

