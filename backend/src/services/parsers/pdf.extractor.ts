import { inflateSync } from 'zlib';

interface PdfObject {
  body: string;
  stream: Buffer | null;
}

interface TextItem {
  y: number;
  x: number;
  text: string;
}

interface FontInfo {
  twoByte: boolean;
  cmap: Map<number, string>;
}

export function isPdfBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function loadPdfObjects(buffer: Buffer): Map<number, PdfObject> {
  const objs = new Map<number, PdfObject>();
  const latin = buffer.toString('latin1');
  const objRegex = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g;
  let match: RegExpExecArray | null;

  while ((match = objRegex.exec(latin)) !== null) {
    const num = parseInt(match[1], 10);
    const fullBody = match[2];
    const streamMatch = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(fullBody);
    let body = fullBody;
    let stream: Buffer | null = null;

    if (streamMatch) {
      const rawStart = match.index + match[0].indexOf(streamMatch[1]);
      const rawEnd = rawStart + streamMatch[1].length;
      const rawBuf = buffer.subarray(rawStart, rawEnd);
      body = fullBody.slice(0, streamMatch.index);
      try {
        stream = inflateSync(rawBuf);
      } catch {
        stream = rawBuf;
      }
    }

    objs.set(num, { body, stream });
  }

  return objs;
}

function parseToUnicodeCMap(cmapBuf: Buffer): Map<number, string> {
  const mapping = new Map<number, string>();
  const text = cmapBuf.toString('latin1');

  const bfCharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
  let block: RegExpExecArray | null;
  while ((block = bfCharRegex.exec(text)) !== null) {
    const pairRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let pair: RegExpExecArray | null;
    while ((pair = pairRegex.exec(block[1])) !== null) {
      const src = parseInt(pair[1], 16);
      const dstBuf = Buffer.from(pair[2], 'hex');
      const decoded = dstBuf.swap16().toString('utf16le');
      mapping.set(src, decoded);
    }
  }

  const bfRangeRegex = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((block = bfRangeRegex.exec(text)) !== null) {
    const rangeRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let r: RegExpExecArray | null;
    while ((r = rangeRegex.exec(block[1])) !== null) {
      const start = parseInt(r[1], 16);
      const end = parseInt(r[2], 16);
      const dstStart = parseInt(r[3], 16);
      for (let code = start; code <= end; code++) {
        mapping.set(code, String.fromCodePoint(dstStart + (code - start)));
      }
    }
  }

  return mapping;
}

