import en from "./en.json";
import zh from "./zh.json";

export type Locale = "en" | "zh";

type NestedValue = string | Record<string, string>;

const messages: Record<Locale, Record<string, Record<string, NestedValue>>> = { en, zh };

let currentLocale: Locale = "zh";

export function setLocale(locale: Locale) {
  currentLocale = locale;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    document.documentElement.classList.toggle("dark", document.documentElement.classList.contains("dark"));
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

type NestedKeyOf<T> = T extends Record<string, infer U>
  ? U extends Record<string, string>
    ? { [K in keyof T & string]: `${K}.${keyof T[K] & string}` }[keyof T & string]
    : never
  : never;

export type I18nKey = NestedKeyOf<typeof en>;

export function t(key: string, params?: Record<string, string | number>): string {
  const parts = key.split(".");
  if (parts.length !== 2) return key;

  const [section, item] = parts;
  let msg = messages[currentLocale]?.[section]?.[item] || messages.en?.[section]?.[item] || key;

  if (typeof msg !== "string") return key;

  if (!params) return msg;

  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    msg,
  );
}
