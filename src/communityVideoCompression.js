import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import {
  COMMUNITY_VIDEO_INPUT_MAX_BYTES,
  COMMUNITY_VIDEO_OUTPUT_MAX_BYTES,
} from "./communityMediaLimits";

const TARGET_VIDEO_BYTES = 12 * 1024 * 1024;
const AUDIO_BITRATE = 96_000;
const MIN_VIDEO_BITRATE = 450_000;
const MAX_VIDEO_BITRATE = 2_500_000;

let ffmpegPromise;

function getFileExtension(file) {
  return String(file?.name || "").split(".").pop()?.toLowerCase() || "mov";
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    function cleanup() {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    }

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const duration = Number(video.duration);
      cleanup();

      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("No fue posible leer la duración del video."));
        return;
      }

      resolve(duration);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("El navegador no pudo leer este video."));
    };

    video.src = objectUrl;
  });
}

async function getFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({ coreURL, wasmURL });
      return ffmpeg;
    })().catch((error) => {
      ffmpegPromise = null;
      throw error;
    });
  }

  return ffmpegPromise;
}

function getTargetVideoBitrate(duration, reductionFactor = 1) {
  const totalBitrate = (TARGET_VIDEO_BYTES * 8) / duration;
  return Math.round(
    clamp((totalBitrate - AUDIO_BITRATE) * reductionFactor, MIN_VIDEO_BITRATE, MAX_VIDEO_BITRATE)
  );
}

async function transcodeVideo(ffmpeg, inputName, outputName, videoBitrate) {
  const scaleFilter =
    "scale=if(gt(iw\\,ih)\\,min(iw\\,1280)\\,-2):if(gt(iw\\,ih)\\,-2\\,min(ih\\,1280))";

  const exitCode = await ffmpeg.exec([
    "-i",
    inputName,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-vf",
    scaleFilter,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-profile:v",
    "main",
    "-pix_fmt",
    "yuv420p",
    "-b:v",
    String(videoBitrate),
    "-maxrate",
    String(Math.round(videoBitrate * 1.2)),
    "-bufsize",
    String(videoBitrate * 2),
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    "-y",
    outputName,
  ]);

  if (exitCode !== 0) {
    throw new Error("FFmpeg no pudo convertir el video.");
  }

  const output = await ffmpeg.readFile(outputName);
  return new Uint8Array(output);
}

export async function compressCommunityVideo(file, { onProgress } = {}) {
  if (!file?.type?.startsWith("video/")) {
    throw new Error("El archivo seleccionado no es un video.");
  }

  if (file.size > COMMUNITY_VIDEO_INPUT_MAX_BYTES) {
    throw new Error("El video supera el máximo de 60 MB antes de comprimir.");
  }

  const duration = await getVideoDuration(file);
  const ffmpeg = await getFFmpeg();
  const { fetchFile } = await import("@ffmpeg/util");
  const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputName = `community-input-${operationId}.${getFileExtension(file)}`;
  const outputName = `community-output-${operationId}.mp4`;

  const progressListener = ({ progress }) => {
    if (!Number.isFinite(progress)) return;
    onProgress?.(Math.min(99, Math.max(1, Math.round(progress * 100))));
  };

  ffmpeg.on("progress", progressListener);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    let output = await transcodeVideo(
      ffmpeg,
      inputName,
      outputName,
      getTargetVideoBitrate(duration)
    );

    if (output.byteLength > COMMUNITY_VIDEO_OUTPUT_MAX_BYTES) {
      await ffmpeg.deleteFile(outputName);
      output = await transcodeVideo(
        ffmpeg,
        inputName,
        outputName,
        getTargetVideoBitrate(duration, 0.65)
      );
    }

    if (!output.byteLength || output.byteLength > COMMUNITY_VIDEO_OUTPUT_MAX_BYTES) {
      throw new Error(
        "No fue posible comprimir el video por debajo de 15 MB. Recórtalo e intenta nuevamente."
      );
    }

    onProgress?.(100);

    return new File([output], `${file.name.replace(/\.[^.]+$/, "") || "video"}.mp4`, {
      type: "video/mp4",
      lastModified: Date.now(),
    });
  } catch (error) {
    if (error?.message?.includes("15 MB")) throw error;
    console.error("No fue posible comprimir el video de Comunidad:", error);
    throw new Error(
      "No se pudo comprimir este video. Intenta recortarlo o exportarlo como MP4.",
      { cause: error }
    );
  } finally {
    ffmpeg.off("progress", progressListener);
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(outputName),
    ]);
  }
}
