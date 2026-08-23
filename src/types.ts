/** A captured element from the proxied browser panel. */
export interface ElementData {
	tag: string;
	id: string;
	className: string;
	text: string;
	xpath: string;
	cssSelector: string;
	outerHTML: string;
	rect?: { x: number; y: number; w: number; h: number };
	url?: string;
	timestamp: number;

	// Rich context (populated by the injected collector)
	htmlPath?: string;
	cssMatched?: string[];
	cssInherited?: string[];
	cssResolved?: string[];
	cssVars?: string[];
	source?: { file: string; line: number } | null;

	/** Pre-rendered "Attached Element Context" text block. */
	contextText?: string;
}

/** One annotated step in a recorded bug-reproduction flow. */
export interface BugStep {
	element: ElementData;
	note: string;
}

/** A recorded path — an ordered sequence of annotated steps (a bug or task flow). */
export interface BugPath {
	id: string;
	title: string;
	kind: 'bug' | 'task';
	createdAt: number;
	steps: BugStep[];
}

/** A debug project groups related recorded paths. */
export interface BugProject {
	id: string;
	name: string;
	createdAt: number;
	paths: BugPath[];
}

// ---- Lightweight view models sent to the sidebar webview ----
// Full ElementData (incl. 8KB outerHTML) stays host-side; the viz only needs
// tag/id/note, and copy/export compose from the full store in the extension.

export interface BugStepSummary { tag: string; id: string; note: string; }

export interface BugPathView {
	id: string;
	title: string;
	kind: 'bug' | 'task';
	createdAt: number;
	steps: BugStepSummary[];
}

export interface BugProjectView {
	id: string;
	name: string;
	createdAt: number;
	paths: BugPathView[];
}

/** Snapshot of all debug-flow state for the sidebar. */
export interface BugView {
	projects: BugProjectView[];
	activeProjectId: string | null;
	recordingActive: boolean;
	recordingSteps: number;
	recordingProjectName: string | null;
}
