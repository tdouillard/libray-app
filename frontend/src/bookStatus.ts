import type { BookStatus } from "./types";

export const STATUS_ORDER: readonly BookStatus[] = ["owned", "reading", "borrowed", "wishlist"];

export const STATUS_META: Record<BookStatus, { label: string; dot: string; chip: string }> = {
  owned: { label: "Owned", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700" },
  reading: { label: "Reading", dot: "bg-sky-500", chip: "bg-sky-100 text-sky-700" },
  borrowed: { label: "Borrowed", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-700" },
  wishlist: { label: "Wishlist", dot: "bg-violet-500", chip: "bg-violet-100 text-violet-700" },
};
