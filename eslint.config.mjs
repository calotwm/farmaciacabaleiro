import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  { ignores: [".next/", "out/", "coverage/", "playwright-report/", "test-results/", "next-env.d.ts", "src/generated/"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
