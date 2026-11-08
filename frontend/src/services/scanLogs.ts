import { supabase } from "./supabase";
import type { ProviderTrace } from "./bookLookup";

/* "not-found": every catalogue answered but none knows the ISBN. "error": a catalogue failed (network, timeout,
   HTTP error), so the answer is unreliable. "invalid": the typed ISBN failed the checksum. */
export type ScanFailureReason = "not-found" | "error" | "invalid";

export interface ScanLog {
  id: string;
  user_id: string;
  user_email: string;
  isbn: string;
  kind: string;
  reason: ScanFailureReason;
  trace: ProviderTrace[];
  user_agent: string;
  created_at: string;
}

/* "error" as soon as one source failed, otherwise the ISBN is simply unknown. */
export function failureReason(trace: ProviderTrace[] | undefined): ScanFailureReason {
  return !trace || trace.some((entry) => entry.status === "error") ? "error" : "not-found";
}

/* Records a failed identification. Fire and forget: logging must never disturb scanning. */
export function logScanFailure(entry: { isbn: string; kind: string; reason: ScanFailureReason; trace?: ProviderTrace[] }): void {
  const user = supabase.user;
  if (!user) return;
  supabase
    .rest("/scan_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: {
        user_email: user.email ?? "",
        isbn: entry.isbn.slice(0, 40),
        kind: entry.kind,
        reason: entry.reason,
        trace: entry.trace ?? [],
        user_agent: navigator.userAgent.slice(0, 300),
      },
    })
    .catch((error) => console.info("scan log not saved", error));
}

/* True when the signed-in user is listed in public.admins. Any failure (e.g. table not installed) means "no". */
export async function fetchIsAdmin(): Promise<boolean> {
  try {
    const rows = await supabase.rest<unknown[]>("/admins?select=user_id");
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export async function fetchScanLogs(reason: ScanFailureReason | "all", limit = 300): Promise<ScanLog[]> {
  const filter = reason === "all" ? "" : `&reason=eq.${reason}`;
  return (await supabase.rest<ScanLog[]>(`/scan_logs?select=*&order=created_at.desc&limit=${limit}${filter}`)) ?? [];
}

export async function deleteScanLogs(ids: string[] | "all"): Promise<void> {
  const filter = ids === "all" ? "id=not.is.null" : `id=in.(${ids.join(",")})`;
  await supabase.rest(`/scan_logs?${filter}`, { method: "DELETE" });
}
