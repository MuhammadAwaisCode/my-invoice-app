/**
 * ============================================================================
 * FBR Digital Invoicing — API Middleware & Integration Service
 * ============================================================================
 * File: src/services/fbrService.js
 *
 * Part 4 of the Ideal Invoice Web Application.
 *
 * Handles all communication with Pakistan's FBR (Federal Board of Revenue)
 * Digital Invoicing (DI) API — the system that issues fiscal invoice
 * numbers (IRNs) and QR verification data for "Tax Asaan" app scanning.
 *
 * ----------------------------------------------------------------------
 * IMPORTANT — VERIFY BEFORE PRODUCTION USE
 * ----------------------------------------------------------------------
 * FBR's Digital Invoicing API (maintained by PRAL) has published several
 * technical spec versions (v1.0 through v1.12+), and exact field names,
 * response codes, and verification-URL formats have shifted between
 * versions. This file is built against the general v1.12-era DI API
 * shape (POST endpoints ending in `postinvoicedata` / `postinvoicedata_sb`,
 * Bearer token auth, per-item `hsCode`/`rate`/`uoM` fields). Before going
 * live, confirm the following against the CURRENT technical documentation
 * downloaded from https://fbr.gov.pk (search "Digital Invoicing Technical
 * Documentation") or your PRAL onboarding packet:
 *   1. The exact success/failure response code(s) — this file treats
 *      "a response that contains a valid invoiceNumber/IRN with no
 *      validation errors" as success, rather than hardcoding a single
 *      numeric code, specifically because that code has varied by version.
 *   2. The exact verification URL format for the Tax Asaan QR — this file
 *      exposes `verificationBaseUrl` as a config value for this reason.
 *   3. Static IP whitelisting is mandatory — FBR/PRAL blocks POST requests
 *      from non-whitelisted IPs regardless of token validity. Confirm your
 *      server's outbound IP is whitelisted before debugging "network"
 *      failures as if they were code bugs.
 * ----------------------------------------------------------------------
 *
 * This module is transport-agnostic (uses native `fetch`) so it runs
 * equally well in a Next.js Route Handler / Server Action (recommended —
 * never call FBR directly from the browser, since that would expose your
 * Bearer token to the client) or in a Node backend script.
 * ============================================================================
 */

// --------------------------------------------------------------------------
// Environment endpoint registry
// --------------------------------------------------------------------------

/**
 * FBR DI API base endpoints. Sandbox is for pre-production scenario
 * testing (requires a `scenarioId` on each invoice); production is for
 * live fiscal submission once all sandbox scenarios have passed.
 *
 * Source: FBR/PRAL Digital Invoicing technical documentation. Re-confirm
 * against the latest published PDF before go-live — PRAL has revised
 * these paths across spec versions.
 */
const FBR_ENDPOINTS = {
  sandbox: {
    post: "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb",
    validate: "https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb",
  },
  production: {
    post: "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata",
    validate: "https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata",
  },
};

/** Default verification URL template — CONFIRM against current FBR docs before go-live (see header note). */
const DEFAULT_VERIFICATION_BASE_URL = "https://fbr.gov.pk/invoice-verification";

/**
 * Structured error categories so calling UI code (the POS cashier screen)
 * can branch on `.type` without parsing message strings.
 */
export const FBR_ERROR_TYPES = {
  VALIDATION_ERROR: "VALIDATION_ERROR", // bad input caught before or by FBR (e.g. malformed NTN)
  NETWORK_ERROR: "NETWORK_ERROR", // request never reached/returned from FBR
  AUTH_ERROR: "AUTH_ERROR", // 401/403 — bad or expired Bearer token
  FBR_REJECTED: "FBR_REJECTED", // FBR received the request but rejected the invoice
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
};

/** Custom error class carrying a `.type` for clean cashier-facing fallback logic. */
export class FBRServiceError extends Error {
  constructor(message, type = FBR_ERROR_TYPES.UNKNOWN_ERROR, details = null) {
    super(message);
    this.name = "FBRServiceError";
    this.type = type;
    this.details = details;
  }
}

