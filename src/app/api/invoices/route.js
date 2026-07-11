import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
async function getAuthenticatedUser() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}
export async function POST(request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  try {
    const invoice = await request.json();

    if (!invoice || !invoice.buyer || !Array.isArray(invoice.items)) {
      return NextResponse.json(
        { error: "Invalid invoice payload: missing buyer or items." },
        { status: 400 }
      );
    }
    const { buyer, seller, items, totals } = invoice;

    const created = await prisma.invoice.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        invoiceNumber: invoice.invoiceNumber,
        posId: invoice.posId ?? null,
        invoiceDateTime: invoice.invoiceDateTime
          ? new Date(invoice.invoiceDateTime)
          : new Date(),
        invoiceType: invoice.invoiceType,
        paymentMode: invoice.paymentMode,
        currency: invoice.currency ?? "PKR",

        buyerName: buyer.buyerName,
        buyerEmail: buyer.buyerEmail ?? null,
        buyerPhone: buyer.buyerPhone ?? null,
        buyerNTNCNIC: buyer.buyerNTNCNIC,
        buyerRegistrationType: buyer.buyerRegistrationType,
        buyerAddress: buyer.buyerAddress ?? null,
        buyerProvince: buyer.buyerProvince ?? null,

        seller: seller ?? null,

        totalExclusiveOfTax: totals.totalExclusiveOfTax,
        totalDiscount: totals.totalDiscount,
        totalSalesTax: totals.totalSalesTax,
        totalFurtherTax: totals.totalFurtherTax,
        totalExtraOrFed: totals.totalExtraOrFed,
        netPayable: totals.netPayable,
        totalItemsCount: totals.totalItemsCount,

        remarks: invoice.remarks ?? null,
        fbrInvoiceRefNo: invoice.fbrInvoiceRefNo ?? null,
        scenarioId: invoice.scenarioId ?? null,
        qrCode: invoice.qrCode ?? null,
        fbrSubmissionStatus: invoice.fbrSubmissionStatus ?? null,
        fbrErrorMessage: invoice.fbrErrorMessage ?? null,

        items: {
          create: items.map((item) => ({
            itemSKU: item.itemSKU,
            itemName: item.itemName,
            description: item.description ?? null,
            hsCode: item.hsCode ?? null,
            unitOfMeasurement: item.unitOfMeasurement,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            currency: item.currency ?? "PKR",
            discountAmount: item.discountAmount,
            exclusiveOfTaxAmount: item.exclusiveOfTaxAmount,
            salesTaxRate: item.salesTaxRate,
            salesTaxAmount: item.salesTaxAmount,
            furtherTaxAmount: item.furtherTaxAmount ?? null,
            extraOrFedAmount: item.extraOrFedAmount ?? null,
            totalNetAmount: item.totalNetAmount,
            sroScheduleNo: item.sroScheduleNo ?? null,
            sroItemSerialNo: item.sroItemSerialNo ?? null,
          })),
        },
      },
      include: { items: true },
    });

    return NextResponse.json({ invoice: created }, { status: 201 });
  } catch (err) {
    console.error("Invoice POST handler error:", err);

    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "You already have an invoice with this invoice number." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Unexpected server error.", details: err.message },
      { status: 500 }
    );
  }
}
export async function GET(request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit")) || 50;

    const invoices = await prisma.invoice.findMany({
      include: { items: true },
      orderBy: { invoiceDateTime: "desc" },
      take: limit,
    });

    return NextResponse.json({ invoices }, { status: 200 });
  } catch (err) {
    console.error("Invoice GET handler error:", err);
    return NextResponse.json(
      { error: "Unexpected server error.", details: err.message },
      { status: 500 }
    );
  }
}
