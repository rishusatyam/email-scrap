import { Request, Response } from 'express';
import { extractPdfFromGmail } from '../services/pdf.service';

interface ExtractPdfRequest {
  messageId: string;
  attachmentId: string;
  accessToken: string;
}

/**
 * HTTP handler for extracting PDF from Gmail
 */
export const extractPdfHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { messageId, attachmentId, accessToken } = req.body as ExtractPdfRequest;

    // Validate input
    if (!messageId || !attachmentId || !accessToken) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: messageId, attachmentId, accessToken'
      });
      return;
    }

    // Extract PDF
    const result = await extractPdfFromGmail(messageId, attachmentId, accessToken);

    // Return response
    if (result.success) {
      res.status(200).json({
        success: true,
        text: result.text,
        debugPath: result.debugPath
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Handler error: ${errorMessage}`);
    
    res.status(500).json({
      success: false,
      error: `Server error: ${errorMessage}`
    });
  }
};