// --------------------------------------------------------------------------
// Validation helpers (fail fast, before spending a network round-trip)
// --------------------------------------------------------------------------

/** Same NTN/CNIC rule as Part 2's UI validation, re-checked server-side. */
function isValidNTNCNIC(value) {
  const digitsOnly = String(value || "").replace(/[\s-]/g, "");
  return /^\d{7}$/.test(digitsOnly) || /^\d{13}$/.test(digitsOnly);
}

function assertInvoiceIsSubmittable(invoice) {
  const problems = [];

  if (!invoice?.invoiceNumber) problems.push("invoiceNumber is required.");
  if (!invoice?.posId) problems.push("posId is required.");
  if (!invoice?.invoiceDateTime) problems.push("invoiceDateTime is required.");
  if (!invoice?.buyer?.buyerNTNCNIC || !isValidNTNCNIC(invoice.buyer.buyerNTNCNIC)) {
    problems.push("buyer.buyerNTNCNIC is missing or not a valid 7/13-digit NTN or 13-digit CNIC.");
  }
  if (!Array.isArray(invoice?.items) || invoice.items.length === 0) {
    problems.push("invoice.items must contain at least one line item.");
  }

  if (problems.length > 0) {
    throw new FBRServiceError(
      `Invoice failed pre-submission validation: ${problems.join(" ")}`,
      FBR_ERROR_TYPES.VALIDATION_ERROR,
      { problems }
    );
  }
}

// --------------------------------------------------------------------------
// Payload mapping — internal Invoice shape (Part 1) → FBR DI API schema
// --------------------------------------------------------------------------

/**
 * Maps a single calculated InvoiceLineItem (from Part 1's
 * `calculateLineItem`) into an FBR line-item object.
 *
 * Field name notes:
 *   - `hsCode` is FBR's Harmonized System code field. In Pakistan's
 *     tariff system this is equivalent to what's often informally called
 *     the "PCT Code" (Pakistan Customs Tariff) — the same field serves
 *     both purposes, so `taxCode`/`PCTCode` from our internal schema
 *     both map onto `hsCode` here.
 *   - `rate` is sent as a percentage-formatted string per FBR convention
 *     in published sample payloads (e.g. "18%"), not a bare number.
 *   - `saleType` defaults to a standard-rate goods classification; swap
 *     per your registered business nature/sector if you sell services
 *     (PRA/SRB) rather than goods.
 *
 * @param {object} item - calculated InvoiceLineItem
 * @returns {object} FBR-shaped item object
 */
function mapLineItemToFBR(item) {
  return {
    hsCode: item.hsCode || item.itemSKU || "0000.0000",
    productDescription: item.itemName,
    rate: `${item.salesTaxRate}%`,
    uoM: item.unitOfMeasurement || "PCS",
    quantity: item.quantity,
    totalValues: roundTo2(item.totalNetAmount),
    valueSalesExcludingST: roundTo2(item.exclusiveOfTaxAmount),
    salesTaxApplicable: roundTo2(item.salesTaxAmount),
    extraTax: roundTo2(item.extraOrFedAmount || 0),
    furtherTax: roundTo2(item.furtherTaxAmount || 0),
    discount: roundTo2(item.discountAmount),
    saleType: item.saleType || "Goods at standard rate (default)",
    sroScheduleNo: item.sroScheduleNo || "",
    sroItemSerialNo: item.sroItemSerialNo || "",
  };
}

function roundTo2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Builds the full FBR DI API request body from our internal `Invoice`
 * object (Part 1 shape) plus seller/registration details that live in
 * your app config rather than on the invoice itself.
 *
 * @param {object} invoice - Invoice object (see src/types/invoice.ts), already
 *                            run through `recalculateInvoice` (Part 1) so
 *                            every item and total is up to date.
 * @param {object} sellerInfo
 * @param {string} sellerInfo.sellerNTN
 * @param {string} sellerInfo.sellerBusinessName
 * @param {string} sellerInfo.sellerProvince
 * @param {string} sellerInfo.sellerAddress
 * @param {string} [sellerInfo.posId] - overrides invoice.posId if provided
 * @param {string} [scenarioId] - REQUIRED for sandbox submissions, omit in production
 * @returns {object} FBR-shaped invoice payload
 */
