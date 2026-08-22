import * as fs from 'fs';
import * as path from 'path';
import { CookieJar } from './proxy/cookieJar';

/**
 * Persistent per-origin state for the proxied browser:
 *  - cookie jars  → login sessions survive reloads AND VS Code restarts
 *  - proxy ports  → stable iframe origins so localStorage logins survive
 * Stored under the extension's globalStorage directory.
 */
export class SessionStore {
	private jarsFile: string;
	private portsFile: string;
	private storedJars = new Map<string, JarCookie[]>();
	private liveJars = new Map<string, CookieJar>();
	private rememberedPorts = new Map<string, number>();

	constructor(private storageDir: string, private log?: (msg: string) => void) {
		fs.mkdirSync(storageDir, { recursive: true });
		this.jarsFile = path.join(storageDir, 'proxy-cookie-jars.json');
		this.portsFile = path.join(storageDir, 'proxy-ports.json');
		this.loadJars();
		this.loadPorts();
	}

	get jarCount(): number {
		return this.liveJars.size;
	}

	getJar(origin: string): CookieJar {
		let jar = this.liveJars.get(origin);
		if (!jar) {
			jar = new CookieJar();
			const saved = this.storedJars.get(origin);
			if (saved) jar.load(saved);
			this.liveJars.set(origin, jar);
		}
		return jar;
	}

	dropJar(origin: string): void {
		this.liveJars.delete(origin);
		this.storedJars.delete(origin);
		this.persistJars();
	}

	clearAllSessions(): void {
		this.liveJars.clear();
		this.storedJars.clear();
		this.persistJars();
	}

	persistJars(): void {
		try {
			const obj: Record<string, JarCookie[]> = {};
			for (const [origin, jar] of this.liveJars) obj[origin] = jar.toJSON();
			for (const [origin, list] of this.storedJars) if (!obj[origin]) obj[origin] = list;
			fs.writeFileSync(this.jarsFile, JSON.stringify(obj, null, 2));
		} catch (e: any) {
			this.log?.('cookie-jar save failed: ' + e.message);
		}
	}

	candidatesFor(origin: string): number[] {
		const saved = this.rememberedPorts.get(origin);
		return saved ? [saved] : [];
	}

	rememberPort(origin: string, port: number): void {
		if (port <= 0 || this.rememberedPorts.get(origin) === port) return;
		this.rememberedPorts.set(origin, port);
		try {
			const obj: Record<string, number> = {};
			for (const [o, p] of this.rememberedPorts) obj[o] = p;
			fs.writeFileSync(this.portsFile, JSON.stringify(obj, null, 2));
		} catch (e: any) {
			this.log?.('proxy-port save failed: ' + e.message);
		}
	}

	private loadJars(): void {
		try {
			if (!fs.existsSync(this.jarsFile)) return;
			const raw = JSON.parse(fs.readFileSync(this.jarsFile, 'utf8')) as Record<string, JarCookie[]>;
			for (const [origin, list] of Object.entries(raw)) this.storedJars.set(origin, list);
		} catch (e: any) {
			this.log?.('cookie-jar load failed: ' + e.message);
		}
	}

	private loadPorts(): void {
		try {
			if (!fs.existsSync(this.portsFile)) return;
			const raw = JSON.parse(fs.readFileSync(this.portsFile, 'utf8')) as Record<string, number>;
			for (const [origin, port] of Object.entries(raw)) {
				if (typeof port === 'number' && port > 0) this.rememberedPorts.set(origin, port);
			}
		} catch (e: any) {
			this.log?.('proxy-port load failed: ' + e.message);
		}
	}
}

interface JarCookie {
	name: string;
	value: string;
	domain?: string;
	path: string;
	expires?: number;
}
