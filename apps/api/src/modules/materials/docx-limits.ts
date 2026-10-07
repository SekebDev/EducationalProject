import { inflateRawSync } from 'node:zlib';

// Check real expansion, not only ZIP size claims, before Mammoth loads XML.
export function validateDocxArchive(data: Uint8Array): void {
  const bytes = Buffer.from(data);
  const fail = (): never => {
    throw new Error('DOCX_ARCHIVE_LIMIT');
  };
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 65_557);
    offset--
  ) {
    if (
      bytes.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) fail();
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16);
  const directoryEnd = offset + directorySize;
  if (
    bytes.readUInt32LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 8) !== count ||
    count < 1 ||
    count > 200 ||
    directoryEnd !== end
  )
    fail();
  let total = 0;
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (offset + 46 > directoryEnd || bytes.readUInt32LE(offset) !== 0x02014b50)
      fail();
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const expanded = bytes.readUInt32LE(offset + 24);
    const nameSize = bytes.readUInt16LE(offset + 28);
    const extraSize = bytes.readUInt16LE(offset + 30);
    const commentSize = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      expanded > 8_000_000 ||
      total + expanded > 8_000_000 ||
      local + 30 > offset ||
      offset + 46 + nameSize + extraSize + commentSize > directoryEnd ||
      bytes.readUInt16LE(offset + 34) !== 0
    )
      fail();
    const name = bytes.subarray(offset + 46, offset + 46 + nameSize);
    const nameText = name.toString('utf8');
    if (
      names.has(nameText) ||
      nameText.includes('..') ||
      nameText.includes('\\') ||
      nameText.startsWith('/')
    )
      fail();
    names.add(nameText);
    if (
      bytes.readUInt32LE(local) !== 0x04034b50 ||
      bytes.readUInt16LE(local + 8) !== method ||
      bytes.readUInt16LE(local + 6) !== flags ||
      bytes.readUInt16LE(local + 26) !== nameSize
    )
      fail();
    const start = local + 30 + nameSize + bytes.readUInt16LE(local + 28);
    if (
      start + compressed > bytes.readUInt32LE(end + 16) ||
      !bytes.subarray(local + 30, local + 30 + nameSize).equals(name)
    )
      fail();
    const packed = bytes.subarray(start, start + compressed);
    const unpacked =
      method === 0
        ? packed
        : inflateRawSync(packed, { maxOutputLength: 8_000_000 });
    if (unpacked.length !== expanded) fail();
    total += unpacked.length;
    offset += 46 + nameSize + extraSize + commentSize;
  }
  if (offset !== directoryEnd || !names.has('word/document.xml')) fail();
}
