/**
 * ============================================================================
 * Invoice Calculation Utilities
 * ============================================================================
 * File: src/utils/calculations.js
 *
 * Purpose:
 *   High-precision calculation engine for the Ideal Invoice Web Application.
 *   Computes item-level and invoice-level totals in a way that is SAFE from
 *   floating-point rounding drift — a critical requirement for FBR/PRA
 *   compliance, since tax authorities validate that line-item sums exactly
 *   equal the declared invoice totals (to the paisa).
 *
 * Why not just use plain JS numbers?
 *   JavaScript numbers are IEEE-754 doubles. Naive operations like
 *   `0.1 + 0.2` produce `0.30000000000000004`. Across many invoice line
 *   items, these tiny errors accumulate into visible rounding mismatches
 *   (e.g. totals off by Rs. 0.01–0.05), which FBR's IMS validation will
 *   reject.
 *
 * Strategy used here:
 *   1. Convert every rupee amount to an integer number of "paisa"
 *      (1 Rupee = 100 Paisa) using rupeesToPaisa(). Integer arithmetic in
 *      JS is exact (safe up to 2^53 - 1, far beyond any invoice amount).
 *   2. Perform ALL addition/subtraction/multiplication in paisa (integers).
 *   3. Only convert back to rupees (paisaToRupees) at the very last step,
 *      for display/storage.
 *   4. Rounding uses "round half away from zero" at the paisa level, which
 *      matches standard commercial rounding conventions used in FBR/PRA
 *      filings.
 *
 * Calculation order enforced (per FBR line-item rules):
 *   exclusiveAmount   = quantity * unitPrice
 *   taxableAmount      = exclusiveAmount - discountAmount   (discount FIRST)
 *   salesTaxAmount     = taxableAmount * (salesTaxRate / 100)
 *   totalNetAmount     = taxableAmount + salesTaxAmount + furtherTax + extraOrFed
 *
 * This file has no framework dependencies (plain JS) so it can be reused
 * in API routes, server actions, or client components alike.
 * ============================================================================
 */

/** Number of paisa in one rupee. Central constant — do not hardcode 100 elsewhere. */
const PAISA_PER_RUPEE = 100;

/**
 * Converts a rupee amount (number, possibly with decimals) into an
 * integer number of paisa. Rounds to the nearest paisa using
 * "round half away from zero" to match standard currency rounding.
 *
 * @param {number} rupees
 * @returns {number} integer paisa
 */
function rupeesToPaisa(rupees) {
  const value = Number(rupees) || 0;
  const scaled = value * PAISA_PER_RUPEE;
  return Math.sign(scaled) * Math.round(Math.abs(scaled));
}

/**
 * Converts an integer paisa amount back into a rupee number rounded to
 * exactly 2 decimal places.
 *
 * @param {number} paisa
 * @returns {number} rupees, 2 decimal places
 */
function paisaToRupees(paisa) {
  return Math.round(paisa) / PAISA_PER_RUPEE;
}

/**
 * Safely rounds a rupee value to 2 decimal places by round-tripping
 * through paisa. Use this any time you need to sanitize a currency
 * number before displaying or storing it.
 *
 * @param {number} rupees
 * @returns {number}
 */
export function roundCurrency(rupees) {
  return paisaToRupees(rupeesToPaisa(rupees));
}

/**
 * Multiplies a paisa (integer) amount by a plain multiplier (e.g.
 * quantity, or a tax rate fraction) and rounds the result back to the
 * nearest integer paisa. Centralizes rounding so it's applied
 * consistently everywhere.
 *
 * @param {number} paisa
 * @param {number} multiplier
 * @returns {number} integer paisa
 */
function multiplyPaisa(paisa, multiplier) {
  const result = paisa * multiplier;
  return Math.sign(result) * Math.round(Math.abs(result));
}

/**
 * ----------------------------------------------------------------------
 * calculateLineItem
 * ----------------------------------------------------------------------
 * Computes all derived fields for a single invoice line item:
 *   exclusiveOfTaxAmount, salesTaxAmount, totalNetAmount
 *
 * Input item is expected to already have: quantity, unitPrice,
 * discountAmount, salesTaxRate, and optionally furtherTaxAmount /
 * extraOrFedAmount (both default to 0 if omitted).
 *
 * Returns a NEW object (does not mutate the input) with all computed
 * fields populated and rounded to 2 decimal places.
 *
 * @param {object} item - partial InvoiceLineItem
 * @returns {object} InvoiceLineItem with computed fields filled in
 */
