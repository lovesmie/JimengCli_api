import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const tempDir = path.resolve(__dirname, '../../data/temp_inputs');

// Ensure temp dir exists
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Handle base64, URL, or local file buffer and save it to a temporary file
 */
export const saveTempFile = async (input: string | Buffer, ext = '.png'): Promise<string> => {
  const fileName = `${uuidv4()}${ext}`;
  const filePath = path.join(tempDir, fileName);

  if (Buffer.isBuffer(input)) {
    fs.writeFileSync(filePath, input);
    return filePath;
  }

  if (typeof input === 'string') {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      // Download image
      const response = await axios({
        url: input,
        responseType: 'arraybuffer',
      });
      fs.writeFileSync(filePath, response.data);
      return filePath;
    } else if (input.startsWith('data:image')) {
      // Base64
      const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const buffer = Buffer.from(matches[2], 'base64');
        fs.writeFileSync(filePath, buffer);
        return filePath;
      }
    }
  }
  
  throw new Error('Unsupported file input format');
};

export const cleanupTempFile = (filePath: string) => {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.error(`Failed to cleanup file ${filePath}`, e);
    }
  }
};
