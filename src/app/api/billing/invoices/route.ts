import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import getStripe from "@/lib/stripe";

export interface InvoiceItem {
  id: string;
  date: string; // ISO
  amount: number; // in cents
  currency: string;
  status: string; // "paid" | "open" | "void" | "uncollectible"
  invoicePdf: string | null;
  hostedInvoiceUrl: string | null;
  description: string | null;
}

// GET /api/billing/invoices
// Returns the last 12 invoices for the authenticated user's Stripe subscription.
export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    });

    // Free users or users without a real Stripe customer have no invoices
    if (!subscription || subscription.stripeCustomerId.startsWith("free_")) {
      return NextResponse.json({ invoices: [] });
    }

    const stripe = getStripe();
    const stripeInvoices = await stripe.invoices.list({
      customer: subscription.stripeCustomerId,
      limit: 12,
    });

    const invoices: InvoiceItem[] = stripeInvoices.data.map((inv) => ({
      id: inv.id,
      date: new Date((inv.created ?? 0) * 1000).toISOString(),
      amount: inv.amount_paid ?? inv.total ?? 0,
      currency: inv.currency ?? "usd",
      status: inv.status ?? "unknown",
      invoicePdf: inv.invoice_pdf ?? null,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      description: inv.lines?.data?.[0]?.description ?? null,
    }));

    return NextResponse.json({ invoices });
  } catch (error) {
    logServerError("billing-invoices-get", error, {
      route: "/api/billing/invoices",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
