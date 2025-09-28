/**
 * @typedef {import("./test-reporter").TestReporterEventTreeNode} TreeNode
 * @typedef {import("./test-reporter").TestReportSummary} Summary
 * @typedef {import("./test-reporter").TestReporterEvent} Event
 */

import { Transform } from "node:stream";
import { relative, isAbsolute } from "node:path";
import { colors } from "./colors.js";
import { format_error } from "./error.js";

const CWD_PREFIX = process.cwd();
/**
 * @param {string} p
 */
const rel = (p) => isAbsolute(p) ? relative(CWD_PREFIX, p) : p;

/** @type {Map<any, string>} */
const indentMemo = new Map();
function indent(nesting) {
	let value = indentMemo.get(nesting);
	if (value === undefined) {
		value = '  '.repeat(nesting);
		indentMemo.set(nesting, value);
	}
	return value;
}

const reporter_unicode_symbol_map = {
	"__proto__": null,
	"test:fail": "\u2715",
	"test:pass": "\u2713",
	"test:skip": "\u25CB",
};

/** @type {Event[]} */
const event_buffer = [];
/** @type {TreeNode[]} */
const fail_buffer = [];
/** @type {TreeNode[][]} */
let trees_by_depth = [];
/** @type {Summary[]} */
const file_summaries = [];

const flush_buffer_to_tree = () => {
	let max_nesting = 0;
	for (const e of event_buffer) {
		max_nesting = Math.max(max_nesting, e.data.nesting);
	}

	if (trees_by_depth.length < max_nesting + 1) {
		let count = max_nesting + 1 - trees_by_depth.length;
		while (count-- > 0) {
			trees_by_depth.push([]);
		}
	}

	for (const e of event_buffer) {
		/** @type {TreeNode} */
		const node = {
			event: e,
			children: [],
		};
		const nesting_idx = e.data.nesting;
		if (nesting_idx === max_nesting) {
			// definitely leaves
			trees_by_depth[nesting_idx].push(node);
			continue;
		}

		const next_idx = nesting_idx + 1;
		if (trees_by_depth[next_idx].length > 0) {
			node.children = trees_by_depth[next_idx];
			node.children.forEach(child => child.parent = node);
			trees_by_depth[next_idx] = [];
		}
		trees_by_depth[nesting_idx].push(node);
	}

	event_buffer.length = 0;
};

/**
 * Generate a detailed test report containing each suite and test for a single file
 * @param {string} filename
 */
const format_file_report = (filename) => {
	/** @type {string[]} */
	const chunks = [];

	/**
	 * @param {TreeNode} node
	 */
	const dfs = (node) => {
		// type: "test:pass" | "test:fail"
		const { data, type } = node.event;
		const { todo, skip } = data;

		if (data.details.type) {
			chunks.push(`${indent(1 + data.nesting)}${data.name}`);
			node.children.forEach(c => dfs(c));
		} else {
			let icon = "", text = "";

			if (type === "test:pass") {
				icon = `${colors.green}${reporter_unicode_symbol_map[type]}${colors.reset}`;
				text = `${data.name} ${colors.brightBlack}(${data.details.duration_ms.toFixed(0)} ms)${colors.reset}`;
			} else if (type === "test:fail") {
				icon = `${colors.red}${reporter_unicode_symbol_map[type]}${colors.reset}`;
				text = `${data.name} ${colors.brightBlack}(${data.details.duration_ms.toFixed(0)} ms)${colors.reset}`;
			}

			if (todo !== undefined) {
				icon = `${colors.cyan}${reporter_unicode_symbol_map["test:todo"]}${colors.reset}`;
				text = `TODO ${data.name}`;
			}
			if (skip !== undefined) {
				icon = `${colors.yellow}${reporter_unicode_symbol_map["test:skip"]}${colors.reset}`;
				text = `skipped ${data.name}`;
			}

			chunks.push(`${indent(1 + data.nesting)}${icon} ${text}`);

			if (type === "test:fail" && data.details?.error) {
				fail_buffer.push(node);
			}
		}
	};

	for (const root of trees_by_depth[0].filter(x => x.event.data.file === filename)) {
		dfs(root);
	}

	chunks.push("");

	return chunks.join("\n");
};

/**
 * DFS
 * @param {TreeNode} node
 * @param {(event: Event) => void} cb
 */
