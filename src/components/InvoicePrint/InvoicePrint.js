"use client";

import { roundCurrency } from "@/utils/calculations";
const CURRENCY_CONFIG = {
  PKR: { symbol: "Rs.", major: "Pakistani Rupees", minor: "Paisa" },
  USD: { symbol: "$", major: "US Dollars", minor: "Cents" },
  EUR: { symbol: "€", major: "Euros", minor: "Cents" },
  AED: { symbol: "AED ", major: "UAE Dirhams", minor: "Fils" },
};
function getCurrencyConfig(currencyCode) {
  return CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.PKR;
}
function formatCurrency(amount, currencyCode, options = {}) {
  const { withSymbol = true } = options;
  const config = getCurrencyConfig(currencyCode);
  const rounded = roundCurrency(amount);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
  return withSymbol ? `${config.symbol}${formatted}` : formatted;
}
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function threeDigitsToWords(n) {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    const ones = n % 10;
    return ones ? `${tens}-${ONES[ones]}` : tens;
  }
  const hundreds = ONES[Math.floor(n / 100)];
  const rest = n % 100;
  return rest ? `${hundreds} Hundred ${threeDigitsToWords(rest)}` : `${hundreds} Hundred`;
}

function integerToWords(n) {
  if (n === 0) return "Zero";

  const SCALES = [
    { value: 1_000_000_000, label: "Billion" },
    { value: 1_000_000, label: "Million" },
    { value: 1_000, label: "Thousand" },
  ];

  let remaining = n;
  const parts = [];

  for (const { value, label } of SCALES) {
    const chunk = Math.floor(remaining / value);
    if (chunk > 0) {
      parts.push(`${threeDigitsToWords(chunk)} ${label}`);
      remaining %= value;
    }
  }
  if (remaining > 0) {
    parts.push(threeDigitsToWords(remaining));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function amountInWords(amount, currencyCode) {
  const config = getCurrencyConfig(currencyCode);
  const rounded = roundCurrency(amount);
  const wholePart = Math.floor(Math.abs(rounded));
  const fractionPart = Math.round((Math.abs(rounded) - wholePart) * 100);

  let sentence = `${integerToWords(wholePart)} ${config.major}`;
  if (fractionPart > 0) {
    sentence += ` and ${integerToWords(fractionPart)} ${config.minor}`;
  }
  sentence += " Only";
  return sentence;
}
function generateMockQRGrid(seed, gridSize = 11) {
  const safeSeed = String(seed || "FBR-PENDING-VERIFICATION");
  const grid = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));

  let charIndex = 0;
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const code = safeSeed.charCodeAt(charIndex % safeSeed.length) || 1;
      charIndex += 1;
      grid[row][col] = (code + row * 3 + col * 7) % 5 < 2;
    }
  }
  const stampFinder = (r0, c0) => {
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        const filled = r === 0 || r === 2 || c === 0 || c === 2;
        if (r0 + r < gridSize && c0 + c < gridSize) {
          grid[r0 + r][c0 + c] = filled;
        }
      }
    }
  };
  stampFinder(0, 0);
  stampFinder(0, gridSize - 3);
  stampFinder(gridSize - 3, 0);

  return grid;
}

function MockQRCode({ seed, size = 96 }) {
  const gridSize = 11;
  const grid = generateMockQRGrid(seed, gridSize);
  const cell = size / gridSize;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="block"
      role="img"
      aria-label="FBR verification QR code placeholder"
    >
      <rect x="0" y="0" width={size} height={size} fill="#ffffff" />
      {grid.map((row, r) =>
        row.map((filled, c) =>
          filled ? (
            <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#111827" />
          ) : null
        )
      )}
    </svg>
  );
}

