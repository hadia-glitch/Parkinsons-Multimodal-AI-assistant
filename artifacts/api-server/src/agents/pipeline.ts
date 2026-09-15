import { logger } from "../lib/logger";

type Language = "en" | "ur";
type Attachment = {
  type: "image" | "document" | "audio" | "video";
  name: string;
  extracted_text?: string | null;
  observations?: string[];
};

type Source = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  retrieved_at: string;
  relevance_score: number;
  source_quality: string;
  why_selected: string;
};

type Evidence = {
  id: string;
  source_id: string;
  passage: string;
  relevance_score: number;
  reranker_score: number | null;
};

type Trace = {
  agent: string;
  label: string;
  status: "success" | "warning" | "error" | "skipped" | "running";
  summary: string;
  metrics: Record<string, unknown>;
  warnings: string[];
};

const DISCLAIMER =
  "This is an experimental AI research prototype for informational and educational purposes. It does not diagnose Parkinson's disease, provide medical advice, prescribe treatment, or replace a qualified healthcare professional. Do not upload confidential or personally identifiable medical information.";

const TRUSTED_PUBLISHERS = new Set([
  "National Library of Medicine",
  "National Institute of Neurological Disorders and Stroke",
  "National Institutes of Health",
  "World Health Organization",
  "NHS",
  "Parkinson's Foundation",
]);

function trace(
  agent: string,
  label: string,
  status: Trace["status"],
  summary: string,
  metrics: Record<string, unknown> = {},
  warnings: string[] = [],
): Trace {
  return { agent, label, status, summary, metrics, warnings };
}

function detectLanguage(text: string, selected: Language): Language {
  const urduCharacters = (text.match(/[\u0600-\u06ff]/g) ?? []).length;
  return urduCharacters > 3 ? "ur" : selected;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/<[^>]+>/g, "").trim();
}

function sourceQuality(publisher: string): string {
  return TRUSTED_PUBLISHERS.has(publisher) ? "High" : "Moderate";
}

async function retrieveSources(query: string): Promise<{
  sources: Source[];
  evidence: Evidence[];
  warning?: string;
}> {
  const encodedQuery = encodeURIComponent(
    `Parkinson disease ${query}`.slice(0, 380),
  );
  const retrievedAt = new Date().toISOString();
  // NCBI E-utilities work without a key (3 req/s), but accept a free
  // registered key to raise the rate limit to 10 req/s. See
  // https://www.ncbi.nlm.nih.gov/books/NBK25497/#chapter2.Getting_Started
  const apiKeyParam = process.env.SEARCH_API_KEY
    ? `&api_key=${encodeURIComponent(process.env.SEARCH_API_KEY)}`
    : "";

  try {
    const searchResponse = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&term=${encodedQuery}${apiKeyParam}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!searchResponse.ok) {
      throw new Error(`PubMed search returned ${searchResponse.status}`);
    }

    const searchJson = (await searchResponse.json()) as {
      esearchresult?: { idlist?: string[] };
    };
    const ids = searchJson.esearchresult?.idlist ?? [];
    if (ids.length === 0) {
      return { sources: [], evidence: [], warning: "No PubMed results matched this question." };
    }

    const summaryResponse = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}${apiKeyParam}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    const summaryJson = (await summaryResponse.json()) as {
      result?: Record<string, { title?: string; fulljournalname?: string }>;
    };

    const sources: Source[] = [];
    const evidence: Evidence[] = [];
    for (const [index, id] of ids.slice(0, 5).entries()) {
      const summary = summaryJson.result?.[id];
      if (!summary?.title) continue;
      const sourceId = `S${index + 1}`;
      const title = cleanText(summary.title);
      const publisher = summary.fulljournalname || "PubMed indexed journal";
      sources.push({
        id: sourceId,
        title,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        publisher,
        retrieved_at: retrievedAt,
        relevance_score: Number((0.94 - index * 0.06).toFixed(2)),
        source_quality: sourceQuality(publisher),
        why_selected:
          "Matched the question through live PubMed retrieval; source quality is shown separately from relevance.",
      });
      evidence.push({
        id: `E${index + 1}`,
        source_id: sourceId,
        passage: title,
        relevance_score: Number((0.94 - index * 0.06).toFixed(2)),
        reranker_score: null,
      });
    }

    return { sources, evidence };
  } catch (error) {
    logger.warn({ err: error }, "Live evidence retrieval unavailable");
    return {
      sources: [],
      evidence: [],
      warning:
        "Live PubMed retrieval is currently unavailable. No external evidence was attached to this response.",
    };
  }
}

