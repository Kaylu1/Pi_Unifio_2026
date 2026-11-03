import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Offline preparation only. The licensed source is downloaded separately into ignored local data.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, process.argv[2] ?? 'data/video-source/mixkit-4716-source.mp4');
const media = resolve(root, 'public/media');
const video = resolve(media, 'workshop-loop.mp4');
const poster = resolve(media, 'workshop-poster.webp');
const expectedSourceHash = '8f300ab6bd9bfebb29757afd641e3a0c1a567802c68acff2f83ef32abcda787d';
const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

function run(binary, args, capture = false) {
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
  });
  if (result.error) throw new Error(`${binary}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${binary} failed (${result.status}): ${result.stderr ?? ''}`);
  return result.stdout;
}

if (!existsSync(source)) {
  throw new Error('Licensed source is missing. See docs/VIDEO-LOCAL.md for the public download URL.');
}
if (await sha256(source) !== expectedSourceHash) {
  throw new Error('Source checksum does not match the reviewed Mixkit 4716 download.');
}
await mkdir(media, { recursive: true });

// Main content: source 0.5-11.5 s. Its last 0.5 s blends into source 0-0.5 s,
// so the final frame naturally precedes the first frame on native HTML video loop.
const filter = [
  '[0:v]fps=24,scale=1280:720:flags=lanczos,setsar=1,',
  'eq=brightness=-0.035:saturation=0.82:contrast=1.03,format=yuv420p,split=2[main][head];',
  '[main]trim=start=0.5:end=11.5,setpts=PTS-STARTPTS[a];',
  '[head]trim=start=0:end=0.5,setpts=PTS-STARTPTS[b];',
  '[a][b]xfade=transition=fade:duration=0.5:offset=10.5,format=yuv420p[outv]',
].join('');
run('ffmpeg', [
  '-hide_banner', '-loglevel', 'warning', '-y', '-i', source,
  '-filter_complex_threads', '1', '-filter_complex', filter, '-map', '[outv]',
  '-an', '-map_metadata', '-1', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
  '-profile:v', 'high', '-level:v', '3.1', '-pix_fmt', 'yuv420p',
  '-maxrate', '1800k', '-bufsize', '3600k', '-g', '48', '-keyint_min', '24',
  '-movflags', '+faststart', '-t', '11', video,
]);
run('ffmpeg', [
  '-hide_banner', '-loglevel', 'warning', '-y', '-i', video,
  '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6',
  '-map_metadata', '-1', poster,
]);
const probe = JSON.parse(run('ffprobe', [
  '-v', 'error', '-show_entries',
  'format=duration,size:stream=codec_type,codec_name,profile,level,width,height,r_frame_rate,pix_fmt',
  '-of', 'json', video,
], true));
const manifest = {
  source: {
    provider: 'Mixkit', itemId: 4716, title: 'Mechanic repairing a car engine',
    creator: null, creatorNote: 'No individual creator credit is shown on the public item page.',
    page: 'https://mixkit.co/free-stock-video/mechanic-repairing-a-car-engine-4716/',
    download: 'https://assets.mixkit.co/videos/4716/4716-720.mp4',
    license: 'Mixkit Stock Video Free License',
    licenseUrl: 'https://mixkit.co/license/modal/videoFree/',
    termsUrl: 'https://mixkit.co/terms/', reviewedOn: '2026-10-21',
    sha256: expectedSourceHash,
  },
  edits: {
    realFootage: true, generatedWithAI: false,
    size: '1280x720', fps: 24, durationSeconds: Number(probe.format.duration),
    audio: false, sourceMainSegmentSeconds: [0.5, 11.5],
    loopBlendSeconds: 0.5, loopBlendTargetSegmentSeconds: [0, 0.5],
    brightness: -0.035, saturation: 0.82, contrast: 1.03,
    encoding: 'H.264 High Level 3.1, yuv420p, MP4 faststart',
    poster: 'First decoded frame of the prepared MP4, WebP quality 82',
  },
  files: {
    video: '/media/workshop-loop.mp4', poster: '/media/workshop-poster.webp',
    videoBytes: (await stat(video)).size, posterBytes: (await stat(poster)).size,
    videoSha256: await sha256(video), posterSha256: await sha256(poster),
  },
};
await writeFile(resolve(media, 'workshop-source.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ ...manifest.files, durationSeconds: manifest.edits.durationSeconds, probe }, null, 2));
