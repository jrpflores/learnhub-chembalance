from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional
from urllib import error, request

from fastapi import FastAPI
from pydantic import BaseModel, Field


app = FastAPI(title="ChemBalance Offline Grader", version="2.0.0")


ALLOWED_PROVIDERS = {"auto", "heuristic", "ollama"}


def sanitize_model_name(value: Optional[str]) -> str:
    if not value:
        return ""
    return value.strip().strip('"').strip("'").strip()


def parse_model_list(value: Optional[str]) -> List[str]:
    if not value:
        return []
    items = re.split(r"[,\n]+", value)
    deduped: List[str] = []
    for item in items:
        model = sanitize_model_name(item)
        if model and model not in deduped:
            deduped.append(model)
    return deduped


def env_int(name: str, default: int, minimum: Optional[int] = None) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError:
        value = default
    if minimum is not None:
        return max(minimum, value)
    return value


def env_float(name: str, default: float, minimum: Optional[float] = None, maximum: Optional[float] = None) -> float:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = float(raw)
    except ValueError:
        value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


GRADER_PROVIDER = os.getenv("GRADER_PROVIDER", "auto").strip().lower()
if GRADER_PROVIDER not in ALLOWED_PROVIDERS:
    GRADER_PROVIDER = "auto"

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434").strip().rstrip("/")
OLLAMA_MODEL = sanitize_model_name(os.getenv("OLLAMA_MODEL", "llama3:8b")) or "llama3:8b"
OLLAMA_FALLBACK_MODELS = parse_model_list(os.getenv("OLLAMA_FALLBACK_MODELS"))
OLLAMA_TIMEOUT_MS = env_int("OLLAMA_TIMEOUT_MS", 12000, minimum=500)
OLLAMA_TEMPERATURE = env_float("OLLAMA_TEMPERATURE", 0.1, minimum=0.0, maximum=0.4)
MEDIUM_CONFIDENCE_THRESHOLD = env_float("AI_CONFIDENCE_MEDIUM", 0.7, minimum=0.0, maximum=1.0)

SUBSCRIPT_DIGIT_MAP = str.maketrans({
    "₀": "0",
    "₁": "1",
    "₂": "2",
    "₃": "3",
    "₄": "4",
    "₅": "5",
    "₆": "6",
    "₇": "7",
    "₈": "8",
    "₉": "9",
})

LEET_CHAR_MAP = str.maketrans({
    "@": "a",
    "€": "e",
    "$": "s",
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
})

CONCEPT_ALIAS_GROUPS = [
    ["water", "h2o", "h₂o", "dihydrogen monoxide", "aqua"],
]


class GradeShortAnswerRequest(BaseModel):
    prompt: str = Field(min_length=1)
    student_answer: str = Field(min_length=1)
    reference_answer: Optional[str] = None
    keywords: List[str] = Field(default_factory=list)
    max_score: float = Field(default=1.0, gt=0)
    rubric: Optional[str] = None


class GradeShortAnswerResponse(BaseModel):
    provider: str
    verdict: str
    normalized_score: float
    score: float
    feedback: str
    confidence: float
    matched_concepts: List[str]
    missing_concepts: List[str]
    misconceptions: List[str]
    teacher_review_recommended: bool
    signals: Dict[str, float]


class AnalyzeEquationRequest(BaseModel):
    prompt: str = Field(min_length=1)
    student_answer: str = Field(min_length=1)
    expected_answer: Optional[str] = None
    hints: List[str] = Field(default_factory=list)


class AnalyzeEquationResponse(BaseModel):
    provider: str
    is_correct: bool
    confidence: float
    feedback: str
    hint: Optional[str] = None
    normalized_answer: str
    metadata: Dict[str, Any]


@dataclass
class ScoringSignals:
    keyword_ratio: float
    reference_similarity: float
    prompt_similarity: float
    token_coverage: float


