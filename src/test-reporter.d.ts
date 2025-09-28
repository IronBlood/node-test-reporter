export interface TestReporterData {
	name: string;
	nesting: number;
	testNumber: number;
	details: {
		duration_ms: number,
		type?: string; // suite
		error: Error & TestError;
	}
	line: number;
	column: number;
	file: string; // full path
	todo?: boolean;
	skip?: boolean;
}

export interface TestReporterEventTreeNode {
	parent?: TestReporterEventTreeNode;
	event: TestReporterEvent;
	children: TestReporterEventTreeNode[];
}

export interface TestReporterEvent {
	type: string;
	data: TestReporterData
}

export interface TestReportSummary {
	type: 'test:summary',
	data: {
		success: boolean;
		counts: {
			tests: number;
			failed: number;
			passed: number;
			cancelled: number;
			skipped: number;
			todo: number;
			topLevel: number;
			suites: number;
		},
		duration_ms: number;
		file?: string;
	}
}

export interface TestError {
	code: string;
	failureType: string;
	cause: Error & {
		generatedMessage: boolean;
		code: string;
		actual: number;
		expected: number;
		operator: string;
	}
}

interface WriteReportLineObj {
	file: any;
	depth?: number;
	coveragesColumns: any[];
	fileCoverage: any;
	uncoveredLines: any;
};

export type WriteReportLineFn = (o: WriteReportLineObj) => string;
