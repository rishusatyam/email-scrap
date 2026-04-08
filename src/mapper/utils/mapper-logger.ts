import fs from 'fs';
import path from 'path';

// Log mapped email data to mapper logs folder
export const logMappedEmail = async (fileName: string, data: any): Promise<void> => {
  const logsDir = path.join(__dirname, '../logs');

  // Create logs directory if it doesn't exist
  await fs.promises.mkdir(logsDir, { recursive: true });

  const filePath = path.join(logsDir, fileName);
  const content = JSON.stringify(data, null, 2);

  await fs.promises.writeFile(filePath, content, 'utf-8');
  console.log(`[Mapper] Logged mapped email to: ${fileName}`);
};