@dataclass
class HeuristicEvaluation:
    verdict: str
    normalized_score: float
    confidence: float
    feedback: str
    matched_concepts: List[str]
    missing_concepts: List[str]
    misconceptions: List[str]
    signals: ScoringSignals
    deterministic_final: bool


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def normalize_text(text: str) -> str:
    replaced_subscripts = text.translate(SUBSCRIPT_DIGIT_MAP)
    collapsed_letters = re.sub(r"\b(?:[a-zA-Z]\s+){2,}[a-zA-Z]\b", lambda m: re.sub(r"\s+", "", m.group(0)), replaced_subscripts)
    mapped_leet = collapsed_letters.translate(LEET_CHAR_MAP)
    normalized = re.sub(r"[^a-z0-9\s]+", " ", mapped_leet.strip().lower())
    return re.sub(r"\s+", " ", normalized)


def normalize_equation_text(text: str) -> str:
    with_digits = text.translate(SUBSCRIPT_DIGIT_MAP)
    arrows = re.sub(r"=>|=|→|⟶|⟹|⇌|<-+>|<->|->", "->", with_digits)
    compact = re.sub(r"\s+", "", arrows)
    return compact.strip()


def split_equation_sides(raw: str) -> Optional[tuple[str, str]]:
    normalized = normalize_equation_text(raw)
    parts = normalized.split("->")
    if len(parts) != 2:
        return None
    return parts[0], parts[1]


def parse_compound_token(token: str) -> Optional[tuple[int, str]]:
    match = re.match(r"^(\d+)?([A-Z][A-Za-z0-9]*)$", token)
    if not match:
        return None
    coefficient = int(match.group(1) or "1")
    formula = match.group(2)
    if not formula:
        return None
    return coefficient, formula


def parse_molecule(formula: str) -> Optional[Dict[str, int]]:
    tokens = re.findall(r"[A-Z][a-z]?\d*", formula)
    if not tokens or "".join(tokens) != formula:
        return None

    counts: Dict[str, int] = {}
    for token in tokens:
        match = re.match(r"^([A-Z][a-z]?)(\d*)$", token)
        if not match:
            return None
        element = match.group(1)
        amount = int(match.group(2) or "1")
        counts[element] = counts.get(element, 0) + amount
    return counts


def aggregate_side_atoms(side: str) -> Optional[tuple[Dict[str, int], List[str]]]:
    totals: Dict[str, int] = {}
    compounds = [item.strip() for item in side.split("+") if item.strip()]
    if not compounds:
        return None

    for compound in compounds:
        parsed = parse_compound_token(compound)
        if not parsed:
            return None
        coefficient, formula = parsed
        molecule = parse_molecule(formula)
        if not molecule:
            return None
        for element, amount in molecule.items():
            totals[element] = totals.get(element, 0) + amount * coefficient

    return totals, compounds


def tokenize(text: str) -> List[str]:
    return [token for token in re.split(r"[^a-z0-9]+", normalize_text(text)) if token]


def concept_alias_map() -> Dict[str, str]:
    alias_map: Dict[str, str] = {}
    for group in CONCEPT_ALIAS_GROUPS:
        canonical = normalize_text(group[0])
        for alias in group:
            alias_map[normalize_text(alias)] = canonical
    return alias_map


CONCEPT_ALIAS_MAP = concept_alias_map()


def concept_key(text: Optional[str]) -> str:
    if not text:
        return ""
    normalized = normalize_text(text)
    return CONCEPT_ALIAS_MAP.get(normalized, normalized)


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, normalize_text(a), normalize_text(b)).ratio()


def verdict_from_score(score: float) -> str:
    if score >= 0.9:
        return "correct"
    if score >= 0.55:
        return "partially_correct"
    return "incorrect"


def build_feedback(score: float, signals: ScoringSignals) -> str:
    if score >= 0.9:
        return "Excellent response with strong accuracy and clear understanding."
    if score >= 0.75:
        return "Strong answer. Minor details can be improved for full marks."
    if score >= 0.55:
        return "Good effort. Review key concepts and include more precise details."
    if score >= 0.35:
        return "Partial understanding detected. Revisit the lesson examples and try again."

    if signals.keyword_ratio == 0 and signals.reference_similarity < 0.2:
        return "Answer appears off-topic. Review the lesson before retrying."

    return "Keep going. Focus on the core concept and submit a more complete answer."


