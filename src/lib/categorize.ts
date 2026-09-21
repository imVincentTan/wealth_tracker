import type { CategoryId } from "./types";

export const CATEGORIES: {
  id: CategoryId;
  label: string;
  hint: string;
  color: string;
}[] = [
  { id: "groceries", label: "Groceries", hint: "Supermarkets and food delivery groceries", color: "#3F6F52" },
  { id: "dining", label: "Dining", hint: "Restaurants, coffee, takeout", color: "#C45C26" },
  { id: "transport", label: "Transport", hint: "Gas, rideshare, transit, parking", color: "#2F5D8A" },
  { id: "housing", label: "Housing", hint: "Rent, mortgage, homeowners", color: "#6A5340" },
  { id: "utilities", label: "Utilities", hint: "Power, water, phone, internet", color: "#6B7C3D" },
  { id: "shopping", label: "Shopping", hint: "Retail, Amazon, household goods", color: "#8A3D6B" },
  { id: "entertainment", label: "Entertainment", hint: "Movies, games, events", color: "#6B3D8A" },
  { id: "healthcare", label: "Healthcare", hint: "Pharmacy, doctors, insurance", color: "#3D6B6B" },
  { id: "travel", label: "Travel", hint: "Flights, hotels, vacation", color: "#C49A26" },
  { id: "subscriptions", label: "Subscriptions", hint: "Recurring software and media", color: "#3D4A6B" },
  { id: "personal", label: "Personal", hint: "Haircuts, gym, gifts", color: "#8A6B3D" },
  { id: "income", label: "Income", hint: "Paychecks and other money in", color: "#2D6B3A" },
  { id: "transfers", label: "Transfers", hint: "Card payments, Zelle, account moves", color: "#7A7A72" },
  { id: "fees", label: "Fees", hint: "ATM, interest, overdraft", color: "#8A3D3D" },
  { id: "other", label: "Other", hint: "Uncategorized or one-offs", color: "#5A5A52" },
];

export const CATEGORY_BY_ID = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c])
) as Record<CategoryId, (typeof CATEGORIES)[number]>;

export const SPEND_CATEGORIES: CategoryId[] = CATEGORIES.filter(
  (c) => c.id !== "income" && c.id !== "transfers"
).map((c) => c.id);

const KEYWORD_RULES: { category: CategoryId; pattern: RegExp }[] = [
  {
    category: "transfers",
    pattern:
      /payment thank you|thank you[- ]web|credit card payment|autopay|auto pay|transfer to|transfer from|online transfer|wire transfer|\bzelle\b|\bvenmo\b|paypal instant|cash app|\bach payment\b|payment to chase|payment to amex|payment to capital|payment to citi|\batm withdrawal\b/i,
  },
  {
    category: "income",
    pattern:
      /payroll|direct deposit|salary|paycheck|paychex|gusto|adp\b|employer|dividend|interest payment|tax refund|irs treas/i,
  },
  {
    category: "fees",
    pattern:
      /\bfee\b|overdraft|insufficient fund|atm surcharge|interest charge|finance charge|annual membership|late fee|foreign transaction/i,
  },
  {
    category: "groceries",
    pattern:
      /whole foods|trader joe|safeway|kroger|aldi\b|costco(?! gas)|publix|wegmans|heb\b|instacart|sprouts|grocery|food lion|meijer|winco|lidl\b|albertsons|ralphs|vons\b|giant eagle|hannaford|stop ?& ?shop|fresh market/i,
  },
  {
    category: "dining",
    pattern:
      /starbucks|mcdonald|chipotle|uber eats|doordash|grubhub|dunkin|sweetgreen|panera|wendy'?s|taco bell|chipotle|restaurant|cafe\b|coffee|pizza|sushi|burger|kfc\b|chick-fil-a|chipotle|subway\b|olive garden|chipotle|doordash|postmates/i,
  },
  {
    category: "transport",
    pattern:
      /costco gas|\buber\b|\blyft\b|shell oil|shell service|chevron|exxon|mobil\b|\bbp#|\bbp \b|parking|metro transit|mta\b|clipper|ezpass|e-zpass|tolls|toyota|honda service|valero|sunoco|waze parking|limebike|citibike/i,
  },
  {
    category: "housing",
    pattern:
      /\brent\b|mortgage|landlord|apartments|hoa\b|property management|geico insurance|state farm|homeowners|lease payment/i,
  },
  {
    category: "utilities",
    pattern:
      /pg&e|pge\b|pgande|con ed|comed|duke energy|xfinity|comcast|verizon|at&t|t-mobile|spectrum|internet|electric|water bill|gas co|utility|tmobile|att\b|sprint/i,
  },
  {
    category: "subscriptions",
    pattern:
      /netflix|spotify|hulu|disney plus|disney\+|youtube premium|apple\.com\/bill|icloud|google one|microsoft|adobe|github|notion|nytimes|washington post|patreon|openai|anthropic|cursor|dashpass/i,
  },
  {
    category: "shopping",
    pattern:
      /amazon|amzn\b|target\b|walmart|nordstrom|best buy|ikea\b|home depot|lowe'?s|apple store|apple\.com|ebay\b|etsy\b|nike\b|gap\b|old navy|ikea/i,
  },
  {
    category: "entertainment",
    pattern:
      /\bamc\b|regal cinemas|steam games|nintendo|playstation|xbox\b|ticketmaster|stubhub|concert|museum/i,
  },
  {
    category: "healthcare",
    pattern:
      /pharmacy|cvs\b|walgreens|rite aid|doctor|dental|copay|hospital|cigna|unitedhealth|aetna|kaiser|labcorp|quest diag|optometry|one medical/i,
  },
  {
    category: "travel",
    pattern:
      /airline|airlines|hotel|airbnb|marriott|hilton|hyatt|united air|delta air|american air|southwest|jetblue|expedia|booking\.com|vrbo\b|tsa pre|lyft.*airport/i,
  },
  {
    category: "personal",
    pattern:
      /gym|fitness|planet fitness|hair|barber|salon|spa\b|dry clean|laundry|classpass|peloton/i,
  },
];

