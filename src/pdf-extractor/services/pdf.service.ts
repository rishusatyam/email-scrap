import axios from 'axios';
import pdf from 'pdf-parse';
import fs from 'fs';
import path from 'path';

interface ExtractPdfResponse {
  success: boolean;
  text?: string;
  debugPath?: string;
  error?: string;
}

const parsePdfBuffer = async (pdfBuffer: Buffer, debugFilePrefix: string): Promise<ExtractPdfResponse> => {
  // Save PDF for debugging
  const debugDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const debugPdfPath = path.join(debugDir, `${debugFilePrefix}_${timestamp}.pdf`);

  fs.writeFileSync(debugPdfPath, pdfBuffer);
  console.log(`Debug PDF saved: ${debugPdfPath}`);

  console.log(`Parsing PDF to extract text...`);
  const parsed = await pdf(pdfBuffer);
  const pdfText = parsed.text;

  console.log(`PDF parsed successfully (${pdfText.length} characters extracted)`);

  return {
    success: true,
    text: pdfText,
    debugPath: debugPdfPath,
  };
};

/**
 * Extract PDF from Gmail attachment and convert to text
 * @param messageId - Gmail message ID
 * @param attachmentId - Gmail attachment ID
 * @param accessToken - Gmail API access token
 * @returns Extracted text and debug path
 */
export const extractPdfFromGmail = async (
  messageId: string,
  attachmentId: string,
  accessToken: string
): Promise<ExtractPdfResponse> => {
  try {
    // Validate inputs
    if (!messageId || !attachmentId || !accessToken) {
      return {
        success: false,
        error: 'Missing required parameters: messageId, attachmentId, or accessToken'
      };
    }

    // STEP 2: Fetch PDF from Gmail API
    console.log(`Fetching PDF attachment... (messageId: ${messageId}, attachmentId: ${attachmentId})`);
    
    const gmailApiUrl = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;
    
    const response = await axios.get(gmailApiUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.data.data) {
      return {
        success: false,
        error: 'No attachment data received from Gmail API'
      };
    }

    const base64Data = response.data.data;
    console.log(`PDF fetched (size: ${base64Data.length} bytes)`);

    // STEP 3: Convert Base64 → Binary Buffer
    console.log(`Converting base64 to binary buffer...`);
    const pdfBuffer = Buffer.from(base64Data, 'base64');
    console.log(`Buffer created (${pdfBuffer.length} bytes)`);

    // STEP 4: Convert PDF → Text
    return await parsePdfBuffer(pdfBuffer, `pdf_gmail_${messageId}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(` PDF extraction failed: ${errorMessage}`);
    
    return {
      success: false,
      error: `PDF extraction failed: ${errorMessage}`
    };
  }
};

/**
 * Extract PDF from Outlook attachment and convert to text
 * @param messageId - Outlook message ID
 * @param attachmentId - Outlook attachment ID
 * @param accessToken - Microsoft Graph API access token
 * @returns Extracted text and debug path
 */
export const extractPdfFromOutlook = async (
  messageId: string,
  attachmentId: string,
  accessToken: string
): Promise<ExtractPdfResponse> => {
  try {
    if (!messageId || !attachmentId || !accessToken) {
      return {
        success: false,
        error: 'Missing required parameters: messageId, attachmentId, or accessToken',
      };
    }

    console.log(`Fetching Outlook PDF attachment... (messageId: ${messageId}, attachmentId: ${attachmentId})`);

    const outlookApiUrl = `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments/${attachmentId}`;

    const response = await axios.get(outlookApiUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const contentBytes = response.data?.contentBytes;
    if (!contentBytes) {
      return {
        success: false,
        error: 'No attachment data received from Outlook API',
      };
    }

    console.log(`Outlook PDF fetched (size: ${contentBytes.length} bytes)`);

    // Graph contentBytes is base64 encoded
    const pdfBuffer = Buffer.from(contentBytes, 'base64');
    console.log(`Outlook PDF buffer created (${pdfBuffer.length} bytes)`);

    return await parsePdfBuffer(pdfBuffer, `pdf_outlook_${messageId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Outlook PDF extraction failed: ${errorMessage}`);

    return {
      success: false,
      error: `PDF extraction failed: ${errorMessage}`,
    };
  }
};