def calculate_signals(
    prompt: str,
    student_answer: str,
    reference_answer: Optional[str],
    keywords: List[str],
) -> tuple[ScoringSignals, List[str], List[str]]:
    normalized_student = normalize_text(student_answer)
    student_concept = concept_key(student_answer)

    filtered_keywords = [normalize_text(keyword) for keyword in keywords if keyword.strip()]
    matched_keywords = []
    missing_keywords = []
    for keyword in filtered_keywords:
        keyword_concept = concept_key(keyword)
        if keyword in normalized_student or (student_concept and keyword_concept and student_concept == keyword_concept):
            matched_keywords.append(keyword)
        else:
            missing_keywords.append(keyword)

    keyword_ratio = len(matched_keywords) / len(filtered_keywords) if filtered_keywords else 0.0
    reference_similarity = similarity(student_answer, reference_answer or "")
    prompt_similarity = similarity(student_answer, prompt)

    student_tokens = set(tokenize(student_answer))
    reference_tokens = set(tokenize(reference_answer or ""))
    token_coverage = len(student_tokens.intersection(reference_tokens)) / len(reference_tokens) if reference_tokens else 0.0

    return (
        ScoringSignals(
            keyword_ratio=keyword_ratio,
            reference_similarity=reference_similarity,
            prompt_similarity=prompt_similarity,
            token_coverage=token_coverage,
        ),
        matched_keywords,
        missing_keywords,
    )


def heuristic_grade(payload: GradeShortAnswerRequest) -> HeuristicEvaluation:
    signals, matched_keywords, missing_keywords = calculate_signals(
        prompt=payload.prompt,
        student_answer=payload.student_answer,
        reference_answer=payload.reference_answer,
        keywords=payload.keywords,
    )

    weighted = (
        signals.keyword_ratio * 0.4
        + signals.reference_similarity * 0.35
        + signals.token_coverage * 0.2
        + min(signals.prompt_similarity, 0.85) * 0.05
    )
    normalized_score = clamp(weighted, 0.0, 1.0)
    verdict = verdict_from_score(normalized_score)

    confidence = clamp(
        0.5
        + signals.reference_similarity * 0.2
        + signals.keyword_ratio * 0.2
        + signals.token_coverage * 0.15,
        0.45,
        0.98,
    )

    deterministic_final = False

    normalized_student = normalize_text(payload.student_answer)
    normalized_reference = normalize_text(payload.reference_answer or "")
    student_concept = concept_key(payload.student_answer)
    reference_concept = concept_key(payload.reference_answer)

    # Deterministic fast-pass/fail guards to reduce unnecessary model calls.
    if normalized_reference:
        if normalized_student == normalized_reference or (student_concept and reference_concept and student_concept == reference_concept):
            deterministic_final = True
            normalized_score = 1.0
            verdict = "correct"
            confidence = 0.98
    else:
        if payload.keywords and signals.keyword_ratio >= 0.95 and signals.token_coverage >= 0.7:
            deterministic_final = True
            normalized_score = max(normalized_score, 0.92)
            verdict = "correct"
            confidence = max(confidence, 0.9)
        elif payload.keywords and signals.keyword_ratio == 0 and signals.reference_similarity < 0.15 and len(tokenize(payload.student_answer)) <= 5:
            deterministic_final = True
            normalized_score = min(normalized_score, 0.15)
            verdict = "incorrect"
            confidence = max(confidence, 0.8)

    misconceptions: List[str] = []
    if verdict == "incorrect" and signals.prompt_similarity < 0.25:
        misconceptions.append("off_topic_response")

    return HeuristicEvaluation(
        verdict=verdict,
        normalized_score=round(normalized_score, 3),
        confidence=round(confidence, 3),
        feedback=build_feedback(normalized_score, signals),
        matched_concepts=matched_keywords,
        missing_concepts=missing_keywords,
        misconceptions=misconceptions,
        signals=signals,
        deterministic_final=deterministic_final,
    )


def safe_json_object(raw: str) -> Optional[Dict[str, Any]]:
    text = raw.strip()
    if not text:
        return None

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None

    try:
        parsed = json.loads(match.group(0))
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        return None

    return None


def candidate_ollama_models() -> List[str]:
    ordered: List[str] = []
    for model in [OLLAMA_MODEL, *OLLAMA_FALLBACK_MODELS]:
        if model and model not in ordered:
            ordered.append(model)
    return ordered


