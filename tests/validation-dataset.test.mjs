import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  appendDispatchToDataset,
  parseDispatchEventBytes,
  serializeSample,
  sha256Utf8,
  validateDatasetBytes,
} from "../scripts/validation-dataset.mjs";

const sample = {
  schemaVersion: 1,
  license: "CC-BY-4.0",
  context: "「臺灣」𠀀、emoji 😀、é、反斜線 \\、換行\n與分隔\u2028\u2029",
  answer: "𠀀咖啡",
  padding: [
    { syllable: "ㄧ", tone: 1 },
    { syllable: "ㄎㄚ", tone: 1 },
    { syllable: "ㄈㄟ", tone: 1 },
  ],
  difficulty: 4,
};

function dispatchEvent(overrides = {}) {
  const selectedSample = structuredClone(overrides.sample ?? sample);
  const line = serializeSample(selectedSample);
  return {
    action: "append-validation-sample",
    client_payload: {
      submissionId: "0262684d-61eb-4c2b-906f-62d168bcd021",
      sample: selectedSample,
      payloadSha256: sha256Utf8(line),
      attribution: null,
      ...overrides,
    },
  };
}

function writeEvent(directory, event) {
  const path = join(directory, "event.json");
  writeFileSync(path, JSON.stringify(event), { encoding: "utf8" });
  return path;
}

function createDatasetPath(directory) {
  const datasetDirectory = join(directory, "dataset");
  mkdirSync(datasetDirectory);
  return join(datasetDirectory, "validation.jsonl");
}

test("preserves Chinese, Bopomofo, astral characters and emoji as UTF-8", () => {
  const directory = mkdtempSync(join(tmpdir(), "llavon-validation-"));
  const datasetPath = createDatasetPath(directory);
  const messagePath = join(directory, "commit-message.txt");
  const eventPath = writeEvent(directory, dispatchEvent({
    attribution: { githubId: 12345678, githubLogin: "example-user" },
  }));

  const result = appendDispatchToDataset({ eventPath, datasetPath, commitMessagePath: messagePath });
  assert.equal(result.changed, true);

  const bytes = readFileSync(datasetPath);
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = bytes.toString("utf8");
  assert.equal(text.split("\n").length, 2);
  assert.match(text, /臺灣/u);
  assert.match(text, /𠀀/u);
  assert.match(text, /😀/u);
  assert.match(text, /ㄎㄚ/u);
  assert.match(text, /\\u2028/u);
  assert.match(text, /\\u2029/u);
  assert.deepEqual(JSON.parse(text.trimEnd()), sample);
  assert.match(readFileSync(messagePath, "utf8"), /Co-authored-by: example-user/u);
});

test("accepts and preserves an empty context", () => {
  const emptyContextSample = { ...sample, context: "" };
  const directory = mkdtempSync(join(tmpdir(), "llavon-validation-"));
  const datasetPath = createDatasetPath(directory);
  const messagePath = join(directory, "commit-message.txt");
  const eventPath = writeEvent(directory, dispatchEvent({ sample: emptyContextSample }));

  const result = appendDispatchToDataset({ eventPath, datasetPath, commitMessagePath: messagePath });

  assert.equal(result.changed, true);
  assert.equal(JSON.parse(readFileSync(datasetPath, "utf8").trimEnd()).context, "");
});

test("is idempotent for an identical canonical sample", () => {
  const directory = mkdtempSync(join(tmpdir(), "llavon-validation-"));
  const datasetPath = createDatasetPath(directory);
  const messagePath = join(directory, "commit-message.txt");
  const eventPath = writeEvent(directory, dispatchEvent());

  const first = appendDispatchToDataset({ eventPath, datasetPath, commitMessagePath: messagePath });
  const second = appendDispatchToDataset({ eventPath, datasetPath, commitMessagePath: messagePath });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(validateDatasetBytes(readFileSync(datasetPath)).lines.length, 1);
});

test("rejects a payload when canonical UTF-8 SHA-256 does not match", () => {
  const event = dispatchEvent();
  event.client_payload.payloadSha256 = "0".repeat(64);
  assert.throws(
    () => parseDispatchEventBytes(Buffer.from(JSON.stringify(event), "utf8")),
    /payloadSha256/u,
  );
});

test("rejects non-NFC text instead of silently rewriting it", () => {
  const event = dispatchEvent();
  event.client_payload.sample.context = "Cafe\u0301";
  event.client_payload.payloadSha256 = "0".repeat(64);
  assert.throws(
    () => parseDispatchEventBytes(Buffer.from(JSON.stringify(event), "utf8")),
    /Unicode NFC/u,
  );
});

test("rejects an unpaired surrogate encoded in otherwise valid JSON", () => {
  const event = dispatchEvent();
  event.client_payload.sample.context = "\ud800";
  event.client_payload.payloadSha256 = "0".repeat(64);
  assert.throws(
    () => parseDispatchEventBytes(Buffer.from(JSON.stringify(event), "utf8")),
    /surrogate/u,
  );
});

test("rejects BOM and invalid UTF-8 bytes", () => {
  assert.throws(
    () => parseDispatchEventBytes(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])),
    /BOM/u,
  );
  assert.throws(() => parseDispatchEventBytes(Buffer.from([0xff])), /無效 UTF-8/u);
  assert.throws(
    () => validateDatasetBytes(Buffer.from([0xef, 0xbb, 0xbf])),
    /BOM/u,
  );
  assert.throws(() => validateDatasetBytes(Buffer.from([0xff])), /無效 UTF-8/u);
});

test("rejects CRLF, blank lines and non-canonical JSONL", () => {
  const line = serializeSample(sample);
  assert.throws(() => validateDatasetBytes(Buffer.from(`${line}\r\n`, "utf8")), /不得包含 CR/u);
  assert.throws(() => validateDatasetBytes(Buffer.from(`${line}\n\n`, "utf8")), /空白行/u);
  const nonCanonical = JSON.stringify(sample).replace("{", "{ ");
  assert.throws(
    () => validateDatasetBytes(Buffer.from(`${nonCanonical}\n`, "utf8")),
    /不是 canonical JSON/u,
  );
});
