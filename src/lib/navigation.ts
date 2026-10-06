import type { Role } from "@/domain/types";

export type NavItem = {
  label: string;
  href: string;
};

const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Users", href: "/admin/users" },
  { label: "Subjects", href: "/admin/subjects" },
  { label: "Sections", href: "/admin/sections" },
  { label: "Analytics", href: "/admin/analytics" },
  { label: "Settings", href: "/admin/settings" },
];

export function roleNavigation(role: Role) {
  if (role === "ADMIN") {
    return adminNav;
  }

  if (role === "TEACHER") {
    return [
      { label: "Dashboard", href: "/teacher" },
      { label: "Students", href: "/teacher/students" },
      { label: "Subjects", href: "/teacher/subjects" },
      { label: "Sections", href: "/teacher/sections" },
      { label: "Analytics", href: "/teacher/analytics" },
    ];
  }

  return [
    { label: "Dashboard", href: "/student" },
    { label: "Subjects", href: "/student/subjects" },
    { label: "Lessons", href: "/student/lessons" },
    { label: "Quizzes", href: "/student/quizzes" },
    { label: "Practice", href: "/student/practice" },
    { label: "Results", href: "/student/results" },
    { label: "Achievements", href: "/student/achievements" },
    { label: "Profile", href: "/student/profile" },
  ];
}
