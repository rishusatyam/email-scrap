import fs from 'fs';
import path from 'path';

export const logNormalizedEmail = (fileName: string, data: any) => {
  const logsDir = path.join(__dirname, '../logs');

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const filePath = path.join(logsDir, fileName);
  const content = JSON.stringify(data, null, 2);

  fs.writeFileSync(filePath, content);
  console.log(`[EmailNormalizer] Logged pre-mapper snapshot to: ${fileName}`);
};
