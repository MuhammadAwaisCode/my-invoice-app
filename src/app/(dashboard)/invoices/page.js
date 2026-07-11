"use client";

import { useEffect, useState } from "react";
import { formatPKR } from "@/utils/calculations";

function formatDateTime(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function InvoiceHistoryPage() {
  const [invoices, setInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInvoices() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/invoices");
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Failed to load invoices.");
        }
        if (!cancelled) setInvoices(result.invoices);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadInvoices();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
      <div className="mb-6 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Invoice History
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          All invoices created by the team, most recent first.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Created By</th>
              <th className="px-4 py-3 text-right">Net Payable</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  Loading invoices…
                </td>
              </tr>
            )}

            {!isLoading && error && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-red-500">
                  {error}
                </td>
              </tr>
            )}

            {!isLoading && !error && invoices.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  No invoices yet.
                </td>
              </tr>
            )}

            {!isLoading &&
              !error &&
              invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                >
                  <td className="px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {invoice.invoiceNumber}
                  </td>
                  <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">
                    {invoice.buyerName}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {formatDateTime(invoice.invoiceDateTime)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-teal-500/10 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-400">
                      {invoice.userEmail || invoice.userId}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-zinc-900 dark:text-zinc-100">
                    {formatPKR(invoice.netPayable)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
