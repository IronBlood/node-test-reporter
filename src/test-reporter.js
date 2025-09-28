// ref https://github.com/nodejs/node/blob/main/lib/internal/test_runner/reporter/spec.js
// ref https://github.com/nodejs/node/blob/main/lib/internal/test_runner/reporter/utils.js
// Version: 38757c906d90da68ffbc6277e2d719b04c71a902

import { Transform } from "node:stream";
import { relative, sep } from "node:path";
import { inspect } from "node:util";
import assert from "node:assert";
import {
	colors,
	should_colorize,
} from "./colors.js";

const kSubtestsFailed = 'subtestsFailed';

const reporterUnicodeSymbolMap = {
	'__proto__': null,
	'test:fail': '\u2716 ',
	'test:pass': '\u2714 ',
	'test:diagnostic': '\u2139 ',
	'test:coverage': '\u2139 ',
	'arrow:right': '\u25B6 ',
	'hyphen:minus': '\uFE63 ',
};

const reporterColorMap = {
	'__proto__': null,
	get 'test:fail'() {
		return colors.red;
	},
	get 'test:pass'() {
		return colors.green;
	},
	get 'test:diagnostic'() {
		return colors.blue;
	},
	get 'info'() {
		return colors.blue;
	},
	get 'warn'() {
		return colors.yellow;
	},
	get 'error'() {
		return colors.red;
	},
};

const coverageColors = {
	__proto__: null,
	high: colors.green,
	medium: colors.yellow,
	low: colors.red,
};

const inspectOptions = {
	__proto__: null,
	colors: should_colorize(process.stdout),
	breakLength: Infinity,
};

function formatError(error, indent) {
	if (!error) return '';
	const err = error.code === 'ERR_TEST_FAILURE' ? error.cause : error;
	const message = inspect(err, inspectOptions).split(/\r?\n/).join(`\n${indent}  `);
	return `\n${indent}  ${message}\n`;
}

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

function formatTestReport(type, data, prefix = '', indent = '', hasChildren = false, showErrorDetails = true) {
	let color = reporterColorMap[type] ?? colors.white;
	let symbol = reporterUnicodeSymbolMap[type] ?? ' ';
	const { skip, todo } = data;
	const duration_ms = data.details?.duration_ms ? ` ${colors.brightBlack}(${data.details.duration_ms}ms)${colors.reset}` : '';
	let title = `${data.name}${duration_ms}`;

	if (skip !== undefined) {
		title += ` # ${typeof skip === 'string' && skip.length ? skip : 'SKIP'}`;
	} else if (todo !== undefined) {
		title += ` # ${typeof todo === 'string' && todo.length ? todo : 'TODO'}`;
	}

	const error = showErrorDetails ? formatError(data.details?.error, indent) : '';
	const err = hasChildren ?
		(!error || data.details?.error?.failureType === 'subtestsFailed' ? '' : `\n${error}`) :
		error;

	if (skip !== undefined) {
		color = colors.brightBlack;
		symbol = reporterUnicodeSymbolMap['hyphen:minus'];
	}
	return `${prefix}${indent}${color}${symbol}${title}${colors.white}${err}`;
}

function buildFileTree(summary) {
	const tree = { __proto__: null };
	let treeDepth = 1;
	let longestFile = 0;

	summary.files.forEach((file) => {
		let longestPart = 0;
		const parts = relative(summary.workingDirectory, file.path).split(sep);
		let current = tree;

		parts.forEach((part, index) => {
			current[part] ||= { __proto__: null };
			current = current[part];
			// If this is the last part, add the file to the tree
			if (index === parts.length - 1) {
				current.file = file;
			}
			// Keep track of the longest part for padding
			longestPart = Math.max(longestPart, part.length);
		});

		treeDepth = Math.max(treeDepth, parts.length);
		longestFile = Math.max(longestPart, longestFile);
	});

	return {
		__proto__: null,
		tree,
		treeDepth,
		longestFile,
	};
}

const memo = new Map();
function addTableLine(prefix, width) {
	const key = `${prefix}-${width}`;
	let value = memo.get(key);
	if (value === undefined) {
		value = `${prefix}${'-'.repeat(width)}\n`;
		memo.set(key, value);
	}

	return value;
}

const kHorizontalEllipsis = '\u2026';

/**
 * @param {string} string
 * @param {number} width
 */
function truncateStart(string, width) {
	return string.length > width ? `${kHorizontalEllipsis}${string.slice(string.length - width + 1)}` : string;
}

/**
 * @param {string} string
 * @param {number} width
 */
function truncateEnd(string, width) {
	return string.length > width ? `${string.slice(0, width - 1)}${kHorizontalEllipsis}` : string;
}

/**
 * @param {any[]} lines
 */
function getUncoveredLines(lines) {
	return lines.flatMap((line) => (line.count === 0 ? line.line : []));
}

/**
 * @param {any[]} values
 */
