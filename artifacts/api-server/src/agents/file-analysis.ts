import { screenSpeech } from "./speech-screening";
import { screenGait } from "./gait-screening";
import { describeImage } from "./vision";

const MAX_TEXT = 12_000;

function languageOf(text: string): string {
  return (text.match(/[\u0600-\u06ff]/g) ?? []).length > 3 ? "ur" : "en";
}

export async function analyzeDocument(buffer: Buffer, filename: string) {
  let parser: import("pdf-parse").PDFParse | undefined;
  try {
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    const info = await parser.getInfo();
    const text = parsed.text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    const pages = info.total ?? parsed.pages?.length ?? 1;
    return {
      kind: "document" as const,
      status: text ? ("success" as const) : ("warning" as const),
      text,
      observations: text
        ? [`Extracted text from ${pages} PDF page(s).`]
        : ["The PDF did not contain an extractable text layer."],
      features: { pages, filename },
      language: text ? languageOf(text) : null,
      confidence: text ? 0.94 : null,
      warnings: text ? [] : ["Scanned PDFs may require a configured OCR engine."],
    };
  } catch {
    return {
      kind: "document" as const,
      status: "error" as const,
      text: "",
      observations: [],
      features: { filename },
      language: null,
      confidence: null,
      warnings: ["PDF extraction failed. No document content was retained."],
    };
  } finally {
    await parser?.destroy();
  }
}

export async function analyzeImage(buffer: Buffer, filename: string, mimetype: string) {
  const result = await describeImage(buffer, mimetype);
  const disclaimer = "Visual observations are informational and cannot diagnose disease.";

  if (result.available && result.description) {
    return {
      kind: "image" as const,
      status: "success" as const,
      text: result.description,
      observations: [result.description],
      features: { filename, model: process.env.VISION_MODEL },
      language: null,
      confidence: null,
      warnings: [disclaimer],
    };
  }

  return {
    kind: "image" as const,
    status: "warning" as const,
    text: "",
    observations: [],
    features: { filename, model_configured: Boolean(process.env.VISION_MODEL) },
    language: null,
    confidence: null,
    warnings: [disclaimer, result.warning ?? "Vision analysis is unavailable."],
  };
}

export async function analyzeAudio(buffer: Buffer, filename: string, mimetype: string) {
  const result = await screenSpeech(buffer, filename, mimetype);

  const baseWarnings = [
    "This is an experimental AI screening estimate and is NOT a medical diagnosis.",
    "Acoustic measurements are not diagnostic and cannot determine whether someone has Parkinson's disease.",
  ];

  if (result.status === "success") {
    return {
      kind: "audio" as const,
      status: "success" as const,
      text: "",
      observations: result.observations,
      features: {
        filename,
        bytes: buffer.byteLength,
        screening_probability: result.screening_probability,
        screening_probability_interval: result.screening_probability_interval,
        classification: result.classification,
        acoustic_features: result.features,
        shap_explanation: result.shap_explanation,
        feature_notes: result.feature_notes,
        model_card_summary: result.model_card_summary,
      },
      language: null,
      confidence: result.confidence,
      warnings: [...baseWarnings, ...result.limitations],
    };
  }

  // insufficient_quality, unavailable, or error: never fabricate a score.
  return {
    kind: "audio" as const,
    status: "warning" as const,
    text: "",
    observations: [],
    features: { filename, bytes: buffer.byteLength, screening_probability: null },
    language: null,
    confidence: null,
    warnings: [...baseWarnings, ...result.limitations],
  };
}

export async function analyzeVideo(buffer: Buffer, filename: string, mimetype: string) {
  const result = await screenGait(buffer, filename, mimetype);

  const baseWarnings = [
    "This is an experimental AI screening estimate and is NOT a medical diagnosis.",
    "Gait/movement measurements are not diagnostic and cannot determine whether someone has Parkinson's disease.",
  ];

  if (result.status === "success") {
    return {
      kind: "video" as const,
      status: "success" as const,
      text: "",
      observations: result.observations,
      features: {
        filename,
        bytes: buffer.byteLength,
        screening_probability: result.screening_probability,
        screening_probability_interval: result.screening_probability_interval,
        classification: result.classification,
        gait_features: result.features,
        shap_explanation: result.shap_explanation,
        severity: result.severity,
        feature_notes: result.feature_notes,
        model_card_summary: result.model_card_summary,
      },
      language: null,
      confidence: result.confidence,
      warnings: [...baseWarnings, ...result.limitations],
    };
  }

  // insufficient_quality, unavailable, or error: never fabricate a score.
  return {
    kind: "video" as const,
    status: "warning" as const,
    text: "",
    observations: [],
    features: { filename, bytes: buffer.byteLength, screening_probability: null },
    language: null,
    confidence: null,
    warnings: [...baseWarnings, ...result.limitations],
  };
}