export function mapInvoiceToFBRPayload(invoice, sellerInfo, scenarioId = undefined) {
  const buyerRegistrationType =
    invoice.buyer.buyerRegistrationType === "REGISTERED" ? "Registered" : "Unregistered";

  const payload = {
    invoiceType: invoice.invoiceType === "SALE_INVOICE" ? "Sale Invoice" : invoice.invoiceType,
    invoiceDate: invoice.invoiceDateTime.slice(0, 10), // FBR expects date-only (YYYY-MM-DD)

    // Seller / issuer block
    sellerNTNCNIC: sellerInfo.sellerNTN,
    sellerBusinessName: sellerInfo.sellerBusinessName,
    sellerProvince: sellerInfo.sellerProvince,
    sellerAddress: sellerInfo.sellerAddress,

    // Buyer block
    buyerNTNCNIC: invoice.buyer.buyerNTNCNIC,
    buyerBusinessName: invoice.buyer.buyerName,
    buyerProvince: invoice.buyer.buyerProvince || sellerInfo.sellerProvince,
    buyerAddress: invoice.buyer.buyerAddress || "",
    buyerRegistrationType,

    // POS / invoice identity — POSId and InvoiceNumber as requested
    posId: sellerInfo.posId || invoice.posId,
    invoiceRefNo: invoice.invoiceNumber,

    // Invoice-level aggregates (computed totals, re-verified server-side —
    // never trust client-submitted totals as-is; recompute before sending
    // if this service runs where the raw items are also available).
    totalSaleValue: roundTo2(invoice.totals.totalExclusiveOfTax),
    totalTaxCharged: roundTo2(invoice.totals.totalSalesTax),
    netAmount: roundTo2(invoice.totals.netPayable),

    items: invoice.items.map(mapLineItemToFBR),
  };

  // scenarioId is only valid (and required) for sandbox test submissions.
  if (scenarioId) {
    payload.scenarioId = scenarioId;
  }

  return payload;
}

// --------------------------------------------------------------------------
// Verification URL / QR string builder
// --------------------------------------------------------------------------

/**
 * Builds the human/QR-facing verification URL for a successfully
 * submitted invoice, for embedding in the "Scan via FBR Tax Asaan App
 * to Verify" QR box built in Part 3.
 *
 * The exact query param name and path FBR uses for its own verification
 * portal should be confirmed against current documentation — this
 * function takes the base URL as a config value specifically so you can
 * correct it in one place without touching call sites.
 *
 * @param {string} fbrInvoiceNumber
 * @param {string} [verificationBaseUrl]
 * @returns {string}
 */
export function buildFBRVerificationUrl(
  fbrInvoiceNumber,
  verificationBaseUrl = DEFAULT_VERIFICATION_BASE_URL
) {
  const url = new URL(verificationBaseUrl);
  url.searchParams.set("invoiceNo", fbrInvoiceNumber);
  return url.toString();
}

// --------------------------------------------------------------------------
// Core service class
// --------------------------------------------------------------------------

/**
 * FBRService wraps environment selection, auth headers, request
 * dispatch, response parsing, and error normalization into one
 * reusable object. Instantiate once per seller/config and reuse across
 * requests (e.g. as a module-level singleton in your API route).
 */