function formatInvoiceDateTime(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function PaymentDetailsBlock({ currencyCode }) {
  // Is block ko screen se hide karne ke liye return null kar diya hai
  return null;
}

export default function InvoicePrint({
  invoice,
  company = {
    name: "Criticpick Solutions",
    ntn: "7439210-4",
    address: "Lahore, Punjab, Pakistan",
    phone: "+1 (559) 571-2010",
    email: "criticpickindustries@gmail.com",
    logoUrl: null,
  },
  fbrFiscalInvoiceNumber = null,
  fbrVerificationUrl = "https://fbr.gov.pk/verify",
}) {
  const items = invoice?.items || [];
  const totals = invoice?.totals || {
    totalExclusiveOfTax: 0,
    totalDiscount: 0,
    totalSalesTax: 0,
    netPayable: 0,
    totalItemsCount: 0,
  };
  const buyer = invoice?.buyer || {};
  const isFbrVerified = Boolean(fbrFiscalInvoiceNumber);

  const currencyCode = invoice?.currency || "PKR";
  const isUSInvoice = Boolean(invoice?.isUSInvoice) || currencyCode === "USD";
  const taxLabel = isUSInvoice ? "Sales Tax" : "GST / SST";

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => window.print());
  };

  return (
    <div className="bg-zinc-100 py-6 print:bg-white print:py-0">
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .hide-on-print {
            display: none !important;
          }
          html, body {
            background: #ffffff !important;
          }
          .invoice-print-page {
            box-shadow: none !important;
            margin: 0 !important;
            border-radius: 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
          }
          @page {
            size: A4;
            margin: 12mm;
          }
        }

        .invoice-print-page {
          width: 210mm;
          min-height: 297mm;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color-adjust: exact;
        }
      `}</style>

      {/* Action Bar Header */}
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-2">
        <p className="text-sm text-zinc-500">Print preview</p>
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500 cursor-pointer"
        >
          Print / Save as PDF
        </button>
      </div>

      {/* A4 PAGE */}
      <div className="invoice-print-page mx-auto flex flex-col bg-white p-10 text-zinc-900 shadow-lg print:shadow-none">

        {/* Fiscal / Status Banner */}
        {isUSInvoice ? (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600">
            <span>Sales Tax Invoice Record</span>
            <span className="rounded-full bg-white px-2 py-0.5 font-semibold uppercase tracking-wide text-zinc-500">
              {invoice?.invoiceNumber ? "Issued" : "Draft"}
            </span>
          </div>
        ) : (
          <div
            className={`mb-6 flex items-center justify-between rounded-lg border px-4 py-2 text-xs font-medium ${
              isFbrVerified
                ? "border-teal-300 bg-teal-50 text-teal-700"
                : "border-amber-300 bg-amber-50 text-amber-700"
            }`}
          >
            <span>
              FBR Fiscal Invoice Number:{" "}
              <span className="font-mono font-semibold">
                {isFbrVerified ? fbrFiscalInvoiceNumber : "[DYNAMIC_FBR_ID_HERE]"}
              </span>
            </span>
            <span className="rounded-full bg-white/70 px-2 py-0.5 font-semibold uppercase tracking-wide">
              {isFbrVerified ? "Synced" : "Pending Sync"}
            </span>
          </div>
        )}

        {/* Header Section */}
       <div className="mb-6 flex items-center justify-between border-b border-zinc-200 pb-6">
  <div className="flex items-center gap-4">
    {/* Logo Box - Rounded Box Frame with Black Background */}
    <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-950 p-1 flex items-center justify-center shadow-md border border-zinc-800 shrink-0">
      <img 
        src="/logo.jpeg" 
        alt={`${company.name} Logo`} 
        className="w-full h-full object-contain"
      />
    </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">{company.name}</h1>
              <p className="mt-0.5 text-xs text-zinc-600 font-medium">{company.address}</p>
              <p className="text-xs text-zinc-500">Phone: {company.phone}</p>
              <p className="text-xs text-zinc-500">Email: {company.email}</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                Company NTN: <span className="font-mono">{company.ntn}</span>
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-2xl font-bold uppercase tracking-tight text-zinc-900">Invoice</p>
            <p className="mt-1 text-xs text-zinc-500">
              Invoice #:{" "}
              <span className="font-mono font-medium text-zinc-700">
                {invoice?.invoiceNumber || "0001 (Auto-Gen)"}
              </span>
            </p>
            <p className="text-xs text-zinc-500">
              Date/Time:{" "}
              <span className="font-mono font-medium text-zinc-700">
                {formatInvoiceDateTime(invoice?.invoiceDateTime || new Date().toISOString())}
              </span>
            </p>
          </div>
        </div>

        {/* Buyer Section */}
        <div className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Billed To
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-900">{buyer.buyerName || "—"}</p>
            <p className="text-xs text-zinc-500">{buyer.buyerEmail || "—"}</p>
            <p className="text-xs text-zinc-500">
              NTN/CNIC: <span className="font-mono">{buyer.buyerNTNCNIC || "—"}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Payment Mode
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-900">{invoice?.paymentMode || "—"}</p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Currency
            </p>
            <p className="text-sm font-medium text-zinc-900">{currencyCode}</p>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-900 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-2 font-medium">SKU</th>
              <th className="py-2 pr-2 font-medium">Description</th>
              <th className="py-2 pr-2 text-right font-medium">Qty</th>
              <th className="py-2 pr-2 text-right font-medium">Price</th>
              <th className="py-2 pr-2 text-right font-medium">{taxLabel} %</th>
              <th className="py-2 pr-2 text-right font-medium">{taxLabel} Amt</th>
              <th className="py-2 pl-2 text-right font-medium">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-xs text-zinc-400">
                  No items on this invoice.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="print:break-inside-avoid border-b border-zinc-100">
                  <td className="py-2 pr-2 font-mono text-xs text-zinc-500">
                    {item.itemSKU || "—"}
                  </td>
                  <td className="py-2 pr-2 text-zinc-800">{item.itemName}</td>
                  <td className="py-2 pr-2 text-right font-mono text-zinc-700">{item.quantity}</td>
                  <td className="py-2 pr-2 text-right font-mono text-zinc-700">
                    {formatCurrency(item.unitPrice, item.currency || currencyCode, { withSymbol: false })}
                  </td>
                  <td className="py-2 pr-2 text-right font-mono text-zinc-700">{item.salesTaxRate}%</td>
                  <td className="py-2 pr-2 text-right font-mono text-zinc-700">
                    {formatCurrency(item.salesTaxAmount, item.currency || currencyCode, { withSymbol: false })}
                  </td>
                  <td className="py-2 pl-2 text-right font-mono font-medium text-zinc-900">
                    {formatCurrency(item.totalNetAmount, item.currency || currencyCode, { withSymbol: false })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Totals Summary */}
        <div className="print:break-inside-avoid mt-6 flex items-end justify-between gap-8">
          {!isUSInvoice && (
            <div className="hide-on-print print:hidden flex flex-col items-start">
              
            </div>
          )}

          <div className="w-64 ml-auto shrink-0 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Subtotal (Ex-Tax)</span>
              <span className="font-mono text-zinc-800">
                {formatCurrency(totals.totalExclusiveOfTax, currencyCode)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Total Discount</span>
              <span className="font-mono text-zinc-800">
                − {formatCurrency(totals.totalDiscount, currencyCode, { withSymbol: false })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Total {taxLabel}</span>
              <span className="font-mono text-zinc-800">
                + {formatCurrency(totals.totalSalesTax, currencyCode, { withSymbol: false })}
              </span>
            </div>
            <div className="mt-2 flex justify-between border-t-2 border-zinc-900 pt-2">
              <span className="font-semibold text-zinc-900">Grand Total</span>
              <span className="font-mono text-base font-bold text-zinc-900">
                {formatCurrency(totals.netPayable, currencyCode)}
              </span>
            </div>
          </div>
        </div>

        {/* Amount in Words */}
        <div className="print:break-inside-avoid mt-3 flex justify-end">
          <p className="w-64 text-right text-[11px] italic text-zinc-500">
            Amount in Words:{" "}
            <span className="not-italic font-medium text-zinc-700">
              {amountInWords(totals.netPayable, currencyCode)}
            </span>
          </p>
        </div>

        {/* Payment Details */}
        <PaymentDetailsBlock currencyCode={currencyCode} />

        {/* Footer */}
        <div className="mt-auto pt-8 text-center text-[10px] text-zinc-400">
          {isUSInvoice
            ? `This is a computer-generated Sales Tax Invoice record for ${company.name}.`
            : `This is a computer-generated invoice for ${company.name}. FBR fiscal verification status shown above reflects the latest sync at time of printing.`}
        </div>

      </div>
    </div>
  );
}