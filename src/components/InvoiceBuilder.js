"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  calculateLineItem,
  calculateInvoiceTotals,
  formatPKR,
} from "@/utils/calculations";
import InvoicePrint from "@/components/InvoicePrint/InvoicePrint";

const CURRENCY_OPTIONS = ["PKR", "USD", "EUR", "AED"];

const DYNAMIC_TAX_REGIONS = {
  PKR: [
    { value: 18, label: "18% — FBR Standard" },
    { value: 15, label: "15% — FBR / GST" },
    { value: 16, label: "16% — PRA / SST" },
    { value: 0, label: "0% — Exempt" },
  ],
  USD: [
    { value: 8.25, label: "8.25% — Standard US Tax" },
    { value: 4, label: "4% — NY Tax" },
    { value: 0, label: "0% — Exempt" },
  ],
  EUR: [
    { value: 21, label: "21% — Standard EU VAT" },
    { value: 19, label: "19% — German VAT" },
    { value: 0, label: "0% — Exempt" },
  ],
  AED: [
    { value: 5, label: "5% — UAE VAT" },
    { value: 0, label: "0% — Exempt" },
  ],
};

function isValidNTNCNIC(value) {
  const digitsOnly = String(value || "").replace(/[\s-]/g, "");
  return /^\d{7}$/.test(digitsOnly) || /^\d{13}$/.test(digitsOnly);
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `row_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createEmptyRow(currencyCode = "PKR") {
  const defaultTax = currencyCode === "USD" ? 8.25 : currencyCode === "EUR" ? 21 : currencyCode === "AED" ? 5 : 18;
  return {
    id: generateId(),
    itemSKU: "",
    itemName: "",
    unitOfMeasurement: "PCS",
    quantity: 1,
    unitPrice: 0,
    currency: currencyCode,
    discountPercent: 0, 
    salesTaxRate: defaultTax,
  };
}

function TrashIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function PlusIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export default function InvoiceBuilder({ lastHistoricalInvoiceNumber = "INV-2026-000123" }) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerNTNCNIC, setBuyerNTNCNIC] = useState("");
  const [ntnTouched, setNtnTouched] = useState(false);

  const ntnIsValid = useMemo(
    () => buyerNTNCNIC.length === 0 || isValidNTNCNIC(buyerNTNCNIC),
    [buyerNTNCNIC]
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedInvoiceNumber, setSavedInvoiceNumber] = useState(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const [items, setItems] = useState([createEmptyRow("PKR")]);
  const [calculatedItems, setCalculatedItems] = useState([]);
  const [totals, setTotals] = useState(calculateInvoiceTotals([]));

  const activeSystemCurrency = useMemo(() => {
    return items[0]?.currency || "PKR";
  }, [items]);

  const taxLabelText = useMemo(() => {
    if (activeSystemCurrency === "PKR") return "Total Sales Tax";
    if (activeSystemCurrency === "USD") return "US Sales Tax";
    return `${activeSystemCurrency} Sales Tax`;
  }, [activeSystemCurrency]);

  const currencyPrefixText = useMemo(() => {
    return activeSystemCurrency === "PKR" ? "Rs. " : `${activeSystemCurrency} `;
  }, [activeSystemCurrency]);

  useEffect(() => {
    if (lastHistoricalInvoiceNumber) {
      const match = lastHistoricalInvoiceNumber.match(/(\d+)(?!.*\d)/);
      if (match) {
        const lastNumber = parseInt(match[0], 10);
        const nextNumber = lastNumber + 1;
        const paddedStr = String(nextNumber).padStart(match[0].length, "0");
        const nextInvoiceStr = lastHistoricalInvoiceNumber.replace(match[0], paddedStr);
        setInvoiceNumber(nextInvoiceStr);
      } else {
        setInvoiceNumber("INV-2026-000001");
      }
    }
  }, [lastHistoricalInvoiceNumber]);

  useEffect(() => {
    const nextCalculatedItems = items.map((row) => {
      const exclusiveAmount = (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
      const discountAmount = exclusiveAmount * ((Number(row.discountPercent) || 0) / 100);

      return calculateLineItem({
        ...row,
        discountAmount,
      });
    });

    setCalculatedItems(nextCalculatedItems);
    setTotals(calculateInvoiceTotals(nextCalculatedItems));
  }, [items]);

  const updateItem = useCallback((id, field, value) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row.id === id) {
          const updatedRow = { ...row, [field]: value };
          if (field === "currency") {
            updatedRow.salesTaxRate = value === "USD" ? 8.25 : value === "EUR" ? 21 : value === "AED" ? 5 : 18;
          }
          return updatedRow;
        }
        return row;
      })
    );
  }, []);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, createEmptyRow(activeSystemCurrency)]);
  }, [activeSystemCurrency]);

  const removeItem = useCallback((id) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  }, []);

  const handleSaveInvoice = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    setSavedInvoiceNumber(null);

    const payload = {
      id: generateId(),
      invoiceNumber,
      posId: "",
      invoiceDateTime: new Date().toISOString(),
      invoiceType: "SALE_INVOICE",
      paymentMode: "CASH",
      currency: activeSystemCurrency,
      buyer: {
        buyerName,
        buyerEmail: buyerEmail || undefined,
        buyerNTNCNIC,
        buyerRegistrationType: "UNREGISTERED",
      },
      items: calculatedItems,
      totals,
    };

    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to save invoice.");
      }
      setSavedInvoiceNumber(result.invoice.invoiceNumber);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [invoiceNumber, buyerName, buyerEmail, buyerNTNCNIC, calculatedItems, totals, activeSystemCurrency]);

  if (showPrintPreview) {
    return (
      <div>
        <div className="no-print mx-auto max-w-[210mm] px-2 pt-4">
          <button
            type="button"
            onClick={() => setShowPrintPreview(false)}
            className="mb-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            ← Back to Editor
          </button>
        </div>
        <InvoicePrint
          invoice={{
            invoiceNumber,
            invoiceDateTime: new Date().toISOString(),
            paymentMode: "CASH",
            currency: activeSystemCurrency,
            buyer: { buyerName, buyerEmail, buyerNTNCNIC },
            items: calculatedItems,
            totals,
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        
        {/* BRAND LOGO HEADER BLOCK */}
        <div className="flex items-center gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5 mb-8">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-950 p-1 flex items-center justify-center shadow-lg border border-zinc-800 flex-shrink-0">
            <img 
              src="/logo.jpeg" 
              alt="Criticpick Logo" 
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Invoice Builder ({activeSystemCurrency})
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Contextual multiregional engine — totals recalculate instantly.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
                Client &amp; Meta Details
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Invoice Number (Auto-Incremented)
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-2026-000123"
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Buyer Name
                  </label>
                  <input
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value.replace(/[^A-Za-z .]/g, ""))}
                    placeholder="Full legal / business name"
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    Letters, spaces, and dots only — no digits.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Buyer Email
                  </label>
                  <input
                    type="email"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    placeholder="buyer@example.com"
                    className="mt-1.5 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Buyer NTN / CNIC <span className="text-amber-600 dark:text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={buyerNTNCNIC}
                    onChange={(e) => setBuyerNTNCNIC(e.target.value)}
                    onBlur={() => setNtnTouched(true)}
                    placeholder="7 or 13 digit NTN, or 13-digit CNIC"
                    inputMode="numeric"
                    className={`mt-1.5 w-full rounded-lg border bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 ${
                      ntnTouched && !ntnIsValid
                        ? "border-red-500 focus:border-red-500 focus:ring-red-500/30"
                        : "border-zinc-300 dark:border-zinc-700 focus:border-teal-500 focus:ring-teal-500/30"
                    }`}
                  />
                  {ntnTouched && !ntnIsValid && (
                    <p className="mt-1 text-xs text-red-500">
                      Enter a valid 7 or 13-digit NTN, or 13-digit CNIC (digits only).
                    </p>
                  )}
                  {(!ntnTouched || ntnIsValid) && (
                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                      Mandatory for localized FBR compliance validation tracking.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
                  Line Items Table
                </h2>
                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                >
                  <PlusIcon /> Add Row Item
                </button>
              </div>

              <div className="mt-4 hidden sm:grid sm:grid-cols-12 sm:gap-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/60 pb-2">
                <span className="col-span-3">Item Name</span>
                <span className="col-span-1 text-center">Qty</span>
                <span className="col-span-1 text-right">Price</span>
                <span className="col-span-2 text-center">Currency</span>
                <span className="col-span-2 text-center">Discount %</span>
                <span className="col-span-2 text-center">Tax Rate Options</span>
                <span className="col-span-1 text-right">Subtotal</span>
              </div>

              <div className="mt-2 space-y-3">
                {items.map((row, index) => {
                  const calculated = calculatedItems[index];
                  const activeOptions = DYNAMIC_TAX_REGIONS[row.currency] || DYNAMIC_TAX_REGIONS.PKR;

                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 p-3 sm:grid-cols-12 sm:items-center sm:border-0 sm:bg-transparent sm:p-1"
                    >
                      <div className="sm:col-span-3">
                        <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:hidden">
                          Item Name
                        </label>
                        <input
                          type="text"
                          value={row.itemName}
                          onChange={(e) => updateItem(row.id, "itemName", e.target.value)}
                          placeholder="e.g. Wireless Mouse"
                          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        />
                      </div>

                      <div className="sm:col-span-1">
                        <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:hidden">
                          Qty
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.quantity}
                          onChange={(e) => updateItem(row.id, "quantity", e.target.value === "" ? "" : Number(e.target.value))}
                          className="w-full text-center rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        />
                      </div>

                      <div className="sm:col-span-1">
                        <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:hidden">
                          Unit Price
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.unitPrice}
                          onChange={(e) => updateItem(row.id, "unitPrice", e.target.value === "" ? "" : Number(e.target.value))}
                          className="w-full text-right rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:hidden">
                          Currency
                        </label>
                        <select
                          value={row.currency}
                          onChange={(e) => updateItem(row.id, "currency", e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 cursor-pointer"
                        >
                          {CURRENCY_OPTIONS.map((code) => (
                            <option key={code} value={code}>{code}</option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:hidden">
                          Discount %
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={row.discountPercent}
                          onChange={(e) => updateItem(row.id, "discountPercent", e.target.value === "" ? "" : Number(e.target.value))}
                          className="w-full text-center rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:hidden">
                          Tax Rate
                        </label>
                        <select
                          value={row.salesTaxRate}
                          onChange={(e) => updateItem(row.id, "salesTaxRate", Number(e.target.value))}
                          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 cursor-pointer"
                        >
                          {activeOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-1 sm:text-right">
                        <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:hidden">
                          Total
                        </label>
                        <span className="block truncate text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                          {calculated ? formatPKR(calculated.totalNetAmount, { withSymbol: false }) : "0.00"}
                        </span>
                      </div>

                      <div className="flex sm:col-span-1 sm:justify-end">
                        <button
                          type="button"
                          onClick={() => removeItem(row.id)}
                          disabled={items.length === 1}
                          aria-label="Remove item"
                          className="inline-flex items-center justify-center rounded-lg border border-transparent p-2 text-zinc-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-500 dark:hover:border-red-900/40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="lg:col-span-1">
            <section className="sticky top-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
                Totals Summary ({activeSystemCurrency})
              </h2>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Total Ex-Tax</dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-100">
                    {formatPKR(totals.totalExclusiveOfTax, { withSymbol: false })}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">Total Discount</dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-100">
                    − {formatPKR(totals.totalDiscount, { withSymbol: false })}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    {taxLabelText}
                  </dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-100">
                    + {formatPKR(totals.totalSalesTax, { withSymbol: false })}
                  </dd>
                </div>
              </dl>

              <div className="my-4 border-t border-dashed border-zinc-200 dark:border-zinc-800" />

              <div className="flex items-center justify-between rounded-xl bg-amber-500/10 px-4 py-3">
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  Net Payable
                </span>
                <span className="text-lg font-mono font-bold text-amber-700 dark:text-amber-400">
                  {currencyPrefixText}
                  {formatPKR(totals.netPayable, { withSymbol: false })}
                </span>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                {totals.totalItemsCount} line item{totals.totalItemsCount === 1 ? "" : "s"} · recalculated instantly.
              </p>

              <button
                type="button"
                onClick={handleSaveInvoice}
                disabled={!buyerNTNCNIC || !ntnIsValid || !invoiceNumber || isSaving}
                className="mt-5 w-full rounded-lg bg-zinc-900 dark:bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSaving ? "Saving…" : "Save Invoice"}
              </button>

              <button
                type="button"
                onClick={() => setShowPrintPreview(true)}
                className="mt-2.5 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Print Invoice Preview
              </button>

              {saveError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {saveError}
                </p>
              )}

              {savedInvoiceNumber && (
                <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">
                  Invoice {savedInvoiceNumber} saved successfully.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}