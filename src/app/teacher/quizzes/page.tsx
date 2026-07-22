import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

export default async function TeacherQuizzesPage() {
  await requireRole(["TEACHER"]);
  redirect("/teacher/lessons");
}
