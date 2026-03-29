import { NextRequest, NextResponse } from "next/server";
import { getSTTClient, getSTTModel } from "@/lib/audio/client";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    const language = formData.get("language");

    if (!audio || !(audio instanceof File)) {
      return NextResponse.json({ error: "audio file is required" }, { status: 400 });
    }
    if (!language || typeof language !== "string") {
      return NextResponse.json({ error: "language is required" }, { status: 400 });
    }

    const mimeType = audio.type || "application/octet-stream";
    const hasName = typeof audio.name === "string" && audio.name.length > 0;
    const extension =
      mimeType.includes("mp4") ? "mp4" : mimeType.includes("mpeg") ? "mp3" : "webm";
    const filename = hasName ? audio.name : `recording.${extension}`;
    const file = new File([audio], filename, { type: mimeType });

    const client = getSTTClient();
    const model = getSTTModel();

    const transcription = await client.audio.transcriptions.create({
      model,
      file,
      language,
    });

    return NextResponse.json({ text: transcription.text });
  } catch (error) {
    console.error("[STT] Transcription failed:", error);
    const message = error instanceof Error ? error.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
