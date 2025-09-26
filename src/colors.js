// ref https://github.com/nodejs/node/blob/main/lib/internal/util/colors.js
const FORCE_COLOR = process.env.FORCE_COLOR;

/**
 * @param {NodeJS.WriteStream} stream
 */
export function should_colorize(stream = process.stderr) {
	if (FORCE_COLOR !== undefined)
		return FORCE_COLOR !== "0";
	return stream?.isTTY && (
		typeof stream.getColorDepth === 'function' ?
			stream.getColorDepth() > 2 : true);
}

function build(on) {
	const esc = (n) => on ? `\x1b[${n}m` : "";
	const codes = {
		// styles
		reset: 0,
		bold: 1,
		dim: 2,
		italic: 3,
		underline: 4,
		inverse: 7,
		hidden: 8,
		strike: 9,
		// fg 30-37
		black: 30,
		red: 31,
		green: 32,
		yellow: 33,
		blue: 34,
		magenta: 35,
		cyan: 36,
		white: 37,
		// bright fg 90-97
		brightBlack: 90,
		brightRed: 91,
		brightGreen: 92,
		brightYellow: 93,
		brightBlue: 94,
		brightMagenta: 95,
		brightCyan: 96,
		brightWhite: 97,
		// bg 40-47
		bgBlack: 40,
		bgRed: 41,
		bgGreen: 42,
		bgYellow: 43,
		bgBlue: 44,
		bgMagenta: 45,
		bgCyan: 46,
		bgWhite: 47,
		// bright bg 100-107
		bgBrightBlack: 100,
		bgBrightRed: 101,
		bgBrightGreen: 102,
		bgBrightYellow: 103,
		bgBrightBlue: 104,
		bgBrightMagenta: 105,
		bgBrightCyan: 106,
		bgBrightWhite: 107,
	}

	/** @type {Record<keyof codes, string> & { wrap: (parts: string[], text: string) => string }} */
	// @ts-ignore
	const o = Object.keys(codes).reduce((obj, key) => {
		obj[key] = esc(codes[key]);
		return obj;
	}, {});

	o.wrap = (parts, text) => {
		const open = parts.filter(Boolean).join("");
		return `${open}${text}${o.reset}`;
	};

	return o;
};

export const colors = build(should_colorize());
