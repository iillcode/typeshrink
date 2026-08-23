import { BugPath, BugProject, BugStep, ElementData } from '../types';
import { buildContextText } from './buildContextText';

/** First http(s) URL found across a path's steps — the page the flow ran on. */
export function firstHttpUrl(steps: BugStep[]): string {
	const found = steps.map((s) => String(s.element.url || '')).find((u) => /^https?:\/\//i.test(u));
	return found || '';
}

/**
 * Compose the report for one recorded path: an ordered, annotated walkthrough
 * where every step carries the user's note plus the full attached element
 * context (selector, HTML path, outer HTML, CSS…).
 */
export function composeBugReport(
	title: string,
	targetUrl: string,
	steps: BugStep[]
): string {
	const L: string[] = [];
	L.push('# Bug Flow Report — ' + title);
	L.push('');
	if (targetUrl) {
		L.push('Target: ' + targetUrl);
	}
	L.push('Captured: ' + new Date().toLocaleString());
	L.push('Steps: ' + steps.length);

	steps.forEach((s) => {
		L.push('');
		L.push('---');
		L.push('');
		L.push('## Step — <' + s.element.tag + '>' + (s.element.id ? '#' + s.element.id : ''));
		if (s.note) {
			L.push('');
			L.push('**Note:** ' + s.note.replace(/\r?\n/g, '\n'));
		}
		L.push('');
		L.push(buildBlock(s.element));
		L.push('');
	});

	return L.join('\n');
}

/** Full markdown document for one stored path (bug or task). */
export function pathReport(p: BugPath): string {
	if (p.source === 'design' && p.edits && p.edits.length) return styleEditsReport(p);
	const heading = p.kind === 'task' ? 'Task Flow Report' : 'Bug Flow Report';
	return composeTypedReport(heading, p.title, p);
}

/**
 * Compact, AI-actionable report for Design-tab style edits.
 * Deliberately tiny: identity of the element + the exact CSS changes +
 * explicit instructions for a coding agent. No CSS dumps, no duplication —
 * an AI model (or human) gets everything needed to apply the change in code.
 */
function styleEditsReport(p: BugPath): string {
	const el = p.steps[0]?.element;
	const edits = (p.edits || []) as Array<{ prop: string; value: string }>;
	if (!el) return composeTypedReport('Task Flow Report', p.title, p);
	const target = firstHttpUrl(p.steps);
	const L: string[] = [];

	L.push('# Style Edit — <' + el.tag + '>' + (el.id ? '#' + el.id : '') + ' · ' + edits.length + ' change' + (edits.length === 1 ? '' : 's'));
	L.push('');
	if (target) L.push('Target: ' + target);
	L.push('Recorded: ' + new Date(p.createdAt).toLocaleString());

	L.push('');
	L.push('## Element');
	L.push('- Selector: `' + (el.cssSelector || '—') + '`');
	L.push('- XPath: `' + (el.xpath || '—') + '`');
	if (el.id) L.push('- id: `' + el.id + '`');
	if (el.className) L.push('- class: `.' + String(el.className).trim().split(/\s+/).join('`.`') + '`');
	if (el.rect) L.push('- Size/position at capture: ' + Math.round(el.rect.w) + '×' + Math.round(el.rect.h) + ' @ (' + Math.round(el.rect.x) + ', ' + Math.round(el.rect.y) + ')');
	if (el.source && el.source.file) L.push('- Source: `' + el.source.file + ':' + el.source.line + '`');
	L.push('- Page marker: `[data-ecb-id="' + (el.ecbId || '') + '"]`');
	if (el.outerHTML) {
		L.push('');
		L.push('```html');
		L.push(String(el.outerHTML));
		L.push('```');
	}

	L.push('');
	L.push('## Changes to apply');
	L.push('');
	edits.forEach((e, i) => L.push((i + 1) + '. `' + e.prop + ': ' + e.value + ';`'));

	L.push('');
	L.push('Combined:');
	L.push('');
	L.push('```css');
	L.push((el.cssSelector || '[data-ecb-id="' + el.ecbId + '"]') + ' {');
	edits.forEach((e) => L.push('  ' + e.prop + ': ' + e.value + ' !important;'));
	L.push('}');
	L.push('```');

	L.push('');
	L.push('## Instructions for the AI model');
	L.push('');
	L.push('Apply exactly the declarations listed above to the identified element in the source code.');
	L.push('- Prefer editing the component/style rule that already styles this element over adding inline styles.');
	L.push('- Do not modify anything else on the page.');
	L.push('- After applying, confirm each declaration resolves as computed style on the element.');

	return L.join('\n');
}

function composeTypedReport(kindHeading: string, title: string, p: BugPath): string {
	const L: string[] = [];
	L.push('# ' + kindHeading + ' — ' + title);
	L.push('');
	const target = firstHttpUrl(p.steps);
	if (target) L.push('Target: ' + target);
	L.push('Recorded: ' + new Date(p.createdAt).toLocaleString());
	L.push('Steps: ' + p.steps.length);

	p.steps.forEach((s) => {
		L.push('');
		L.push('---');
		L.push('');
		L.push('## Step — <' + s.element.tag + '>' + (s.element.id ? '#' + s.element.id : ''));
		if (s.note) {
			L.push('');
			L.push('**Note:** ' + s.note.replace(/\r?\n/g, '\n'));
		}
		L.push('');
		L.push(buildBlock(s.element));
		L.push('');
	});

	return L.join('\n');
}

/** Compose every path in a project into one shareable markdown document. */
export function composeProjectReport(p: BugProject): string {
	const L: string[] = [];
	L.push('# Debug Project — ' + p.name);
	L.push('');
	L.push('Created: ' + new Date(p.createdAt).toLocaleString());
	L.push('Paths: ' + p.paths.length);

	if (!p.paths.length) {
		L.push('');
		L.push('_No recorded paths yet._');
	}

	p.paths.forEach((pt, i) => {
		L.push('');
		L.push('=======================');
		L.push('');
		if (pt.source === 'design' && pt.edits && pt.edits.length) {
			L.push(styleEditsReport(pt));
		} else {
			L.push(composeTypedReport(pt.kind === 'task' ? 'Task Flow Report' : 'Bug Flow Report', i + 1 + '. ' + pt.title, pt));
		}
	});

	return L.join('\n');
}

/** Standard attached-context block per step. */
function buildBlock(d: ElementData): string {
	try {
		return buildContextText(d);
	} catch {
		return d.outerHTML || '';
	}
}