def ollama_generate_json(prompt: str) -> Optional[Dict[str, Any]]:
    for model in candidate_ollama_models():
        body = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": OLLAMA_TEMPERATURE,
            },
        }

        req = request.Request(
            f"{OLLAMA_BASE_URL}/api/generate",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=OLLAMA_TIMEOUT_MS / 1000) as response:
                raw = response.read().decode("utf-8")
        except (error.URLError, TimeoutError):
            continue

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue

        response_text = payload.get("response", "")
        if not isinstance(response_text, str):
            continue

        parsed = safe_json_object(response_text)
        if parsed is not None:
            return parsed

    return None


def evaluate_with_ollama(payload: GradeShortAnswerRequest, heuristic: HeuristicEvaluation) -> Optional[GradeShortAnswerResponse]:
    keywords = [item for item in payload.keywords if item.strip()]

    rubric = payload.rubric or (
        "Score strictly against conceptual correctness and coverage. "
        "Do not invent criteria. Give partial credit when core ideas are present."
    )

    prompt = f"""
You are grading a junior-high LMS short-answer response.

Return ONLY valid JSON object with this schema:
{{
  "verdict": "correct|partially_correct|incorrect",
  "normalized_score": 0.0,
  "confidence": 0.0,
  "matched_concepts": ["..."],
  "missing_concepts": ["..."],
  "misconceptions": ["..."],
  "feedback": "short constructive feedback"
}}

Rules:
- Grade strictly using the provided rubric and expected concepts.
- If the question asks for one example/any valid item, accept valid alternatives even when wording differs from the reference answer.
- Be conservative. If unsure, reduce confidence.
- Do not add markdown or extra text.

Question:
{payload.prompt}

Reference answer:
{payload.reference_answer or "(not provided)"}

Required concepts:
{", ".join(keywords) if keywords else "(none provided)"}

Rubric:
{rubric}

Student answer:
{payload.student_answer}

Heuristic summary (context only):
- keyword_ratio={heuristic.signals.keyword_ratio:.3f}
- reference_similarity={heuristic.signals.reference_similarity:.3f}
- token_coverage={heuristic.signals.token_coverage:.3f}
""".strip()

    parsed = ollama_generate_json(prompt)
    if not parsed:
        return None

    verdict_raw = str(parsed.get("verdict", "")).strip().lower()
    verdict = verdict_raw if verdict_raw in {"correct", "partially_correct", "incorrect"} else heuristic.verdict

    normalized_score_raw = parsed.get("normalized_score", heuristic.normalized_score)
    try:
        normalized_score = clamp(float(normalized_score_raw), 0.0, 1.0)
    except (TypeError, ValueError):
        normalized_score = heuristic.normalized_score

    confidence_raw = parsed.get("confidence", heuristic.confidence)
    try:
        confidence = clamp(float(confidence_raw), 0.0, 1.0)
    except (TypeError, ValueError):
        confidence = heuristic.confidence

    feedback_raw = parsed.get("feedback", heuristic.feedback)
    feedback = str(feedback_raw).strip() if isinstance(feedback_raw, str) else heuristic.feedback
    if not feedback:
        feedback = heuristic.feedback

    def to_string_list(value: Any) -> List[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    matched = to_string_list(parsed.get("matched_concepts")) or heuristic.matched_concepts
    missing = to_string_list(parsed.get("missing_concepts")) or heuristic.missing_concepts
    misconceptions = to_string_list(parsed.get("misconceptions")) or heuristic.misconceptions

    teacher_review_recommended = confidence < MEDIUM_CONFIDENCE_THRESHOLD

    return GradeShortAnswerResponse(
        provider="ollama",
        verdict=verdict,
        normalized_score=round(normalized_score, 3),
        score=round(normalized_score * payload.max_score, 3),
        feedback=feedback,
        confidence=round(confidence, 3),
        matched_concepts=matched,
        missing_concepts=missing,
        misconceptions=misconceptions,
        teacher_review_recommended=teacher_review_recommended,
        signals={
            "keyword_ratio": round(heuristic.signals.keyword_ratio, 3),
            "reference_similarity": round(heuristic.signals.reference_similarity, 3),
            "prompt_similarity": round(heuristic.signals.prompt_similarity, 3),
            "token_coverage": round(heuristic.signals.token_coverage, 3),
        },
    )


def heuristic_response(payload: GradeShortAnswerRequest, heuristic: HeuristicEvaluation, provider: str) -> GradeShortAnswerResponse:
    return GradeShortAnswerResponse(
        provider=provider,
        verdict=heuristic.verdict,
        normalized_score=heuristic.normalized_score,
        score=round(heuristic.normalized_score * payload.max_score, 3),
        feedback=heuristic.feedback,
        confidence=heuristic.confidence,
        matched_concepts=heuristic.matched_concepts,
        missing_concepts=heuristic.missing_concepts,
        misconceptions=heuristic.misconceptions,
        teacher_review_recommended=heuristic.confidence < MEDIUM_CONFIDENCE_THRESHOLD,
        signals={
            "keyword_ratio": round(heuristic.signals.keyword_ratio, 3),
            "reference_similarity": round(heuristic.signals.reference_similarity, 3),
            "prompt_similarity": round(heuristic.signals.prompt_similarity, 3),
            "token_coverage": round(heuristic.signals.token_coverage, 3),
        },
    )


def ollama_health() -> bool:
    req = request.Request(f"{OLLAMA_BASE_URL}/api/tags", method="GET")
    try:
        with request.urlopen(req, timeout=min(3, OLLAMA_TIMEOUT_MS / 1000)) as response:
            return 200 <= response.status < 300
    except (error.URLError, TimeoutError):
        return False


def deterministic_equation_evaluation(payload: AnalyzeEquationRequest) -> AnalyzeEquationResponse:
    normalized_answer = normalize_equation_text(payload.student_answer)
    expected = payload.expected_answer or ""
    normalized_expected = normalize_equation_text(expected) if expected else ""

    if normalized_expected and normalized_answer == normalized_expected:
        return AnalyzeEquationResponse(
            provider="deterministic",
            is_correct=True,
            confidence=0.99,
            feedback="Correct. Your balanced equation matches the expected form.",
            normalized_answer=normalized_answer,
            metadata={"match_type": "exact"},
        )

    sides = split_equation_sides(normalized_answer)
    expected_sides = split_equation_sides(normalized_expected) if normalized_expected else None
    if not sides:
        return AnalyzeEquationResponse(
            provider="deterministic",
            is_correct=False,
            confidence=0.55,
            feedback="Use complete equation format like Reactants -> Products.",
            hint="Check for reactants, products, plus signs, and an arrow.",
            normalized_answer=normalized_answer,
            metadata={"match_type": "invalid_format", "unresolved": True},
        )

    left_side, right_side = sides
    parsed_left = aggregate_side_atoms(left_side)
    parsed_right = aggregate_side_atoms(right_side)
    if not parsed_left or not parsed_right:
        return AnalyzeEquationResponse(
            provider="deterministic",
            is_correct=False,
            confidence=0.55,
            feedback="One or more compounds could not be parsed. Check formula notation and coefficients.",
            hint="Use standard element symbols and whole-number coefficients.",
            normalized_answer=normalized_answer,
            metadata={"match_type": "parse_error", "unresolved": True},
        )

    left_totals, left_compounds = parsed_left
    right_totals, right_compounds = parsed_right
    atoms_balanced = left_totals == right_totals

    if expected_sides:
        expected_left = aggregate_side_atoms(expected_sides[0])
        expected_right = aggregate_side_atoms(expected_sides[1])
        same_compounds = False
        if expected_left and expected_right:
            same_compounds = left_compounds == expected_left[1] and right_compounds == expected_right[1]

        if atoms_balanced and same_compounds:
            return AnalyzeEquationResponse(
                provider="deterministic",
                is_correct=True,
                confidence=0.96,
                feedback="Correct. Atom counts are balanced on both sides.",
                normalized_answer=normalized_answer,
                metadata={"match_type": "balanced_equivalent"},
            )

    if not atoms_balanced:
        return AnalyzeEquationResponse(
            provider="deterministic",
            is_correct=False,
            confidence=0.9,
            feedback="Not balanced yet. Recount each element and adjust coefficients only.",
            hint="Balance one element group at a time, then verify oxygen and hydrogen.",
            normalized_answer=normalized_answer,
            metadata={"match_type": "not_balanced", "unresolved": False},
        )

    return AnalyzeEquationResponse(
        provider="deterministic",
        is_correct=False,
        confidence=0.72,
        feedback="Your equation appears balanced, but it does not match the expected reactants/products.",
        normalized_answer=normalized_answer,
        metadata={"match_type": "compound_mismatch", "unresolved": True},
    )


def evaluate_equation_with_ollama(payload: AnalyzeEquationRequest, deterministic: AnalyzeEquationResponse) -> Optional[AnalyzeEquationResponse]:
    prompt = f"""
You are validating a junior-high chemistry equation response.

Return ONLY valid JSON:
{{
  "is_correct": true,
  "confidence": 0.0,
  "feedback": "short feedback",
  "hint": "optional hint",
  "metadata": {{"reason": "..." }}
}}

Rules:
- Be strict and concise.
- Prefer deterministic chemistry correctness over wording.
- If uncertain, lower confidence.
- No markdown.

Question:
{payload.prompt}

Expected answer:
{payload.expected_answer or "(none provided)"}

Student answer:
{payload.student_answer}

Hints:
{", ".join(payload.hints) if payload.hints else "(none)"}
""".strip()

    parsed = ollama_generate_json(prompt)
    if not parsed:
        return None

    try:
        confidence = clamp(float(parsed.get("confidence", deterministic.confidence)), 0.0, 1.0)
    except (TypeError, ValueError):
        confidence = deterministic.confidence

    feedback_raw = parsed.get("feedback", deterministic.feedback)
    feedback = str(feedback_raw).strip() if isinstance(feedback_raw, str) else deterministic.feedback
    hint_raw = parsed.get("hint")
    hint = str(hint_raw).strip() if isinstance(hint_raw, str) and str(hint_raw).strip() else None

    is_correct = bool(parsed.get("is_correct", False))
    metadata = parsed.get("metadata")
    metadata_obj = metadata if isinstance(metadata, dict) else {}

    return AnalyzeEquationResponse(
        provider="ollama",
        is_correct=is_correct,
        confidence=round(confidence, 3),
        feedback=feedback or deterministic.feedback,
        hint=hint,
        normalized_answer=deterministic.normalized_answer,
        metadata=metadata_obj,
    )


@app.get("/health")
def health() -> dict:
    ollama_ok = ollama_health() if GRADER_PROVIDER in {"auto", "ollama"} else None
    status = "ok"
    if GRADER_PROVIDER == "ollama" and not ollama_ok:
        status = "degraded"

    return {
        "status": status,
        "provider_mode": GRADER_PROVIDER,
        "ollama": {
            "base_url": OLLAMA_BASE_URL,
            "model": OLLAMA_MODEL,
            "fallback_models": OLLAMA_FALLBACK_MODELS,
            "reachable": ollama_ok,
        },
    }


@app.post("/grade-short-answer", response_model=GradeShortAnswerResponse)
def grade_short_answer(payload: GradeShortAnswerRequest) -> GradeShortAnswerResponse:
    heuristic = heuristic_grade(payload)

    # Deterministic-first guardrail: avoid AI call if heuristic resolution is high confidence.
    if heuristic.deterministic_final or GRADER_PROVIDER == "heuristic":
        return heuristic_response(payload, heuristic, provider="heuristic")

    if GRADER_PROVIDER in {"auto", "ollama"}:
        ollama_result = evaluate_with_ollama(payload, heuristic)
        if ollama_result is not None:
            return ollama_result

    return heuristic_response(payload, heuristic, provider="heuristic_fallback")


@app.post("/equations/analyze", response_model=AnalyzeEquationResponse)
def analyze_equation(payload: AnalyzeEquationRequest) -> AnalyzeEquationResponse:
    deterministic = deterministic_equation_evaluation(payload)
    unresolved = bool(deterministic.metadata.get("unresolved"))

    if not unresolved or GRADER_PROVIDER == "heuristic":
        return deterministic

    if GRADER_PROVIDER in {"auto", "ollama"}:
        ai_result = evaluate_equation_with_ollama(payload, deterministic)
        if ai_result is not None:
            return ai_result

    return AnalyzeEquationResponse(
      provider="heuristic_fallback",
      is_correct=deterministic.is_correct,
      confidence=deterministic.confidence,
      feedback=deterministic.feedback,
      hint=deterministic.hint,
      normalized_answer=deterministic.normalized_answer,
      metadata=deterministic.metadata,
    )
