import { GmailHeader } from '../types/email.types';

export const extractHeaders = (headers: GmailHeader[]) => {
  const headerMap = new Map<string, string>();

  for (const header of headers) {
    const lowerName = header.name.toLowerCase();
    headerMap.set(lowerName, header.value);
  }

  return {
    subject: headerMap.get('subject') || '',
    from: headerMap.get('from') || '',
    to: headerMap.get('to') || '',
    date: headerMap.get('date') || '',
  };
};
