"use client";

import { useId } from "react";
import type { LangOption } from "@/lib/langs";

export default function LangSelect({
  options,
  value,
  onChange,
  label = "Language:",
}: {
  options: LangOption[];
  value: string;
  onChange: (code: string) => void;
  label?: string;
}) {
  const id = useId();
  return (
    <span className="lang-pick">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select inline" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
    </span>
  );
}
