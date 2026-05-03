/**
 * @jest-environment node
 *
 * Pure-function tests for the retrieval scorer. Does not hit Postgres.
 */
import { computeScore, fuseAndScore } from "@/lib/rag/retrieve"
import type { MatchRagItemRow } from "@/lib/rag/types"

const mkRow = (overrides: Partial<MatchRagItemRow>): MatchRagItemRow => ({
  id: "r1",
  source_type: "design",
  source_id: "d1",
  content: "hi",
  source_title: "Design",
  source_url: "/d/1",
  source_section: null,
  metadata: {},
  source_updated_at: null,
  similarity: 0,
  bm25_rank: 0,
  age_days: 0,
  ...overrides
})

describe("computeScore", () => {
  test("RRF combines dense + sparse with k=60", () => {
    const onlyDense = computeScore({
      denseRank: 1,
      bm25Rank: null,
      ageDays: 0,
      sourceType: "design"
    })
    const onlySparse = computeScore({
      denseRank: null,
      bm25Rank: 1,
      ageDays: 0,
      sourceType: "design"
    })
    const both = computeScore({
      denseRank: 1,
      bm25Rank: 1,
      ageDays: 0,
      sourceType: "design"
    })
    // 1/(60+1) ≈ 0.01639
    expect(onlyDense).toBeCloseTo(1 / 61, 5)
    expect(onlySparse).toBeCloseTo(1 / 61, 5)
    expect(both).toBeCloseTo(2 / 61, 5)
  })

  test("recency boost halves at 90-day half-life", () => {
    const fresh = computeScore({
      denseRank: 1,
      bm25Rank: null,
      ageDays: 0,
      sourceType: "design"
    })
    const aged = computeScore({
      denseRank: 1,
      bm25Rank: null,
      ageDays: 90,
      sourceType: "design"
    })
    expect(aged / fresh).toBeCloseTo(Math.exp(-1), 4)
  })

  test("chat_message gets 0.7 multiplier", () => {
    const design = computeScore({
      denseRank: 1,
      bm25Rank: null,
      ageDays: 0,
      sourceType: "design"
    })
    const chat = computeScore({
      denseRank: 1,
      bm25Rank: null,
      ageDays: 0,
      sourceType: "chat_message"
    })
    expect(chat / design).toBeCloseTo(0.7, 4)
  })

  test("missing both ranks scores zero", () => {
    expect(
      computeScore({
        denseRank: null,
        bm25Rank: null,
        ageDays: 0,
        sourceType: "file"
      })
    ).toBe(0)
  })
})

describe("fuseAndScore", () => {
  test("ranks by combined score, slices to sourceCount", () => {
    const rows: MatchRagItemRow[] = [
      mkRow({ id: "a", similarity: 0.9, bm25_rank: 0.0 }),
      mkRow({ id: "b", similarity: 0.7, bm25_rank: 0.5 }),
      mkRow({ id: "c", similarity: 0.0, bm25_rank: 0.9 }),
      mkRow({ id: "d", similarity: 0.4, bm25_rank: 0.3 })
    ]
    const top2 = fuseAndScore(rows, 2)
    expect(top2.length).toBe(2)
    // b should win — has both signals (rank-1 sparse, rank-2 dense)
    expect(top2[0].id).toBe("b")
  })

  test("recency demotes older docs over equally-relevant fresh ones", () => {
    const rows: MatchRagItemRow[] = [
      mkRow({ id: "fresh", similarity: 0.5, bm25_rank: 0.5, age_days: 0 }),
      mkRow({ id: "old", similarity: 0.5, bm25_rank: 0.5, age_days: 365 })
    ]
    const ranked = fuseAndScore(rows, 2)
    expect(ranked[0].id).toBe("fresh")
    expect(ranked[1].id).toBe("old")
  })

  test("chat_message penalty: equally-ranked design beats chat", () => {
    const rows: MatchRagItemRow[] = [
      mkRow({
        id: "design",
        source_type: "design",
        similarity: 0.5,
        bm25_rank: 0.5
      }),
      mkRow({
        id: "chat",
        source_type: "chat_message",
        similarity: 0.5,
        bm25_rank: 0.5
      })
    ]
    const ranked = fuseAndScore(rows, 2)
    expect(ranked[0].id).toBe("design")
    expect(ranked[1].id).toBe("chat")
  })

  test("rows with no signals on either side score 0 and rank last", () => {
    const rows: MatchRagItemRow[] = [
      mkRow({ id: "scored", similarity: 0.1, bm25_rank: 0 }),
      mkRow({ id: "noisy", similarity: 0, bm25_rank: 0 })
    ]
    const ranked = fuseAndScore(rows, 5)
    expect(ranked[0].id).toBe("scored")
    expect(ranked[ranked.length - 1].id).toBe("noisy")
    expect(ranked[ranked.length - 1].score).toBe(0)
  })
})
