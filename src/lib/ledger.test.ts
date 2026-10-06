import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categorize, extractMerchant } from "./categorize";
import { parseMoney } from "./money";
import { accountIdFromName, parseCsvText, rowsToTransactions } from "./parse-csv";
import { buildReport } from "./reports";
import { CHASE_CHECKING_CSV, CHASE_CREDIT_CSV } from "./sample";
import { mappingFromParserConfig, overlayMapping, parserConfigFromMapping } from "./api";

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

describe("balance column", () => {
  it("auto-maps a Balance header without treating it as an amount", () => {
    const preview = parseCsvText(CHASE_CHECKING_CSV, "chase-checking.csv");
    assert.equal(preview.mapping.balance, "Balance");
    assert.equal(preview.mapping.amount, "Amount");
    const txns = rowsToTransactions(preview, {
      accountId: "acc_checking",
      mapping: preview.mapping,
      invertAmounts: preview.invertAmounts,
    });
    const rent = txns.find((t) => t.description.includes("RENT"));
    assert.equal(rent!.amount, -1850);
  });

  it("recognizes balance alongside debit/credit columns", () => {
    const csv =
      "Date,Description,Withdrawals,Deposits,Balance\n" +
      "09/15/2026,COFFEE,4.50,,100.00\n" +
      "09/16/2026,PAYROLL,,1000.00,1100.00\n";
    const preview = parseCsvText(csv, "td-chequing.csv");
    assert.equal(preview.mapping.balance, "Balance");
    assert.equal(preview.mapping.debit, "Withdrawals");
    assert.equal(preview.mapping.credit, "Deposits");
    assert.equal(preview.mapping.amount, null);
    const txns = rowsToTransactions(preview, {
      accountId: "acc_td",
      mapping: preview.mapping,
      invertAmounts: false,
    });
    assert.deepEqual(txns.map((t) => t.amount).sort((a, b) => a - b), [-4.5, 1000]);
  });
});

describe("headerless and separator handling", () => {
  it("treats a headerless file as all data with synthetic columns", () => {
    const csv = "09/15/2026,ANNUAL FEE,139.00,,2024.78\n09/16/2026,LOBLAWS,88.14,,1886.64\n";
    const preview = parseCsvText(csv, "td-card.csv");
    assert.equal(preview.headerRow, 0);
    assert.deepEqual(preview.headers, ["Column 1", "Column 2", "Column 3", "Column 4", "Column 5"]);
    assert.equal(preview.rows.length, 2);
    assert.equal(preview.rows[0]["Column 2"], "ANNUAL FEE");
  });

  it("honors an explicit separator", () => {
    const csv = "Date;Description;Amount\n09/15/2026;COFFEE;-4.50\n";
    const preview = parseCsvText(csv, "x.csv", { delimiter: ";" });
    assert.deepEqual(preview.headers, ["Date", "Description", "Amount"]);
    assert.equal(preview.rows[0]["Amount"], "-4.50");
  });

  it("skips preamble rows when headerRow is set", () => {
    const csv = "Account summary\nGenerated 09/30\nDate,Description,Amount\n09/15/2026,COFFEE,-4.50\n";
    const preview = parseCsvText(csv, "x.csv", { headerRow: 3 });
    assert.deepEqual(preview.headers, ["Date", "Description", "Amount"]);
    assert.equal(preview.rows.length, 1);
  });

  it("gives duplicate headers distinct names so each can hold its own role", () => {
    const csv = "Date,Description,Amount,Amount\n09/15/2026,COFFEE,10.00,20.00\n";
    const preview = parseCsvText(csv, "dup.csv");
    assert.deepEqual(preview.headers, ["Date", "Description", "Amount", "Amount (2)"]);
    assert.equal(preview.rows[0]["Amount"], "10.00");
    assert.equal(preview.rows[0]["Amount (2)"], "20.00");
    assert.equal(preview.mapping.amount, "Amount");
  });
});

describe("saved parser_config overlay", () => {
  it("round-trips a debit/credit mapping through parser_config", () => {
    const mapping = {
      date: "Column 1",
      description: "Column 2",
      amount: null,
      debit: "Column 3",
      credit: "Column 4",
      category: "Column 6",
      type: null,
      balance: "Column 5",
    };
    const config = parserConfigFromMapping(mapping, false, { delimiter: ",", headerRow: 0 });
    const back = mappingFromParserConfig(config);
    assert.equal(back.date, "Column 1");
    assert.equal(back.debit, "Column 3");
    assert.equal(back.credit, "Column 4");
    assert.equal(back.balance, "Column 5");
    assert.equal(back.category, "Column 6");
    assert.equal(config.category_column, "Column 6");
    assert.equal(config.header_row, 0);
  });

  it("lets a saved mapping override auto-detect when headers still exist", () => {
    const auto = {
      date: "Date",
      description: "Memo",
      amount: "Balance",
      debit: null,
      credit: null,
      category: null,
      type: null,
      balance: null,
    };
    const saved = {
      date: "Date",
      description: "Memo",
      amount: null,
      debit: "Out",
      credit: "In",
      category: null,
      type: null,
      balance: "Balance",
    };
    const next = overlayMapping(["Date", "Memo", "Out", "In", "Balance"], auto, saved);
    assert.equal(next.amount, null);
    assert.equal(next.debit, "Out");
    assert.equal(next.credit, "In");
    assert.equal(next.balance, "Balance");
  });

  it("keeps auto-detect for headers the saved mapping does not have", () => {
    const auto = {
      date: "Date",
      description: "Memo",
      amount: "Amount",
      debit: null,
      credit: null,
      category: null,
      type: null,
      balance: null,
    };
    const saved = {
      date: "Transaction Date",
      description: "Details",
      amount: "Amount",
      debit: null,
      credit: null,
      category: null,
      type: null,
      balance: null,
    };
    const next = overlayMapping(["Date", "Memo", "Amount"], auto, saved);
    assert.equal(next.date, "Date");
    assert.equal(next.description, "Memo");
    assert.equal(next.amount, "Amount");
  });

  it("clears auto amount when the saved mapping is debit/credit", () => {
    const auto = {
      date: "Date",
      description: "Memo",
      amount: "Amount",
      debit: null,
      credit: null,
      category: null,
      type: null,
      balance: null,
    };
    const saved = {
      date: "Date",
      description: "Memo",
      amount: null,
      debit: "Out",
      credit: "In",
      category: null,
      type: null,
      balance: null,
    };
    const next = overlayMapping(["Date", "Memo", "Amount", "Out", "In"], auto, saved);
    assert.equal(next.amount, null);
    assert.equal(next.debit, "Out");
    assert.equal(next.credit, "In");
  });

  it("clears auto debit/credit when the saved mapping is signed amount", () => {
    const auto = {
      date: "Date",
      description: "Memo",
      amount: null,
      debit: "Withdrawals",
      credit: "Deposits",
      category: null,
      type: null,
      balance: null,
    };
    const saved = {
      date: "Date",
      description: "Memo",
      amount: "Amount",
      debit: null,
      credit: null,
      category: null,
      type: null,
      balance: null,
    };
    const next = overlayMapping(["Date", "Memo", "Amount", "Withdrawals", "Deposits"], auto, saved);
    assert.equal(next.amount, "Amount");
    assert.equal(next.debit, null);
    assert.equal(next.credit, null);
  });
});
