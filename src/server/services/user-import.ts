import crypto from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { normalizeImportGender, normalizeImportRole, type ParsedUserImportRow } from "@/lib/user-import-csv";
import type { Role } from "@/domain/types";
import type { UserImportSummary } from "@/lib/user-import-types";
import {
  addStudentToSection,
  assignTeacherToSection,
  findDefaultSectionOwnerTeacherId,
  getOrCreateActiveSectionForImport,
  listSectionSubjectIds,
  studentSectionMembership,
} from "@/server/queries/sections";
import { createUser, getUserByEmail } from "@/server/queries/users";

export type { UserImportRowResult, UserImportSummary } from "@/lib/user-import-types";

const emailSchema = z.string().email();
const fullNameSchema = z.string().min(2).max(120);

type EnrollmentContext = "new" | "existing";

function enrollmentFailurePrefix(context: EnrollmentContext) {
  return context === "existing" ? "Existing student:" : "User created but";
}

function resolveSectionEnrollment(
  row: ParsedUserImportRow,
  role: Role,
  userId: string,
  assignedById?: string,
  context: EnrollmentContext = "new",
): { applied: boolean; warning?: string; warnings?: string[] } {
  if (role === "ADMIN") {
    return { applied: false };
  }

  const sectionName = row.sectionName.trim();
  if (!sectionName) {
    return { applied: false };
  }

  const ownerTeacherId =
    role === "TEACHER" ? userId : findDefaultSectionOwnerTeacherId(undefined, assignedById);

  if (!ownerTeacherId) {
    return {
      applied: false,
      warning: `${enrollmentFailurePrefix(context)} section "${sectionName}" was not created because no active user is available to own the section.`,
    };
  }

  let sectionId: string;
  let resolvedSectionName = sectionName;
  const extraWarnings: string[] = [];

  try {
    const section = getOrCreateActiveSectionForImport({
      name: sectionName,
      ownerTeacherId,
      assignedById,
    });
    sectionId = section.sectionId;
    resolvedSectionName = section.sectionName;
    if (section.created) {
      extraWarnings.push(
        `Created new section "${resolvedSectionName}". Add subjects in Admin > Sections when ready.`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create or resolve section.";
    return {
      applied: false,
      warning: `${enrollmentFailurePrefix(context)} section assignment failed: ${message}`,
    };
  }

  try {
    if (role === "STUDENT") {
      addStudentToSection(sectionId, userId, assignedById);
      return { applied: true, warnings: extraWarnings.length > 0 ? extraWarnings : undefined };
    }

    if (role === "TEACHER") {
      assignTeacherToSection(sectionId, userId, assignedById);
      const subjectCount = listSectionSubjectIds(sectionId).length;
      if (subjectCount === 0) {
        extraWarnings.push(`Teacher added to section "${resolvedSectionName}" but the section has no subjects yet.`);
      }
      return { applied: true, warnings: extraWarnings.length > 0 ? extraWarnings : undefined };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to assign section.";
    return {
      applied: false,
      warning: `${enrollmentFailurePrefix(context)} section assignment failed: ${message}`,
    };
  }

  return { applied: false };
}

function appendEnrollmentWarnings(
  summary: UserImportSummary,
  rowNumber: number,
  email: string,
  enrollment: { applied: boolean; warning?: string; warnings?: string[] },
) {
  const warningMessages = [...(enrollment.warnings ?? []), ...(enrollment.warning ? [enrollment.warning] : [])];
  for (const message of warningMessages) {
    summary.warnings += 1;
    summary.results.push({
      rowNumber,
      status: "warning",
      email,
      message,
    });
  }
}

export function importUsersFromRows(params: {
  rows: ParsedUserImportRow[];
  passwordHash: string;
  createdById?: string;
}): UserImportSummary {
  const summary: UserImportSummary = {
    created: 0,
    enrolled: 0,
    skipped: 0,
    errors: 0,
    warnings: 0,
    results: [],
  };

  const seenEmails = new Set<string>();

  const importRoleOrder: Record<Role, number> = {
    TEACHER: 0,
    STUDENT: 1,
    ADMIN: 2,
  };

  const orderedRows = [...params.rows].sort((left, right) => {
    const leftRole = normalizeImportRole(left.userTypeRaw) ?? "ADMIN";
    const rightRole = normalizeImportRole(right.userTypeRaw) ?? "ADMIN";
    const orderDiff = importRoleOrder[leftRole] - importRoleOrder[rightRole];
    return orderDiff !== 0 ? orderDiff : left.rowNumber - right.rowNumber;
  });

  for (const row of orderedRows) {
    const emailNormalized = row.email.trim().toLowerCase();
    const fullName = row.fullName.trim();

    if (!fullNameSchema.safeParse(fullName).success) {
      summary.errors += 1;
      summary.results.push({
        rowNumber: row.rowNumber,
        status: "error",
        email: row.email,
        reason: "Full name must be at least 2 characters.",
      });
      continue;
    }

    if (!emailSchema.safeParse(emailNormalized).success) {
      summary.errors += 1;
      summary.results.push({
        rowNumber: row.rowNumber,
        status: "error",
        email: row.email,
        reason: "Invalid email address.",
      });
      continue;
    }

    const role = normalizeImportRole(row.userTypeRaw);
    if (!role) {
      summary.errors += 1;
      summary.results.push({
        rowNumber: row.rowNumber,
        status: "error",
        email: emailNormalized || row.email,
        reason: `Unknown user type "${row.userTypeRaw}". Use student, teacher, or admin.`,
      });
      continue;
    }

    const gender = normalizeImportGender(row.genderRaw);
    if (!gender) {
      summary.errors += 1;
      summary.results.push({
        rowNumber: row.rowNumber,
        status: "error",
        email: emailNormalized || row.email,
        reason: `Unknown gender "${row.genderRaw}". Use male or female.`,
      });
      continue;
    }

    if (seenEmails.has(emailNormalized)) {
      summary.skipped += 1;
      summary.results.push({
        rowNumber: row.rowNumber,
        status: "skipped",
        email: emailNormalized,
        reason: "Duplicate email in this import file.",
      });
      continue;
    }
    seenEmails.add(emailNormalized);

    const existingUser = getUserByEmail(emailNormalized);
    if (existingUser) {
      if (existingUser.role !== "STUDENT" || role !== "STUDENT") {
        summary.skipped += 1;
        summary.results.push({
          rowNumber: row.rowNumber,
          status: "skipped",
          email: emailNormalized,
          reason: "User with this email already exists.",
        });
        continue;
      }

      const memberships = studentSectionMembership(existingUser.id);
      if (memberships.length > 0) {
        summary.skipped += 1;
        summary.results.push({
          rowNumber: row.rowNumber,
          status: "skipped",
          email: emailNormalized,
          reason: `Student already assigned to section "${memberships[0]!.sectionName}".`,
        });
        continue;
      }

      if (!row.sectionName.trim()) {
        summary.skipped += 1;
        summary.results.push({
          rowNumber: row.rowNumber,
          status: "skipped",
          email: emailNormalized,
          reason: "Student exists but CSV has no section to assign.",
        });
        continue;
      }

      const enrollment = resolveSectionEnrollment(row, "STUDENT", existingUser.id, params.createdById, "existing");
      if (enrollment.applied) {
        summary.enrolled += 1;
        summary.results.push({
          rowNumber: row.rowNumber,
          status: "enrolled",
          email: emailNormalized,
          sectionApplied: true,
        });
      }
      appendEnrollmentWarnings(summary, row.rowNumber, emailNormalized, enrollment);
      continue;
    }

    const userId = crypto.randomUUID();

    try {
      const db = getDb();
      db.transaction(() => {
        createUser({
          id: userId,
          email: emailNormalized,
          passwordHash: params.passwordHash,
          fullName,
          gender,
          role,
          createdById: params.createdById,
        });
      })();

      const enrollment = resolveSectionEnrollment(row, role, userId, params.createdById, "new");

      summary.created += 1;
      summary.results.push({
        rowNumber: row.rowNumber,
        status: "created",
        email: emailNormalized,
        role,
        sectionApplied: enrollment.applied,
      });

      appendEnrollmentWarnings(summary, row.rowNumber, emailNormalized, enrollment);
    } catch (error) {
      summary.errors += 1;
      const message = error instanceof Error ? error.message : "Unable to create user.";
      summary.results.push({
        rowNumber: row.rowNumber,
        status: "error",
        email: emailNormalized,
        reason: message,
      });
    }
  }

  return summary;
}
