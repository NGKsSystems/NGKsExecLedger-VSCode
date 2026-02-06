// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\bridge\agentBridgePanel.ts
import * as vscode from "vscode";
import { SessionManager } from "../core/sessionManager";
import { nowIso } from "../util/time";

export class AgentBridgePanel implements vscode.WebviewViewProvider {
  public static readonly viewType = "ngksAutologger.agentBridge";

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly sessions: SessionManager
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "logInput":
          this._logAgentInput(data.text);
          break;
        case "logOutput":
          this._logAgentOutput(data.text);
          break;
        case "logBoth":
          this._logAgentInput(data.inputText);
          this._logAgentOutput(data.outputText);
          break;
      }
    });
  }

  private _logAgentInput(text: string): void {
    if (!this.sessions.isActive()) {
      vscode.window.showWarningMessage("NGKs Logger not active. Start session first.");
      return;
    }

    const context = this._getContext();
    this.sessions.log("AGENT_INPUT", { text, context });
    vscode.window.setStatusBarMessage("NGKs: Agent input logged", 1500);
  }

  private _logAgentOutput(text: string): void {
    if (!this.sessions.isActive()) {
      vscode.window.showWarningMessage("NGKs Logger not active. Start session first.");
      return;
    }

    const context = this._getContext();
    this.sessions.log("AGENT_OUTPUT", { text, context });
    vscode.window.setStatusBarMessage("NGKs: Agent output logged", 1500);
  }

  private _getContext(): { activeFile?: string; selectionLength?: number } {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return {};

    return {
      activeFile: activeEditor.document.fileName,
      selectionLength: activeEditor.selection.isEmpty ? 0 : activeEditor.document.getText(activeEditor.selection).length
    };
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NGKs Agent Bridge</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 10px;
            margin: 0;
        }
        
        .section {
            margin-bottom: 20px;
        }
        
        .section h3 {
            margin: 0 0 8px 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        
        textarea {
            width: 100%;
            min-height: 100px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 8px;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            resize: vertical;
        }
        
        .button-group {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }
        
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 12px;
        }
        
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .log-both-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .log-both-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <div class="section">
        <h3>Agent Input</h3>
        <textarea id="agentInput" placeholder="Enter agent input text..."></textarea>
        <div class="button-group">
            <button onclick="logInput()">Log Input</button>
        </div>
    </div>
    
    <div class="section">
        <h3>Agent Output</h3>
        <textarea id="agentOutput" placeholder="Enter agent output text..."></textarea>
        <div class="button-group">
            <button onclick="logOutput()">Log Output</button>
        </div>
    </div>
    
    <div class="section">
        <div class="button-group">
            <button class="log-both-btn" onclick="logBoth()">Log Both</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function logInput() {
            const text = document.getElementById('agentInput').value;
            if (!text.trim()) {
                return;
            }
            vscode.postMessage({
                type: 'logInput',
                text: text
            });
        }
        
        function logOutput() {
            const text = document.getElementById('agentOutput').value;
            if (!text.trim()) {
                return;
            }
            vscode.postMessage({
                type: 'logOutput',
                text: text
            });
        }
        
        function logBoth() {
            const inputText = document.getElementById('agentInput').value;
            const outputText = document.getElementById('agentOutput').value;
            
            if (!inputText.trim() && !outputText.trim()) {
                return;
            }
            
            vscode.postMessage({
                type: 'logBoth',
                inputText: inputText,
                outputText: outputText
            });
        }
    </script>
</body>
</html>`;
  }
}