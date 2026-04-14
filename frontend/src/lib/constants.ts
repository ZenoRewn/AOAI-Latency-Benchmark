export const CHART_COLORS = [
  "#8661C5", "#0078D4", "#C5B4E3", "#8DC8E8", "#E8C170",
  "#5BBF8A", "#D09EBF", "#6BADD6", "#D9A870", "#A88BD6",
];

export const API_TYPE_OPTIONS = [
  { value: "chat", label: "Chat Completions" },
  { value: "responses", label: "Responses API" },
  { value: "embeddings", label: "Embeddings" },
  { value: "tts", label: "TTS (Audio)" },
  { value: "whisper", label: "Whisper (STT)" },
  { value: "image", label: "Image (DALL-E)" },
  { value: "realtime", label: "Realtime" },
];

export const REASONING_EFFORT_OPTIONS = [
  { value: "", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export const REASONING_SUMMARY_OPTIONS = [
  { value: "", label: "Off" },
  { value: "auto", label: "Auto" },
  { value: "concise", label: "Concise" },
  { value: "detailed", label: "Detailed" },
];
