import { validateDatasetFile } from "./validation-dataset.mjs";

const datasetPath = process.argv[2] ?? "dataset/validation.jsonl";
const result = validateDatasetFile(datasetPath);
process.stdout.write(
  `${datasetPath}: ${result.lines.length} samples, UTF-8/NFC/canonical JSON valid\n`,
);

if (!process.argv[2]) {
  const { validateDatasetFile: validatePronunciations } = await import("./pronunciation-dataset.mjs");
  const pronunciations = validatePronunciations("dataset/pronunciations.jsonl");
  process.stdout.write(`dataset/pronunciations.jsonl: ${pronunciations.lines.length} samples valid\n`);
}
