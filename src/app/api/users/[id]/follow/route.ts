import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/event-bus";
import { checkFirstFollowerMilestone } from "@/lib/streaks";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    const followerId = session.user.id;
    const followingId = params.id;

    if (followerId === followingId) {
      return NextResponse.json(
        { error: "You cannot follow yourself", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Verify target user exists
    const target = await prisma.user.findUnique({
      where: { id: followingId },
      select: { id: true, name: true, username: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const { created } = await prisma.$transaction(async (tx) => {
      const existing = await tx.follow.findUnique({
        where: { followerId_followingId: { followerId, followingId } },
      });
      if (!existing) {
        await tx.follow.create({ data: { followerId, followingId } });
        return { created: true };
      }
      return { created: false };
    });

    // Notify the followed user (only on new follows, not re-follows)
    if (created) {
      try {
        const follower = await prisma.user.findUnique({
          where: { id: followerId },
          select: { name: true, username: true },
        });
        const followerName = follower?.name ?? follower?.username ?? "Someone";
        const profileHref = follower?.username ? `/u/${follower.username}` : undefined;
        const notification = await prisma.notification.create({
          data: {
            userId: followingId,
            type: "new_follower",
            title: "New follower",
            message: `${followerName} started following you`,
            href: profileHref ?? null,
          },
        });
        broadcast(followingId, {
          type: "notification",
          data: { id: notification.id, type: "new_follower" },
        });
      } catch {
        // Non-critical
      }

      // Check first-follower milestone (fire-and-forget)
      checkFirstFollowerMilestone(followingId).catch(() => {});
    }

    return NextResponse.json({ following: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    const followerId = session.user.id;
    const followingId = params.id;

    await prisma.follow.deleteMany({
      where: { followerId, followingId },
    });

    return NextResponse.json({ following: false });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
