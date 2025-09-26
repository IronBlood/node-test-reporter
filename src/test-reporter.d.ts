export interface TestReporterData {
	name: string;
	nesting: number;
	testNumber: number;
	details: {
		duration_ms: number,
		type?: string; // suite
		error: Error[];
	}
	line: number;
	column: number;
	file: string; // full path
}

export interface TestReporterEvent {
	type: string;
	data: TestReporterData
}

interface WriteReportLineObj {
	file: any;
	depth?: number;
	coveragesColumns: any[];
	fileCoverage: any;
	uncoveredLines: any;
};

export type WriteReportLineFn = (o: WriteReportLineObj) => string;
