/**
 * ============================================================================
 * FBR-Compliant Invoice Data Schema
 * ============================================================================
 * File: src/types/invoice.ts
 *
 * Purpose:
 *   Defines the core TypeScript data structures for the Ideal Invoice Web
 *   Application. This schema is designed to be a superset of the fields
 *   required for Pakistan's FBR (Federal Board of Revenue) Invoice
 *   Monitoring System (IMS) and Point-of-Sale (POS) integration, while
 *   remaining flexible enough for provincial revenue authorities
 *   (PRA/SRB/KPRA/BRA) with differing sales tax rates on services.
 *
 * Notes on FBR/PRA compliance:
 *   - `buyerNTNCNIC` is mandatory per FBR invoicing rules — either a 7 or
 *     13-digit NTN, or a 13-digit CNIC (no dashes), depending on buyer type.
 *   - Sales tax rates commonly seen: 18% (FBR standard goods rate),
 *     15%/16% (PRA - Punjab Revenue Authority services rate), and other
 *     provincial variants. The schema keeps `salesTaxRate` fully dynamic
 *     (not hardcoded) so it can support any current or future rate.
 *   - Fields such as `fbrInvoiceRefNo`, `qrCode`, and `scenarioId` are
 *     included as OPTIONAL fields to be populated once the app integrates
 *     with the live FBR IMS/POS API (FBR returns these upon submission).
 *     They are safe to ignore until that integration phase.
 *
 * All monetary fields are typed as `number` but MUST be treated as
 * currency values with 2 decimal places of precision. Never perform raw
 * floating-point arithmetic directly on these fields in UI code — always
 * route calculations through `src/utils/calculations.js` (Part 1, file 2)
 * to avoid floating-point rounding bugs.
 * ============================================================================
 */

/**
 * Buyer type distinguishes which identity document is mandatory.
 * FBR requires NTN for registered businesses and CNIC for unregistered
 * individual/end consumers when the invoice value crosses certain
 * thresholds.
 */
export type BuyerRegistrationType = "REGISTERED" | "UNREGISTERED";

/**
 * Standard FBR/PRA invoice type classifications.
 * "SALE_INVOICE" is the default. Others are included for future-proofing
 * once debit/credit note workflows are added.
 */
export type InvoiceType =
  | "SALE_INVOICE"
  | "DEBIT_NOTE"
  | "CREDIT_NOTE"
  | "REFUND";

/**
 * Payment mode captured at POS. Useful for POS reconciliation and for
 * the `saleType` field FBR expects in some payload variants.
 */
export type PaymentMode =
  | "CASH"
  | "CARD"
  | "MOBILE_WALLET"
  | "BANK_TRANSFER"
  | "CREDIT"
  | "OTHER";

/**
 * Unit of Measurement — FBR IMS payloads require a UoM code per line
 * item (e.g. "PCS", "KG", "LTR", "DOZ", "NUMBER, PIECES"). Kept as a
 * plain string to avoid over-constraining before FBR's official UoM
 * list is wired in.
 */
export type UnitOfMeasurement = string;

/**
 * ----------------------------------------------------------------------
 * Line Item
 * ----------------------------------------------------------------------
 * Represents a single product/service row on the invoice.
 *
 * Calculation order (enforced by calculations.js, not by this type):
 *   1. exclusiveAmount   = quantity * unitPrice
 *   2. discountAmount    applied against exclusiveAmount
 *   3. taxableAmount     = exclusiveAmount - discountAmount
 *   4. salesTaxAmount    = taxableAmount * (salesTaxRate / 100)
 *   5. totalNetAmount    = taxableAmount + salesTaxAmount
 */
export interface InvoiceLineItem {
  /** Internal unique row id (e.g. crypto.randomUUID()) — for React keys / state management, not sent to FBR. */
  id: string;

  /** Stock Keeping Unit / product code used internally. */
  itemSKU: string;

  /** Human-readable product or service name. */
  itemName: string;

  /** Optional free-text description (useful for services under PRA/SRB). */
  description?: string;

