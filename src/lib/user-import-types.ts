import type { Role } from "@/domain/types";

export type UserImportRowResult =
  | { rowNumber: number; status: "created"; email: string; role: Role; sectionApplied: boolean }
  | { rowNumber: number; status: "enrolled"; email: string; sectionApplied: boolean }
  | { rowNumber: number; status: "skipped"; email: string; reason: string }
  | { rowNumber: number; status: "error"; email: string; reason: string }
  | { rowNumber: number; status: "warning"; email: string; message: string };

export type UserImportSummary = {
  created: number;
  enrolled: number;
  skipped: number;
  errors: number;
  warnings: number;
  results: UserImportRowResult[];
};
