import { env } from "@/lib/env";

type PracticeHistoryMessage = {
  role: "STUDENT" | "ASSISTANT";
  contentMarkdown: string;
};

type LessonPracticeContext = {
  title: string;
  subject: string;
  topic: string;
  shortDescription: string;
  contentMarkdown: string;
};

const HISTORY_WINDOW = Math.max(2, Math.min(Math.trunc(env.aiTutorHistoryWindow), 12));
const HISTORY_MESSAGE_CHAR_LIMIT = Math.max(120, Math.min(Math.trunc(env.aiTutorHistoryChars), 1200));
const LESSON_CHUNK_CHAR_LIMIT = Math.max(280, Math.min(Math.trunc(env.aiTutorLessonChunkChars), 1600));
const LESSON_MAX_CHUNKS = Math.max(1, Math.min(Math.trunc(env.aiTutorLessonMaxChunks), 8));
const LESSON_MAX_CONTEXT_CHARS = Math.max(800, Math.min(Math.trunc(env.aiTutorLessonMaxContextChars), 9000));
const QUESTION_CHAR_LIMIT = Math.max(240, Math.min(Math.trunc(env.aiTutorQuestionCharLimit), 2400));
const STOPWORDS = new Set([
  "the",
  "and",
  "that",
  "this",
  "with",
  "from",
  "have",
  "about",
  "your",
  "what",
  "when",
  "where",
  "which",
  "into",
  "there",
  "their",
  "would",
  "could",
  "should",
  "were",
  "will",
  "lesson",
  "topic",
  "subject",
  "student",
  "tutor",
]);

function sanitizeAssistantMarkdown(content: string) {
  const withoutScripts = content
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[^>]+>/g, "");
  const compact = withoutScripts.replace(/\r\n/g, "\n").trim();
  return formatScienceMathMarkdown(compact).slice(0, 4200);
}