  /** Optional FBR HS Code (Harmonized System code) — required for some FBR goods categories. */
  hsCode?: string;

  /** Unit of measurement, e.g. "PCS", "KG", "DOZEN". */
  unitOfMeasurement: UnitOfMeasurement;

  /** Quantity sold. Must be > 0. */
  quantity: number;

  /** Price per single unit, EXCLUSIVE of tax. Must be >= 0. */
  unitPrice: number;

  /**
   * Discount applied at line-item level.
   * Stored as a flat currency amount (not a percentage) to keep
   * downstream math unambiguous. If you collect a discount %,
   * convert it to an amount before storing here.
   */
  discountAmount: number;

  /**
   * exclusiveOfTaxAmount = (quantity * unitPrice) - discountAmount
   * This is the taxable base. Computed field — populate via
   * calculations.js, do not hand-edit in forms.
   */
  exclusiveOfTaxAmount: number;

  /**
   * Sales tax rate as a percentage number, e.g. 18 for 18%, 15 for
   * PRA services, 16 for SRB services. Kept fully dynamic — do NOT
   * hardcode a default in the UI without checking buyer's province
   * and item category.
   */
  salesTaxRate: number;

  /**
   * salesTaxAmount = exclusiveOfTaxAmount * (salesTaxRate / 100)
   * Computed field — populate via calculations.js.
   */
  salesTaxAmount: number;

  /** Optional further tax (commonly applied on sales to unregistered persons). */
  furtherTaxAmount?: number;

  /** Optional extra tax / FED (Federal Excise Duty) if applicable to this item. */
  extraOrFedAmount?: number;

  /**
   * totalNetAmount = exclusiveOfTaxAmount + salesTaxAmount
   *                  + (furtherTaxAmount || 0) + (extraOrFedAmount || 0)
   * Computed field — this is what the buyer actually pays for this line.
   */
  totalNetAmount: number;

  /** Optional FBR SRO (Statutory Regulatory Order) schedule number, if the item falls under a special tax notification. */
  sroScheduleNo?: string;
  sroItemSerialNo?: string;
}

/**
 * ----------------------------------------------------------------------
 * Buyer Details
 * ----------------------------------------------------------------------
 */
export interface BuyerDetails {
  /** Full legal name of the buyer / customer. */
  buyerName: string;

  /**
   * Mandatory for FBR compliance. Either:
   *   - NTN (National Tax Number): 7 or 13 digits, for registered businesses
   *   - CNIC: 13 digits (no dashes), for unregistered individuals
   * Validate format in the UI layer based on `buyerRegistrationType`.
   */
  buyerNTNCNIC: string;

  /** Whether the buyer is FBR-registered (affects tax treatment/further tax). */
  buyerRegistrationType: BuyerRegistrationType;

  buyerEmail?: string;
  buyerPhone?: string;

  /** Buyer's business/registered address — often required for B2B invoices. */
  buyerAddress?: string;

  /** Province is important because PRA/SRB/KPRA/BRA service tax rates differ by province. */
  buyerProvince?: string;
}

/**
 * ----------------------------------------------------------------------
 * Seller Details
 * ----------------------------------------------------------------------
 * Not explicitly requested in Part 1 scope, but included as an optional
 * block since every FBR invoice requires seller identification too.
 * Safe to leave undefined until the Seller/Settings module is built.
 */
export interface SellerDetails {
  sellerName: string;
  sellerNTN: string;
  sellerAddress?: string;
  sellerProvince?: string;
  posId: string;
}

/**
 * ----------------------------------------------------------------------
 * Invoice Totals (Global Aggregates)
 * ----------------------------------------------------------------------
 * All fields here are computed by summing the corresponding per-line
 * values in `InvoiceLineItem[]` via calculations.js. Never manually set
 * these in form state — always derive them.
 */
export interface InvoiceTotals {
  /** Sum of all line items' exclusiveOfTaxAmount. */
  totalExclusiveOfTax: number;

  /** Sum of all line items' discountAmount. */
  totalDiscount: number;

  /** Sum of all line items' salesTaxAmount. */
  totalSalesTax: number;

