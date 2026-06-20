import { useEffect, useState } from "react";
import { api, type Account, type Dashboard, type ImportPreview, type Transaction } from "./api";

type Tab = "dashboard" | "import" | "transactions" | "accounts";

const INSTITUTIONS = [
  { value: "td", label: "TD" },
  { value: "amex", label: "Amex" },
];

const ACCOUNT_TYPES = [
  { value: "chequing", label: "Chequing" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit Card" },
];

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState("");

  const [newAccount, setNewAccount] = useState({
    name: "",
    institution: "td",
    account_type: "chequing",
  });
  const [importAccountId, setImportAccountId] = useState<number | "">("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [excludeTransfer, setExcludeTransfer] = useState(true);

  const loadBase = async () => {
    const [accts, cats] = await Promise.all([api.getAccounts(), api.getCategories()]);
    setAccounts(accts);
    setCategories(cats.map((c) => c.name));
    if (accts.length && importAccountId === "") setImportAccountId(accts[0].id);
  };

  useEffect(() => {
    loadBase().catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (tab === "dashboard") {
      const exclude = excludeTransfer ? ["Transfer"] : [];
      api.getDashboard(exclude).then(setDashboard).catch((e) => setError(String(e)));
    }
    if (tab === "transactions") {
      api.getTransactions({ limit: "200" }).then(setTransactions).catch((e) => setError(String(e)));
    }
  }, [tab, excludeTransfer]);

  const createAccount = async () => {
    setError("");
    try {
      await api.createAccount(newAccount);
      setNewAccount({ name: "", institution: "td", account_type: "chequing" });
      await loadBase();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file || importAccountId === "") return;
    setError("");
    try {
      const result = await api.previewImport(Number(importAccountId), file);
      setPreview(result);
    } catch (e) {
      setError(String(e));
    }
  };

  const commitImport = async () => {
    if (!preview) return;
    setError("");
    try {
      await api.commitImport(preview.import_id);
      setPreview(null);
      setTab("transactions");
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="app">
      <header>
        <h1>Wealth Tracker</h1>
        <nav>
          {(["dashboard", "import", "transactions", "accounts"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      {error && <div className="card error">{error}</div>}

      {tab === "dashboard" && dashboard && (
        <>
          <div className="card">
            <label>
              <input
                type="checkbox"
                checked={excludeTransfer}
                onChange={(e) => setExcludeTransfer(e.target.checked)}
              />{" "}
              Exclude Transfer from expense breakdown
            </label>
          </div>
          <div className="grid-2">
            <div className="card">
              <div>Total income</div>
              <div className="stat">{formatMoney(dashboard.total_income)}</div>
            </div>
            <div className="card">
              <div>Total expenses</div>
              <div className="stat">{formatMoney(dashboard.total_expenses)}</div>
            </div>
          </div>
          <div className="card">
            <h3>By category</h3>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Total</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.by_category.map((row) => (
                  <tr key={row.category}>
                    <td>{row.category}</td>
                    <td>{formatMoney(row.total)}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Monthly</h3>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Income</th>
                  <th>Expenses</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.monthly.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{formatMoney(row.income)}</td>
                    <td>{formatMoney(row.expenses)}</td>
                    <td>{formatMoney(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "import" && (
        <div className="card">
          <h3>Import CSV</h3>
          <label>Account</label>
          <select
            value={importAccountId}
            onChange={(e) => setImportAccountId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.institution} / {a.account_type})
              </option>
            ))}
          </select>
          <div style={{ marginTop: "1rem" }}>
            <input type="file" accept=".csv" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          </div>
          {preview && (
            <>
              <p>
                Preview: {preview.transactions.length} rows, {preview.skipped_duplicates} duplicates skipped
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.transactions.slice(0, 50).map((t, i) => (
                    <tr key={i} className={t.is_duplicate ? "duplicate" : ""}>
                      <td>{t.transaction_date}</td>
                      <td>{t.description}</td>
                      <td>{formatMoney(t.amount)}</td>
                      <td>{t.category ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="primary" style={{ marginTop: "1rem" }} onClick={commitImport}>
                Commit import
              </button>
            </>
          )}
        </div>
      )}

      {tab === "transactions" && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount (CAD)</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.transaction_date}</td>
                  <td>{t.description}</td>
                  <td>{formatMoney(t.amount_cad)}</td>
                  <td>
                    <select
                      value={t.category ?? ""}
                      onChange={async (e) => {
                        await api.updateTransaction(t.id, { category: e.target.value });
                        setTransactions((prev) =>
                          prev.map((row) =>
                            row.id === t.id ? { ...row, category: e.target.value } : row
                          )
                        );
                      }}
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "accounts" && (
        <>
          <div className="card">
            <h3>Your accounts</h3>
            <ul>
              {accounts.map((a) => (
                <li key={a.id}>
                  {a.name} — {a.institution} / {a.account_type} ({a.currency})
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>Add account</h3>
            <label>Name</label>
            <input
              value={newAccount.name}
              onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
              placeholder="TD Chequing"
            />
            <label style={{ marginTop: "0.5rem" }}>Institution</label>
            <select
              value={newAccount.institution}
              onChange={(e) => setNewAccount({ ...newAccount, institution: e.target.value })}
            >
              {INSTITUTIONS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
            <label style={{ marginTop: "0.5rem" }}>Account type</label>
            <select
              value={newAccount.account_type}
              onChange={(e) => setNewAccount({ ...newAccount, account_type: e.target.value })}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div style={{ marginTop: "1rem" }}>
              <button className="primary" onClick={createAccount} disabled={!newAccount.name}>
                Create account
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
