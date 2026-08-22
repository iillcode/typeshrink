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
exports.SessionStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cookieJar_1 = require("./proxy/cookieJar");
/**
 * Persistent per-origin state for the proxied browser:
 *  - cookie jars  → login sessions survive reloads AND VS Code restarts
 *  - proxy ports  → stable iframe origins so localStorage logins survive
 * Stored under the extension's globalStorage directory.
 */
class SessionStore {
    constructor(storageDir, log) {
        this.storageDir = storageDir;
        this.log = log;
        this.storedJars = new Map();
        this.liveJars = new Map();
        this.rememberedPorts = new Map();
        fs.mkdirSync(storageDir, { recursive: true });
        this.jarsFile = path.join(storageDir, 'proxy-cookie-jars.json');
        this.portsFile = path.join(storageDir, 'proxy-ports.json');
        this.loadJars();
        this.loadPorts();
    }
    get jarCount() {
        return this.liveJars.size;
    }
    getJar(origin) {
        let jar = this.liveJars.get(origin);
        if (!jar) {
            jar = new cookieJar_1.CookieJar();
            const saved = this.storedJars.get(origin);
            if (saved)
                jar.load(saved);
            this.liveJars.set(origin, jar);
        }
        return jar;
    }
    dropJar(origin) {
        this.liveJars.delete(origin);
        this.storedJars.delete(origin);
        this.persistJars();
    }
    clearAllSessions() {
        this.liveJars.clear();
        this.storedJars.clear();
        this.persistJars();
    }
    persistJars() {
        try {
            const obj = {};
            for (const [origin, jar] of this.liveJars)
                obj[origin] = jar.toJSON();
            for (const [origin, list] of this.storedJars)
                if (!obj[origin])
                    obj[origin] = list;
            fs.writeFileSync(this.jarsFile, JSON.stringify(obj, null, 2));
        }
        catch (e) {
            this.log?.('cookie-jar save failed: ' + e.message);
        }
    }
    candidatesFor(origin) {
        const saved = this.rememberedPorts.get(origin);
        return saved ? [saved] : [];
    }
    rememberPort(origin, port) {
        if (port <= 0 || this.rememberedPorts.get(origin) === port)
            return;
        this.rememberedPorts.set(origin, port);
        try {
            const obj = {};
            for (const [o, p] of this.rememberedPorts)
                obj[o] = p;
            fs.writeFileSync(this.portsFile, JSON.stringify(obj, null, 2));
        }
        catch (e) {
            this.log?.('proxy-port save failed: ' + e.message);
        }
    }
    loadJars() {
        try {
            if (!fs.existsSync(this.jarsFile))
                return;
            const raw = JSON.parse(fs.readFileSync(this.jarsFile, 'utf8'));
            for (const [origin, list] of Object.entries(raw))
                this.storedJars.set(origin, list);
        }
        catch (e) {
            this.log?.('cookie-jar load failed: ' + e.message);
        }
    }
    loadPorts() {
        try {
            if (!fs.existsSync(this.portsFile))
                return;
            const raw = JSON.parse(fs.readFileSync(this.portsFile, 'utf8'));
            for (const [origin, port] of Object.entries(raw)) {
                if (typeof port === 'number' && port > 0)
                    this.rememberedPorts.set(origin, port);
            }
        }
        catch (e) {
            this.log?.('proxy-port load failed: ' + e.message);
        }
    }
}
exports.SessionStore = SessionStore;
//# sourceMappingURL=session.js.map