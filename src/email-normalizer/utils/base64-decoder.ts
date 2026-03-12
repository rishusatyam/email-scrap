export const decodeBase64 = (data: string): string => {
  try {
    const urlSafeData = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(urlSafeData, 'base64').toString('utf-8');
  } catch (error) {
    console.error('[Base64Decoder] Failed to decode base64:', error);
    return '';
  }
};

export const isQuotedPrintable = (headers?: Array<{ name: string; value: string }>): boolean => {
  if (!headers) return false;
  
  const encoding = headers.find(
    h => h.name.toLowerCase() === 'content-transfer-encoding'
  );
  
  return encoding?.value.toLowerCase().includes('quoted-printable') || false;
};

export const decodeQuotedPrintable = (text: string): string => {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
};
