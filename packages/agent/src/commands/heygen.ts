/**
 * HeyGen commands - Avatar video generation, polling, status, looks.
 */
import fs from 'fs';
import path from 'path';
import {
  B,
  G,
  Y,
  R,
  D,
  X,
  positional,
  opt,
  flag,
  save,
  outDir,
  cleanScriptFile,
} from '../cli-utils';
import type { AssetGenerationRequest } from '../types';

export async function heygen() {
  let script = positional(1);
  if (!script) {
    console.log(
      `Usage: bun run rs heygen "Tekst" [--avatar-v] [--iv] [--look <id>] [--background "#hex"]\n       bun run rs heygen skrypt.txt\n       bun run rs heygen skrypt.txt --avatar-v --look <look-id> --motion "gestures"\n       bun run rs heygen skrypt.txt --test   (cheap Avatar III, 1 credit/min)`
    );
    process.exit(1);
  }

  // File support: read script from file, strip timing markers
  const filePath = opt('file');
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      console.log(`${R}File not found: ${filePath}${X}`);
      process.exit(1);
    }
    script = cleanScriptFile(fs.readFileSync(filePath, 'utf-8'));
  } else if (script && fs.existsSync(script)) {
    script = cleanScriptFile(fs.readFileSync(script, 'utf-8'));
  }

  // Engine selection: --avatar-v (V, 10 cr/min) > --iv (IV, 5 cr/min) > default (III, 1 cr/min)
  const useAvatarV = flag('avatar-v') || flag('v3'); // --v3 kept for backward compat
  const useAvatarIV = flag('iv');

  const { HeyGenTool, HeyGenV3Tool } = await import('../tools/heygen-tool');
  const tool = useAvatarV ? new HeyGenV3Tool() : new HeyGenTool();

  const health = await tool.healthCheck();
  if (!health.available) {
    console.log(`${R}HeyGen unavailable: ${health.reason}${X}`);
    process.exit(1);
  }

  const modeLabel = useAvatarV
    ? 'Avatar V (10 cr/min)'
    : useAvatarIV
      ? 'Avatar IV (5 cr/min)'
      : flag('test')
        ? 'Avatar III test (1 cr/min)'
        : 'Avatar III (1 cr/min)';
  console.log(`${B}HeyGen Generate${X} (${modeLabel})`);
  console.log(`Script: "${script.substring(0, 80)}${script.length > 80 ? '...' : ''}"`);

  const t0 = performance.now();

  const generateRequest: Record<string, unknown> = {
    purpose: 'CLI test',
    script,
    aspectRatio: '9:16',
  };

  // --look or --avatar (look_id = avatar_id in HeyGen)
  const lookId = opt('look') ?? opt('avatar');
  if (lookId) {
    generateRequest.avatarId = lookId;
  }

  // --rmbg: request HeyGen to remove background (requires matting-trained avatar)
  if (flag('rmbg')) {
    generateRequest.heygen_remove_background = true;
    console.log(`Background: remove (requires matting-trained avatar)`);
  }

  // --greenscreen: generate on green background (for ffmpeg chromakey post-processing)
  if (flag('greenscreen')) {
    generateRequest.heygen_background = { type: 'color', value: '#00FF00' };
    console.log(`Background: green screen (#00FF00)`);
  }

  // --background "#1a1a2e" or --background "https://example.com/bg.jpg"
  const bgValue = opt('background');
  if (bgValue && !flag('greenscreen') && !flag('rmbg')) {
    const isUrl = bgValue.startsWith('http');
    generateRequest.heygen_background = {
      type: isUrl ? 'image' : 'color',
      value: bgValue,
    };
    console.log(`Background: ${isUrl ? 'image' : 'color'} ${bgValue}`);
  }

  // Engine-specific params
  if (useAvatarV) {
    const charOverrides: Record<string, unknown> = {};
    if (opt('motion')) charOverrides.motion_prompt = opt('motion');
    if (opt('expressiveness')) charOverrides.expressiveness = opt('expressiveness');
    if (Object.keys(charOverrides).length > 0) {
      generateRequest.heygen_character = charOverrides;
    }
  } else if (useAvatarIV) {
    generateRequest.heygen_character = {
      use_avatar_iv_model: true,
      prompt: opt('motion') ?? 'speaks naturally with hand gestures',
    };
  }

  if (opt('emotion') || opt('speed')) {
    generateRequest.heygen_voice = {
      ...(opt('emotion') ? { emotion: opt('emotion') } : {}),
      ...(opt('speed') ? { speed: parseFloat(opt('speed')!) } : {}),
    };
  }

  const result = await tool.generate(generateRequest as unknown as AssetGenerationRequest);

  if (result.status === 'failed') {
    console.log(`${R}Failed: ${result.error}${X}`);
    process.exit(1);
  }

  console.log(`Job: ${result.jobId}`);
  console.log(
    `Polling (ctrl+c to cancel, use 'bun run rs heygen-poll ${result.jobId}' to resume)...`
  );

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await tool.poll(result.jobId);
    const sec = (i + 1) * 5;

    if (poll.status === 'completed') {
      const heygenMeta: Record<string, unknown> = {
        url: poll.url,
        durationSeconds: poll.durationSeconds,
        jobId: result.jobId,
      };

      // Download video
      if (poll.url) {
        const videoPath = path.join(outDir, 'heygen.mp4');
        const res = await fetch(poll.url);
        if (res.ok) {
          fs.writeFileSync(videoPath, Buffer.from(await res.arrayBuffer()));
          console.log(`${G}Done${X} (${sec}s): ${poll.durationSeconds?.toFixed(1)}s video`);
          console.log(`${D}Saved: ${videoPath}${X}`);

          // Chromakey post-processing for green screen -> WebM with alpha
          if (flag('greenscreen')) {
            const transparentPath = path.join(outDir, 'heygen-transparent.webm');
            console.log(`${Y}Chromakey: removing green screen...${X}`);
            const { execSync } = await import('child_process');
            execSync(
              `ffmpeg -y -i "${videoPath}" -vf "chromakey=0x00FF00:0.15:0.1" -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -c:a libopus "${transparentPath}"`,
              { stdio: 'pipe' }
            );
            console.log(`${G}Transparent WebM${X}: ${transparentPath}`);
            heygenMeta.transparentVideoPath = transparentPath;
            heygenMeta.transparent = true;
          }

          // rmbg flag: HeyGen already gave us a transparent video (WebM or MP4 with alpha)
          if (flag('rmbg')) {
            heygenMeta.transparent = true;
          }

          console.log(`${D}Open:  open ${videoPath}${X}`);
        } else {
          console.log(`${G}Done${X} (${sec}s): ${poll.durationSeconds?.toFixed(1)}s video`);
          console.log(
            `${Y}Download failed (${res.status}), URL:${X} ${poll.url?.substring(0, 80)}...`
          );
        }
      }
      save('heygen.json', heygenMeta);
      console.log(`${D}Next: bun run rs plan ${outDir}/tts.json${X}`);
      return;
    }
    if (poll.status === 'failed') {
      console.log(`${R}Failed: ${poll.error}${X}`);
      process.exit(1);
    }
    if (sec % 30 === 0) console.log(`  ${D}${sec}s...${X}`);
  }
  console.log(`${Y}Timeout. Use: bun run rs heygen-poll ${result.jobId}${X}`);
}

