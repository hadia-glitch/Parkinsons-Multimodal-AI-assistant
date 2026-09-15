import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { DISCLAIMER } from "../agents/pipeline";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/capabilities", (_req, res) => {
  res.json({
    status: "operational",
    capabilities: [
      {
        id: "retrieval",
        label: "Live PubMed retrieval",
        available: true,
        detail: "Uses NCBI E-utilities for current indexed literature.",
      },
      {
        id: "llm",
        label: "Language model synthesis",
        available: Boolean(process.env.LLM_MODEL || process.env.OLLAMA_MODEL),
        detail: process.env.LLM_MODEL || process.env.OLLAMA_MODEL
          ? "Configured OpenAI-compatible or Ollama model."
          : "Configure LLM_BASE_URL + LLM_MODEL or Ollama to enable synthesis.",
      },
      {
        id: "vision",
        label: "Vision analysis",
        available: Boolean(
          process.env.VISION_MODEL &&
            (process.env.LLM_BASE_URL || process.env.OLLAMA_BASE_URL) &&
            (process.env.LLM_API_KEY || process.env.OLLAMA_BASE_URL),
        ),
        detail:
          process.env.VISION_MODEL && (process.env.LLM_BASE_URL || process.env.OLLAMA_BASE_URL)
            ? "Configured; forwarding image uploads to the vision-capable model."
            : "Set VISION_MODEL plus (LLM_BASE_URL + LLM_API_KEY) or OLLAMA_BASE_URL to enable real image descriptions.",
      },
      {
        id: "speech_screening",
        label: "Speech gait screening (ml-speech-service)",
        available: Boolean(process.env.SPEECH_SERVICE_URL),
        detail: process.env.SPEECH_SERVICE_URL
          ? "Configured; forwarding audio uploads to ml-speech-service."
          : "Set SPEECH_SERVICE_URL to enable real speech screening scores.",
      },
      {
        id: "gait_screening",
        label: "Gait screening (ml-gait-service)",
        available: Boolean(process.env.GAIT_SERVICE_URL),
        detail: process.env.GAIT_SERVICE_URL
          ? "Configured; forwarding video uploads to ml-gait-service."
          : "Set GAIT_SERVICE_URL to enable real gait screening scores.",
      },
      {
        id: "safety",
        label: "Safety filtering",
        available: true,
        detail: "Responses are checked for diagnostic and treatment-directed language.",
      },
    ],
    disclaimer: DISCLAIMER,
  });
});

export default router;
