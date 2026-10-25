"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { normalizeBarcode } from "@/shared/domain/barcode";
import { type ProductHit, searchProductsAction } from "./product-search-actions";

interface ProductPickerProps {
  label: string;
  onSelect: (product: ProductHit) => void;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Ids of the DOM input, so a parent can focus it. */
  inputId?: string;
}

const DEBOUNCE_MS = 250;

/**
 * Product search by name, code or barcode. Typing shows matches; a barcode scan (the reader types the
 * code and presses Enter) selects the product directly when it is the only match. Not part of a form
 * submission: the parent decides what to do with the chosen product.
 */
export function ProductPicker({ label, onSelect, hint, placeholder, disabled, autoFocus, inputId }: ProductPickerProps) {
  const fallbackId = useId();
  const name = inputId ?? `product-picker-${fallbackId.replace(/:/g, "")}`;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductHit[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function run(text: string): Promise<ProductHit[]> {
    const current = ++requestId.current;
    setSearching(true);
    try {
      const hits = await searchProductsAction(text);
      if (current !== requestId.current) return [];
      setResults(hits);
      setMessage(hits.length === 0 ? "No se encontraron productos." : null);
      return hits;
    } catch {
      if (current === requestId.current) setMessage("No se pudo buscar. Intentá de nuevo.");
      return [];
    } finally {
      if (current === requestId.current) setSearching(false);
    }
  }

  function choose(product: ProductHit) {
    requestId.current++;
    setQuery("");
    setResults([]);
    setMessage(null);
    setSearching(false);
    onSelect(product);
  }

  function onChange(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    if (value.trim().length < 2) {
      requestId.current++;
      setResults([]);
      setMessage(null);
      return;
    }
    timer.current = setTimeout(() => void run(value), DEBOUNCE_MS);
  }

  async function onEnter() {
    clearTimeout(timer.current);
    const text = normalizeBarcode(query);
    if (text.length < 2) return;
    const hits = await run(text);
    const chosen = hits.find((hit) => hit.barcode === text || hit.code === text) ?? (hits.length === 1 ? hits[0] : undefined);
    if (chosen) choose(chosen);
  }

  return (
    <div className="grid gap-2">
      <FormField
        name={name}
        label={label}
        value={query}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          void onEnter();
        }}
        placeholder={placeholder ?? "Nombre, código o código de barras"}
        hint={hint}
        autoComplete="off"
        enterKeyHint="search"
        disabled={disabled}
        autoFocus={autoFocus}
      />
      <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
        {searching ? "Buscando..." : (message ?? (results.length > 0 ? `${results.length} resultado${results.length === 1 ? "" : "s"}.` : ""))}
      </p>
      {results.length > 0 ? (
        <ul className="grid gap-1" aria-label="Resultados de la búsqueda">
          {results.map((product) => (
            <li key={product.id}>
              <Button type="button" variant="outline" size="sm" className="h-auto w-full justify-start py-2 text-left" onClick={() => choose(product)}>
                <span className="font-medium">{product.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {product.code}
                  {product.barcode ? ` · ${product.barcode}` : ""}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
