/*
 * A minimal NetCDF-3 reader (classic and 64-bit offset formats), enough for NOAA MADIS's hourly
 * ACARS files (docs/REAL_DATA.md, "Status: route history from MADIS"): the header, then one
 * variable at a time, for all records or for a chosen few. No dependencies; the files are
 * untrusted downloads, so every offset is checked against the buffer before it is read.
 */

/** NetCDF-3 external types: byte, char, short, int, float, double. */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 4, 6: 8 };
const NC_DIMENSION = 10;
const NC_VARIABLE = 11;
const NC_ATTRIBUTE = 12;

export interface NcDim {
  name: string;
  /** 0 for the record (unlimited) dimension. */
  len: number;
}

export interface NcVar {
  name: string;
  dims: NcDim[];
  type: number;
  vsize: number;
  begin: number;
  /** A record variable: one slice per record, interleaved with the other record variables. */
  rec: boolean;
  attrs: Record<string, string | number[]>;
}

export interface NcFile {
  numrecs: number;
  vars: Record<string, NcVar>;
  /** Bytes from one record to the next. */
  recsize: number;
  buf: Buffer;
}

const pad4 = (n: number) => (4 - (n % 4)) % 4;

/** Parses the header; throws on anything that is not a well-formed NetCDF-3 file. */
export function openNetcdf(buf: Buffer): NcFile {
  if (buf.length < 8 || buf.toString("latin1", 0, 3) !== "CDF") throw new Error("not a NetCDF-3 file");
  const version = buf[3];
  if (version !== 1 && version !== 2) throw new Error(`NetCDF-3 version ${version} is not supported`);
  let p = 4;
  const need = (n: number) => {
    if (p + n > buf.length) throw new Error("NetCDF header runs past the end of the file");
  };
  const u32 = () => {
    need(4);
    const v = buf.readUInt32BE(p);
    p += 4;
    return v;
  };
  const name = () => {
    const n = u32();
    need(n);
    const s = buf.toString("latin1", p, p + n);
    p += n + pad4(n);
    return s;
  };
  const values = (type: number, len: number): string | number[] => {
    const size = TYPE_SIZE[type];
    if (!size) throw new Error(`unknown NetCDF type ${type}`);
    const bytes = size * len;
    need(bytes);
    const out = type === 2 ? buf.toString("latin1", p, p + len).replace(/\0+$/, "") : readValues(buf, p, type, len);
    p += bytes + pad4(bytes);
    return out;
  };
  const attrs = () => {
    const out: Record<string, string | number[]> = {};
    const tag = u32();
    const n = u32();
    if (tag === NC_ATTRIBUTE) {
      for (let i = 0; i < n; i++) {
        const key = name();
        const type = u32();
        out[key] = values(type, u32());
      }
    }
    return out;
  };

  const numrecs = u32();
  const dims: NcDim[] = [];
  {
    const tag = u32();
    const n = u32();
    if (tag === NC_DIMENSION) for (let i = 0; i < n; i++) dims.push({ name: name(), len: u32() });
  }
  attrs(); // global attributes
  const vars: Record<string, NcVar> = {};
  {
    const tag = u32();
    const n = u32();
    if (tag === NC_VARIABLE) {
      for (let i = 0; i < n; i++) {
        const vn = name();
        const nd = u32();
        const vd: NcDim[] = [];
        for (let j = 0; j < nd; j++) {
          const d = dims[u32()];
          if (!d) throw new Error(`variable ${vn}: unknown dimension`);
          vd.push(d);
        }
        const at = attrs();
        const type = u32();
        const vsize = u32();
        let begin: number;
        if (version === 2) {
          need(8);
          begin = Number(buf.readBigUInt64BE(p));
          p += 8;
        } else begin = u32();
        vars[vn] = { name: vn, dims: vd, type, vsize, begin, rec: vd.length > 0 && vd[0].len === 0, attrs: at };
      }
    }
  }
  const recVars = Object.values(vars).filter((v) => v.rec);
  // With a single record variable the records are packed without padding.
  const recsize = recVars.length === 1 ? innerCount(recVars[0]) * TYPE_SIZE[recVars[0].type] : recVars.reduce((s, v) => s + v.vsize, 0);
  return { numrecs, vars, recsize, buf };
}

function innerCount(v: NcVar): number {
  return v.dims.slice(v.rec ? 1 : 0).reduce((s, d) => s * d.len, 1);
}

function readValues(buf: Buffer, p: number, type: number, len: number): number[] {
  const out: number[] = new Array(len);
  const size = TYPE_SIZE[type];
  for (let i = 0; i < len; i++) {
    const q = p + i * size;
    out[i] = type === 1 ? buf.readInt8(q) : type === 2 ? buf[q] : type === 3 ? buf.readInt16BE(q) : type === 4 ? buf.readInt32BE(q) : type === 5 ? buf.readFloatBE(q) : buf.readDoubleBE(q);
  }
  return out;
}

function recordVar(f: NcFile, name: string): NcVar {
  const v = f.vars[name];
  if (!v) throw new Error(`no variable ${name}`);
  if (!v.rec) throw new Error(`${name} is not a record variable`);
  const last = v.begin + Math.max(0, f.numrecs - 1) * f.recsize + innerCount(v) * TYPE_SIZE[v.type];
  if (f.numrecs > 0 && last > f.buf.length) throw new Error(`${name} runs past the end of the file`);
  return v;
}

/** A numeric record variable with one value per record (all records, or the given ones), fill values as NaN. */
export function readNumbers(f: NcFile, name: string, rows?: ArrayLike<number>): Float64Array {
  const v = recordVar(f, name);
  if (v.type === 2 || innerCount(v) !== 1) throw new Error(`${name} is not a numeric scalar per record`);
  const fills = new Set<number>();
  for (const key of ["_FillValue", "missing_value"]) {
    const a = v.attrs[key];
    if (Array.isArray(a)) for (const x of a) fills.add(x);
  }
  const count = rows ? rows.length : f.numrecs;
  const out = new Float64Array(count);
  const { buf, recsize } = f;
  for (let i = 0; i < count; i++) {
    const r = rows ? rows[i] : i;
    const q = v.begin + r * recsize;
    const x = v.type === 5 ? buf.readFloatBE(q) : v.type === 6 ? buf.readDoubleBE(q) : v.type === 4 ? buf.readInt32BE(q) : v.type === 3 ? buf.readInt16BE(q) : buf.readInt8(q);
    out[i] = fills.has(x) ? Number.NaN : x;
  }
  return out;
}

/** A character record variable (a fixed-length string per record), cut at the first NUL and trimmed. */
export function readStrings(f: NcFile, name: string, rows?: ArrayLike<number>): string[] {
  const v = recordVar(f, name);
  if (v.type !== 2) throw new Error(`${name} is not a character variable`);
  const len = innerCount(v);
  const count = rows ? rows.length : f.numrecs;
  const out: string[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const r = rows ? rows[i] : i;
    const q = v.begin + r * f.recsize;
    let end = q;
    while (end < q + len && f.buf[end] !== 0) end++;
    out[i] = f.buf.toString("latin1", q, end).trim();
  }
  return out;
}