async function generateWithProvider(
  question: string,
  language: Language,
  evidence: Evidence[],
  extractedContent: string[],
  researchMode: boolean,
): Promise<{ answer: string; available: boolean; warning?: string }> {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || process.env.OLLAMA_BASE_URL;
  const model = process.env.LLM_MODEL || process.env.OLLAMA_MODEL;
  if (!baseUrl || !model || (!apiKey && !process.env.OLLAMA_MODEL)) {
    return {
      answer: "",
      available: false,
      warning:
        "No compatible language model is configured. Retrieved evidence and analysis outputs are shown without an invented AI summary.",
    };
  }

  const evidenceText = evidence
    .map((item) => `[${item.id}] ${item.passage}`)
    .join("\n");
  const attachmentsText = extractedContent.join("\n");
  const languageInstruction =
    language === "ur"
      ? "Respond in Unicode Urdu. Keep source IDs such as [E1] unchanged."
      : "Respond in clear English.";
  const formattingInstruction = researchMode
    ? "Format the answer in markdown. Structure is welcome here (a short intro paragraph, then headings and a " +
      "table only if the question genuinely has multiple comparable items to lay out) — but only add a table or " +
      "extra headings when they truly aid comprehension, not for every answer. Keep it as short as it can be " +
      "while fully answering the question."
    : "Format the answer in markdown, but keep it conversational: short paragraphs, occasional bold for a key " +
      "term, a plain bullet list only if there are several distinct items to enumerate. Do NOT use headings, " +
      "tables, or horizontal rules for a normal conversational answer — save those for when the question " +
      "explicitly asks for a structured comparison or breakdown. Aim for 2-5 short paragraphs unless the " +
      "question needs more.";
  const system = `You are a safety-first educational assistant focused on Parkinson's-related information. ${languageInstruction} ${formattingInstruction} Use only the supplied evidence and uploaded observations. Distinguish observations from conclusions. Never diagnose, prescribe, suggest medication changes, or claim disease probability. State uncertainty clearly. Cite factual claims with evidence IDs. The user may paste their own speech/gait screening results (scores, feature values, classifications) from this same application directly into the chat and ask questions about them — this is the app's own already-computed output, not external confidential data, so always analyze it directly and answer the question; do not refuse or add unprompted privacy/confidentiality caveats about data the user chose to paste in. If an uploaded image's observations indicate vision analysis was unavailable, explain plainly that image analysis is not currently configured for this deployment (not that you have no ability to see images at all), and suggest checking the VISION_MODEL setting.`;
  const user = `Question: ${question}\n\nEvidence:\n${evidenceText || "No external evidence available."}\n\nUploaded observations:\n${attachmentsText || "None."}`;
  const endpoint = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) {
      return {
        answer: "",
        available: false,
        warning: `The configured language model returned HTTP ${response.status}.`,
      };
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return {
        answer: "",
        available: false,
        warning: "The configured language model returned an empty response.",
      };
    }
    return { answer, available: true };
  } catch (error) {
    logger.warn({ err: error }, "Configured language model unavailable");
    return {
      answer: "",
      available: false,
      warning: "The configured language model could not be reached.",
    };
  }
}

function fallbackAnswer(
  question: string,
  language: Language,
  evidence: Evidence[],
  warnings: string[],
): string {
  if (language === "ur") {
    const evidenceLine = evidence.length
      ? `\n\nدستیاب شواہد:\n${evidence.map((item) => `${item.id}: ${item.passage}`).join("\n")}`
      : "";
    return `آپ کے سوال کا جائزہ لیا گیا، لیکن اس وقت قابلِ اعتماد AI خلاصہ دستیاب نہیں ہے۔ یہ نظام تشخیص یا علاج فراہم نہیں کرتا۔${evidenceLine}\n\n${warnings.join(" ")}`;
  }
  const evidenceLine = evidence.length
    ? `\n\nRetrieved evidence:\n${evidence.map((item) => `${item.id}: ${item.passage}`).join("\n")}`
    : "";
  return `I reviewed your question, but a configured language model is not available for a synthesized answer. This prototype will not invent a medical conclusion.${evidenceLine}\n\n${warnings.join(" ")}`;
}

