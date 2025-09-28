import { relative, isAbsolute } from "node:path";

const CWD_PREFIX = process.cwd();
/**
 * @param {string} p
 */
export const rel = (p) => isAbsolute(p) ? relative(CWD_PREFIX, p) : p;

/** @type {Map<any, string>} */
const indentMemo = new Map();
export function indent(nesting) {
	let value = indentMemo.get(nesting);
	if (value === undefined) {
		value = '  '.repeat(nesting);
		indentMemo.set(nesting, value);
	}
	return value;
}

export const reporter_unicode_symbol_map = {
	"__proto__": null,
	"test:fail": "\u2715",
	"test:pass": "\u2713",
	"test:skip": "\u25CB",
	"dot": "\u25cf", // ●
	"gt": "\u203a",  // ›
};