export async function heygenPoll() {
  const jobId = positional(1);
  if (!jobId) {
    console.log(`Usage: bun run rs heygen-poll <job-id>`);
    process.exit(1);
  }

  const { HeyGenTool } = await import('../tools/heygen-tool');
  const tool = new HeyGenTool();

  console.log(`${B}HeyGen Poll${X} ${jobId}`);

  for (let i = 0; i < 60; i++) {
    const poll = await tool.poll(jobId);
    if (poll.status === 'completed') {
      save('heygen.json', { url: poll.url, durationSeconds: poll.durationSeconds, jobId });
      if (poll.url) {
        const videoPath = path.join(outDir, 'heygen.mp4');
        const res = await fetch(poll.url);
        if (res.ok) {
          fs.writeFileSync(videoPath, Buffer.from(await res.arrayBuffer()));
          console.log(`${G}Done${X}: ${poll.durationSeconds?.toFixed(1)}s video`);
          console.log(`${D}Saved: ${videoPath}${X}`);
          console.log(`${D}Open:  open ${videoPath}${X}`);
        } else {
          console.log(`${G}Done${X}: ${poll.durationSeconds?.toFixed(1)}s video`);
          console.log(`${D}URL: ${poll.url?.substring(0, 80)}...${X}`);
        }
      }
      return;
    }
    if (poll.status === 'failed') {
      console.log(`${R}Failed: ${poll.error}${X}`);
      process.exit(1);
    }
    console.log(`  ${D}${(i + 1) * 5}s: ${poll.status}${X}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

export async function heygenStatus() {
  const { HeyGenTool } = await import('../tools/heygen-tool');
  const tool = new HeyGenTool();
  const health = await tool.healthCheck();
  console.log(`${B}HeyGen Status${X}`);
  console.log(`Available: ${health.available ? G + 'yes' : R + 'no'}${X}`);
  if (health.reason) console.log(`Reason: ${health.reason}`);
}

export async function heygenLooks() {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    console.log(`${R}HEYGEN_API_KEY not set${X}`);
    process.exit(1);
  }

  const ownership = flag('public') ? 'public' : 'private';
  const avatarType = opt('type'); // studio_avatar, digital_twin, photo_avatar

  console.log(`${B}HeyGen Avatar Looks${X} (${ownership})`);

  let token: string | undefined;
  let total = 0;

  do {
    const params = new URLSearchParams({ ownership, limit: '50' });
    if (avatarType) params.set('avatar_type', avatarType);
    if (token) params.set('token', token);

    const res = await fetch(`https://api.heygen.com/v3/avatars/looks?${params}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });

    if (!res.ok) {
      console.log(`${R}API error: ${res.status}${X}`);
      process.exit(1);
    }

    const data = (await res.json()) as {
      data?: Array<{
        id?: string;
        name?: string;
        avatar_type?: string;
        group_id?: string;
        supported_api_engines?: string[];
        preview_image_url?: string;
        default_voice_id?: string;
      }>;
      has_more?: boolean;
      next_token?: string;
    };

    const looks = data.data ?? [];
    for (const look of looks) {
      const engines = (look.supported_api_engines ?? []).join(', ');
      const voiceTag = look.default_voice_id
        ? ` voice=${look.default_voice_id.substring(0, 12)}...`
        : '';
      console.log(
        `  ${Y}${look.id}${X}  ${look.name ?? '?'}  (${look.avatar_type ?? '?'}, engines: ${engines || 'unknown'}${voiceTag})`
      );
      total++;
    }

    token = data.has_more ? data.next_token : undefined;
  } while (token);

  console.log(`\n${G}${total} looks${X}`);
  console.log(`${D}Use: bun run rs heygen skrypt.txt --look <id>${X}`);
}