const BANK_CATEGORY_MAP: Record<string, CategoryId> = {
  groceries: "groceries",
  "food & drink": "dining",
  "food and drink": "dining",
  restaurants: "dining",
  dining: "dining",
  gas: "transport",
  "gas/automotive": "transport",
  automotive: "transport",
  travel: "travel",
  shopping: "shopping",
  merchandise: "shopping",
  "bills & utilities": "utilities",
  utilities: "utilities",
  entertainment: "entertainment",
  "health & wellness": "healthcare",
  healthcare: "healthcare",
  education: "personal",
  "gifts & donations": "personal",
  personal: "personal",
  "fees & adjustments": "fees",
  fees: "fees",
  payment: "transfers",
  payments: "transfers",
  transfer: "transfers",
  income: "income",
  paycheck: "income",
  "home improvement": "shopping",
  "supermarkets": "groceries",
};

export function merchantKey(merchant: string): string {
  return merchant.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function extractMerchant(description: string): string {
  let s = description.replace(/\s+/g, " ").trim();
  const prefixes = [
    /^POS DEBIT\s+/i,
    /^POS PURCHASE\s+/i,
    /^DEBIT CARD\s+(PURCHASE\s+)?/i,
    /^ACH DEBIT\s+/i,
    /^ACH CREDIT\s+/i,
    /^VISA\s+/i,
    /^MASTERCARD\s+/i,
    /^CHECKCARD\s+\d{4}\s+/i,
    /^PURCHASE AUTHORIZED ON \d{2}\/\d{2}\s+/i,
    /^RECURRING PAYMENT AUTHORIZED ON \d{2}\/\d{2}\s+/i,
    /^SQ\s*\*\s*/i,
    /^TST\s*\*\s*/i,
    /^SP\s+/i,
    /^WWW\./i,
  ];
  for (const prefix of prefixes) s = s.replace(prefix, "");
  s = s.replace(/\s+#\d+\b.*/, "");
  s = s.replace(/\s+\d{2}\/\d{2}(?:\/\d{2,4})?$/, "");
  s = s.replace(/\s+\d{5}(?:-\d{4})?$/, "");
  s = s.replace(/\s+[A-Z][A-Z\s]{2,}\s+[A-Z]{2}$/i, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  if (!s) return description.trim();
  return toTitleCase(s.slice(0, 52));
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function categorize(input: {
  description: string;
  merchant: string;
  amount: number;
  bankCategory?: string;
  learned?: Record<string, CategoryId>;
}): CategoryId {
  const learnedKey = merchantKey(input.merchant);
  if (learnedKey && input.learned?.[learnedKey]) {
    return input.learned[learnedKey];
  }

  const haystack = `${input.description} ${input.merchant}`;
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(haystack)) return rule.category;
  }

  if (input.bankCategory) {
    const mapped = BANK_CATEGORY_MAP[input.bankCategory.trim().toLowerCase()];
    if (mapped) return mapped;
  }

  if (input.amount > 0) return "income";
  return "other";
}