export class FBRService {
  /**
   * @param {object} config
   * @param {"sandbox"|"production"} config.environment
   * @param {string} config.bearerToken - PRAL-issued security token for this environment
   * @param {object} config.sellerInfo - see mapInvoiceToFBRPayload's sellerInfo param
   * @param {string} [config.scenarioId] - sandbox-only test scenario id (e.g. "SN001")
   * @param {string} [config.verificationBaseUrl] - override for buildFBRVerificationUrl
   * @param {number} [config.timeoutMs=15000]
   * @param {boolean} [config.simulate=false] - if true, never calls the network;
   *        returns a realistic fake success response after a short delay.
   *        Use this for local development before you have live PRAL
   *        credentials or IP whitelisting sorted out.
   */
  constructor(config) {
    if (!config || !config.environment) {
      throw new FBRServiceError(
        "FBRService requires a config with at least `environment` set.",
        FBR_ERROR_TYPES.VALIDATION_ERROR
      );
    }
    this.environment = config.environment;
    this.bearerToken = config.bearerToken;
    this.sellerInfo = config.sellerInfo || {};
    this.scenarioId = config.scenarioId;
    this.verificationBaseUrl = config.verificationBaseUrl || DEFAULT_VERIFICATION_BASE_URL;
    this.timeoutMs = config.timeoutMs || 15000;
    this.simulate = Boolean(config.simulate);

    if (!this.simulate && !this.bearerToken) {
      throw new FBRServiceError(
        "FBRService requires `bearerToken` unless `simulate: true` is set.",
        FBR_ERROR_TYPES.AUTH_ERROR
      );
    }
  }

  /** Resolves the correct POST endpoint for the configured environment. */
  get endpoint() {
    return FBR_ENDPOINTS[this.environment]?.post;
  }

  /**
   * Submits a single invoice to FBR and returns a normalized result.
   *
   * @param {object} invoice - Invoice object (Part 1 shape), already recalculated
   * @returns {Promise<{
   *   success: boolean,
   *   fbrInvoiceNumber: string|null,
   *   verificationUrl: string|null,
   *   raw: object|null
   * }>}
   * @throws {FBRServiceError} on validation failure, network failure, auth
   *         failure, timeout, or an explicit FBR rejection. Callers should
   *         wrap this in try/catch and use `error.type` to decide the
   *         cashier-facing fallback (e.g. print a non-fiscal draft receipt
   *         and queue for retry, rather than crashing the POS UI).
   */
  async submitInvoice(invoice) {
    // 1. Fail fast on obviously bad input — no point spending a network
    //    round trip (or burning a sandbox rate-limit slot) on it.
    assertInvoiceIsSubmittable(invoice);

    // 2. Build the FBR-shaped payload from our internal invoice.
    const payload = mapInvoiceToFBRPayload(invoice, this.sellerInfo, this.scenarioId);

    // 3. Simulate mode — return a deterministic fake success without
    //    touching the network. Useful during local development.
    if (this.simulate) {
      return this._simulateResponse(invoice);
    }

    // 4. Real dispatch, with timeout + structured error handling.
    return this._dispatch(payload);
  }

  /** @private */
  async _simulateResponse(invoice) {
    await new Promise((resolve) => setTimeout(resolve, 400)); // mimic latency
    const fakeFbrInvoiceNumber = `SIM-${this.environment.toUpperCase()}-${invoice.invoiceNumber}`;
    return {
      success: true,
      fbrInvoiceNumber: fakeFbrInvoiceNumber,
      verificationUrl: buildFBRVerificationUrl(fakeFbrInvoiceNumber, this.verificationBaseUrl),
      raw: { simulated: true, message: "Simulated FBR response — no network call made." },
    };
  }