function stashProtectedSegments(content: string) {
  const stash: string[] = [];
  const masked = content.replace(/```[\s\S]*?```|\$\$[\s\S]*?\$\$|`[^`\n]+`|\$[^$\n]+\$/g, (segment) => {
    const key = `@@SEGMENT_${stash.length}@@`;
    stash.push(segment);
    return key;
  });

  return { masked, stash };
}

function restoreProtectedSegments(content: string, stash: string[]) {
  return content.replace(/@@SEGMENT_(\d+)@@/g, (_, rawIndex) => {
    const index = Number.parseInt(String(rawIndex), 10);
    return Number.isFinite(index) && stash[index] ? stash[index] : "";
  });
}

function normalizeFormulaToken(token: string) {
  return token.replace(/([A-Za-z])(\d+)/g, "$1_$2");
}

function formatScienceMathMarkdown(content: string) {
  const { masked, stash } = stashProtectedSegments(content);
  let formatted = masked;

  // Normalize classic reaction arrows first.
  formatted = formatted.replace(/\s*(?:->|=>|→|⟶|⟹)\s*/g, " \\rightarrow ");

  // Wrap reaction equations as markdown-math.
  formatted = formatted.replace(
    /\b((?:\d*[A-Z][a-z]?\d*(?:\s*\+\s*|\s*\\rightarrow\s*))+?\d*[A-Z][a-z]?\d*)\b/g,
    (match) => `$${normalizeFormulaToken(match).replace(/\s+/g, " ").trim()}$`,
  );

  // Wrap standalone chemical formulas as inline math.
  formatted = formatted.replace(/\b((?:\d+)?(?:[A-Z][a-z]?\d*){2,})\b/g, (match) => {
    return `$${normalizeFormulaToken(match)}$`;
  });

  // Wrap simple exponent expressions if not yet wrapped.
  formatted = formatted.replace(/\b([A-Za-z]\s*\^\s*-?\d+)\b/g, (_, expr) => `$${expr.replace(/\s+/g, "")}$`);

  // Normalize sqrt() to latex when it appears plainly.
  formatted = formatted.replace(/\bsqrt\(([^)]+)\)/gi, (_, value) => `$\\sqrt{${String(value).trim()}}$`);

  return restoreProtectedSegments(formatted, stash);
}

function fallbackResponse(payload: {
  lesson: LessonPracticeContext;
  question: string;
  reason?: string;
}) {
  const reasonText = payload.reason
    ? `I could not reach offline AI right now (${payload.reason}).`
    : "I could not reach offline AI right now.";
  return `${reasonText}

### Quick guidance from this lesson
- **Lesson:** ${payload.lesson.title}
- **Subject/Topic:** ${payload.lesson.subject} / ${payload.lesson.topic}
- Review this section first: ${payload.lesson.shortDescription}

Your question was: **${payload.question}**

Try asking again in a moment, or continue with the lesson/quizzes while AI reconnects.`;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function stripMarkdownForSearch(content: string) {
  return normalizeWhitespace(
    content
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`\n]+`/g, " ")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[[^\]]+]\([^)]*\)/g, " ")
      .replace(/[>#*_~|-]/g, " "),
  ).toLowerCase();
}

function tokenizeSearchTerms(content: string) {
  return stripMarkdownForSearch(content)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
    .slice(0, 80);
}

function looksLikeFollowUpQuestion(question: string) {
  const compact = normalizeWhitespace(question).toLowerCase();
  return (
    /\b(continue|next|again|same|previous|earlier|above|as discussed|based on that|from that)\b/.test(compact) ||
    /\b(it|that|this)\b/.test(compact)
  );
}

function looksLikeFactoidQuestion(question: string) {
  const compact = normalizeWhitespace(question).toLowerCase();
  return /^(what\s+is|what's|which\s+is|who\s+is|where\s+is|when\s+is|define|symbol\b|give\s+the)/.test(compact);
}

function messageRelevanceScore(message: PracticeHistoryMessage, terms: string[]) {
  if (terms.length === 0) {
    return 0;
  }
  const searchable = stripMarkdownForSearch(message.contentMarkdown);
  let score = 0;
  for (const term of terms) {
    if (searchable.includes(term)) {
      score += 1;
    }
  }
  return score;
}

function buildHistoryContext(history: PracticeHistoryMessage[], question: string) {
  if (history.length === 0) {
    return "";
  }

  const terms = tokenizeSearchTerms(question);
  const recent = history.slice(-Math.max(HISTORY_WINDOW * 2, 12));
  const scored = recent.map((message, index) => ({
    index,
    message,
    score: messageRelevanceScore(message, terms),
  }));

  const relevant = scored.filter((entry) => entry.score > 0);
  let selected: typeof scored = [];

  if (relevant.length > 0) {
    selected = relevant
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return b.index - a.index;
      })
      .slice(0, HISTORY_WINDOW)
      .sort((a, b) => a.index - b.index);
  } else if (looksLikeFollowUpQuestion(question)) {
    selected = scored.slice(-Math.min(HISTORY_WINDOW, 2));
  }

  return selected
    .map((entry) => {
      const role = entry.message.role === "STUDENT" ? "Student" : "Tutor";
      const compact = normalizeWhitespace(entry.message.contentMarkdown).slice(0, HISTORY_MESSAGE_CHAR_LIMIT);
      return `${role}: ${compact}`;
    })
    .join("\n");
}

function splitIntoParagraphs(content: string) {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitIntoSentences(content: string) {
  const matches = content.match(/[^.!?]+[.!?]?/g);
  if (!matches) {
    return [content.trim()].filter(Boolean);
  }
  return matches.map((sentence) => sentence.trim()).filter(Boolean);
}

function pruneFirstParagraphForFactoid(paragraph: string, terms: string[], question: string) {
  if (!looksLikeFactoidQuestion(question)) {
    return paragraph;
  }

  const sentences = splitIntoSentences(paragraph);
  if (sentences.length <= 1) {
    return paragraph;
  }

  const kept = [sentences[0]];
  for (const sentence of sentences.slice(1)) {
    if (chunkRelevanceScore(sentence, terms) > 0) {
      kept.push(sentence);
    }
  }
  return kept.join(" ").trim();
}

function pruneOffTopicContinuation(payload: {
  content: string;
  question: string;
  allowContinuation: boolean;
}) {
  if (payload.allowContinuation) {
    return payload.content;
  }

  const terms = tokenizeSearchTerms(payload.question).slice(0, 20);
  if (terms.length === 0) {
    return payload.content;
  }

  const paragraphs = splitIntoParagraphs(payload.content);
  if (paragraphs.length === 0) {
    return payload.content;
  }

  const firstParagraph = pruneFirstParagraphForFactoid(paragraphs[0], terms, payload.question);
  const kept: string[] = firstParagraph ? [firstParagraph] : [];

  for (const paragraph of paragraphs.slice(1)) {
    const lower = paragraph.toLowerCase();
    const continuationCue =
      lower.startsWith("let's continue") ||
      lower.startsWith("lets continue") ||
      lower.startsWith("to balance") ||
      lower.startsWith("now let's") ||
      lower.startsWith("next,");

    const relevance = chunkRelevanceScore(paragraph, terms);
    if (relevance > 0 && !continuationCue) {
      kept.push(paragraph);
    }
  }

  return kept.join("\n\n").trim() || paragraphs[0];
}

function chunkLessonContent(contentMarkdown: string) {
  const sections = contentMarkdown
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const section of sections) {
    if (section.length > LESSON_CHUNK_CHAR_LIMIT) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      const pieceCount = Math.ceil(section.length / LESSON_CHUNK_CHAR_LIMIT);
      for (let index = 0; index < pieceCount; index += 1) {
        const start = index * LESSON_CHUNK_CHAR_LIMIT;
        const end = start + LESSON_CHUNK_CHAR_LIMIT;
        const piece = section.slice(start, end).trim();
        if (piece) {
          chunks.push(piece);
        }
      }
      continue;
    }

    const combined = current ? `${current}\n\n${section}` : section;
    if (combined.length <= LESSON_CHUNK_CHAR_LIMIT) {
      current = combined;
    } else {
      if (current) {
        chunks.push(current);
      }
      current = section;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function chunkRelevanceScore(chunk: string, terms: string[]) {
  if (terms.length === 0) {
    return 0;
  }
  const searchable = stripMarkdownForSearch(chunk);
  let score = 0;
  for (const term of terms) {
    if (searchable.includes(term)) {
      score += 1;
    }
  }
  return score;
}

function buildRelevantLessonContext(payload: {
  lesson: LessonPracticeContext;
  question: string;
  history: PracticeHistoryMessage[];
}) {
  const chunks = chunkLessonContent(payload.lesson.contentMarkdown);
  if (chunks.length === 0) {
    return "(no lesson content)";
  }

  const searchTerms = tokenizeSearchTerms(
    `${payload.question}\n${payload.history.slice(-3).map((message) => message.contentMarkdown).join("\n")}`,
  );
  const scored = chunks.map((chunk, index) => ({
    index,
    chunk,
    score: chunkRelevanceScore(chunk, searchTerms),
  }));

  const prioritized = [...scored].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });
  const selected = prioritized.slice(0, LESSON_MAX_CHUNKS).sort((a, b) => a.index - b.index);

  const merged = selected.map((item) => item.chunk).join("\n\n---\n\n");
  if (merged.length <= LESSON_MAX_CONTEXT_CHARS) {
    return merged;
  }
  return `${merged.slice(0, LESSON_MAX_CONTEXT_CHARS)}...`;
}

function buildPrompt(payload: {
  lesson: LessonPracticeContext;
  history: PracticeHistoryMessage[];
  question: string;
}) {
  const historyText = buildHistoryContext(payload.history, payload.question);
  const lessonContext = buildRelevantLessonContext(payload);

  return `
