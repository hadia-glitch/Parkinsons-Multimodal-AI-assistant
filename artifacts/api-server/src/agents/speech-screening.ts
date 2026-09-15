/**
 * Client for the Python speech-screening microservice (ml-speech-service).
 *
 * The Node api-server never fabricates a screening result itself — it is a
 * thin, honest proxy. If SPEECH_SERVICE_URL is not configured, or the
 * service is unreachable, or the service reports the model isn't loaded,
 * this returns the same "unavailable" shape the app previously used for
 * every audio upload — nothing regresses, it now just becomes a real result
 * once the service is deployed and configured.
 */

import { logger } from "../lib/logger";

const SPEECH_SERVICE_URL = process.env.SPEECH_SERVICE_URL; // e.g. https://ml-speech.yourhost.com
const SPEECH_SERVICE_TIMEOUT_MS = Number(process.env.SPEECH_SERVICE_TIMEOUT_MS ?? "20000");

export type SpeechScreeningResult = {
  status: "success" | "insufficient_quality" | "unavailable" | "error";
  screening_probability: number | null;
  screening_probability_interval: Record<string, unknown> | null;
  classification: string | null;
  confidence: number | null;
  features: Record<string, number | null>;
  quality: Record<string, unknown> | null;
  feature_notes: string | null;
  shap_explanation: Record<string, unknown> | null;
  observations: string[];
  limitations: string[];
  model_card_summary: Record<string, unknown> | null;
};

function unavailable(reason: string): SpeechScreeningResult {
  return {
    status: "unavailable",
    screening_probability: null,
    screening_probability_interval: null,
    classification: null,
    confidence: null,
    features: {},
    quality: null,
    feature_notes: null,
    shap_explanation: null,
    observations: [],
    limitations: [reason],
    model_card_summary: null,
  };
}

export async function screenSpeech(buffer: Buffer, filename: string, mimetype: string): Promise<SpeechScreeningResult> {
  if (!SPEECH_SERVICE_URL) {
    return unavailable(
      "Speech screening is unavailable because SPEECH_SERVICE_URL is not configured. " +
        "Deploy ml-speech-service and set the environment variable to enable this feature."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SPEECH_SERVICE_TIMEOUT_MS);

  try {
    const form = new FormData();
    const bytes: Uint8Array<ArrayBuffer> = Uint8Array.from(buffer);
    form.append("audio", new Blob([bytes], { type: mimetype || "audio/wav" }), filename);

    const response = await fetch(`${SPEECH_SERVICE_URL.replace(/\/$/, "")}/analyze/speech`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.error({ status: response.status, detail }, "Speech service returned an error");
      return unavailable(`Speech screening service returned an error (HTTP ${response.status}).`);
    }

    const body = (await response.json()) as {
      status: string;
      screening_probability: number | null;
      screening_probability_interval?: Record<string, unknown> | null;
      classification?: string | null;
      confidence: number | null;
      features?: Record<string, number | null>;
      quality?: Record<string, unknown>;
      feature_notes?: string | null;
      shap_explanation?: Record<string, unknown> | null;
      observations?: string[];
      limitations?: string[];
      model_card_summary?: Record<string, unknown> | null;
    };

    return {
      status: (body.status as SpeechScreeningResult["status"]) ?? "error",
      screening_probability: body.screening_probability ?? null,
      screening_probability_interval: body.screening_probability_interval ?? null,
      classification: body.classification ?? null,
      confidence: body.confidence ?? null,
      features: body.features ?? {},
      quality: body.quality ?? null,
      feature_notes: body.feature_notes ?? null,
      shap_explanation: body.shap_explanation ?? null,
      observations: body.observations ?? [],
      limitations: body.limitations ?? [],
      model_card_summary: body.model_card_summary ?? null,
    };
  } catch (error) {
    logger.error({ err: error }, "Speech screening request failed");
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "Speech screening timed out."
        : "Speech screening service is unreachable.";
    return unavailable(reason);
  } finally {
    clearTimeout(timeout);
  }
}
