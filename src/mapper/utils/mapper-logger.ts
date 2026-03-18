import fs from 'fs';
import path from 'path';

// Log mapped email data to mapper logs folder
export const logMappedEmail = (fileName: string, data: any) => {
  const logsDir = path.join(__dirname, '../logs');
  
  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  const filePath = path.join(logsDir, fileName);
  const content = JSON.stringify(data, null, 2);
  
  fs.writeFileSync(filePath, content);
  console.log(`[Mapper] Logged mapped email to: ${fileName}`);
};
