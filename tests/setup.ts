/**
 * Test setup — runs before all test files.
 *
 * 1. Forces MODEL_PRESET=testing → all LLM calls use Haiku (cheapest)
 * 2. Clears API keys → prevents accidental real API calls
 *
 * Bun auto-loads .env which contains production keys.
 * Without this, tests can hit real Opus API at $15/1M output tokens.
 */
process.env.MODEL_PRESET = 'testing';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.HEYGEN_API_KEY;
delete process.env.FAL_KEY;
delete process.env.RUNWAY_API_KEY;
delete process.env.KIE_API_KEY;
delete process.env.WAVESPEED_API_KEY;
delete process.env.SEEDANCE_API_KEY;
delete process.env.KLING_API_KEY;
delete process.env.REPLICATE_API_TOKEN;
delete process.env.AIMLAPI_KEY;
delete process.env.NANOBANANA_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.VEO3_API_KEY;
delete process.env.VERTEX_PROJECT_ID;
delete process.env.PIAPI_API_KEY;
delete process.env.MINIMAX_API_KEY;
delete process.env.RUNPOD_API_KEY;
delete process.env.PEXELS_API_KEY;