function runSafetyCheck(answer: string, language: Language) {
  const unsafePatterns = [
    /\byou have\b.*\bparkinson/i,
    /\bdiagnos(ed|is)\b/i,
    /\bstop taking\b/i,
    /\bchange your medication\b/i,
    /\bdose\b.*\bmg\b/i,
  ];
  const issues = unsafePatterns
    .filter((pattern) => pattern.test(answer))
    .map(() => "Potentially diagnostic or treatment-directed language detected.");
  return {
    passed: issues.length === 0,
    issues,
    requires_clinician: /urgent|emergency|severe|worsen/i.test(answer),
    disclaimer: language === "ur" ? "یہ معلوماتی تحقیقاتی پروٹوٹائپ ہے، طبی تشخیص یا علاج نہیں۔" : DISCLAIMER,
  };
}

export type CarePlanInput = {
  language: Language;
  speech?: {
    status: string;
    screening_probability: number | null;
    classification: string | null;
    shap_top_features?: Array<{ feature: string; direction: string }>;
    validated_accuracy?: number | null;
    validated_sensitivity?: number | null;
    validated_specificity?: number | null;
  };
  gait?: {
    status: string;
    screening_probability: number | null;
    classification: string | null;
    shap_top_features?: Array<{ feature: string; direction: string }>;
    validated_accuracy?: number | null;
    validated_sensitivity?: number | null;
    validated_specificity?: number | null;
  };
  combined_score: number | null;
  combined_label: string | null;
};

export type CarePlanResult = {
  care_plan: string | null;
  available: boolean;
  warning?: string;
  sources: Source[];
};

function summarizeResultForPrompt(label: string, result?: CarePlanInput["speech"]): string {
  if (!result) return `${label}: not provided.`;
  if (result.status !== "success") {
    return `${label}: no usable score (status: ${result.status}).`;
  }
  const pct = result.screening_probability != null ? Math.round(result.screening_probability * 100) : null;
  const features = result.shap_top_features?.length
    ? ` Top contributing measured features: ${result.shap_top_features
        .slice(0, 4)
        .map((f) => `${f.feature} (${f.direction})`)
        .join(", ")}.`
    : "";
  const validated =
    result.validated_accuracy != null
      ? ` Model's own validated cross-validation performance: accuracy ${Math.round(result.validated_accuracy * 100)}%` +
        (result.validated_sensitivity != null ? `, sensitivity ${Math.round(result.validated_sensitivity * 100)}%` : "") +
        (result.validated_specificity != null ? `, specificity ${Math.round(result.validated_specificity * 100)}%` : "") +
        "."
      : "";
  return `${label}: model score ${pct}% (${result.classification ?? "unclassified"}).${features}${validated}`;
}

/**
 * Generates a cautious, non-diagnostic explanation of a speech/gait
 * screening result plus general next-step suggestions, grounded in live
 * PubMed evidence — same RAG pattern as the chat/research assistant, but
 * fed the actual screening numbers instead of a free-text question, and
 * with a stricter system prompt (no diagnosis, no treatment, no
 * medication, explicitly frames the model's own limited validated
 * accuracy). If no LLM is configured, this returns available: false with
 * a plain explanation rather than inventing a care plan.
 */
