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
} from "@/server/queries/sections";
import { createUser, getUserByEmail } from "@/server/queries/users";

export type { UserImportRowResult, UserImportSummary } from "@/lib/user-import-types";

const emailSchema = z.string().email();
const fullNameSchema = z.string().min(2).max(120);

function resolveSectionEnrollment(
  row: ParsedUserImportRow,
  role: Role,
  userId: string,
  assignedById?: string,
): { applied: boolean; warning?: string; warnings?: string[] } {
  if (role === "ADMIN") {
    return { applied: false };
  }

  const sectionName = row.sectionName.trim();
  if (!sectionName) {
    return { applied: false };
  }

  const ownerTeacherId =
    role === "TEACHER" ? userId : findDefaultSectionOwnerTeacherId();

  if (!ownerTeacherId) {
    return {
      applied: false,
      warning: `User created but section "${sectionName}" was not created because no active teacher exists in the system.`,
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
    return { applied: false, warning: `User created but section assignment failed: ${message}` };
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
    return { applied: false, warning: `User created but section assignment failed: ${message}` };
  }

  return { applied: false };
}

export function importUsersFromRows(params: {
  rows: ParsedUserImportRow[];
  passwordHash: string;
  createdById?: string;
}): UserImportSummary {
  const summary: UserImportSummary = {
    created: 0,
    skipped: 0,
    errors: 0,
    warnings: 0,
    results: [],
  };

  const seenEmails = new Set<string>();

  for (const row of params.rows) {
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

    if (getUserByEmail(emailNormalized)) {
      summary.skipped += 1;
      summary.results.push({
        rowNumber: row.rowNumber,
        status: "skipped",
        email: emailNormalized,
        reason: "User with this email already exists.",
      });
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

      const enrollment = resolveSectionEnrollment(row, role, userId, params.createdById);

      summary.created += 1;
      summary.results.push({
        rowNumber: row.rowNumber,
        status: "created",
        email: emailNormalized,
        role,
        sectionApplied: enrollment.applied,
      });

      const warningMessages = [
        ...(enrollment.warnings ?? []),
        ...(enrollment.warning ? [enrollment.warning] : []),
      ];
      for (const message of warningMessages) {
        summary.warnings += 1;
        summary.results.push({
          rowNumber: row.rowNumber,
          status: "warning",
          email: emailNormalized,
          message,
        });
      }
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
