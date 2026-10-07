import type { Gender, Role } from "@/domain/types";

export type ParsedUserImportRow = {
  rowNumber: number;
  fullName: string;
  email: string;
  genderRaw: string;
  userTypeRaw: string;
  sectionName: string;
};

export type UserImportCsvParseResult =
  | { ok: true; rows: ParsedUserImportRow[] }
  | { ok: false; error: string };

const FULL_NAME_HEADERS = new Set(["full name", "fullname", "name", "full_name"]);
const EMAIL_HEADERS = new Set(["email", "e-mail", "email address"]);
const USER_TYPE_HEADERS = new Set(["user type", "usertype", "role", "user_type", "type"]);
const SECTION_HEADERS = new Set(["section", "section name", "section_name"]);
const GENDER_HEADERS = new Set(["gender", "sex"]);

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      current += char;
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      current += char;
    } else if (char === "\n") {
      rows.push(current);
      current = "";
    } else if (char === "\r") {
      if (text[i + 1] === "\n") {
        i += 1;
      }
      rows.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (current.length > 0 || text.endsWith("\n") || text.endsWith("\r")) {
    rows.push(current);
  }

  return rows.filter((row) => row.trim().length > 0);
}

function mapHeaderIndices(headers: string[]) {
  let fullNameIdx = -1;
  let emailIdx = -1;
  let userTypeIdx = -1;
  let sectionIdx = -1;
  let genderIdx = -1;

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (FULL_NAME_HEADERS.has(normalized)) {
      fullNameIdx = index;
    } else if (EMAIL_HEADERS.has(normalized)) {
      emailIdx = index;
    } else if (USER_TYPE_HEADERS.has(normalized)) {
      userTypeIdx = index;
    } else if (SECTION_HEADERS.has(normalized)) {
      sectionIdx = index;
    } else if (GENDER_HEADERS.has(normalized)) {
      genderIdx = index;
    }
  });

  return { fullNameIdx, emailIdx, userTypeIdx, sectionIdx, genderIdx };
}

export function normalizeImportGender(raw: string): Gender | null {
  const value = raw.trim().toLowerCase();
  if (value === "male" || value === "m") {
    return "MALE";
  }
  if (value === "female" || value === "f") {
    return "FEMALE";
  }
  return null;
}

export function normalizeImportRole(raw: string): Role | null {
  const value = raw.trim().toLowerCase();
  if (value === "student" || value === "students") {
    return "STUDENT";
  }
  if (value === "teacher" || value === "teachers") {
    return "TEACHER";
  }
  if (value === "admin" || value === "administrator" || value === "admins") {
    return "ADMIN";
  }
  return null;
}

export function parseUserImportCsv(text: string): UserImportCsvParseResult {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return { ok: false, error: "CSV file is empty." };
  }

  const rawRows = splitCsvRows(trimmed);
  if (rawRows.length < 2) {
    return { ok: false, error: "CSV must include a header row and at least one data row." };
  }

  const headerFields = parseCsvLine(rawRows[0] ?? "");
  const { fullNameIdx, emailIdx, userTypeIdx, sectionIdx, genderIdx } = mapHeaderIndices(headerFields);

  if (fullNameIdx < 0 || emailIdx < 0 || userTypeIdx < 0 || genderIdx < 0) {
    return {
      ok: false,
      error: "CSV must include columns: full name, email, gender, and user type (section is optional).",
    };
  }

  const rows: ParsedUserImportRow[] = [];
  for (let i = 1; i < rawRows.length; i += 1) {
    const fields = parseCsvLine(rawRows[i] ?? "");
    const fullName = (fields[fullNameIdx] ?? "").trim();
    const email = (fields[emailIdx] ?? "").trim();
    const userTypeRaw = (fields[userTypeIdx] ?? "").trim();
    const genderRaw = (fields[genderIdx] ?? "").trim();
    const sectionName = sectionIdx >= 0 ? (fields[sectionIdx] ?? "").trim() : "";

    rows.push({
      rowNumber: i + 1,
      fullName,
      email,
      genderRaw,
      userTypeRaw,
      sectionName,
    });
  }

  return { ok: true, rows };
}

export const USER_IMPORT_CSV_TEMPLATE = `full name,email,gender,user type,section
Jane Student,jane.student@example.com,female,student,Grade 10-A
John Teacher,john.teacher@example.com,male,teacher,Grade 10-A
`;

export const USER_IMPORT_TEMPLATE_FILENAME = "learnhub-users-import-template.csv";

/** UTF-8 BOM helps Excel open the CSV with correct encoding. */
export function userImportCsvTemplateContent() {
  return `\uFEFF${USER_IMPORT_CSV_TEMPLATE}`;
}
