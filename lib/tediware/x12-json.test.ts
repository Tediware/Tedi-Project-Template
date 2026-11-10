import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

import {
  element,
  loop,
  num,
  qualifiedIds,
  segment,
  segments,
  str,
  withQualifier,
  x12Date,
  type X12Record,
} from "./x12-json"

const sample = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "../../fixtures/sample-850.json"),
    "utf8"
  )
) as { heading: X12Record; detail: X12Record }

describe("x12-json helpers on the sample 850", () => {
  it("reads a segment and element by suffix", () => {
    const beg = segment(sample.heading, "BEG")
    assert.equal(str(element(beg, "03")), "PO-10001")
    assert.equal(x12Date(element(beg, "05")), "2026-07-02")
  })

  it("selects a repeated segment by qualifier, in preference order", () => {
    const dtms = segments(sample.heading, "DTM")
    assert.equal(dtms.length, 2)
    const shipDate = withQualifier(dtms, ["010", "118", "106"])
    assert.equal(x12Date(element(shipDate, "02")), "2026-07-10")
    assert.equal(withQualifier(dtms, ["999"]), undefined)
  })

  it("finds a party in a loop by entity code", () => {
    const shipTo = loop(sample.heading, "N1").find(
      (entry) => str(element(segment(entry, "N1"), "01")) === "ST"
    )
    assert.ok(shipTo)
    assert.equal(str(element(segment(shipTo, "N4"), "01")), "Springfield")
  })

  it("collects qualified product ids from PO1", () => {
    const lines = loop(sample.detail, "PO1")
    assert.equal(lines.length, 2)
    const ids = qualifiedIds(segment(lines[1], "PO1"), 6, 24)
    assert.equal(ids.get("VN"), "GAD-220")
    assert.equal(ids.get("PI"), "ER-55120")
    assert.equal(num(element(segment(lines[1], "PO1"), "04")), 48)
  })
})

describe("value helpers", () => {
  it("treats a single occurrence and a list alike", () => {
    assert.equal(segments({ a_REF: { x_01: "IA" } }, "REF").length, 1)
    assert.equal(segments({ a_REF: [{}, {}] }, "REF").length, 2)
    assert.equal(segments({}, "REF").length, 0)
  })

  it("drops a qualifier with no id beside it", () => {
    const ids = qualifiedIds(
      { q_06: "VN", id_07: "", q_08: "UP", id_09: "1" },
      6,
      8
    )
    assert.equal(ids.has("VN"), false)
    assert.equal(ids.get("UP"), "1")
  })

  it("rejects impossible X12 dates", () => {
    assert.equal(x12Date("20261341"), undefined)
    assert.equal(x12Date("20260230"), undefined)
    assert.equal(x12Date("2026-07-02"), undefined)
    assert.equal(x12Date("20240229"), "2024-02-29")
  })

  it("normalizes strings and numbers", () => {
    assert.equal(str("  a "), "a")
    assert.equal(str(""), undefined)
    assert.equal(str(7), "7")
    assert.equal(num("12.5"), 12.5)
    assert.equal(num("x"), undefined)
  })
})
