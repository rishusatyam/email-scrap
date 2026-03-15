import * as cheerio from 'cheerio';

export const cleanHtml = (html: string): string => {
  if (!html) return '';

  const $ = cheerio.load(html, {
    decodeEntities: true,
  });

  $('script').remove();
  $('style').remove();
  $('img').replaceWith('[image]');
  $('svg').remove();
  $('footer').remove();
  $('.gmail_signature').remove();

  $('br').replaceWith('\n');
  $('div').append('\n');
  $('p').append('\n');
  $('tr').append('\n');
  
  $('table').each((_, table) => {
    $(table).find('tr').each((_, row) => {
      const cells: string[] = [];
      $(row).find('td, th').each((_, cell) => {
        const cellText = $(cell).text().trim();
        if (cellText) {
          cells.push(cellText);
        }
      });
      if (cells.length > 0) {
        $(row).replaceWith(cells.join(' | ') + '\n');
      }
    });
  });

  let text = $('body').text();

  const forwardedPatterns = [
    /[-]{5,}\s*Forwarded message\s*[-]{5,}/gi,
    /[-]{5,}\s*Original Message\s*[-]{5,}/gi,
    /Begin forwarded message/gi,
    /From:.*?To:.*?Subject:/gi
  ];

  let lastForwardedIndex = -1;

  for (const pattern of forwardedPatterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      if (lastMatch.index !== undefined && lastMatch.index > lastForwardedIndex) {
        lastForwardedIndex = lastMatch.index;
      }
    }
  }

  if (lastForwardedIndex !== -1) {
    text = text.substring(lastForwardedIndex);
  }

  text = text.replace(/[-]{5,}\s*Forwarded message\s*[-]{5,}/gi, '---------- Forwarded message ---------');

  const footerPatterns = [
    /unsubscribe/gi,
    /privacy\s+(policy|notice)/gi,
    /terms\s+apply/gi,
    /copyright\s+©/gi,
    /do\s+not\s+reply/gi
  ];

  const lines = text.split('\n');
  const cleanedLines: string[] = [];
  let skipBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    const hasFooterPattern = footerPatterns.some(pattern => pattern.test(line));
    
    if (hasFooterPattern) {
      skipBlock = true;
    }
    
    if (!skipBlock) {
      cleanedLines.push(line);
    }
    
    if (skipBlock && line.trim() === '' && i < lines.length - 1) {
      const nextLine = lines[i + 1];
      if (nextLine.trim() !== '' && !footerPatterns.some(p => p.test(nextLine))) {
        skipBlock = false;
      }
    }
  }

  text = cleanedLines.join('\n');

  text = text.replace(/\[image:[^\]]+\]/gi, '[image]');
  text = text.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '');
  text = text.replace(/cid:[^\s]+/g, '');
  text = text.replace(/utm_[a-z]+=[^\s&]+/g, '');
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');

  const stopPhrases = [
    'Online Cancellation',
    'Important Terms',
    'Terms & Conditions',
    'Terms and Conditions',
    'Cancellation Policy'
  ];

  for (const phrase of stopPhrases) {
    const index = text.indexOf(phrase);
    if (index !== -1) {
      text = text.substring(0, index);
      break;
    }
  }

  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\r/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/\s+/g, ' ');
  text = text.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
  text = text.trim();

  return text;
};
