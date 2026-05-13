export async function analyzeText(text: string) {
  const res = await fetch("/api/analyze-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to analyze text");
  }

  return res.json();
}

export async function analyzeImage(base64Data: string, mimeType: string, exifInfo: any) {
  const res = await fetch("/api/analyze-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64Data, mimeType, exifInfo })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to analyze image");
  }

  return res.json();
}
