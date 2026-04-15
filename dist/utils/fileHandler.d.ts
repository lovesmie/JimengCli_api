/**
 * Handle base64, URL, or local file buffer and save it to a temporary file
 */
export declare const saveTempFile: (input: string | Buffer, ext?: string) => Promise<string>;
export declare const cleanupTempFile: (filePath: string) => void;
//# sourceMappingURL=fileHandler.d.ts.map