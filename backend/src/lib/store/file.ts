/*
 * Local JSON file store — the development fallback when Supabase isn't
 * configured (DATA_FILE=./data/responses.json). Not for real data: the files
 * disappear on redeploy and nothing backs them up.
 *
 * Format: one pretty-printed JSON object per file, so it is easy to inspect.
 * Session records live in DATA_FILE keyed by sessionId; product-interest
 * sign-ups (docs/INTEREST.md) in a sibling signups.json keyed by
 * "email_key|source" (signupKey in shared/src/signup.ts) — one entry per email
 * per source, like the Supabase table. Every write goes through one in-process
 * queue (so concurrent saves never interleave) and lands atomically (temp file
 * + rename), so a crash mid-write can't leave a torn file behind.
 */
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { signupKey, sortSignupsNewestFirst } from "@preflight/shared/signup";
import type { SessionRecord, Signup } from "@preflight/shared/types";
import { sortNewestFirst, type ResponseStore } from "./types";

/** Name of the sign-up file, created next to DATA_FILE. */
export const SIGNUPS_FILE = "signups.json";

export interface FileStore extends ResponseStore {
  /** Absolute path of the session-record JSON file. */
  readonly path: string;
  /** Absolute path of the sign-up JSON file (next to `path`). */
  readonly signupsPath: string;
}

type Keyed<T> = Record<string, T>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(err: unknown): boolean {
  return isObject(err) && err.code === "ENOENT";
}

/** A store for `file` (resolved against the current working directory). */
export function createFileStore(file: string): FileStore {
  const path = resolve(process.cwd(), file);
  const signupsPath = join(dirname(path), SIGNUPS_FILE);

  // Serializes all reads and writes, both files: each task starts once the previous one settles.
  let queue: Promise<unknown> = Promise.resolve();
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  let tempCounter = 0;

  /** The whole of `target` as an object keyed by `key` (named in errors); {} when it does not exist yet. */
  async function readAll<T>(target: string, key: string): Promise<Keyed<T>> {
    let raw: string;
    try {
      raw = await readFile(target, "utf8");
    } catch (err) {
      if (isMissingFile(err)) return {};
      throw err;
    }
    if (raw.trim() === "") return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Data file ${target} is not valid JSON`);
    }
    if (!isObject(parsed)) throw new Error(`Data file ${target} must contain a JSON object keyed by ${key}`);
    return parsed as Keyed<T>;
  }

  async function writeAll(target: string, entries: Keyed<unknown>): Promise<void> {
    await mkdir(dirname(target), { recursive: true });
    tempCounter += 1;
    const temp = `${target}.${process.pid}.${tempCounter}.tmp`;
    try {
      await writeFile(temp, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
      await rename(temp, target);
    } catch (err) {
      await unlink(temp).catch(() => undefined);
      throw err;
    }
  }

  const readRecords = () => readAll<SessionRecord>(path, "sessionId");
  const readSignups = () => readAll<Signup>(signupsPath, "email_key|source");

  return {
    path,
    signupsPath,

    upsert(record) {
      return serialize(async () => {
        const records = await readRecords();
        const existing = Object.hasOwn(records, record.sessionId) ? records[record.sessionId] : undefined;
        if (existing && record.seq < existing.seq) return; // stale: a newer copy is already stored
        records[record.sessionId] = { ...record, createdAt: existing?.createdAt ?? record.createdAt };
        await writeAll(path, records);
      });
    },

    list() {
      return serialize(async () => sortNewestFirst(Object.values(await readRecords())));
    },

    upsertSignup(signup) {
      return serialize(async () => {
        const signups = await readSignups();
        const key = signupKey(signup);
        const existing = Object.hasOwn(signups, key) ? signups[key] : undefined;
        // The database refuses an id that already belongs to another email (primary key); mirror it so the bug shows up in development.
        if (Object.entries(signups).some(([k, s]) => k !== key && s.id === signup.id)) {
          throw new Error(`Sign-up ${signup.id} already belongs to another email`);
        }
        // A repeat keeps the original createdAt and never loses what the first sign-up said: the forms
        // start blank, so an empty name or an unticked interview box on the repeat means "not asked
        // again", not "take me off". Same rule as the Supabase trigger (schema.sql).
        signups[key] = {
          ...signup,
          createdAt: existing?.createdAt ?? signup.createdAt,
          firstName: signup.firstName || existing?.firstName || "",
          interview: signup.interview || existing?.interview === true,
        };
        await writeAll(signupsPath, signups);
      });
    },

    listSignups() {
      return serialize(async () => sortSignupsNewestFirst(Object.values(await readSignups())));
    },
  };
}
