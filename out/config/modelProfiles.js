"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelConfigManager = exports.DEFAULT_BASE_URL = void 0;
exports.newId = newId;
const PROFILES_KEY = "agentKit.profiles";
const ACTIVE_KEY = "agentKit.activeProfileId";
const AUTO_APPROVE_KEY = "agentKit.autoApproveSession";
/** Default OpenAI-compatible endpoint (OpenCode Zen). Users can override the URL per profile. */
exports.DEFAULT_BASE_URL = "https://opencode.ai/zen/v1";
function newId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
/**
 * Model profiles are stored dynamically in globalState so users can point the
 * agent at any OpenAI chat-completions server at runtime — no recompile,
 * no settings.json editing.
 */
class ModelConfigManager {
    constructor(globalState) {
        this.globalState = globalState;
    }
    listProfiles() {
        const profiles = this.globalState.get(PROFILES_KEY, []);
        if (profiles.length === 0) {
            const seed = {
                id: newId(),
                label: "OpenCode Zen",
                baseUrl: exports.DEFAULT_BASE_URL,
                apiKey: "",
                model: "",
            };
            void this.globalState.update(PROFILES_KEY, [seed]);
            return [seed];
        }
        return profiles;
    }
    getActive() {
        const profiles = this.listProfiles();
        const activeId = this.globalState.get(ACTIVE_KEY, "");
        return profiles.find((p) => p.id === activeId) ?? profiles[0];
    }
    async upsertProfile(profile) {
        const profiles = this.listProfiles();
        const idx = profiles.findIndex((p) => p.id === profile.id);
        if (idx >= 0) {
            profiles[idx] = profile;
        }
        else {
            profiles.push(profile);
        }
        await this.globalState.update(PROFILES_KEY, profiles);
    }
    async deleteProfile(id) {
        const wasActive = this.globalState.get(ACTIVE_KEY, "") === id;
        const profiles = this.listProfiles().filter((p) => p.id !== id);
        await this.globalState.update(PROFILES_KEY, profiles);
        if (wasActive) {
            await this.globalState.update(ACTIVE_KEY, profiles[0]?.id ?? "");
        }
    }
    async setActive(id) {
        await this.globalState.update(ACTIVE_KEY, id);
    }
    isAutoApprovedForSession() {
        return this.globalState.get(AUTO_APPROVE_KEY, false);
    }
    async setSessionAutoApprove(value) {
        await this.globalState.update(AUTO_APPROVE_KEY, value);
    }
}
exports.ModelConfigManager = ModelConfigManager;
//# sourceMappingURL=modelProfiles.js.map