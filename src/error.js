import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative } from "node:path";
import { colors } from "./colors.js";

/**
 * @param {import("./test-reporter").TestReporterEventTreeNode?} node
 * @param {number} indent
 */
const format_header = (node, indent) => {
	const buf = [];
	while (node) {
		buf.push(node.event.data.name);
		node = node.parent;
	}

	return [
		" ".repeat(indent),
		colors.bold,
		colors.red,
		"\u25cf ", // dot ●
		buf.reverse().join(" \u203a "), // ›
		colors.reset,
	].join("");
};

/**
 * @param {number} len
 * @param {number} num
 */
const padding = (len, num) => {
	const str = String(num);
	return " ".repeat(len - str.length) + str;
};

/**
 * @param {string} s
 * @returns {string}
 */
const spaces_except_tabs = (s) => s.replace(/[^\t]/g, " ");

/**
 * @param {string} filename
 * @param {number} line_idx_0based
 * @returns {{ line: number, text: string }[]}
 */
const get_context = (filename, line_idx_0based) => {
	let text;
	try {
		text = readFileSync(filename, "utf8");
	} catch {
		return [];
	};

	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	const L = lines.length;
	const start = Math.max(1, line_idx_0based - 2);
	const end = Math.min(L, line_idx_0based + 4); // exclusive

	const context = [];
	for (let line = start; line < end; line++) {
		context.push({ line, text: lines[line] ?? "" });
	}

	return context;
};

/**
 * @param {string?} stack
 * @returns {string}
 */
const format_meta = (stack, default_indent = 0) => {
	if (!stack)
		return "";

	// (file:///...:L:C)
	const match = /\((file:[^)]+):(\d+):(\d+)\)/.exec(stack);
	if (!match)
		return "";

	const abs = fileURLToPath(match[1]);
	const filename = relative(process.cwd(), abs);
	const line = +match[2] - 1;   // 1-based -> 0-based index
	const column = +match[3] - 1; // 1-based -> 0-based index

	const context = get_context(filename, line);

	let max_col_len = 0;
	for (const entry of context) {
		const s = String(entry.line + 1); // 0-based -> 1-based
		max_col_len = Math.max(max_col_len, s.length);
	}

	const indent = " ".repeat(default_indent);

	/** @type {string[]} */
	const meta = [];
	for (const entry of context) {
		meta.push([
			indent,
			entry.line === line
				? `${colors.red}${colors.bold}>${colors.reset} ` // red >
				: "  ",
			`${colors.brightBlack}${padding(max_col_len, entry.line + 1)} | ${colors.reset}`, // column
			entry.text
		].join(""));
		if (entry.line === line) {
			meta.push([
				indent,
				"  ",
				`${colors.brightBlack}${" ".repeat(max_col_len)} | ${colors.reset}`,
				spaces_except_tabs(entry.text.substring(0, column)),
				`${colors.red}${colors.bold}^${colors.reset}`,
			].join(""));
		}
	}

	meta.push(""); // empty line
	meta.push([
		indent,
		"  ",
		`at (${colors.cyan}${filename}${colors.reset}:${line + 1}:${column + 1})`,
	].join(""));

	return meta.join("\n");
};

/**
 * @param {import("./test-reporter").TestReporterEventTreeNode} node
 * @returns {string}
 */
export const format_error = (node) => {
	const data = node.event.data;
	const err = data.details.error;
	const meta = format_meta(err.cause.stack, 4);

	const header = format_header(node, 2);

	return [
		header,
		"", // empty line
		`${" ".repeat(4)}Expected: ${colors.green}${err.cause.expected}${colors.reset}`,
		`${" ".repeat(4)}Received: ${colors.red}${err.cause.actual}${colors.reset}`,
		"", // empty line
		meta,
		"", // empty line
	].join("\n");

};
