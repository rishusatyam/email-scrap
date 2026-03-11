import fs from 'fs';
import path from 'path';

// Simple function to write data to file
export const writeToFile = (fileName: string, data: any) => {
  const logsDir = path.join(process.cwd(), 'logs');
  
  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  const filePath = path.join(logsDir, fileName);
  const content = JSON.stringify(data, null, 2);
  
  fs.writeFileSync(filePath, content);
  console.log(`Data written to: ${fileName}`);
};