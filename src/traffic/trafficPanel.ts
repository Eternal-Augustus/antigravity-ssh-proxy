import * as vscode from 'vscode';
import { TrafficCollector, TrafficStats } from './trafficCollector';

/**
 * TrafficPanel - Wrapper for backwards compatibility
 * The main functionality is now integrated into the unified StatusManager panel.
 * This class redirects to the main status panel when show() is called.
 */
export class TrafficPanel {
    private context: vscode.ExtensionContext;
    private trafficCollector: TrafficCollector;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.trafficCollector = new TrafficCollector();
    }

    /**
     * Show traffic panel - redirects to main status panel
     */
    show(): void {
        // Redirect to the main unified status panel
        vscode.commands.executeCommand('antigravity-ssh-proxy.showStatusPanel');
    }

    /**
     * Get current traffic stats
     */
    getStats(): TrafficStats {
        return this.trafficCollector.getStats();
    }

    /**
     * Start collecting traffic data
     */
    start(): void {
        this.trafficCollector.start();
    }

    /**
     * Stop collecting traffic data
     */
    stop(): void {
        this.trafficCollector.stop();
    }

    dispose(): void {
        this.trafficCollector.dispose();
    }
}