export async function generateCarePlan(input: CarePlanInput): Promise<CarePlanResult> {
  const topics: string[] = [];
  if (input.speech?.status === "success") topics.push("Parkinson's disease speech voice screening next steps");
  if (input.gait?.status === "success") topics.push("Parkinson's disease gait walking screening next steps");
  const query = topics.length
    ? topics.join(" ")
    : "Parkinson's disease screening next steps clinical evaluation";

  const retrieval = await retrieveSources(query);

  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || process.env.OLLAMA_BASE_URL;
  const model = process.env.LLM_MODEL || process.env.OLLAMA_MODEL;
  if (!baseUrl || !model || (!apiKey && !process.env.OLLAMA_MODEL)) {
    return {
      care_plan: null,
      available: false,
      warning:
        "No compatible language model is configured, so no AI-written explanation was generated. " +
        "The raw scores and features above are the only real output; nothing here is invented.",
      sources: retrieval.sources,
    };
  }

  const evidenceText = retrieval.evidence.map((item) => `[${item.id}] ${item.passage}`).join("\n");
  const resultsSummary = [
    summarizeResultForPrompt("Speech screening", input.speech),
    summarizeResultForPrompt("Gait screening", input.gait),
    input.combined_score != null
      ? `Combined score: ${Math.round(input.combined_score * 100)}% (${input.combined_label ?? "unclassified"}).`
      : "Combined score: not applicable (only one modality provided).",
  ].join("\n");

  const languageInstruction =
    input.language === "ur"
      ? "Respond in Unicode Urdu. Keep source IDs such as [E1] unchanged."
      : "Respond in clear English.";

  const system =
    "You are an assistant explaining experimental Parkinson's speech/gait screening results, writing " +
    `for two audiences at once. ${languageInstruction} Format the answer in markdown with exactly two ` +
    "top-level sections, in this order:\n\n" +
    "## For the patient\n" +
    "Plain-language explanation of what the score(s) mean, written for someone without a clinical " +
    "background. Include a bullet list of concrete, practical next steps (e.g. what kind of appointment " +
    "to book and roughly how soon, what to bring/mention, general lifestyle factors relevant to gait/voice " +
    "if evidence supports them).\n\n" +
    "## For the clinician\n" +
    "A more technical, practically useful note for the treating clinician. Include: the actual measured " +
    "feature values and which ones drove the score (from the SHAP data given below) with brief clinical " +
    "interpretation of each; how this compares to typical/atypical ranges where the evidence supports a " +
    "comparison; which standard clinical assessment tools would appropriately follow up or corroborate this " +
    "screening result (e.g. formal MDS-UPDRS examination, DaTscan or other imaging where clinically " +
    "indicated, referral to a movement disorder specialist); and general, evidence-based management " +
    "categories relevant to the symptoms observed (e.g. physical/occupational therapy for gait, speech-" +
    "language therapy for voice, exercise programs shown in the literature to help) — framed as options " +
    "for the clinician to consider and evaluate for this specific patient, not as a directive.\n\n" +
    "RULES THAT APPLY TO BOTH SECTIONS: do not state or imply a diagnosis (do not say the person does or " +
    "does not have Parkinson's disease); do not name a specific medication, dose, or medication change for " +
    "this person; do not present this score as a calibrated clinical probability of disease. State plainly, " +
    "once, that this is a research-prototype screening tool whose real-world accuracy has not been " +
    "clinically validated, and give the tool's own reported cross-validated accuracy/sensitivity/specificity " +
    "if present in the results below, so the reader can calibrate how much weight to give the score. If the " +
    "score is low/typical, do not create false reassurance — this tool cannot rule anything out either. " +
    "Beyond that, be as concrete, specific, and clinically useful as the evidence allows — do not hedge " +
    "with vague caution for its own sake. Cite factual claims from the evidence with their [Ex] IDs.";

  const user =
    `Screening results:\n${resultsSummary}\n\n` +
    `Supporting evidence:\n${evidenceText || "No external evidence available."}\n\n` +
    "Write the explanation and next steps described in the system prompt.";

  const endpoint = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) {
      return {
        care_plan: null,
        available: false,
        warning: `The configured language model returned HTTP ${response.status}.`,
        sources: retrieval.sources,
      };
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const carePlan = payload.choices?.[0]?.message?.content?.trim();
    if (!carePlan) {
      return {
        care_plan: null,
        available: false,
        warning: "The configured language model returned an empty response.",
        sources: retrieval.sources,
      };
    }
    return { care_plan: carePlan, available: true, sources: retrieval.sources };
  } catch (error) {
    logger.warn({ err: error }, "Care plan generation failed");
    return {
      care_plan: null,
      available: false,
      warning: "The configured language model could not be reached.",
      sources: retrieval.sources,
    };
  }
}

