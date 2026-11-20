/*
 * Just enough of the ZIP format to stream one member out of a BTS monthly download
 * (docs/REAL_DATA.md, "Status: airline on-time from BTS"): the central directory names the member,
 * its method (stored or deflate) and where its bytes start; the bytes go through zlib's raw
 * inflate as a stream, so a 250 MB CSV is never held in memory. No ZIP64, no encryption, no
 * multi-disk archives: a BTS month is one ~30 MB archive with one CSV and a readme.
 */
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";

export interface ZipMember {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
/** The end-of-central-directory record is 22 bytes plus a comment of at most 65,535. */
const EOCD_SEARCH = 22 + 0xffff;

/** Every member the archive's central directory lists. */
export async function listZip(path: string): Promise<ZipMember[]> {
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    const tailSize = Math.min(size, EOCD_SEARCH);
    const tail = Buffer.alloc(tailSize);
    await file.read(tail, 0, tailSize, size - tailSize);
    let at = -1;
    for (let i = tailSize - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === EOCD) {
        at = i;
        break;
      }
    }
    if (at < 0) throw new Error(`${path}: not a ZIP archive (no end of central directory)`);
    const count = tail.readUInt16LE(at + 10);
    const cdSize = tail.readUInt32LE(at + 12);
    const cdOffset = tail.readUInt32LE(at + 16);
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new Error(`${path}: ZIP64 archives are not supported`);
    const cd = Buffer.alloc(cdSize);
    await file.read(cd, 0, cdSize, cdOffset);
    const members: ZipMember[] = [];
    let p = 0;
    for (let n = 0; n < count; n += 1) {
      if (cd.readUInt32LE(p) !== CENTRAL) throw new Error(`${path}: damaged central directory`);
      const flags = cd.readUInt16LE(p + 8);
      if (flags & 1) throw new Error(`${path}: encrypted members are not supported`);
      const nameLength = cd.readUInt16LE(p + 28);
      const extraLength = cd.readUInt16LE(p + 30);
      const commentLength = cd.readUInt16LE(p + 32);
      const member: ZipMember = {
        method: cd.readUInt16LE(p + 10),
        compressedSize: cd.readUInt32LE(p + 20),
        size: cd.readUInt32LE(p + 24),
        localHeaderOffset: cd.readUInt32LE(p + 42),
        name: cd.toString(flags & 0x800 ? "utf8" : "latin1", p + 46, p + 46 + nameLength),
      };
      if (member.compressedSize === 0xffffffff || member.size === 0xffffffff || member.localHeaderOffset === 0xffffffff) {
        throw new Error(`${path}: ZIP64 members are not supported`);
      }
      members.push(member);
      p += 46 + nameLength + extraLength + commentLength;
    }
    return members;
  } finally {
    await file.close();
  }
}

/** The member's uncompressed bytes as a stream. */
export async function openZipMember(path: string, member: ZipMember): Promise<Readable> {
  if (member.method !== 0 && member.method !== 8) throw new Error(`${path}: ${member.name} uses compression method ${member.method}`);
  const file = await open(path, "r");
  let start: number;
  try {
    const header = Buffer.alloc(30);
    await file.read(header, 0, 30, member.localHeaderOffset);
    if (header.readUInt32LE(0) !== LOCAL) throw new Error(`${path}: damaged local header for ${member.name}`);
    start = member.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  } finally {
    await file.close();
  }
  if (member.compressedSize === 0) return Readable.from([]);
  const raw = createReadStream(path, { start, end: start + member.compressedSize - 1 });
  if (member.method === 0) return raw;
  const inflate = createInflateRaw();
  raw.on("error", (err) => inflate.destroy(err));
  return raw.pipe(inflate);
}

/** The archive's one CSV member, streamed (BTS zips hold the CSV and a readme.html). */
export async function openZipCsv(path: string): Promise<{ name: string; stream: Readable }> {
  const csv = (await listZip(path)).filter((m) => /\.csv$/i.test(m.name));
  if (csv.length !== 1) throw new Error(`${path}: expected one CSV member, found ${csv.length}`);
  return { name: csv[0]!.name, stream: await openZipMember(path, csv[0]!) };
}
