type ApiPayload = Record<string, unknown> | null | undefined;

export function extractApiErrorMessage(payload: ApiPayload, fallback: string) {
  const parsed = extractApiError(payload, fallback);
  return parsed.title;
}

export function extractGenerationConflictMessage(payload: ApiPayload, fallback: string, trackingHint?: string) {
  const base = extractApiErrorMessage(payload, fallback);
  const conflictJobId = asNonEmptyString(payload?.conflictJobId);
  if (!conflictJobId) {
    return base;
  }
  const shortId = `${conflictJobId.slice(0, 8)}…`;
  const hint = trackingHint?.trim();
  return hint ? `${base} Active job ${shortId} ${hint}` : `${base} Active job ${shortId}`;
}

export function extractApiError(payload: ApiPayload, fallback: string) {
  const validationMessages = extractValidationMessages(payload?.details);
  const explicitError = asNonEmptyString(payload?.error);
  const explicitMessage = asNonEmptyString(payload?.message);

  if (validationMessages.length > 0) {
    if (!explicitError || isGenericInvalidPayload(explicitError)) {
      return {
        title: validationMessages[0],
        description: validationMessages.length > 1 ? validationMessages.slice(1, 4).join(" • ") : undefined,
      };
    }
  }

  if (explicitError) {
    return {
      title: explicitError,
      description: validationMessages.length > 0 ? validationMessages.slice(0, 3).join(" • ") : undefined,
    };
  }

  if (validationMessages.length > 0) {
    return {
      title: validationMessages[0],
      description: validationMessages.length > 1 ? validationMessages.slice(1, 4).join(" • ") : undefined,
    };
  }

  if (explicitMessage) {
    return { title: explicitMessage };
  }

  return { title: fallback };
}

function extractValidationMessages(details: unknown) {
  const messages: string[] = [];

  if (typeof details === "string") {
    const value = details.trim();
    return value ? [value] : [];
  }

  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return [];
  }

  const formErrorsRaw = (details as { formErrors?: unknown }).formErrors;
  if (Array.isArray(formErrorsRaw)) {
    for (const entry of formErrorsRaw) {
      const value = asNonEmptyString(entry);
      if (value) {
        messages.push(value);
      }
    }
  }

  const fieldErrorsRaw = (details as { fieldErrors?: unknown }).fieldErrors;
  if (fieldErrorsRaw && typeof fieldErrorsRaw === "object" && !Array.isArray(fieldErrorsRaw)) {
    for (const [field, value] of Object.entries(fieldErrorsRaw)) {
      const label = humanizeField(field);
      if (Array.isArray(value)) {
        for (const item of value) {
          const message = asNonEmptyString(item);
          if (message) {
            messages.push(`${label}: ${message}`);
          }
        }
      } else {
        const message = asNonEmptyString(value);
        if (message) {
          messages.push(`${label}: ${message}`);
        }
      }
    }
  }

  return Array.from(new Set(messages));
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isGenericInvalidPayload(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "") === "invalid payload";
}

function humanizeField(field: string) {
  const spaced = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) {
    return "Field";
  }
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}
