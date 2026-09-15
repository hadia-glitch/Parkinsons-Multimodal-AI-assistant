import { Router, type IRouter } from "express";
import multer from "multer";
import {
  AnalyzeAudioResponse,
  AnalyzeDocumentResponse,
  AnalyzeImageResponse,
  AnalyzeVideoResponse,
  ChatBody,
  ChatResponse,
  ResearchBody,
  ResearchResponse,
  ScreenResponse,
} from "@workspace/api-zod";
import { analyzeAudio, analyzeDocument, analyzeImage, analyzeVideo } from "../agents/file-analysis";
import { runAssistant, DISCLAIMER, generateCarePlan } from "../agents/pipeline";

const router: IRouter = Router();
const maxUploadBytes =
  Number(process.env.MAX_UPLOAD_SIZE_MB ?? "25") * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes },
});

function allowedFile(file: Express.Multer.File, kinds: string[]) {
  const extension = file.originalname.toLowerCase().split(".").pop() ?? "";
  return kinds.includes(extension) || kinds.includes(file.mimetype);
}

router.post("/chat", async (req, res) => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid chat request.", detail: parsed.error.message });
    return;
  }
  try {
    const response = await runAssistant({
      message: parsed.data.message,
      language: parsed.data.language,
      researchMode: parsed.data.research_mode,
      attachments: parsed.data.attachments,
    });
    res.json(ChatResponse.parse(response));
  } catch (error) {
    req.log.error({ err: error }, "Chat workflow failed");
    res.status(500).json({ error: "Assistant workflow failed safely." });
  }
});

router.post("/research", async (req, res) => {
  const parsed = ResearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid research request.", detail: parsed.error.message });
    return;
  }
  try {
    const response = await runAssistant({
      message: parsed.data.question,
      language: parsed.data.language,
      researchMode: true,
      attachments: [],
    });
    res.json(ResearchResponse.parse(response));
  } catch (error) {
    req.log.error({ err: error }, "Research workflow failed");
    res.status(500).json({ error: "Research workflow failed safely." });
  }
});

router.post("/analyze/image", upload.single("file"), async (req, res) => {
  if (!req.file || !allowedFile(req.file, ["png", "jpg", "jpeg", "webp", "image/png", "image/jpeg", "image/webp"])) {
    res.status(400).json({ error: "Unsupported or missing image file." });
    return;
  }
  res.json(AnalyzeImageResponse.parse(await analyzeImage(req.file.buffer, req.file.originalname, req.file.mimetype)));
});

router.post("/analyze/document", upload.single("file"), async (req, res) => {
  if (!req.file || !allowedFile(req.file, ["pdf", "application/pdf"])) {
    res.status(400).json({ error: "Unsupported or missing PDF file." });
    return;
  }
  res.json(AnalyzeDocumentResponse.parse(await analyzeDocument(req.file.buffer, req.file.originalname)));
});

router.post("/analyze/audio", upload.single("file"), async (req, res) => {
  if (!req.file || !allowedFile(req.file, ["wav", "mp3", "m4a", "webm", "audio/wav", "audio/mpeg", "audio/mp4", "audio/webm"])) {
    res.status(400).json({ error: "Unsupported or missing audio file." });
    return;
  }
  res.json(
    AnalyzeAudioResponse.parse(
      await analyzeAudio(req.file.buffer, req.file.originalname, req.file.mimetype),
    ),
  );
});

router.post("/analyze/video", upload.single("file"), async (req, res) => {
  if (
    !req.file ||
    !allowedFile(req.file, ["mp4", "webm", "mov", "video/mp4", "video/webm", "video/quicktime"])
  ) {
    res.status(400).json({ error: "Unsupported or missing video file." });
    return;
  }
  res.json(
    AnalyzeVideoResponse.parse(
      await analyzeVideo(req.file.buffer, req.file.originalname, req.file.mimetype),
    ),
  );
});

const SPEECH_WEIGHT = Number(process.env.SPEECH_WEIGHT ?? "0.5");
const GAIT_WEIGHT = Number(process.env.GAIT_WEIGHT ?? "0.5");