function refTarget(body: string, key: string): number | null {
  const m = new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`).exec(body);
  return m ? parseInt(m[1], 10) : null;
}

function getFontMapsForPage(
  objs: Map<number, PdfObject>,
  pageBody: string,
): Map<string, FontInfo> {
  const fonts = new Map<string, FontInfo>();
  let resBody = pageBody;
  const resRef = refTarget(pageBody, 'Resources');
  if (resRef && objs.has(resRef)) {
    resBody = objs.get(resRef)!.body;
  }

  let fontDict: string | null = null;
  const fm = /\/Font\s*<<([\s\S]*?)>>/.exec(resBody);
  if (fm) {
    fontDict = fm[1];
  } else {
    const fref = refTarget(resBody, 'Font');
    if (fref && objs.has(fref)) {
      fontDict = objs.get(fref)!.body;
    }
  }

  if (!fontDict) return fonts;

  const entryRegex = /\/([A-Za-z0-9_.]+)\s+(\d+)\s+0\s+R/g;
  let entry: RegExpExecArray | null;
  while ((entry = entryRegex.exec(fontDict)) !== null) {
    const fontName = entry[1];
    const objNum = parseInt(entry[2], 10);
    const fObj = objs.get(objNum);
    if (!fObj) continue;

    const twoByte = fObj.body.includes('Identity-H');
    const toUnicodeRef = refTarget(fObj.body, 'ToUnicode');
    const cmap =
      toUnicodeRef && objs.get(toUnicodeRef)?.stream
        ? parseToUnicodeCMap(objs.get(toUnicodeRef)!.stream!)
        : new Map<number, string>();

    fonts.set(fontName, { twoByte, cmap });
  }

  return fonts;
}

function unescapePdfLiteral(raw: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    if (ch === 0x5c && i + 1 < raw.length) {
      const next = raw[i + 1];
      const map: Record<string, number> = {
        n: 10,
        r: 13,
        t: 9,
        b: 8,
        f: 12,
        '(': 40,
        ')': 41,
        '\\': 92,
      };
      if (map[next] !== undefined) {
        bytes.push(map[next]);
        i++;
      } else if (next >= '0' && next <= '7') {
        let oct = next;
        let j = i + 2;
        while (j < raw.length && oct.length < 3 && raw[j] >= '0' && raw[j] <= '7') {
          oct += raw[j];
          j++;
        }
        bytes.push(parseInt(oct, 8) & 0xff);
        i = j - 1;
      } else if (next === '\n' || next === '\r') {
        i++;
      } else {
        bytes.push(next.charCodeAt(0) & 0xff);
        i++;
      }
    } else {
      bytes.push(ch & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function decodePdfText(raw: Buffer, font: FontInfo): string {
  let out = '';
  if (font.twoByte) {
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const code = (raw[i] << 8) | raw[i + 1];
      out += font.cmap.get(code) ?? '?';
    }
  } else {
    for (let i = 0; i < raw.length; i++) {
      const code = raw[i];
      if (font.cmap.has(code)) {
        out += font.cmap.get(code)!;
      } else {
        out += Buffer.from([code]).toString('latin1');
      }
    }
  }
  return out;
}

type StackItem =
  | { kind: 'str'; val: Buffer }
  | { kind: 'num'; val: number }
  | { kind: 'name'; val: string }
  | { kind: 'arr'; val: StackItem[] }
  | { kind: '[' };

function extractPageItems(
  objs: Map<number, PdfObject>,
  pageBody: string,
): TextItem[] {
  const fonts = getFontMapsForPage(objs, pageBody);
  if (fonts.size === 0) return [];

  const refs: number[] = [];
  const arrMatch = /\/Contents\s*\[([\s\S]*?)\]/.exec(pageBody);
  if (arrMatch) {
    const rRegex = /(\d+)\s+0\s+R/g;
    let rm: RegExpExecArray | null;
    while ((rm = rRegex.exec(arrMatch[1])) !== null) {
      refs.push(parseInt(rm[1], 10));
    }
  } else {
    const single = refTarget(pageBody, 'Contents');
    if (single !== null) refs.push(single);
  }

  const streamChunks: string[] = [];
  for (const r of refs) {
    const s = objs.get(r)?.stream;
    if (s) streamChunks.push(s.toString('latin1'));
  }
  if (streamChunks.length === 0) return [];

  const streamText = streamChunks.join('\n');
  const tokenRegex =
    /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>|\[|\]|\/[^\s/\[\]()<>]+|[-+]?\d*\.?\d+|[A-Za-z'"*]+/g;

  const items: TextItem[] = [];
  let stack: StackItem[] = [];
  let currentFont: FontInfo | undefined;
  let x = 0;
  let y = 0;
  let lead = 0;
  let tokMatch: RegExpExecArray | null;

  while ((tokMatch = tokenRegex.exec(streamText)) !== null) {
    const tok = tokMatch[0];
    if (tok.startsWith('(')) {
      stack.push({ kind: 'str', val: unescapePdfLiteral(tok.slice(1, -1)) });
    } else if (tok.startsWith('<')) {
      const hex = tok.slice(1, -1).replace(/\s+/g, '');
      stack.push({
        kind: 'str',
        val: hex ? Buffer.from(hex, 'hex') : Buffer.alloc(0),
      });
    } else if (tok === '[') {
      stack.push({ kind: '[' });
    } else if (tok === ']') {
      const arr: StackItem[] = [];
      while (stack.length > 0 && stack[stack.length - 1].kind !== '[') {
        arr.push(stack.pop()!);
      }
      if (stack.length > 0) stack.pop();
      stack.push({ kind: 'arr', val: arr.reverse() });
    } else if (tok.startsWith('/')) {
      stack.push({ kind: 'name', val: tok.slice(1) });
    } else if (/^[-+]?\d*\.?\d+$/.test(tok)) {
      stack.push({ kind: 'num', val: parseFloat(tok) });
    } else {
      if (tok === 'Tf') {
        const names = stack.filter((s) => s.kind === 'name') as {
          kind: 'name';
          val: string;
        }[];
        if (names.length > 0) {
          currentFont = fonts.get(names[names.length - 1].val);
        }
      } else if (tok === 'Tm') {
        const nums = stack.filter((s) => s.kind === 'num') as {
          kind: 'num';
          val: number;
        }[];
        if (nums.length >= 6) {
          x = nums[nums.length - 2].val;
          y = nums[nums.length - 1].val;
        }
      } else if (tok === 'Td' || tok === 'TD') {
        const nums = stack.filter((s) => s.kind === 'num') as {
          kind: 'num';
          val: number;
        }[];
        if (nums.length >= 2) {
          x += nums[nums.length - 2].val;
          y += nums[nums.length - 1].val;
          if (tok === 'TD') lead = -nums[nums.length - 1].val;
        }
      } else if (tok === 'T*') {
        y -= lead;
      } else if (tok === 'Tj' || tok === "'") {
        const strs = stack.filter((s) => s.kind === 'str') as {
          kind: 'str';
          val: Buffer;
        }[];
        if (strs.length > 0 && currentFont) {
          items.push({
            y: Math.round(y * 10) / 10,
            x: Math.round(x * 10) / 10,
            text: decodePdfText(strs[strs.length - 1].val, currentFont),
          });
        }
      } else if (tok === 'TJ') {
        const arrs = stack.filter((s) => s.kind === 'arr') as {
          kind: 'arr';
          val: StackItem[];
        }[];
        if (arrs.length > 0 && currentFont) {
          let txt = '';
          for (const el of arrs[arrs.length - 1].val) {
            if (el.kind === 'str') {
              txt += decodePdfText(el.val, currentFont);
            }
          }
          items.push({
            y: Math.round(y * 10) / 10,
            x: Math.round(x * 10) / 10,
            text: txt,
          });
        }
      } else if (tok === 'BT') {
        x = 0;
        y = 0;
      }
      stack = [];
    }
  }

  return items;
}

function groupPageItemsToLines(
  items: TextItem[],
  separator: string,
  maxX?: number,
): string[] {
  const byY = new Map<number, TextItem[]>();
  for (const it of items) {
    if (maxX !== undefined && it.x >= maxX) continue;
    if (!it.text.trim()) continue;
    const existing = byY.get(it.y) || [];
    existing.push(it);
    byY.set(it.y, existing);
  }

  const ys = Array.from(byY.keys()).sort((a, b) => b - a);
  const lines: string[] = [];
  for (const y of ys) {
    const rowItems = byY.get(y)!.sort((a, b) => a.x - b.x);
    lines.push(rowItems.map((i) => i.text.trim()).join(separator));
  }
  return lines;
}

export function extractPdfText(buffer: Buffer, banco: string): string {
  const objs = loadPdfObjects(buffer);
  const pageBodies: string[] = [];

  for (const [, obj] of Array.from(objs.entries()).sort((a, b) => a[0] - b[0])) {
    if (/\/Type\s*\/Page(?![a-zA-Z])/.test(obj.body)) {
      pageBodies.push(obj.body);
    }
  }

  const pagesItems = pageBodies.map((pb) => extractPageItems(objs, pb));
  const totalItems = pagesItems.reduce((acc, p) => acc + p.length, 0);
  if (totalItems === 0) {
    return '';
  }

  const bancoUpper = (banco || '').toUpperCase();
  if (bancoUpper === 'BRADESCO') {
    const allLines: string[] = [];
    pagesItems.forEach((items, idx) => {
      // Na página 1 lemos tudo (para capturar Vencimento e Resumo);
      // Nas páginas 2+ filtramos x < 355 para isolar a coluna esquerda de Lançamentos.
      const maxX = idx === 0 ? undefined : 355;
      allLines.push(...groupPageItemsToLines(items, ' ', maxX));
    });
    return allLines.join('\n');
  }

  // Padrão para Banco do Brasil (Ourocard) e outros
  const allLines: string[] = [];
  for (const items of pagesItems) {
    allLines.push(...groupPageItemsToLines(items, ' | '));
  }
  return allLines.join('\n');
}

