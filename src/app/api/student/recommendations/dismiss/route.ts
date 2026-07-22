import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { dismissRecommendation } from "@/server/services/quiz-service";

const schema = z.object({
  recommendationId: z.string(),
});

export async function POST(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  dismissRecommendation(auth.user.id, parsed.data.recommendationId);

  return NextResponse.json({ success: true });
}