export function calculateLineItem(item) {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const discountAmount = Number(item.discountAmount) || 0;
  const salesTaxRate = Number(item.salesTaxRate) || 0;
  const furtherTaxAmount = Number(item.furtherTaxAmount) || 0;
  const extraOrFedAmount = Number(item.extraOrFedAmount) || 0;

  // Step 1: gross amount, exclusive of tax, before discount.
  // unitPrice is converted to paisa first, then multiplied by quantity
  // (quantity is treated as a plain multiplier, not currency).
  const grossPaisa = multiplyPaisa(rupeesToPaisa(unitPrice), quantity);

  // Step 2: apply discount FIRST (per FBR calculation order).
  const discountPaisa = rupeesToPaisa(discountAmount);
  const taxableBasePaisa = Math.max(grossPaisa - discountPaisa, 0);

  // Step 3: sales tax computed on the post-discount taxable base.
  const salesTaxPaisa = multiplyPaisa(taxableBasePaisa, salesTaxRate / 100);

  // Step 4: further tax / FED, if any, are flat amounts already in rupees.
  const furtherTaxPaisa = rupeesToPaisa(furtherTaxAmount);
  const extraOrFedPaisa = rupeesToPaisa(extraOrFedAmount);

  // Step 5: total payable for this line.
  const totalNetPaisa =
    taxableBasePaisa + salesTaxPaisa + furtherTaxPaisa + extraOrFedPaisa;

  return {
    ...item,
    quantity,
    unitPrice: roundCurrency(unitPrice),
    discountAmount: roundCurrency(discountAmount),
    salesTaxRate,
    furtherTaxAmount: roundCurrency(furtherTaxAmount),
    extraOrFedAmount: roundCurrency(extraOrFedAmount),
    exclusiveOfTaxAmount: paisaToRupees(taxableBasePaisa),
    salesTaxAmount: paisaToRupees(salesTaxPaisa),
    totalNetAmount: paisaToRupees(totalNetPaisa),
  };
}

/**
 * ----------------------------------------------------------------------
 * calculateInvoiceTotals
 * ----------------------------------------------------------------------
 * Aggregates an array of (already-calculated) line items into global
 * invoice totals. All summation happens in integer paisa to guarantee
 * the totals exactly match the sum of the displayed line items — no
 * drift, no off-by-one-paisa mismatches.
 *
 * NOTE: This function expects items that have ALREADY been through
 * `calculateLineItem`. If you pass raw/uncalculated items, call
 * `recalculateInvoice` instead, which does both steps for you.
 *
 * @param {object[]} items - array of calculated InvoiceLineItem objects
 * @returns {object} InvoiceTotals
 */
export function calculateInvoiceTotals(items) {
  const safeItems = Array.isArray(items) ? items : [];

  let totalExclusivePaisa = 0;
  let totalDiscountPaisa = 0;
  let totalSalesTaxPaisa = 0;
  let totalFurtherTaxPaisa = 0;
  let totalExtraOrFedPaisa = 0;

  for (const item of safeItems) {
    totalExclusivePaisa += rupeesToPaisa(item.exclusiveOfTaxAmount);
    totalDiscountPaisa += rupeesToPaisa(item.discountAmount);
    totalSalesTaxPaisa += rupeesToPaisa(item.salesTaxAmount);
    totalFurtherTaxPaisa += rupeesToPaisa(item.furtherTaxAmount || 0);
    totalExtraOrFedPaisa += rupeesToPaisa(item.extraOrFedAmount || 0);
  }

  const netPayablePaisa =
    totalExclusivePaisa +
    totalSalesTaxPaisa +
    totalFurtherTaxPaisa +
    totalExtraOrFedPaisa;

  return {
    totalExclusiveOfTax: paisaToRupees(totalExclusivePaisa),
    totalDiscount: paisaToRupees(totalDiscountPaisa),
    totalSalesTax: paisaToRupees(totalSalesTaxPaisa),
    totalFurtherTax: paisaToRupees(totalFurtherTaxPaisa),
    totalExtraOrFed: paisaToRupees(totalExtraOrFedPaisa),
    netPayable: paisaToRupees(netPayablePaisa),
    totalItemsCount: safeItems.length,
  };
}

/**
 * ----------------------------------------------------------------------
 * recalculateInvoice
 * ----------------------------------------------------------------------
 * Convenience one-shot function: takes a raw/edited invoice object
 * (e.g. straight out of a form), recalculates every line item, then
 * recalculates the global totals from those results.
 *
 * This is the function most UI components (Part 2+) should call after
 * any edit — add item, remove item, change quantity, change discount,
 * change tax rate, etc. — to keep the whole invoice internally
 * consistent.
 *
 * @param {object} invoice - object with an `items` array (see Invoice type)
 * @returns {object} new invoice object with recalculated items + totals
 */
export function recalculateInvoice(invoice) {
  const calculatedItems = (invoice.items || []).map(calculateLineItem);
  const totals = calculateInvoiceTotals(calculatedItems);

  return {
    ...invoice,
    items: calculatedItems,
    totals,
  };
}

/**
 * ----------------------------------------------------------------------
 * formatPKR
 * ----------------------------------------------------------------------
 * Formats a rupee number for display as Pakistani currency, e.g.
 * 125000.5 -> "Rs. 125,000.50"
 *
 * Kept here (rather than a separate formatting file) since it directly
 * depends on the same rounding rules used above, ensuring displayed
 * values always match calculated values.
 *
 * @param {number} rupees
 * @param {object} [options]
 * @param {boolean} [options.withSymbol=true] - prefix with "Rs. "
 * @returns {string}
 */
export function formatPKR(rupees, options = {}) {
  const { withSymbol = true } = options;
  const rounded = roundCurrency(rupees);
  const formatted = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
  return withSymbol ? `Rs. ${formatted}` : formatted;
}

/**
 * Exported low-level helpers, in case Part 2 (forms/UI) or Part 3
 * (FBR API submission layer) need direct paisa-safe arithmetic
 * without going through the full item/invoice calculation pipeline.
 */
export const currencyMath = {
  rupeesToPaisa,
  paisaToRupees,
  multiplyPaisa,
};
