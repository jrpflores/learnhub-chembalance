import "dotenv/config";
import fs from "node:fs";
import { getDatabaseFile, openDatabase, readSchemaSql } from "./shared";

const databaseFile = getDatabaseFile();

if (fs.existsSync(databaseFile)) {
  fs.unlinkSync(databaseFile);
}

const db = openDatabase();
db.exec(readSchemaSql());

console.log(`Database reset at ${databaseFile}`);
console.log("Run `npm run db:seed` next.");
