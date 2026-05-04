import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const amount = typeof body?.amount === "number" ? Math.trunc(body.amount) : null;
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 200) : "Admin adjustment";

  if (amount === null || amount === 0) {
    return NextResponse.json(
      { error: "amount must be a non-zero integer", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Record a credit usage entry. Positive amount = credit grant (negative cost),
  // negative amount = credit deduction (positive cost).
  await prisma.creditUsage.create({
    data: {
      userId: id,
      action: "admin_adjustment",
      creditCost: -amount, // negative means the user gains credits
      description: reason,
    },
  });

  await logAdminAction(
    admin!.id,
    "adjust_credits",
    id,
    `${amount > 0 ? "+" : ""}${amount} credits for user ${user.email}: ${reason}`
  );

  return NextResponse.json({ ok: true, amount });
}