function formatLinesToRanges(values) {
	return values.reduce((prev, current, index, array) => {
		if ((index > 0) && ((current - array[index - 1]) === 1)) {
			prev[prev.length - 1][1] = current;
		} else {
			prev.push([current]);
		}
		return prev;
	}, []).map((range) => range.join('-'));
}

/**
 * @param {any[]} lines
 */
function formatUncoveredLines(lines, table) {
	return table
		? formatLinesToRanges(lines).join(' ')
		: lines.join(', ');
}

const kColumns = ['line %', 'branch %', 'funcs %'];
const kColumnsKeys = ['coveredLinePercent', 'coveredBranchPercent', 'coveredFunctionPercent'];
const kSeparator = ' | ';

function getCoverageReport(pad, summary, symbol, color, table) {
	const prefix = `${pad}${symbol}`;
	let report = `${color}${prefix}start of coverage report\n`;

	let filePadLength;
	let columnPadLengths = [];
	let uncoveredLinesPadLength;
	let tableWidth;

	// Create a tree of file paths
	const { tree, treeDepth, longestFile } = buildFileTree(summary);
	if (table) {
		// Calculate expected column sizes based on the tree
		filePadLength = table && longestFile;
		filePadLength += (treeDepth - 1);
		if (color) {
			filePadLength += 2;
		}
		filePadLength = Math.max(filePadLength, 'all files'.length);
		if (filePadLength > (process.stdout.columns / 2)) {
			filePadLength = Math.floor(process.stdout.columns / 2);
		}
		const fileWidth = filePadLength + 2;

		columnPadLengths = kColumns.map((column) => (table ? Math.max(column.length, 6) : 0));
		const columnsWidth = columnPadLengths.reduce((acc, columnPadLength) => acc + columnPadLength + 3, 0);

		uncoveredLinesPadLength = table && summary.files.reduce((acc, file) =>
			Math.max(acc, formatUncoveredLines(getUncoveredLines(file.lines), table).length), 0);
		uncoveredLinesPadLength = Math.max(uncoveredLinesPadLength, 'uncovered lines'.length);
		const uncoveredLinesWidth = uncoveredLinesPadLength + 2;

		tableWidth = fileWidth + columnsWidth + uncoveredLinesWidth;

		const availableWidth = (process.stdout.columns || Infinity) - prefix.length;
		const columnsExtras = tableWidth - availableWidth;
		if (table && columnsExtras > 0) {
			filePadLength = Math.min(availableWidth * 0.5, filePadLength);
			uncoveredLinesPadLength = Math.max(availableWidth - columnsWidth - (filePadLength + 2) - 2, 1);
			tableWidth = availableWidth;
		} else {
			uncoveredLinesPadLength = Infinity;
		}
	}

	/**
	 * @param {"PadStart" | "PadEnd" | false} pad
	 * @param {string} string
	 */
	function getCell(string, width, pad, truncate, coverage) {
		if (!table) return string;

		let result = string;
		if (pad) result = pad === "PadEnd"
			? result.padEnd(width)
			: result.padStart(width);
		if (truncate) result = truncate(result, width);
		if (color && coverage !== undefined) {
			if (coverage > 90) return `${coverageColors.high}${result}${color}`;
			if (coverage > 50) return `${coverageColors.medium}${result}${color}`;
			return `${coverageColors.low}${result}${color}`;
		}
		return result;
	}

	/** @type {import("./types").WriteReportLineFn} */
	function writeReportLine({ file, depth = 0, coveragesColumns, fileCoverage, uncoveredLines }) {
		const fileColumn = `${prefix}${' '.repeat(depth)}${getCell(file, filePadLength - depth, "PadEnd", truncateStart, fileCoverage)}`;
		const coverageColumns = coveragesColumns.map((coverage, j) => {
			const coverageText = typeof coverage === 'number' ? coverage.toFixed(2) : coverage;
			return getCell(coverageText, columnPadLengths[j], "PadStart", false, coverage);
		}).join(kSeparator);

		const uncoveredLinesColumn = getCell(uncoveredLines, uncoveredLinesPadLength, false, truncateEnd);

		return `${fileColumn}${kSeparator}${coverageColumns}${kSeparator}${uncoveredLinesColumn}\n`;
	}

	function printCoverageBodyTree(tree, depth = 0) {
		for (const key in tree) {
			if (tree[key].file) {
				const file = tree[key].file;
				const fileName = file.path.split(sep).pop();

				let fileCoverage = 0;
				const coverages = kColumnsKeys.map((columnKey) => {
					const percent = file[columnKey];
					fileCoverage += percent;
					return percent;
				});
				fileCoverage /= kColumnsKeys.length;

				const uncoveredLines = formatUncoveredLines(getUncoveredLines(file.lines), table);

				report += writeReportLine({
					// __proto__: null,
					file: fileName,
					depth: depth,
					coveragesColumns: coverages,
					fileCoverage: fileCoverage,
					uncoveredLines: uncoveredLines,
				});
			} else {
				report += writeReportLine({
					// __proto__: null,
					file: key,
					depth: depth,
					coveragesColumns: columnPadLengths.map(() => ''),
					fileCoverage: undefined,
					uncoveredLines: '',
				});
				printCoverageBodyTree(tree[key], depth + 1);
			}
		}
	}

	// -------------------------- Coverage Report --------------------------
	if (table) report += addTableLine(prefix, tableWidth);

	// Print the header
	report += writeReportLine({
		// __proto__: null,
		file: 'file',
		coveragesColumns: kColumns,
		fileCoverage: undefined,
		uncoveredLines: 'uncovered lines',
	});

	if (table) report += addTableLine(prefix, tableWidth);

	// Print the body
	printCoverageBodyTree(tree);

	if (table) report += addTableLine(prefix, tableWidth);

	// Print the footer
	const allFilesCoverages = kColumnsKeys.map((columnKey) => summary.totals[columnKey]);
	report += writeReportLine({
		// __proto__: null,
		file: 'all files',
		coveragesColumns: allFilesCoverages,
		fileCoverage: undefined,
		uncoveredLines: '',
	});

	if (table) report += addTableLine(prefix, tableWidth);

	report += `${prefix}end of coverage report\n`;
	if (color) {
		report += colors.white;
	}
	return report;
}

