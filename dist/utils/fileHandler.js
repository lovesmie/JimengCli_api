"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupTempFile = exports.saveTempFile = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const tempDir = path_1.default.resolve(__dirname, '../../data/temp_inputs');
// Ensure temp dir exists
if (!fs_1.default.existsSync(tempDir)) {
    fs_1.default.mkdirSync(tempDir, { recursive: true });
}
/**
 * Handle base64, URL, or local file buffer and save it to a temporary file
 */
const saveTempFile = async (input, ext = '.png') => {
    const fileName = `${(0, uuid_1.v4)()}${ext}`;
    const filePath = path_1.default.join(tempDir, fileName);
    if (Buffer.isBuffer(input)) {
        fs_1.default.writeFileSync(filePath, input);
        return filePath;
    }
    if (typeof input === 'string') {
        if (input.startsWith('http://') || input.startsWith('https://')) {
            // Download image
            const response = await (0, axios_1.default)({
                url: input,
                responseType: 'arraybuffer',
            });
            fs_1.default.writeFileSync(filePath, response.data);
            return filePath;
        }
        else if (input.startsWith('data:image')) {
            // Base64
            const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], 'base64');
                fs_1.default.writeFileSync(filePath, buffer);
                return filePath;
            }
        }
    }
    throw new Error('Unsupported file input format');
};
exports.saveTempFile = saveTempFile;
const cleanupTempFile = (filePath) => {
    if (fs_1.default.existsSync(filePath)) {
        try {
            fs_1.default.unlinkSync(filePath);
        }
        catch (e) {
            console.error(`Failed to cleanup file ${filePath}`, e);
        }
    }
};
exports.cleanupTempFile = cleanupTempFile;
//# sourceMappingURL=fileHandler.js.map