/**
 * Vision analysis agent.
 *
 * Calls an OpenAI-compatible multimodal chat completions endpoint (or a
 * local Ollama vision model, e.g. `llava`) with the uploaded image and asks
 * for a strictly factual, non-diagnostic description. Mirrors
 * pipeline.ts's generateWithProvider() connection logic exactly, but is a
 * separate function because it requires VISION_MODEL specifically — we
 * never silently send an image to a model that wasn't confirmed to accept
 * one.
 *
 * If VISION_MODEL (plus a base URL/credentials) isn't configured, or the
 * call fails, this returns `available: false` and an honest reason —
 * mirroring the "never fabricate" contract used by the speech/gait
 * screening agents. It never invents a description.
 */

import { logger } from "../lib/logger";

const SYSTEM_PROMPT =
  "You describe images factually and neutrally for a Parkinson's information assistant. " +
  "Report only what is clearly visible (objects, posture, setting, text present in the image). " +
  "Never diagnose any medical condition, never speculate about a person's health status, and never " +
  "estimate disease probability from an image. If the image shows a person, avoid commenting on " +
  "gait, tremor, or movement — this application's gait/speech screening comes from dedicated, " +
  "validated pipelines elsewhere, not from a general vision model's impression of a still image.";

export type VisionResult = {
  available: boolean;
  description?: string;
  warning?: string;
};

export async function describeImage(buffer: Buffer, mimetype: string): Promise<VisionResult> {
  const visionModel = process.env.VISION_MODEL;
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || process.env.OLLAMA_BASE_URL;
  const usingOllama = Boolean(process.env.OLLAMA_BASE_URL && !process.env.LLM_BASE_URL);

  if (!visionModel || !baseUrl || (!apiKey && !usingOllama)) {
    return {
      available: false,
      warning:
        "Vision analysis is unavailable because no compatible vision model is configured. " +
        "Set VISION_MODEL plus either (LLM_BASE_URL + LLM_API_KEY + LLM_MODEL-capable provider) " +
        "or (OLLAMA_BASE_URL with a local vision model such as llava pulled).",
    };
  }

  const dataUrl = `data:${mimetype || "image/png"};base64,${buffer.toString("base64")}`;
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
        model: visionModel,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this image factually in 2-4 sentences." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.error({ status: response.status, detail }, "Vision model returned an error");
      return { available: false, warning: `The configured vision model returned HTTP ${response.status}.` };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const description = payload.choices?.[0]?.message?.content?.trim();
    if (!description) {
      return { available: false, warning: "The configured vision model returned an empty response." };
    }
    return { available: true, description };
  } catch (error) {
    logger.error({ err: error }, "Vision analysis request failed");
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "Vision analysis timed out."
        : "The configured vision model is unreachable.";
    return { available: false, warning: reason };
  }
}