function classify(score: number): string {
  if (score < 0.4) return "lower_screening_signal";
  if (score < 0.65) return "intermediate_screening_signal";
  return "higher_screening_signal";
}

router.post(
  "/screen",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const audioFile = files?.audio?.[0];
    const videoFile = files?.video?.[0];
    const language: "en" | "ur" = req.body?.language === "ur" ? "ur" : "en";

    if (!audioFile && !videoFile) {
      res.status(400).json({ error: "Provide at least one of: audio, video." });
      return;
    }

    const [speech, gait] = await Promise.all([
      audioFile
        ? analyzeAudio(audioFile.buffer, audioFile.originalname, audioFile.mimetype)
        : Promise.resolve(undefined),
      videoFile
        ? analyzeVideo(videoFile.buffer, videoFile.originalname, videoFile.mimetype)
        : Promise.resolve(undefined),
    ]);

    const speechScore =
      speech?.status === "success" ? (speech.features.screening_probability as number | null) : null;
    const gaitScore =
      gait?.status === "success" ? (gait.features.screening_probability as number | null) : null;

    const modalitiesUsed: ("speech" | "gait")[] = [
      ...(speechScore != null ? (["speech"] as const) : []),
      ...(gaitScore != null ? (["gait"] as const) : []),
    ];

    let combinedScore: number | null = null;
    if (speechScore != null && gaitScore != null) {
      const totalWeight = SPEECH_WEIGHT + GAIT_WEIGHT || 1;
      combinedScore = (SPEECH_WEIGHT * speechScore + GAIT_WEIGHT * gaitScore) / totalWeight;
    } else if (speechScore != null) {
      combinedScore = speechScore;
    } else if (gaitScore != null) {
      combinedScore = gaitScore;
    }
    const combinedLabel = combinedScore != null ? classify(combinedScore) : null;

    const shapTopFeatures = (analysis?: { features: Record<string, unknown> }) =>
      (analysis?.features?.shap_explanation as { top_contributions?: Array<{ feature: string; direction: string }> } | null | undefined)
        ?.top_contributions?.map((c) => ({ feature: c.feature, direction: c.direction }));

    const validatedMetrics = (analysis?: { features: Record<string, unknown> }) => {
      const summary = analysis?.features?.model_card_summary as
        | { validated_cv_accuracy?: number; validated_cv_sensitivity?: number; validated_cv_specificity?: number }
        | null
        | undefined;
      return {
        validated_accuracy: summary?.validated_cv_accuracy ?? null,
        validated_sensitivity: summary?.validated_cv_sensitivity ?? null,
        validated_specificity: summary?.validated_cv_specificity ?? null,
      };
    };

    const carePlan = await generateCarePlan({
      language,
      speech: speech
        ? {
            status: speech.status,
            screening_probability: speechScore,
            classification: (speech.features.classification as string | null) ?? null,
            shap_top_features: shapTopFeatures(speech),
            ...validatedMetrics(speech),
          }
        : undefined,
      gait: gait
        ? {
            status: gait.status,
            screening_probability: gaitScore,
            classification: (gait.features.classification as string | null) ?? null,
            shap_top_features: shapTopFeatures(gait),
            ...validatedMetrics(gait),
          }
        : undefined,
      combined_score: combinedScore,
      combined_label: combinedLabel,
    });

    res.json(
      ScreenResponse.parse({
        speech,
        gait,
        modalities_used: modalitiesUsed,
        speech_weight: SPEECH_WEIGHT,
        gait_weight: GAIT_WEIGHT,
        combined_score: combinedScore != null ? Number(combinedScore.toFixed(4)) : null,
        combined_label: combinedLabel,
        care_plan: carePlan.care_plan,
        care_plan_available: carePlan.available,
        care_plan_warning: carePlan.warning ?? null,
        care_plan_sources: carePlan.sources,
        disclaimer: DISCLAIMER,
      }),
    );
  },
);

export default router;