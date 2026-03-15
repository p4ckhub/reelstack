import type { ProductionTool } from './tool-interface';
import { PexelsTool } from '../tools/pexels-tool';
import { UserUploadTool } from '../tools/user-upload-tool';
import { HeyGenTool } from '../tools/heygen-tool';
import { Veo3Tool } from '../tools/veo3-tool';
import { KlingTool } from '../tools/kling-tool';
import { SeedanceTool } from '../tools/seedance-tool';
import { NanoBananaTool } from '../tools/nanobanana-tool';
import { falTools } from '../tools/fal-tool';
import {
  piapiKlingTool,
  piapiKlingImg2VideoTool,
  piapiSeedanceTool,
  piapiSeedance2Tool,
  piapiHunyuanTool,
  piapiHailuoTool,
  piapiFluxTool,
} from '../tools/piapi-tool';
import {
  replicateWanTool,
  replicateFluxTool,
  replicateSdxlTool,
  replicateIdeogramTool,
  replicateRecraftTool,
  replicateFluxProTool,
} from '../tools/replicate-tool';
import { runwayTool } from '../tools/runway-tool';
import {
  aimlapiKlingTool,
  aimlapiFluxTool,
  aimlapiKlingV3Tool,
  aimlapiVeo3Tool,
  aimlapiSora2Tool,
  aimlapiPixverseTool,
} from '../tools/aimlapi-tool';
import {
  wavespeedSeedanceTool,
  wavespeedWanTool,
  wavespeedFluxTool,
  wavespeedNanaBananaProTool,
  wavespeedWan26Tool,
  wavespeedQwenImageTool,
} from '../tools/wavespeed-tool';
import {
  kieKlingTool,
  kieSeedanceTool,
  kieSeedanceImg2VideoTool,
  kieWanTool,
  kieFluxTool,
  kieNanaBanana2Tool,
} from '../tools/kie-tool';
import { Veo31GeminiTool } from '../tools/veo31-gemini-tool';
import { MinimaxVideoTool } from '../tools/minimax-tool';
import { humoTool } from '../tools/humo-tool';

/**
 * Auto-discover available production tools based on environment variables.
 * User uploads are always available. Pexels requires explicit opt-in via PEXELS_ENABLED=true.
 * API-dependent tools are only instantiated when their key is present.
 */
export function discoverTools(): ProductionTool[] {
  const tools: ProductionTool[] = [new UserUploadTool()];

  // Pexels is opt-in only — it returns generic/irrelevant stock footage.
  // Only register when explicitly enabled via PEXELS_ENABLED=true.
  if (process.env.PEXELS_ENABLED === 'true') {
    tools.push(new PexelsTool());
  }

  if (process.env.HEYGEN_API_KEY) {
    tools.push(new HeyGenTool());
  }

  if (process.env.VEO3_API_KEY) {
    tools.push(new Veo3Tool());
  }

  if (process.env.KLING_API_KEY) {
    tools.push(new KlingTool());
  }

  if (process.env.SEEDANCE_API_KEY) {
    tools.push(new SeedanceTool());
  }

  if (process.env.NANOBANANA_API_KEY || process.env.GEMINI_API_KEY) {
    tools.push(new NanoBananaTool());
  }

  // fal.ai - one key, all models from catalog (video + image)
  if (process.env.FAL_KEY) {
    tools.push(...falTools);
  }

  // piapi.ai
  if (process.env.PIAPI_KEY) {
    tools.push(
      piapiKlingTool,
      piapiKlingImg2VideoTool,
      piapiSeedanceTool,
      piapiSeedance2Tool,
      piapiHunyuanTool,
      piapiHailuoTool,
      piapiFluxTool
    );
  }

  // Veo 3.1 via Vertex AI (requires gcloud auth + project ID)
  if (process.env.VERTEX_PROJECT_ID) {
    tools.push(new Veo31GeminiTool());
  }

  // Replicate
  if (process.env.REPLICATE_API_TOKEN) {
    tools.push(
      replicateWanTool,
      replicateFluxTool,
      replicateSdxlTool,
      replicateIdeogramTool,
      replicateRecraftTool,
      replicateFluxProTool
    );
  }

  // Runway Gen-4
  if (process.env.RUNWAY_API_KEY) {
    tools.push(runwayTool);
  }

  // AIML API
  if (process.env.AIMLAPI_KEY) {
    tools.push(
      aimlapiKlingTool,
      aimlapiFluxTool,
      aimlapiKlingV3Tool,
      aimlapiVeo3Tool,
      aimlapiSora2Tool,
      aimlapiPixverseTool
    );
  }

  // WaveSpeed
  if (process.env.WAVESPEED_API_KEY) {
    tools.push(
      wavespeedSeedanceTool,
      wavespeedWanTool,
      wavespeedWan26Tool,
      wavespeedFluxTool,
      wavespeedNanaBananaProTool,
      wavespeedQwenImageTool
    );
  }

  // kie.ai
  if (process.env.KIE_API_KEY) {
    tools.push(
      kieKlingTool,
      kieSeedanceTool,
      kieSeedanceImg2VideoTool,
      kieWanTool,
      kieFluxTool,
      kieNanaBanana2Tool
    );
  }

  // MiniMax direct API (platform.minimax.io)
  if (process.env.MINIMAX_API_KEY) {
    tools.push(new MinimaxVideoTool());
  }

  // HuMo 1.7B - self-hosted on RunPod serverless (cheapest avatar-video option)
  if (process.env.RUNPOD_API_KEY && process.env.HUMO_RUNPOD_ENDPOINT_ID) {
    tools.push(humoTool);
  }

  return tools;
}