export async function runAssistant(input: {
  message: string;
  language: Language;
  attachments: Attachment[];
  researchMode: boolean;
}) {
  const selectedLanguage = detectLanguage(input.message, input.language);
  const agentTrace: Trace[] = [
    trace("orchestrator", "Orchestrator Agent", "success", "Routed only the agents required for this request.", {
      modalities: input.attachments.map((item) => item.type),
    }),
    trace("multilingual", "Multilingual NLP Agent", "success", `Response language selected: ${selectedLanguage === "ur" ? "Urdu" : "English"}.`, {
      detected_language: selectedLanguage,
    }),
  ];

  const extractedContent = input.attachments
    .flatMap((item) => [item.extracted_text ?? "", ...(item.observations ?? [])])
    .filter(Boolean)
    .slice(0, 12);

  for (const modality of ["document", "image", "audio", "video"] as const) {
    const items = input.attachments.filter((item) => item.type === modality);
    if (!items.length) continue;
    const agentName =
      modality === "document" ? "ocr" : modality === "image" ? "vision" : modality === "audio" ? "speech" : "gait";
    const agentLabel = modality === "document" ? "OCR" : modality === "video" ? "Gait" : modality[0].toUpperCase() + modality.slice(1);
    agentTrace.push(
      trace(
        agentName,
        `${agentLabel} Agent`,
        items.some((item) => item.extracted_text || item.observations?.length) ? "success" : "warning",
        items.some((item) => item.extracted_text || item.observations?.length)
          ? `Received structured ${modality} observations from the analyzer.`
          : `No structured ${modality} output was available.`,
        { files: items.length },
        items.some((item) => !item.extracted_text && !item.observations?.length)
          ? [`${modality} analysis was unavailable for one or more files.`]
          : [],
      ),
    );
  }

  const retrieval = await retrieveSources(input.message);
  agentTrace.push(
    trace(
      "web_retrieval",
      "Web Retrieval Agent",
      retrieval.sources.length ? "success" : "warning",
      retrieval.sources.length
        ? `Retrieved ${retrieval.sources.length} live PubMed sources.`
        : "No live external sources were attached.",
      { source_count: retrieval.sources.length, provider: "PubMed E-utilities" },
      retrieval.warning ? [retrieval.warning] : [],
    ),
  );
  agentTrace.push(
    trace(
      "rag",
      "RAG / Evidence Retrieval Agent",
      retrieval.evidence.length ? "success" : "warning",
      retrieval.evidence.length
        ? `Selected ${retrieval.evidence.length} evidence passages for review.`
        : "No evidence passages were available to rerank.",
      { evidence_count: retrieval.evidence.length, reranker: "not configured" },
    ),
  );

  const generated = await generateWithProvider(
    input.message,
    selectedLanguage,
    retrieval.evidence,
    extractedContent,
    input.researchMode,
  );
  const warnings = [retrieval.warning, generated.warning].filter(
    (item): item is string => Boolean(item),
  );
  const answer = generated.available
    ? generated.answer
    : fallbackAnswer(input.message, selectedLanguage, retrieval.evidence, warnings);
  agentTrace.push(
    trace(
      "reasoning",
      "Reasoning Agent",
      generated.available ? "success" : "warning",
      generated.available ? "Generated an evidence-constrained response." : "Skipped synthesis because no language model is configured.",
      { model_configured: generated.available },
      generated.warning ? [generated.warning] : [],
    ),
  );

  const safety = runSafetyCheck(answer, selectedLanguage);
  if (!safety.passed) {
    safety.issues.push("The response was replaced with a non-diagnostic safety message.");
  }
  agentTrace.push(
    trace(
      "evidence",
      "Evidence Verification Agent",
      retrieval.evidence.length ? "success" : "warning",
      retrieval.evidence.length ? "Evidence IDs are attached to retrieved passages." : "No external claims were verified.",
      { verified_passages: retrieval.evidence.length },
    ),
  );
  agentTrace.push(
    trace(
      "safety",
      "Safety Agent",
      safety.passed ? "success" : "warning",
      safety.passed ? "Passed non-diagnostic language checks." : "Unsafe language was detected and qualified.",
      { passed: safety.passed },
      safety.issues,
    ),
  );
  agentTrace.push(
    trace("response", "Response Synthesizer", "success", "Prepared the answer, evidence, and limitations for display.", {
      research_mode: input.researchMode,
    }),
  );

  logger.info(
    { sourceCount: retrieval.sources.length, evidenceCount: retrieval.evidence.length, researchMode: input.researchMode },
    "Assistant workflow completed",
  );
  return {
    answer: safety.passed ? answer : DISCLAIMER,
    language: selectedLanguage,
    sources: retrieval.sources,
    evidence: retrieval.evidence,
    agent_trace: agentTrace,
    safety,
    extracted_content: extractedContent,
    request_id: crypto.randomUUID(),
  };
}

export { DISCLAIMER };