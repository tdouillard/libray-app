import type { RefreshFields } from "../services/bookLookup";

const OPTIONS: Array<{ key: keyof RefreshFields; label: string }> = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "volume", label: "Volume" },
  { key: "publisher", label: "Editor" },
  { key: "cover", label: "Cover" },
  { key: "category", label: "Category" },
];

interface Props {
  value: RefreshFields;
  onChange: (next: RefreshFields) => void;
  disabled?: boolean;
}

/** One checkbox per field a metadata refresh may overwrite. */
export function RefreshFieldsPicker({ value, onChange, disabled }: Props) {
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" disabled={disabled}>
      <legend className="sr-only">Fields to refresh</legend>
      <span className="font-medium text-slate-600" aria-hidden="true">
        Update:
      </span>
      {OPTIONS.map(({ key, label }) => (
        <label key={key} className="flex cursor-pointer items-center gap-1.5 text-slate-700">
          <input
            type="checkbox"
            checked={value[key]}
            onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