You are an offline lesson tutor for junior-high students.
Answer ONLY using the supplied lesson context and conversation.

Rules:
- Keep tone supportive, concise, and classroom-appropriate.
- If content is outside lesson scope, say it is not in this lesson yet.
- Answer the student's latest question directly first.
- Do not include unrelated continuation text from older topics.
- Do not add "let's continue..." style follow-up unless explicitly requested.
- Use Markdown formatting.
- Use bullet points for steps when needed.
- Never output HTML tags.
- For math/science symbols, use markdown math notation:
  - Inline: $...$
  - Block equations: $$...$$
  - Chemical formulas with subscripts (example: $H_2O$, $CO_2$)
  - Reaction arrows with \\rightarrow.

Lesson title: ${payload.lesson.title}
Subject: ${payload.lesson.subject}
Topic: ${payload.lesson.topic}
Lesson summary: ${payload.lesson.shortDescription}

Relevant lesson excerpts:
${lessonContext}

Previous conversation:
${historyText || "(none)"}

Student's new question:
${payload.question}
`.trim();
}

export async function generateLessonPracticeReply(payload: {
  lesson: LessonPracticeContext;
  history: PracticeHistoryMessage[];
  question: string;
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
}) {
  if (payload.signal?.aborted) {
    const aborted = new Error("Request aborted");
    aborted.name = "AbortError";
    throw aborted;
  }

  const question = payload.question.trim().slice(0, QUESTION_CHAR_LIMIT);
  const allowContinuation = looksLikeFollowUpQuestion(question);
  if (!question) {
    const fallback = fallbackResponse({ lesson: payload.lesson, question: "(empty question)", reason: "empty question" });
    payload.onChunk?.(fallback);
    return fallback;
  }

  if (!env.offlineAiEnabled) {
    const fallback = fallbackResponse({ lesson: payload.lesson, question, reason: "AI disabled" });
    payload.onChunk?.(fallback);
    return fallback;
  }

  const prompt = buildPrompt({
    lesson: payload.lesson,
    history: payload.history,
    question,
  });

  const candidateModels = [env.ollamaModel, ...env.ollamaFallbackModels].filter(
    (model, index, list) => Boolean(model) && list.indexOf(model) === index,
  );

  let lastReason = "no model response";

  for (const model of candidateModels) {
    const controller = new AbortController();
    const abortHandler = () => controller.abort();
    if (payload.signal) {
      payload.signal.addEventListener("abort", abortHandler, { once: true });
    }
    const timeout = setTimeout(() => controller.abort(), env.ollamaTimeoutMs);

    try {
      const response = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: Boolean(payload.onChunk),
          options: {
            temperature: Math.min(Math.max(env.ollamaTemperature, 0), 0.35),
          },
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const detail = await response.text();
        lastReason = `${model} returned ${response.status}${detail ? ` ${detail.slice(0, 120)}` : ""}`;
        continue;
      }

      let rawAssistantContent = "";
      if (payload.onChunk && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
              continue;
            }
            try {
              const frame = JSON.parse(line) as { response?: unknown };
              const chunk = typeof frame.response === "string" ? frame.response : "";
              if (chunk.length > 0) {
                rawAssistantContent += chunk;
                payload.onChunk(chunk);
              }
            } catch {
              // Ignore malformed stream frames and continue reading.
            }
          }
        }

        if (buffer.trim().length > 0) {
          try {
            const frame = JSON.parse(buffer.trim()) as { response?: unknown };
            const chunk = typeof frame.response === "string" ? frame.response : "";
            if (chunk.length > 0) {
              rawAssistantContent += chunk;
              payload.onChunk(chunk);
            }
          } catch {
            // Ignore malformed trailing frame.
          }
        }
      } else {
        const payloadJson = (await response.json()) as { response?: string };
        rawAssistantContent = payloadJson.response ?? "";
      }

      const assistantContent = pruneOffTopicContinuation({
        content: sanitizeAssistantMarkdown(rawAssistantContent),
        question,
        allowContinuation,
      });
      if (!assistantContent) {
        lastReason = `${model} returned empty content`;
        continue;
      }

      return assistantContent;
    } catch (error) {
      if (payload.signal?.aborted) {
        const aborted = new Error("Request aborted");
        aborted.name = "AbortError";
        throw aborted;
      }
      if (error instanceof Error && error.name === "AbortError") {
        lastReason = `${model} timed out`;
      } else {
        lastReason = error instanceof Error ? error.message : `${model} request failed`;
      }
    } finally {
      if (payload.signal) {
        payload.signal.removeEventListener("abort", abortHandler);
      }
      clearTimeout(timeout);
    }
  }

  const fallback = fallbackResponse({
    lesson: payload.lesson,
    question,
    reason: lastReason,
  });
  payload.onChunk?.(fallback);
  return fallback;
}
