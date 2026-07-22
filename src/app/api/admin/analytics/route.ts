import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { adminOverview, getUserActivitySummaries } from "@/server/queries/admin";
import { listRecentActivities } from "@/server/queries/quizzes";

export async function GET() {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json({
    overview: adminOverview(),
    userActivity: getUserActivitySummaries(),
    recentActivity: listRecentActivities(10),
  });
}
