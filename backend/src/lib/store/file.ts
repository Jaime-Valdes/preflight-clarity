/*
 * Local JSON file store — the development fallback when Supabase isn't
 * configured (DATA_FILE=./data/responses.json). Not for real data: the file
 * disappears on redeploy and nothing backs it up.
 *
 * Format: one JSON object keyed by sessionId, pretty-printed so it is easy
 * to inspect. Every write goes through an in-process queue (so concurrent
 * saves never interleave) and lands atomically (temp file + rename), so a
 * crash mid-write can't leave a torn file behind.
 */
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SessionRecord } from "@preflight/shared/types";
import { sortNewestFirst, type ResponseStore } from "./types";

export interface FileStore extends ResponseStore {
  /** Absolute path of the JSON file. */
  readonly path: string;
}

type Records = Record<string, SessionRecord>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(err: unknown): boolean {
  return isObject(err) && err.code === "ENOENT";
}

/** A store for `file` (resolved against the current working directory). */
export function createFileStore(file: string): FileStore {
  const path = resolve(process.cwd(), file);

  // Serializes all reads and writes: each task starts once the previous one settles.
  let queue: Promise<unknown> = Promise.resolve();
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  let tempCounter = 0;

  async function readAll(): Promise<Records> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (err) {
      if (isMissingFile(err)) return {};
      throw err;
    }
    if (raw.trim() === "") return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Data file ${path} is not valid JSON`);
    }
    if (!isObject(parsed)) throw new Error(`Data file ${path} must contain a JSON object keyed by sessionId`);
    return parsed as Records;
  }

  async function writeAll(records: Records): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    tempCounter += 1;
    const temp = `${path}.${process.pid}.${tempCounter}.tmp`;
    try {
      await writeFile(temp, `${JSON.stringify(records, null, 2)}\n`, "utf8");
      await rename(temp, path);
    } catch (err) {
      await unlink(temp).catch(() => undefined);
      throw err;
    }
  }

  return {
    path,

    upsert(record) {
      return serialize(async () => {
        const records = await readAll();
        const existing = Object.hasOwn(records, record.sessionId) ? records[record.sessionId] : undefined;
        if (existing && record.seq < existing.seq) return; // stale: a newer copy is already stored
        records[record.sessionId] = { ...record, createdAt: existing?.createdAt ?? record.createdAt };
        await writeAll(records);
      });
    },

    list() {
      return serialize(async () => sortNewestFirst(Object.values(await readAll())));
    },
  };
}
