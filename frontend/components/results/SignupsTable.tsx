"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { signupsToCsv, sortSignupsNewestFirst } from "@preflight/shared/signup";
import type { Signup } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import { PLACEMENT_LABELS, SOURCE_LABELS } from "./InterestBlock";
import { Block, EmptyNote, formatDateTime } from "./bits";
import { downloadCsv } from "./download";

const PAGE = 30;

const COLUMNS = ["Date", "Name", "Email", "Source", "Placement", "Variant", "Context", "Interview"] as const;

function Row({ signup }: { signup: Signup }) {
  const cell = "px-2.5 py-2.5 align-middle whitespace-nowrap";
  return (
    <tr className="border-t border-line/70">
      <td className={cn(cell, "pl-2 tabular-nums")}>{formatDateTime(signup.createdAt)}</td>
      <td className={cn(cell, "max-w-40 truncate text-ink-700")} title={signup.firstName || undefined}>
        {signup.firstName || <span className="text-ink-400">—</span>}
      </td>
      <td className={cn(cell, "max-w-64 truncate text-ink-900")} title={signup.email}>
        <span className="select-all">{signup.email}</span>
      </td>
      <td className={cell}>
        <span className="flex items-center gap-1">
          <Pill tone={signup.source === "study" ? "breeze" : "dusk"}>{SOURCE_LABELS[signup.source]}</Pill>
          {signup.isTest ? <Pill tone="dusk">Test</Pill> : null}
        </span>
      </td>
      <td className={cn(cell, "text-ink-700")}>{PLACEMENT_LABELS[signup.placement]}</td>
      <td className={cell}>
        {signup.variant ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-canvas text-xs font-bold text-ink-900 ring-1 ring-inset ring-line">
              {signup.variant}
            </span>
            {signup.participant ? <span className="max-w-32 truncate text-xs text-ink-400">{signup.participant}</span> : null}
          </span>
        ) : (
          <span className="text-ink-400">—</span>
        )}
      </td>
      <td className={cn(cell, "max-w-72 truncate text-ink-700")} title={signup.context || signup.page || undefined}>
        {signup.context || <span className="text-ink-400">{signup.page || "—"}</span>}
      </td>
      <td className={cn(cell, "pr-2 text-ink-700")}>{signup.interview ? "Yes" : <span className="text-ink-400">—</span>}</td>
    </tr>
  );
}

/** Every sign-up in the current slice, newest first, with the leads CSV. */
export function SignupsTable({ signups, className }: { signups: Signup[]; className?: string }) {
  const [limit, setLimit] = useState(PAGE);
  const rows = sortSignupsNewestFirst(signups);
  const visible = rows.slice(0, limit);

  return (
    <Block
      id="signups"
      className={className}
      title="Sign-ups"
      subtitle={`${rows.length} ${rows.length === 1 ? "sign-up" : "sign-ups"} in this slice, newest first. Scroll sideways on small screens.`}
      aside={
        <Button
          variant="secondary"
          size="md"
          icon={<Download aria-hidden className="size-4" />}
          onClick={() => downloadCsv(signupsToCsv(rows), "preflight-clarity-signups")}
          disabled={rows.length === 0}
        >
          Download sign-ups CSV
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyNote>No sign-ups match these filters yet.</EmptyNote>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 [scrollbar-width:thin]">
          <table className="w-full min-w-[960px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {COLUMNS.map((c, i) => (
                  <th key={c} scope="col" className={cn("whitespace-nowrap px-2.5 pb-2 pt-1 font-semibold", i === 0 && "pl-2", i === COLUMNS.length - 1 && "pr-2")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <Row key={s.id} signup={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((n) => n + PAGE)}
            className="h-11 rounded-full px-5 text-sm font-semibold text-breeze-700 ring-1 ring-inset ring-line-strong hover:bg-breeze-50"
          >
            Show {Math.min(PAGE, rows.length - limit)} more
          </button>
        </div>
      ) : null}
      <p className="text-xs text-ink-400">
        Variant shows the study session’s arm and its ?p= label · Context = what they were looking at when they signed up (version C), else the page · Interview = ticked “open to a 15-minute chat”. The CSV has every column, including session id.
      </p>
    </Block>
  );
}
