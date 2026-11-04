"use client";

import { ComparePage } from "@/components/c/compare/ComparePage";
import { DLoading } from "@/components/d/brand/Loading";
import { DCompareEmpty } from "./DCompareEmpty";
import { DCompareTable } from "./DCompareTable";

/**
 * /d/compare: version C's page (the compare list, the link form, removing,
 * d_compare_view, the sign-up card) with version D's table — the four ratings
 * in the visitor's order, no score ring, no timeline chart, and "I'd pick this
 * flight" per column (docs/ITERATION_2.md).
 */
export function DComparePage() {
  return (
    <ComparePage
      Table={DCompareTable}
      Empty={DCompareEmpty}
      note="Each flight is rated in plain words for what matters to you; tap a rating for how it is worked out. Airlines don’t publish who will fly a given flight, so “Who flies it” lists the rules every airline pilot meets. Open seats are as of today and change until check-in. All flights and prices are illustrative — nothing can be booked here."
      showScores={false}
      loading={<DLoading />}
    />
  );
}
