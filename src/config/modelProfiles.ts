import * as vscode from "vscode";
import { ModelProfile } from "../harness/types";

const PROFILES_KEY = "agentKit.profiles";
const ACTIVE_KEY = "agentKit.activeProfileId";
const AUTO_APPROVE_KEY = "agentKit.autoApproveSession";

/** Default OpenAI-compatible endpoint (OpenCode Zen). Users can override the URL per profile. */
export const DEFAULT_BASE_URL = "https://opencode.ai/zen/v1";

export function newId(): string {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Model profiles are stored dynamically in globalState so users can point the
 * agent at any OpenAI chat-completions server at runtime — no recompile,
 * no settings.json editing.
 */
export class ModelConfigManager {
	constructor(private readonly globalState: vscode.Memento) {}

	listProfiles(): ModelProfile[] {
		const profiles = this.globalState.get<ModelProfile[]>(PROFILES_KEY, []);
		if (profiles.length === 0) {
			const seed: ModelProfile = {
				id: newId(),
				label: "OpenCode Zen",
				baseUrl: DEFAULT_BASE_URL,
				apiKey: "",
				model: "",
			};
			void this.globalState.update(PROFILES_KEY, [seed]);
			return [seed];
		}
		return profiles;
	}

	getActive(): ModelProfile | undefined {
		const profiles = this.listProfiles();
		const activeId = this.globalState.get<string>(ACTIVE_KEY, "");
		return profiles.find((p) => p.id === activeId) ?? profiles[0];
	}

	async upsertProfile(profile: ModelProfile): Promise<void> {
		const profiles = this.listProfiles();
		const idx = profiles.findIndex((p) => p.id === profile.id);
		if (idx >= 0) {
			profiles[idx] = profile;
		} else {
			profiles.push(profile);
		}
		await this.globalState.update(PROFILES_KEY, profiles);
	}

	async deleteProfile(id: string): Promise<void> {
		const wasActive = this.globalState.get<string>(ACTIVE_KEY, "") === id;
		const profiles = this.listProfiles().filter((p) => p.id !== id);
		await this.globalState.update(PROFILES_KEY, profiles);
		if (wasActive) {
			await this.globalState.update(ACTIVE_KEY, profiles[0]?.id ?? "");
		}
	}

	async setActive(id: string): Promise<void> {
		await this.globalState.update(ACTIVE_KEY, id);
	}

	isAutoApprovedForSession(): boolean {
		return this.globalState.get<boolean>(AUTO_APPROVE_KEY, false);
	}

	async setSessionAutoApprove(value: boolean): Promise<void> {
		await this.globalState.update(AUTO_APPROVE_KEY, value);
	}
}

