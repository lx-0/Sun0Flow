import { prisma } from "@/lib/prisma";
import { type Result, success, Err } from "@/lib/result";

export async function resolveUserIdByUsername(
  username: string,
): Promise<Result<{ id: string }>> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (!user) return Err.notFound("User not found");
  return success(user);
}
