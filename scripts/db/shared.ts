import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

export function getDatabaseFile() {
  const file = process.env.DATABASE_FILE ?? "./data/learnhub.db";
  if (path.isAbsolute(file)) {
    return file;
  }

  return path.resolve(process.cwd(), file);
}

export function openDatabase() {
  const databaseFile = getDatabaseFile();
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  const db = new Database(databaseFile);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  return db;
}

export function readSchemaSql() {
  return fs.readFileSync(path.resolve(process.cwd(), "db/schema.sql"), "utf8");
}

export function id(prefix: string) {
  const raw = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `${prefix}_${raw}`;
}

export function isoDate(daysFromNow: number) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}
