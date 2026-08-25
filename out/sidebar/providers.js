"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidebarViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const sidebarHtml_1 = require("../webview/sidebarHtml");
/** Sidebar view — browser launcher + static "Design" properties placeholder. */
class SidebarViewProvider {
    constructor() { }
    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = (0, sidebarHtml_1.getSidebarHtml)();
        view.webview.onDidReceiveMessage((msg) => {
            if (msg && msg.type === 'start') {
                void vscode.commands.executeCommand('elementClickBrowser.open');
            }
        });
    }
    reveal() {
        if (this.view) {
            void this.view.show?.(true);
        }
        else {
            void vscode.commands.executeCommand('elementClickBrowser.sidebarView.focus');
        }
    }
}
exports.SidebarViewProvider = SidebarViewProvider;
SidebarViewProvider.viewId = 'elementClickBrowser.sidebarView';
//# sourceMappingURL=providers.js.map