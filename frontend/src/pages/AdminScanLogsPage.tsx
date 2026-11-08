import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getLocale } from "../i18n";
import { useI18n } from "../i18n/I18nContext";
import { deleteScanLogs, fetchScanLogs, type ScanFailureReason, type ScanLog } from "../services/scanLogs";

const REASONS: ScanFailureReason[] = ["not-found", "error", "invalid"];
const reasonTone: Record<ScanFailureReason, string> = {
  "not-found": "bg-amber-100 text-amber-900",
  error: "bg-red-100 text-red-800",
  invalid: "bg-slate-200 text-slate-800",
};

/* Administrators only (the database refuses everyone else, this check just hides the page). */
export function AdminScanLogsPage() {
  const { isAdmin } = useAuth();
  const { t } = useI18n();
  const [reason, setReason] = useState<ScanFailureReason | "all">("all");
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setLogs(await fetchScanLogs(reason));
    } catch (e) {
      setError(t("admin.loadError", { message: e instanceof Error ? e.message : t("error.generic") }));
    } finally {
      setLoading(false);
    }
  }, [reason, t]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const remove = async (ids: string[] | "all") => {
    try {
      await deleteScanLogs(ids);
      await load();
    } catch (e) {
      setError(t("admin.loadError", { message: e instanceof Error ? e.message : t("error.generic") }));
    }
  };

  if (!isAdmin) {
    return <p role="alert" className="rounded-2xl bg-white p-6 text-sm text-slate-600">{t("admin.denied")}</p>;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("admin.title")}</h2>
        <p className="text-sm text-slate-500">{t("admin.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          {t("admin.filter")}
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as ScanFailureReason | "all")}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1"
          >
            <option value="all">{t("admin.all")}</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`admin.reason.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-50">
          {t("admin.refresh")}
        </button>
        <button
          type="button"
          disabled={logs.length === 0}
          onClick={() => window.confirm(t("admin.confirmClear")) && void remove("all")}
          className="rounded-lg border border-red-200 bg-white px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          {t("admin.clearAll")}
        </button>
        <span className="text-sm text-slate-500">{t("admin.count", { count: logs.length })}</span>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">{t("admin.loading")}</p>}
      {!loading && !error && logs.length === 0 && <p className="text-sm text-slate-500">{t("admin.empty")}</p>}

      {logs.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("admin.colDate")}</th>
                <th className="px-3 py-2">{t("admin.colUser")}</th>
                <th className="px-3 py-2">{t("admin.colIsbn")}</th>
                <th className="px-3 py-2">{t("admin.colReason")}</th>
                <th className="px-3 py-2">{t("admin.colSources")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 align-top last:border-0" title={log.user_agent}>
                  <td className="whitespace-nowrap px-3 py-2">{new Date(log.created_at).toLocaleString(getLocale())}</td>
                  <td className="px-3 py-2">{log.user_email || log.user_id.slice(0, 8)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">
                    {log.isbn} <span className="text-xs text-slate-400">{log.kind}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${reasonTone[log.reason]}`}>{t(`admin.reason.${log.reason}`)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <ul className="space-y-0.5">
                      {(log.trace ?? []).map((entry) => (
                        <li key={entry.name}>
                          {entry.name}:{" "}
                          <span className={entry.status === "error" ? "font-bold text-red-600" : ""}>{t(`scan.diag.${entry.status}`)}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => void remove([log.id])} className="text-red-600 hover:underline">
                      {t("admin.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