const walk_tree_for_event = (node, cb) => {
	cb(node.event);
	node.children.forEach(c => walk_tree_for_event(c, cb));
};

/**
 * DFS
 * @param {TreeNode} node
 * @param {(node: TreeNode) => void} cb
 */
const walk_tree_for_node = (node, cb) => {
	cb(node);
	node.children.forEach(c => walk_tree_for_node(c, cb));
};

/**
 * @param {string} text
 * @param {number} total
 * @param {boolean} [is_suite]
 * @returns {string}
 */
const format_totals_line = (text, total, is_suite) => {
	const seg = [
		text,
	];

	let failed = 0, skipped = 0, passed = 0, ctodo = 0;

	trees_by_depth[0].forEach(node => walk_tree_for_event(node, (event) => {
		if (false
			|| (is_suite && event.data.details.type)
			|| (!is_suite && event.data.details.type === undefined)
		) {
			const { skip, todo } = event.data;
			if (skip !== undefined) {
				skipped++;
			}
			if (todo != undefined) {
				ctodo++;
			}

			switch (event.type) {
				case "test:pass": passed++; break;
				case "test:fail": failed++; break;
				default: break;
			}
		}
	}));

	if (failed) {
		seg.push(`${colors.red}${colors.bold}${failed} failed${colors.reset},`);
	}

	if (skipped) {
		seg.push(`${colors.yellow}${colors.bold}${skipped} skipped${colors.reset},`);
	}

	if (ctodo) {
		seg.push(`${colors.cyan}${colors.bold}${ctodo} todo${colors.reset},`);
	}

	if (passed) {
		seg.push(`${colors.green}${colors.bold}${passed} passed${colors.reset},`);
	}

	seg.push(`${total} total`);
	return seg.join(" ");
};

/**
 * @param {Summary} event
 */
const print_final_summary = (event) => {
	const lines = [];

	lines.push(format_totals_line(
		`${colors.bold}Test Suites:${colors.reset}`,
		event.data.counts.suites,
		true,
	));
	lines.push(format_totals_line(
		`${colors.bold}Tests:      ${colors.reset}`,
		event.data.counts.tests,
		false,
	));
	lines.push([
		`${colors.bold}Time:       ${colors.reset}`,
		`${(event.data.duration_ms / 1000).toFixed(3)} s`,
	].join(" "));

	console.log(lines.join("\n") + colors.reset);
};

const print_per_file_detail = () => {
	const summary = file_summaries[0];
	const status = summary.data.success
		? `${colors.bgGreen}${colors.black}${colors.bold} PASS ${colors.reset}`
		: `${colors.bgRed}${colors.black}${colors.bold} FAIL ${colors.reset}`;

	const file = rel(summary.data.file);

	console.log(`${status} ${file}`);

	console.log(format_file_report(summary.data.file));
};

const print_fail_summary = () => {
	if (fail_buffer.length > 0) {
		console.log(fail_buffer.map(format_error).join("\n"));
	}
};

/**
 * @param {Summary} event
 */
const print_summaries = (event) => {
	if (file_summaries.length > 1) {
		file_summaries.forEach(s => {
			const status = s.data.success
				? `${colors.bgGreen}${colors.bold}${colors.black} PASS ${colors.reset}`
				: `${colors.bgRed}${colors.bold}${colors.black} FAIL ${colors.reset}`;
			console.log(`${status} ${rel(s.data.file)}`);
		});
		console.log("");

		trees_by_depth[0].forEach(root => walk_tree_for_node(root, node => {
			if (node.event.type === "test:fail" && !node.event.data.details.type) {
				fail_buffer.push(node);
			}
		}));
	} else {
		print_per_file_detail();
	}

	print_fail_summary();

	print_final_summary(event);
};

const JestStyleReporter = new Transform({
	writableObjectMode: true,
	/**
	 * @param {Event} event
	 */
	transform(event, _encoding, callback) {
		const { data, type } = event;
		switch (type) {
			case 'test:fail':
			case 'test:pass':
				event_buffer.push(event);
				if (data.nesting === 0) {
					flush_buffer_to_tree()
				}
				callback(null, "");
				break;
			case 'test:summary':
				if (event.data.file) {
					// @ts-ignore
					file_summaries.push(event);
					callback(null, "");
				} else {
					// @ts-ignore
					print_summaries(event);
					callback(null, "");
				}
				break;
			default:
				callback(null, "");
		}
	},
});

export default JestStyleReporter;
