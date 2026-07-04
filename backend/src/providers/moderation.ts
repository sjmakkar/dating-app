/**
 * Image & text moderation adapter (Rekognition / Hive for images).
 *
 * Phase 1 stub auto-approves so the upload flow is testable. Only APPROVED
 * photos are ever returned in discovery/profiles, so wiring a real provider
 * later is a drop-in change. Moderate only NEW uploads and cache results.
 */
export type ModerationResult = 'approved' | 'rejected';

export async function moderateImage(_url: string): Promise<ModerationResult> {
  // TODO: call Rekognition DetectModerationLabels / Hive; reject on unsafe labels.
  return 'approved';
}

/** Lightweight text moderation for bios. Returns cleaned text. */
export async function moderateText(text: string): Promise<string> {
  // TODO: run through a real text-moderation provider.
  return text.trim();
}
