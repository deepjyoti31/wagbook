"use client";

import { useState, type ComponentProps } from "react";
import { inputStyles } from "./ui";

/** A password box with Show beside it, so a password typed on a phone can be read back before it is sent. */
export function PasswordInput({ words, ...props }: Omit<ComponentProps<"input">, "type"> & { words: { show: string; hide: string } }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={shown ? "text" : "password"} className={`${inputStyles} pr-[76px]!`} />
      <button
        type="button"
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
        className="absolute right-0.5 top-0.5 h-11 rounded-lg px-3.5 text-[15px] font-[650] text-ink"
      >
        {shown ? words.hide : words.show}
      </button>
    </span>
  );
}
