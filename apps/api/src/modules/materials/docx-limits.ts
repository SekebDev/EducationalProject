import { inflateRawSync } from 'node:zlib';

// Check real expansion, not only ZIP size claims, before Mammoth loads XML.
export function validateDocxArchive(data: Uint8Array): void {
  const bytes = Buffer.from(data);
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
  if (end < 0) {
    fail();
  }
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
  ) {
    fail();
  }
  let total = 0;
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    const entry = validateEntry(
      bytes,
      offset,
      directoryEnd,
      bytes.readUInt32LE(end + 16),
    );
    if (names.has(entry.name) || total + entry.expanded > 8_000_000) {
      fail();
    }
    names.add(entry.name);
    total += entry.expanded;
    offset = entry.nextOffset;
  }
  if (offset !== directoryEnd || !names.has('word/document.xml')) {
    fail();
  }
}

function fail(): never {
  throw new Error('DOCX_ARCHIVE_LIMIT');
}

function validateEntry(
  bytes: Buffer,
  offset: number,
  directoryEnd: number,
  directoryStart: number,
) {
  if (offset + 46 > directoryEnd || bytes.readUInt32LE(offset) !== 0x02014b50) {
    fail();
  }
  const flags = bytes.readUInt16LE(offset + 8);
  const method = bytes.readUInt16LE(offset + 10);
  const compressed = bytes.readUInt32LE(offset + 20);
  const expanded = bytes.readUInt32LE(offset + 24);
  const nameSize = bytes.readUInt16LE(offset + 28);
  const nextOffset =
    offset +
    46 +
    nameSize +
    bytes.readUInt16LE(offset + 30) +
    bytes.readUInt16LE(offset + 32);
  const local = bytes.readUInt32LE(offset + 42);
  if (
    flags & 1 ||
    ![0, 8].includes(method) ||
    expanded > 8_000_000 ||
    local + 30 > offset ||
    nextOffset > directoryEnd ||
    bytes.readUInt16LE(offset + 34) !== 0
  ) {
    fail();
  }
  const name = bytes.subarray(offset + 46, offset + 46 + nameSize);
  const nameText = name.toString('utf8');
  if (
    nameText.includes('..') ||
    nameText.includes('\\') ||
    nameText.startsWith('/')
  ) {
    fail();
  }
  validateLocalEntry(
    bytes,
    local,
    name,
    flags,
    method,
    compressed,
    expanded,
    directoryStart,
  );
  return { name: nameText, expanded, nextOffset };
}

function validateLocalEntry(
  bytes: Buffer,
  local: number,
  name: Buffer,
  flags: number,
  method: number,
  compressed: number,
  expanded: number,
  directoryStart: number,
) {
  if (
    bytes.readUInt32LE(local) !== 0x04034b50 ||
    bytes.readUInt16LE(local + 8) !== method ||
    bytes.readUInt16LE(local + 6) !== flags ||
    bytes.readUInt16LE(local + 26) !== name.length
  ) {
    fail();
  }
  const start = local + 30 + name.length + bytes.readUInt16LE(local + 28);
  if (
    start + compressed > directoryStart ||
    !bytes.subarray(local + 30, local + 30 + name.length).equals(name)
  ) {
    fail();
  }
  const packed = bytes.subarray(start, start + compressed);
  const unpacked =
    method === 0
      ? packed
      : inflateRawSync(packed, { maxOutputLength: 8_000_000 });
  if (unpacked.length !== expanded) {
    fail();
  }
}
