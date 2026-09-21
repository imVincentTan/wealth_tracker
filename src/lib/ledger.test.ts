import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categorize, extractMerchant } from "./categorize";
import { parseMoney } from "./money";
import { accountIdFromName, parseCsvText, rowsToTransactions } from "./parse-csv";
import { buildReport } from "./reports";
import { CHASE_CHECKING_CSV, CHASE_CREDIT_CSV } from "./sample";

describe("parseMoney", () => {
  it("handles currency, commas, and parentheses", () => {
    assert.equal(parseMoney("$1,234.50"), 1234.5);
    assert.equal(parseMoney("(12.00)"), -12);
    assert.equal(parseMoney(" -8.20 "), -8.2);
    assert.equal(parseMoney(""), null);
  });
});

describe("extractMerchant", () => {
  it("strips processor prefixes", () => {
    assert.equal(extractMerchant("SQ *BLUE BOTTLE COFFEE").toLowerCase().includes("blue bottle"), true);
  });
});

describe("Chase checking CSV", () => {
  it("detects the format and signs debits as money out", () => {
    const preview = parseCsvText(CHASE_CHECKING_CSV, "chase-checking.csv");
    assert.equal(preview.formatName, "Chase checking / savings");
    const txns = rowsToTransactions(preview, {
      accountId: accountIdFromName("Chase Checking"),
      mapping: preview.mapping,
      invertAmounts: preview.invertAmounts,
    });
    const rent = txns.find((t) => t.description.includes("RENT"));
    assert.ok(rent);
    assert.equal(rent!.amount, -1850);
    assert.equal(rent!.category, "housing");
    const pay = txns.find((t) => t.description.includes("PAYROLL"));
    assert.ok(pay);
    assert.equal(pay!.amount, 3200);
    assert.equal(pay!.category, "income");
    const cardPay = txns.find((t) => t.description.includes("CREDIT CRD"));
    assert.equal(cardPay?.category, "transfers");
  });
});

describe("Chase credit CSV", () => {
  it("keeps purchases negative and payments as transfers", () => {
    const preview = parseCsvText(CHASE_CREDIT_CSV, "chase-credit.csv");
    const txns = rowsToTransactions(preview, {
      accountId: "acc_card",
      mapping: preview.mapping,
      invertAmounts: preview.invertAmounts,
    });
    const grocery = txns.find((t) => t.description.includes("WHOLE FOODS"));
    assert.ok(grocery);
    assert.ok((grocery!.amount as number) < 0);
    assert.equal(grocery!.category, "groceries");
    const payment = txns.find((t) => t.description.toLowerCase().includes("thank you"));
    assert.equal(payment?.category, "transfers");
    assert.ok((payment?.amount ?? 0) > 0);
    const netflix = txns.find((t) => t.description.includes("NETFLIX"));
    assert.equal(netflix?.category, "subscriptions");
  });
});

describe("categorize", () => {
  it("uses learned merchant overrides", () => {
    const category = categorize({
      description: "WHOLE FOODS MARKET",
      merchant: "Whole Foods Market",
      amount: -40,
      learned: { "whole foods market": "dining" },
    });
    assert.equal(category, "dining");
  });
});

describe("buildReport", () => {
  it("excludes transfers from spent and nets refunds", () => {
    const report = buildReport([
      {
        id: "1",
        date: "2026-09-01",
        description: "Rent",
        merchant: "Rent",
        amount: -1850,
        category: "housing",
        accountId: "a",
        sourceFile: "x.csv",
        fingerprint: "1",
      },
      {
        id: "2",
        date: "2026-09-01",
        description: "Payroll",
        merchant: "Payroll",
        amount: 3000,
        category: "income",
        accountId: "a",
        sourceFile: "x.csv",
        fingerprint: "2",
      },
      {
        id: "3",
        date: "2026-09-02",
        description: "Payment Thank You",
        merchant: "Payment",
        amount: 400,
        category: "transfers",
        accountId: "a",
        sourceFile: "x.csv",
        fingerprint: "3",
      },
    ]);
    assert.equal(report.spent, 1850);
    assert.equal(report.income, 3000);
    assert.equal(report.net, 1150);
    assert.equal(report.byCategory[0]?.id, "housing");
  });
});