class SpecLite extends Transform {
	#stack = [];
	#reported = [];
	#failedTests = [];
	#cwd = process.cwd();

	constructor() {
		super({
			writableObjectMode: true,
		});
	}

	#formatFailedTestResults() {
		if (this.#failedTests.length === 0) {
			return "";
		}

		const results = [
			`\n${colors.brightRed}${reporterUnicodeSymbolMap["test:fail"]}failing tests:${colors.reset}\n`,
		];

		for (const test of this.#failedTests) {
			const formattedErr = formatTestReport('test:fail', test);
			if (test.file) {
				const relPath = relative(this.#cwd, test.file);
				const location = `test at ${relPath}:${test.line}:${test.column}`;
				results.push(location);
			}

			results.push(formattedErr);
		}
		this.#failedTests = [];
		return results.join('\n');
	}

	/**
	 * @param {string} type
	 * @param {import("./types").TestReporterData} data
	 */
	#handleTestReportEvent(type, data) {
		const subtest = this.#stack.shift();
		if (subtest) {
			// minimal consistency checks
			assert(subtest.type === 'test:start');
			assert(subtest.data.nesting === data.nesting);
			assert(subtest.data.name === data.name);
		}
		let prefix = '';
		while (this.#stack.length) {
			// Report all the parent `test:start` events
			const parent = this.#stack.pop();
			assert(parent.type === 'test:start');
			const msg = parent.data;
			this.#reported.unshift(msg);
			prefix += `${indent(msg.nesting)}${reporterUnicodeSymbolMap['arrow:right']}${msg.name}\n`;
		}
		let hasChildren = false;
		if (this.#reported[0] && this.#reported[0].nesting === data.nesting && this.#reported[0].name === data.name) {
			this.#reported.shift();
			hasChildren = true;
		}
		const indentation = indent(data.nesting);
		return `${formatTestReport(type, data, prefix, indentation, hasChildren, false)}\n`;
	}

	// @ts-ignore TODO
	#handleEvent({ type, data }) {
		switch (type) {
			case 'test:fail':
				if (data.details?.error?.failureType !== kSubtestsFailed) {
					this.#failedTests.push(data);
				}
				return this.#handleTestReportEvent(type, data);
			case 'test:pass':
				return this.#handleTestReportEvent(type, data);
			case 'test:start':
				this.#stack.unshift({ __proto__: null, data, type });
				break;
			case 'test:stderr':
			case 'test:stdout':
				return data.message;
			case 'test:diagnostic':{
				const diagnosticColor = reporterColorMap[data.level] || reporterColorMap['test:diagnostic'];
				return `${diagnosticColor}${indent(data.nesting)}${reporterUnicodeSymbolMap[type]}${data.message}${colors.white}\n`;
			}
			case 'test:coverage':
				// throw new Error("unsupported");
				return getCoverageReport(indent(data.nesting), data.summary, reporterUnicodeSymbolMap['test:coverage'], colors.blue, true);
			case 'test:summary':
				// We report only the root test summary
				if (data.file === undefined) {
					return this.#formatFailedTestResults();
				}
		}
	}

	_transform({ type, data }, _enc, cb) {
		let chunk = '';
		switch (type) {
			case 'test:start':
				this.#stack.unshift({ type, data });
				break;
			case 'test:pass':
				chunk = this.#handleTestReportEvent(type, data);
				break;
			case 'test:fail':
				this.#failedTests.push(data);
				chunk = this.#handleTestReportEvent(type, data);
				break;
			case 'test:stdout':
			case 'test:stderr':
				chunk = data.message;
				break;
			case 'test:summary':
				if (data.file === undefined) chunk = this.#formatFailedTestResults();
				break;
		}
		cb(null, chunk);
	}

	_flush(cb) {
		cb(null, this.#formatFailedTestResults());
	}
}

export default new SpecLite();
