import { NextResponse } from "next/server";
import { isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ stripeConfigured: isStripeConfigured() });
}
