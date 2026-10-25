"use client";

import type { ComponentProps, KeyboardEvent } from "react";
import { FormField } from "@/components/form-field";
import { normalizeBarcode } from "@/shared/domain/barcode";

interface BarcodeInputProps extends Omit<ComponentProps<typeof FormField>, "onKeyDown" | "type"> {
  /**
   * Called with the normalized code when Enter is pressed (USB keyboard-wedge scanners type the
   * code fast and end with Enter). When given, Enter does not submit the surrounding form;
   * without it, Enter keeps its default behavior (submitting the form) with the cleaned code.
   */
  onScan?: (code: string) => void;
}

/** Text input for barcodes: scanner-friendly (Enter-terminated) and equally usable by typing. */
export function BarcodeInput({ onScan, ...fieldProps }: BarcodeInputProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    const input = event.currentTarget;
    const code = normalizeBarcode(input.value);
    input.value = code;
    if (!onScan) return;
    event.preventDefault();
    if (code) onScan(code);
  }

  return <FormField autoComplete="off" inputMode="text" enterKeyHint="search" {...fieldProps} onKeyDown={handleKeyDown} />;
}