  /** @private */
  async _dispatch(payload) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.bearerToken}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutHandle);
      if (err.name === "AbortError") {
        throw new FBRServiceError(
          `FBR request timed out after ${this.timeoutMs}ms.`,
          FBR_ERROR_TYPES.TIMEOUT_ERROR
        );
      }
      // fetch throws on network-level failures (DNS, connection refused,
      // offline, non-whitelisted IP silently dropped, etc.)
      throw new FBRServiceError(
        `Network error while contacting FBR: ${err.message}`,
        FBR_ERROR_TYPES.NETWORK_ERROR,
        { originalError: err.message }
      );
    }
    clearTimeout(timeoutHandle);

    // Auth failures — bad/expired token, wrong environment token used.
    if (response.status === 401 || response.status === 403) {
      throw new FBRServiceError(
        "FBR rejected the request due to an invalid or expired Bearer token.",
        FBR_ERROR_TYPES.AUTH_ERROR,
        { status: response.status }
      );
    }

    let body;
    try {
      body = await response.json();
    } catch (err) {
      throw new FBRServiceError(
        "FBR response could not be parsed as JSON.",
        FBR_ERROR_TYPES.UNKNOWN_ERROR,
        { status: response.status }
      );
    }

    if (!response.ok) {
      throw new FBRServiceError(
        `FBR returned HTTP ${response.status}.`,
        FBR_ERROR_TYPES.FBR_REJECTED,
        { status: response.status, body }
      );
    }

    return this._parseSuccessBody(body);
  }

  /**
   * Parses a 200-level FBR response body into a normalized result.
   * FBR's DI API returns per-invoice validation info; different spec
   * versions have used slightly different field names for the fiscal
   * invoice number (commonly `invoiceNumber` or `irn`) and for
   * validation error arrays (commonly `validationResponse` /
   * `invalidInvoices`). This function checks the common variants
   * defensively rather than assuming one exact shape.
   *
   * @private
   */
  _parseSuccessBody(body) {
    const validation = body?.validationResponse || body;
    const statusCode = validation?.statusCode ?? validation?.responseCode;
    const hasErrors =
      Array.isArray(body?.invalidInvoices) && body.invalidInvoices.length > 0;

    const fbrInvoiceNumber =
      body?.invoiceNumber || body?.irn || validation?.invoiceNumber || null;

    const isSuccess = Boolean(fbrInvoiceNumber) && !hasErrors && statusCode !== "01";

    if (!isSuccess) {
      throw new FBRServiceError(
        validation?.error ||
          validation?.status ||
          "FBR rejected the invoice — see `details.raw` for the full response.",
        FBR_ERROR_TYPES.FBR_REJECTED,
        { raw: body }
      );
    }

    return {
      success: true,
      fbrInvoiceNumber,
      verificationUrl: buildFBRVerificationUrl(fbrInvoiceNumber, this.verificationBaseUrl),
      raw: body,
    };
  }
}

// --------------------------------------------------------------------------
// Convenience function — matches the requested `sendInvoiceToFBR(invoiceData, config)` signature
// --------------------------------------------------------------------------

/**
 * Convenience one-shot wrapper around `FBRService`, matching the exact
 * function signature requested: `sendInvoiceToFBR(invoiceData, config)`.
 *
 * Prefer instantiating `FBRService` directly and reusing it across many
 * invoices (e.g. as a singleton in your API route) if you're sending a
 * high volume of requests — this wrapper re-validates config on every
 * call, which is a negligible cost for POS-scale (one invoice at a time)
 * usage but unnecessary overhead in a batch job.
 *
 * @param {object} invoiceData - Invoice object (Part 1 shape), pre-recalculated
 * @param {object} config - same shape as `FBRService` constructor config
 * @returns {Promise<{success: boolean, fbrInvoiceNumber: string, verificationUrl: string, raw: object}>}
 *
 * @example
 * try {
 *   const result = await sendInvoiceToFBR(invoice, {
 *     environment: "sandbox",
 *     bearerToken: process.env.FBR_SANDBOX_TOKEN,
 *     scenarioId: "SN001",
 *     sellerInfo: {
 *       sellerNTN: "1234567",
 *       sellerBusinessName: "Awais Retail Store",
 *       sellerProvince: "Punjab",
 *       sellerAddress: "Lahore, Pakistan",
 *       posId: "POS-001",
 *     },
 *   });
 *   // Persist result.fbrInvoiceNumber + result.verificationUrl back onto
 *   // the invoice record, then re-render InvoicePrint (Part 3) with them.
 * } catch (error) {
 *   if (error.type === FBR_ERROR_TYPES.NETWORK_ERROR || error.type === FBR_ERROR_TYPES.TIMEOUT_ERROR) {
 *     // Fall back gracefully: print a non-fiscal draft, queue for retry,
 *     // let the cashier continue serving customers.
 *   } else if (error.type === FBR_ERROR_TYPES.VALIDATION_ERROR) {
 *     // Surface the specific field problem to the cashier immediately.
 *   }
 * }
 */
export async function sendInvoiceToFBR(invoiceData, config) {
  const service = new FBRService(config);
  return service.submitInvoice(invoiceData);
}
