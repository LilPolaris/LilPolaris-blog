"use client";

import { X } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent } from "react";

export interface ChipSuggestion<T> {
  key: string;
  label: string;
  value: T;
  count?: number;
}

const SEPARATORS = new Set([",", "，", "、", ";", "；"]);
const SEPARATOR_PATTERN = /[,，、;；]/;

/**
 * Token input used for tags and categories. Text is only turned into a chip
 * on Enter, a separator, Tab or blur, so typing never loses characters the
 * way a parse-on-every-keystroke text field does.
 */
export function ChipInput<T>({
  label,
  values,
  onChange,
  suggestions,
  toKey,
  toLabel,
  parse,
  placeholder,
  hint,
  quickPickCount = 8,
}: {
  label: string;
  values: T[];
  onChange: (next: T[]) => void;
  suggestions: ChipSuggestion<T>[];
  toKey: (value: T) => string;
  toLabel: (value: T) => string;
  parse: (text: string) => T | null;
  placeholder?: string;
  hint?: string;
  quickPickCount?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const chosen = useMemo(() => new Set(values.map(toKey)), [toKey, values]);
  const available = useMemo(
    () => suggestions.filter((item) => !chosen.has(item.key)),
    [chosen, suggestions],
  );
  const query = draft.trim().toLowerCase();
  const matches = query
    ? available
        .filter((item) => item.label.toLowerCase().includes(query))
        .slice(0, 8)
    : [];
  const listOpen = open && matches.length > 0;
  const activeIndex = Math.min(highlight, Math.max(0, matches.length - 1));

  function resolve(text: string) {
    const exact = available.find(
      (item) => item.label.toLowerCase() === text.toLowerCase(),
    );
    return exact ? exact.value : parse(text);
  }

  /** Adds every non-empty piece once, keeping the existing order. */
  function addTexts(texts: string[], remainder = "") {
    const next = [...values];
    const keys = new Set(chosen);
    for (const text of texts) {
      const trimmed = text.trim();
      if (!trimmed) continue;
      const value = resolve(trimmed);
      if (value === null) continue;
      const key = toKey(value);
      if (!key || keys.has(key)) continue;
      keys.add(key);
      next.push(value);
    }
    if (next.length !== values.length) onChange(next);
    setDraft(remainder);
    setHighlight(0);
  }

  function add(value: T | null) {
    if (value === null) return;
    const key = toKey(value);
    if (key && !chosen.has(key)) onChange([...values, value]);
    setDraft("");
    setHighlight(0);
  }

  function commitDraft() {
    if (!draft.trim()) return false;
    addTexts(draft.split(SEPARATOR_PATTERN));
    return true;
  }

  function remove(key: string) {
    onChange(values.filter((value) => toKey(value) !== key));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" && matches.length) {
      event.preventDefault();
      setOpen(true);
      setHighlight((activeIndex + 1) % matches.length);
    } else if (event.key === "ArrowUp" && matches.length) {
      event.preventDefault();
      setHighlight((activeIndex - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (listOpen) add(matches[activeIndex].value);
      else commitDraft();
    } else if (event.key === "Tab" && draft.trim()) {
      event.preventDefault();
      if (listOpen) add(matches[activeIndex].value);
      else commitDraft();
    } else if (SEPARATORS.has(event.key)) {
      event.preventDefault();
      commitDraft();
    } else if (event.key === "Backspace" && !draft && values.length) {
      event.preventDefault();
      remove(toKey(values[values.length - 1]));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const quickPicks = available.slice(0, quickPickCount);

  return (
    <div className="field chip-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="chip-box">
        {values.map((value) => {
          const key = toKey(value);
          return (
            <span className="chip" key={key}>
              {toLabel(value)}
              <button
                aria-label={`移除 ${toLabel(value)}`}
                onClick={() => remove(key)}
                type="button"
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
        <input
          aria-activedescendant={
            listOpen ? `${id}-option-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={`${id}-list`}
          aria-expanded={listOpen}
          className="chip-input"
          id={id}
          onBlur={() => {
            commitDraft();
            setOpen(false);
          }}
          onChange={(event) => {
            const text = event.target.value;
            const parts = text.split(SEPARATOR_PATTERN);
            if (parts.length > 1) {
              addTexts(parts.slice(0, -1), parts.at(-1)?.trimStart() || "");
              return;
            }
            setDraft(text);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={values.length ? "" : placeholder}
          role="combobox"
          value={draft}
        />
        {listOpen ? (
          <ul className="chip-options" id={`${id}-list`} role="listbox">
            {matches.map((item, index) => (
              <li
                aria-selected={index === activeIndex}
                className={index === activeIndex ? "active" : undefined}
                id={`${id}-option-${index}`}
                key={item.key}
                onMouseDown={(event) => {
                  event.preventDefault();
                  add(item.value);
                }}
                onMouseEnter={() => setHighlight(index)}
                role="option"
              >
                <span>{item.label}</span>
                {item.count ? <small>{item.count} 篇</small> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {hint ? <p className="field-help">{hint}</p> : null}
      {quickPicks.length ? (
        <div className="suggestion-row" aria-label={`常用${label}`}>
          {quickPicks.map((item) => (
            <button
              key={item.key}
              onClick={() => add(item.value)}
              title={item.count ? `已有 ${item.count} 篇` : undefined}
              type="button"
            >
              + {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
