import { test } from "node:test";
import { access, readFile } from "node:fs/promises";
import assert from "node:assert/strict";

test("compare local and CI reporter snapshots", async () => {
	const files = ["test/snapshot.txt", "test/snapshot.ci.txt"];

	for (const file of files) {
		try {
			await access(file);
		} catch {
			assert.fail(`Snapshot file missing: ${file}`);
		}
	}

	const [expected, actual] = await Promise.all(
		files.map(file => readFile(file, "utf8")),
	);

	const expectedLines = expected.split("\n");
	const actualLines = actual.split("\n");

	assert.equal(
		actualLines.length,
		expectedLines.length,
		`Line count mismatch: expected ${expectedLines.length}, actual ${actualLines.length}`,
	);

	[0, 1, 3, 4, 5].forEach(idx => {
		assert.equal(
			actualLines[idx],
			expectedLines[idx],
			`Mismatch at line ${idx + 1}`,
		);
	});

	const line2PrefixActual = actualLines[2]?.replace(/(\d+)\s*ms/, "");
	const line2PrefixExpected = expectedLines[2]?.replace(/(\d+)\s*ms/, "");

	assert.equal(line2PrefixActual, line2PrefixExpected, "Mismatch in line 3 prefix");

	const line6PrefixActual = actualLines[6]?.replace(/\d+\.\d+\s*s/, "");
	const line6PrefixExpected = expectedLines[6]?.replace(/\d+\.\d+\s*s/, "");

	assert.equal(line6PrefixActual, line6PrefixExpected, "Mismatch in line 7 prefix");
});
