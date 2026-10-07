import type { Gender } from "@/domain/types";

export function formatGenderLabel(gender: Gender | null | undefined) {
  if (gender === "MALE") {
    return "Male";
  }
  if (gender === "FEMALE") {
    return "Female";
  }
  return "Not set";
}
