import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

export default async function TeacherQuestionsPage() {
  await requireRole(["TEACHER"]);
  redirect("/teacher/lessons");
}
