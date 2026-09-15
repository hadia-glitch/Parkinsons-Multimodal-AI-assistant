/**
 * Client for the Python gait-screening microservice (ml-gait-service).
 *
 * Mirrors agents/speech-screening.ts exactly: a thin, honest proxy. The
 * Node api-server never fabricates a screening result. If GAIT_SERVICE_URL
 * is not configured, the service is unreachable, or it reports the model
 * isn't loaded, this returns the same "unavailable" shape used for every
 * video upload — nothing regresses, it becomes a real result once the
 * service is deployed, trained on CARE-PD, and configured.
 */

import { logger } from "../lib/logger";

const GAIT_SERVICE_URL = process.env.GAIT_SERVICE_URL; // e.g. https://ml-gait.yourhost.com
const GAIT_SERVICE_TIMEOUT_MS = Number(process.env.GAIT_SERVICE_TIMEOUT_MS ?? "30000");

export type GaitScreeningResult = {
  status: "success" | "insufficient_quality" | "unavailable" | "error";
  screening_probability: number | null;
  screening_probability_interval: Record<string, unknown> | null;
  severity: Record<string, unknown> | null;
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

function unavailable(reason: string): GaitScreeningResult {
  return {
    status: "unavailable",
    screening_probability: null,
    screening_probability_interval: null,
    severity: null,
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

export async function screenGait(buffer: Buffer, filename: string, mimetype: string): Promise<GaitScreeningResult> {
  if (!GAIT_SERVICE_URL) {
    return unavailable(
      "Gait screening is unavailable because GAIT_SERVICE_URL is not configured. " +
        "Deploy ml-gait-service (trained on CARE-PD) and set the environment variable to enable this feature."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GAIT_SERVICE_TIMEOUT_MS);

  try {
    const form = new FormData();
    const bytes: Uint8Array<ArrayBuffer> = Uint8Array.from(buffer);
    form.append("video", new Blob([bytes], { type: mimetype || "video/mp4" }), filename);

    const response = await fetch(`${GAIT_SERVICE_URL.replace(/\/$/, "")}/analyze/gait`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.error({ status: response.status, detail }, "Gait service returned an error");
      return unavailable(`Gait screening service returned an error (HTTP ${response.status}).`);
    }

    const body = (await response.json()) as {
      status: string;
      screening_probability: number | null;
      screening_probability_interval?: Record<string, unknown> | null;
      severity?: Record<string, unknown> | null;
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
      status: (body.status as GaitScreeningResult["status"]) ?? "error",
      screening_probability: body.screening_probability ?? null,
      screening_probability_interval: body.screening_probability_interval ?? null,
      severity: body.severity ?? null,
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
    logger.error({ err: error }, "Gait screening request failed");
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "Gait screening timed out."
        : "Gait screening service is unreachable.";
    return unavailable(reason);
  } finally {
    clearTimeout(timeout);
  }
}
