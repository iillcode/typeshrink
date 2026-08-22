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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddedBrowser = void 0;
exports.findChromium = findChromium;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
/** Locate an installed Chromium-family executable (Chrome / Edge / Chromium). */
function findChromium() {
    const candidates = [];
    if (process.env.LOCALAPPDATA) {
        candidates.push(path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env.LOCALAPPDATA, 'Chromium', 'Application', 'chrome.exe'));
    }
    if (process.env['ProgramFiles']) {
        candidates.push(path.join(process.env['ProgramFiles'], 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env['ProgramFiles'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(process.env['ProgramFiles'], 'Chromium', 'chrome.exe'));
    }
    if (process.env['ProgramFiles(x86)']) {
        candidates.push(path.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
    if (process.platform === 'darwin') {
        candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
    }
    if (process.platform === 'linux') {
        candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/microsoft-edge');
    }
    for (const c of candidates) {
        try {
            if (fs.existsSync(c))
                return c;
        }
        catch {
            /* ignore */
        }
    }
    return null;
}
/* Injected once per document. Draws the inspect hover box and, when inspect
 * mode is ON, reports clicked elements to the extension host through the
 * `ecbReport` CDP binding (registered via Runtime.addBinding). */
const INJECT_SRC = `
(function(){
  if (window.__ecbInstalled) return; window.__ecbInstalled = true;
  var mode = false;
  function report(data){
    try{ if(window.ecbReport) window.ecbReport(JSON.stringify(data)); }catch(e){}
  }
  function getXPath(el){
    if(el.id) return '//*[@id="'+el.id+'"]';
    var parts=[]; var node=el;
    while(node && node.nodeType===1 && node!==document.body){
      var i=1,s=node.previousElementSibling;
      while(s){ if(s.tagName===node.tagName)i++; s=s.previousElementSibling; }
      parts.unshift(node.tagName.toLowerCase()+'['+i+']');
      node=node.parentElement;
    }
    return '/body/'+parts.join('/');
  }
  function getCss(el){
    if(el.id) return '#'+CSS.escape(el.id);
    var parts=[]; var n=el;
    while(n && n!==document.documentElement && parts.length<6){
      var s=n.tagName.toLowerCase();
      if(n.classList && n.classList.length) s+='.'+[].slice.call(n.classList).map(function(c){return CSS.escape(c);}).join('.');
      var i=1,sib=n.previousElementSibling;
      while(sib){ if(sib.tagName===n.tagName)i++; sib=sib.previousElementSibling; }
      if(i>1) s+=':nth-of-type('+i+')';
      parts.unshift(s); n=n.parentElement;
    }
    return parts.reverse().join(' > ');
  }
  window.addEventListener('message', function(ev){
    try{
      var m=ev.data;
      if(m && m.__ecb==='mode'){
        mode=!!m.enabled;
        document.documentElement.classList.toggle('__ecb-inspect',mode);
        if(!mode && window.__ecbClearHover) window.__ecbClearHover();
      }
    }catch(e){}
  });
  window.__ecbSetMode = function(on){
    mode=!!on;
    try{ document.documentElement.classList.toggle('__ecb-inspect',mode); }catch(e){}
    if(!mode && window.__ecbClearHover) window.__ecbClearHover();
  };
  document.addEventListener('click', function(e){
    if(!mode) return;
    e.preventDefault(); e.stopPropagation();
    var el=e.target;
    if(!el || el.nodeType!==1) return;
    if(window.__ecbHighlight) window.__ecbHighlight(el);
    var r=el.getBoundingClientRect();
    report({
      tag:(el.tagName||'').toLowerCase(),
      id:el.id||'',
      className: typeof el.className==='string'?el.className:'',
      text:(el.textContent||'').trim().substring(0,100),
      xpath:getXPath(el),
      cssSelector:getCss(el),
      outerHTML:(el.outerHTML||'').substring(0,500),
      rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
      url:location.href
    });
  }, true);
  var hoverBox=null;
  function ensureHover(){
    if(hoverBox){ document.body.appendChild(hoverBox); return; }
    hoverBox=document.createElement('div');
    hoverBox.style.cssText='position:fixed;display:none;z-index:2147483647;border:1.5px dashed rgba(0,174,239,.95);background:rgba(0,174,239,.08);pointer-events:none;font:11px/18px monospace;';
    (document.body||document.documentElement).appendChild(hoverBox);
  }
  window.__ecbClearHover=function(){ if(hoverBox) hoverBox.style.display='none'; };
  window.__ecbHighlight=function(el){
    try{
      ensureHover();
      var r=el.getBoundingClientRect();
      hoverBox.style.left=(r.x-2)+'px';
      hoverBox.style.top=(r.y-2)+'px';
      hoverBox.style.width=(r.width+4)+'px';
      hoverBox.style.height=(r.height+4)+'px';
      hoverBox.textContent='';
      hoverBox.style.display='block';
      setTimeout(function(){ hoverBox.style.display='none'; },1200);
    }catch(e){}
  };
  document.addEventListener('mousemove', function(e){
    if(!mode || !hoverBox) return;
    var el=e.target;
    if(!el || el.nodeType!==1){ return; }
    var r=el.getBoundingClientRect();
    hoverBox.style.left=(r.x-2)+'px';
    hoverBox.style.top=(r.y-2)+'px';
    hoverBox.style.width=(r.width+4)+'px';
    hoverBox.style.height=(r.height+4)+'px';
    hoverBox.textContent=el.tagName.toLowerCase()+(el.id?'#'+el.id:'');
    hoverBox.style.display='block';
  }, true);
  document.addEventListener('scroll', function(){ if(window.__ecbClearHover) window.__ecbClearHover(); }, true);
  var st=document.createElement('style');
  st.textContent=[
    'html.__ecb-inspect, html.__ecb-inspect *{cursor:crosshair !important;}'
  ].join('');
  document.head.appendChild(st);
})();`;
/**
 * A real Chromium instance rendered into a VS Code webview via CDP screencast.
 * Runs with a persistent user-data dir, so cookies / localStorage / logins
 * survive reloads and even VS Code restarts — same behaviour as VS Code's own
 * integrated browser.
 */
class EmbeddedBrowser {
    constructor(userDataDir) {
        // Latest screencast frame geometry for coordinate mapping
        this.lastFrame = { deviceWidth: 1280, deviceHeight: 800, offsetTop: 0, offsetLeft: 0, pageScaleFactor: 1, dpr: 1 };
        // Device pixel ratio of the webview display — frames are rendered 1:1 with
        // physical pixels so text stays crisp instead of being upsampled.
        this.dpr = 1;
        this.userDataDir = userDataDir;
    }
    async launch() {
        const exe = findChromium();
        if (!exe) {
            throw new Error('No Chrome/Edge/Chromium installation found. Install Google Chrome to use the embedded browser.');
        }
        fs.mkdirSync(this.userDataDir, { recursive: true });
        this.onStatus?.(`Launching ${path.basename(exe)}…`);
        this.browser = await puppeteer_core_1.default.launch({
            executablePath: exe,
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--hide-scrollbars',
                '--mute-audio',
                '--disable-blink-features=AutomationControlled',
            ],
            userDataDir: this.userDataDir,
            defaultViewport: null,
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1280, height: 800 });
        this.cdp = await this.page.createCDPSession();
        // Element-report binding + persistent inject script
        await this.cdp.send('Runtime.addBinding', { name: 'ecbReport' });
        await this.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT_SRC });
        await this.cdp.send('Page.enable');
        await this.cdp.send('Runtime.enable');
        this.cdp.on('Runtime.bindingCalled', (e) => {
            if (e.name !== 'ecbReport')
                return;
            try {
                const data = JSON.parse(e.payload);
                data.timestamp = Date.now();
                this.onElementCaptured?.(data);
            }
            catch {
                /* ignore malformed payloads */
            }
        });
        this.cdp.on('Page.screencastFrame', async (e) => {
            const m = e.metadata ?? {};
            this.lastFrame = {
                deviceWidth: m.deviceWidth ?? 1280,
                deviceHeight: m.deviceHeight ?? 800,
                offsetTop: m.offsetTop ?? 0,
                offsetLeft: m.offsetLeft ?? 0,
                pageScaleFactor: m.pageScaleFactor ?? 1,
                dpr: this.dpr,
            };
            this.onFrame?.(e.data, this.lastFrame);
            try {
                // Must ack every frame or Chromium pauses the stream after the first one.
                await this.cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId });
            }
            catch {
                /* ignore */
            }
        });
        this.cdp.on('Page.frameNavigated', async (e) => {
            if (e.frame?.parentId)
                return; // only top-level frames
            const history = await this.getHistory().catch(() => undefined);
            this.onNavigated?.(e.frame?.url ?? '', history ? history.currentIndex > 0 : false, history ? history.currentIndex < history.entries.length - 1 : false);
        });
        this.cdp.on('Page.javascriptDialogOpening', async (e) => {
            // Auto-handle JS dialogs so headless browsing never stalls on alert().
            this.cdp.send('Page.handleJavaScriptDialog', { accept: e.type === 'alert', promptText: '' }).catch(() => { });
        });
        this.browser.once('disconnected', () => {
            this.onStatus?.('Browser process exited.');
        });
    }
    get viewportSize() {
        return { width: this.lastFrame.deviceWidth, height: this.lastFrame.deviceHeight };
    }
    async navigate(url) {
        if (!this.page)
            throw new Error('Browser not started.');
        const u = /^https?:\/\//i.test(url) ? url : `http://${url}`;
        await this.page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((err) => {
            this.onStatus?.(`Navigation failed: ${err.message}`);
        });
        await this.startScreencast();
    }
    async reload() {
        await this.cdp?.send('Page.reload').catch(() => { });
    }
    async getHistory() {
        const res = await this.cdp.send('Page.getNavigationHistory');
        return res;
    }
    async goBack() {
        const h = await this.getHistory().catch(() => undefined);
        if (!h || h.currentIndex <= 0)
            return;
        await this.cdp.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.currentIndex - 1].id }).catch(() => { });
    }
    async goForward() {
        const h = await this.getHistory().catch(() => undefined);
        if (!h || h.currentIndex >= h.entries.length - 1)
            return;
        await this.cdp.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.currentIndex + 1].id }).catch(() => { });
    }
    async startScreencast() {
        if (!this.cdp)
            return;
        try {
            await this.cdp.send('Page.startScreencast', {
                format: 'jpeg',
                quality: 90,
                maxWidth: 2560,
                maxHeight: 2560,
                everyNthFrame: 1,
            });
        }
        catch {
            /* already running */
        }
    }
    stopScreencast() {
        this.cdp?.send('Page.stopScreencast').catch(() => { });
    }
    /**
     * Resize the emulated viewport when the webview panel changes size.
     * `dpr` is the webview's devicePixelRatio — matching it makes frames land
     * on physical pixels 1:1 (no blurry upsampling).
     */
    async setViewport(width, height, dpr = 1) {
        if (!this.page)
            return;
        this.dpr = Math.max(1, Math.min(3, dpr || 1));
        const w = Math.max(320, Math.min(2560, Math.floor(width)));
        const h = Math.max(240, Math.min(4000, Math.floor(height)));
        await this.page.setViewport({ width: w, height: h, deviceScaleFactor: this.dpr }).catch(() => { });
        this.stopScreencast();
        await this.startScreencast();
    }
    /** Toggle the injected element-inspect mode inside the page. */
    async setInspectMode(on) {
        await this.page?.evaluate((v) => window.__ecbSetMode?.(v), on).catch(() => { });
    }
    mapPoint(px, py) {
        // Frame coordinates arrive in physical pixels (deviceWidth includes
        // devicePixelRatio); CDP Input expects CSS-pixel viewport coordinates.
        const f = this.lastFrame;
        const scale = (f.pageScaleFactor || 1) * (this.dpr || 1);
        return {
            x: Math.max(0, px / scale + f.offsetLeft / (this.dpr || 1)),
            y: Math.max(0, py / scale + f.offsetTop / (this.dpr || 1)),
        };
    }
    /** Forward a mouse event from the webview. Coordinates are CSS px within the frame image. */
    async mouse(type, x, y, button = 'left', clickCount = 1) {
        if (!this.cdp)
            return;
        const p = this.mapPoint(x, y);
        const cdpType = type === 'move' ? 'mouseMoved' : type === 'down' ? 'mousePressed' : 'mouseReleased';
        await this.cdp.send('Input.dispatchMouseEvent', {
            type: cdpType,
            x: p.x,
            y: p.y,
            button: type === 'move' ? 'none' : button,
            clickCount: type === 'move' ? 0 : clickCount,
        }).catch(() => { });
    }
    async wheel(x, y, deltaX, deltaY) {
        if (!this.cdp)
            return;
        const p = this.mapPoint(x, y);
        await this.cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: p.x,
            y: p.y,
            button: 'none',
            deltaX,
            deltaY,
        }).catch(() => { });
    }
    /** Type text into the focused element (from the webview's hidden input). */
    async insertText(text) {
        await this.cdp?.send('Input.insertText', { text }).catch(() => { });
    }
    /** Send a special key (Enter, Backspace, arrows…). key = e.key from DOM KeyboardEvent. */
    async pressKey(key) {
        if (!this.cdp)
            return;
        const SPECIAL_CODES = {
            Enter: [13, 'Enter'],
            Backspace: [8, 'Backspace'],
            Delete: [46, 'Delete'],
            Tab: [9, 'Tab'],
            Escape: [27, 'Escape'],
            ArrowUp: [38, 'ArrowUp'],
            ArrowDown: [40, 'ArrowDown'],
            ArrowLeft: [37, 'ArrowLeft'],
            ArrowRight: [39, 'ArrowRight'],
            Home: [36, 'Home'],
            End: [35, 'End'],
            PageUp: [33, 'PageUp'],
            PageDown: [34, 'PageDown'],
        };
        const entry = SPECIAL_CODES[key];
        if (!entry)
            return;
        const [keyCode, codeVal] = entry;
        const base = { key, code: codeVal, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
        await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base }).catch(() => { });
        await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }).catch(() => { });
    }
    /** Evaluate JS in the page (used for small helpers/debugging). */
    async evaluate(expression) {
        if (!this.cdp)
            return undefined;
        const res = await this.cdp.send('Runtime.evaluate', { expression, returnByValue: true }).catch(() => undefined);
        return res ? res.result?.value : undefined;
    }
    async dispose() {
        this.stopScreencast();
        try {
            await this.browser?.close();
        }
        catch {
            /* ignore */
        }
        this.browser = undefined;
        this.page = undefined;
        this.cdp = undefined;
    }
}
exports.EmbeddedBrowser = EmbeddedBrowser;
//# sourceMappingURL=browser.js.map