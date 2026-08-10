import { validateDatasetFile } from "./validation-dataset.mjs";

const datasetPath = process.argv[2] ?? "dataset/validation.jsonl";
const result = validateDatasetFile(datasetPath);
process.stdout.write(
  `${datasetPath}: ${result.lines.length} samples, UTF-8/NFC/canonical JSON valid\n`,
);
