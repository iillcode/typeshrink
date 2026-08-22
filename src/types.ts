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
