import { appendFileSync } from "node:fs";
import { appendDispatchToDataset } from "./validation-dataset.mjs";

const eventPath = process.env.EVENT_PATH;
const datasetPath = process.env.DATASET_PATH ?? "dataset/validation.jsonl";
const commitMessagePath = process.env.COMMIT_MESSAGE_PATH;

if (!eventPath) throw new Error("EVENT_PATH 未設定");
if (!commitMessagePath) throw new Error("COMMIT_MESSAGE_PATH 未設定");

const result = appendDispatchToDataset({ eventPath, datasetPath, commitMessagePath });

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `changed=${String(result.changed)}\nsha256=${result.payloadSha256}\n`,
    { encoding: "utf8" },
  );
}

process.stdout.write(
  `${JSON.stringify({ changed: result.changed, sampleCount: result.sampleCount, sha256: result.payloadSha256 })}\n`,
);