  /** Sum of all line items' furtherTaxAmount. */
  totalFurtherTax: number;

  /** Sum of all line items' extraOrFedAmount. */
  totalExtraOrFed: number;

  /**
   * netPayable = totalExclusiveOfTax + totalSalesTax
   *              + totalFurtherTax + totalExtraOrFed
   * This is the final amount the buyer must pay.
   */
  netPayable: number;

  /** Total count of distinct line items (not quantity sum) — useful for POS receipt formatting. */
  totalItemsCount: number;
}

/**
 * ----------------------------------------------------------------------
 * Master Invoice Object
 * ----------------------------------------------------------------------
 * This is the root object your forms, calculation utils, PDF generator,
 * and (later) FBR API submission layer will all read from / write to.
 */
export interface Invoice {
  /** Internal unique invoice id (e.g. UUID) for DB/local storage keying. */
  id: string;

  /** Human-facing / sequential invoice number, e.g. "INV-2026-000123". */
  invoiceNumber: string;

  /** POS terminal identifier that generated this invoice — mandatory for FBR POS integration. */
  posId: string;

  /** ISO 8601 datetime string, e.g. "2026-07-01T14:32:00+05:00". Always store in ISO format; format for display in the UI layer only. */
  invoiceDateTime: string;

  invoiceType: InvoiceType;

  /** Payment method captured at checkout. */
  paymentMode: PaymentMode;

  buyer: BuyerDetails;

  /** Optional — populate once Seller/Settings module exists. */
  seller?: SellerDetails;

  items: InvoiceLineItem[];

  totals: InvoiceTotals;

  /** Free-text notes / remarks printed on the invoice footer. */
  remarks?: string;

  /** Currency code — kept explicit for future multi-currency support. Default should be "PKR". */
  currency: string;

  // ------------------------------------------------------------------
  // FBR IMS/POS integration fields (all optional until that phase)
  // ------------------------------------------------------------------

  /** Reference number returned by FBR upon successful invoice submission. */
  fbrInvoiceRefNo?: string;

  /** FBR scenario ID used during sandbox/testing submissions. */
  scenarioId?: string;

  /** QR code payload/string returned by FBR, to be rendered on the printed receipt. */
  qrCode?: string;

  /** Submission status against FBR's system. */
  fbrSubmissionStatus?: "PENDING" | "SUBMITTED" | "VALIDATED" | "REJECTED";

  /** Raw error message from FBR, if `fbrSubmissionStatus` is "REJECTED". */
  fbrErrorMessage?: string;
}

/**
 * ----------------------------------------------------------------------
 * Factory Helpers (type-safe empty objects for forms)
 * ----------------------------------------------------------------------
 * These are plain factory functions (not classes) so they stay
 * serializable and easy to use with React state / form libraries.
 */

export function createEmptyLineItem(id: string): InvoiceLineItem {
  return {
    id,
    itemSKU: "",
    itemName: "",
    unitOfMeasurement: "PCS",
    quantity: 1,
    unitPrice: 0,
    discountAmount: 0,
    exclusiveOfTaxAmount: 0,
    salesTaxRate: 18, // sensible FBR standard default; override per item/province as needed
    salesTaxAmount: 0,
    totalNetAmount: 0,
  };
}

export function createEmptyTotals(): InvoiceTotals {
  return {
    totalExclusiveOfTax: 0,
    totalDiscount: 0,
    totalSalesTax: 0,
    totalFurtherTax: 0,
    totalExtraOrFed: 0,
    netPayable: 0,
    totalItemsCount: 0,
  };
}

export function createEmptyInvoice(id: string): Invoice {
  return {
    id,
    invoiceNumber: "",
    posId: "",
    invoiceDateTime: new Date().toISOString(),
    invoiceType: "SALE_INVOICE",
    paymentMode: "CASH",
    buyer: {
      buyerName: "",
      buyerNTNCNIC: "",
      buyerRegistrationType: "UNREGISTERED",
    },
    items: [],
    totals: createEmptyTotals(),
    currency: "PKR",
  };
}
