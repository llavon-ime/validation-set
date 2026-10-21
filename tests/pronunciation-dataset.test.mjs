import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendDispatchToDataset, canonicalizeSample, serializeSample, sha256Utf8, parseDispatchEventBytes, validateDatasetBytes } from "../scripts/pronunciation-dataset.mjs";
import { canonicalizeSample as validateOldSample } from "../scripts/validation-dataset.mjs";
const sample = { schemaVersion: 1, license: "CC-BY-4.0", kind: "pronunciation", answer: "部署",
  readings: [[{ syllable: "ㄅㄨ", tone: 4 }], [{ syllable: "ㄕㄨ", tone: 3 }, { syllable: "ㄕㄨ", tone: 4 }]], description: "" };
function event(value = sample) { return { action: "append-pronunciation-sample", client_payload: {
  submissionId: "0262684d-61eb-4c2b-906f-62d168bcd021", sample: value, payloadSha256: sha256Utf8(serializeSample(value)), attribution: null } }; }
test("blank explanation, astral characters, custom readings and stable canonical order", () => {
  assert.equal(canonicalizeSample(sample).description, "");
  assert.equal(canonicalizeSample({ ...sample, answer: "𠮷署" }).answer, "𠮷署");
  assert.equal(serializeSample({ ...sample, readings: [sample.readings[0], [...sample.readings[1]].reverse()] }), serializeSample(sample));
  assert.doesNotThrow(() => canonicalizeSample({ ...sample, answer: "鉈", readings: [[{ syllable: "ㄊㄚ", tone: 1 }, { syllable: "ㄊㄨㄛ", tone: 2 }]] }));
});
test("rejects invalid alignment, duplicate readings and samples without alternatives", () => {
  assert.throws(() => canonicalizeSample({ ...sample, readings: [sample.readings[0]] }));
  assert.throws(() => canonicalizeSample({ ...sample, readings: [sample.readings[0], [sample.readings[1][0]]] }));
  assert.throws(() => canonicalizeSample({ ...sample, readings: [sample.readings[0], [sample.readings[1][0], sample.readings[1][0]]] }));
  assert.throws(() => canonicalizeSample({ ...sample, description: "\ud800" }));
  assert.throws(() => validateOldSample(sample));
});
test("hash mismatch, wrong event, invalid UTF-8 and noncanonical files fail", () => {
  const wrongHash = event(); wrongHash.client_payload.sample.description = "tampered";
  assert.throws(() => parseDispatchEventBytes(Buffer.from(JSON.stringify(wrongHash))));
  assert.throws(() => parseDispatchEventBytes(Buffer.from(JSON.stringify({ ...event(), action: "append-validation-sample" }))));
  assert.throws(() => validateDatasetBytes(Buffer.from([0xff])));
  assert.throws(() => validateDatasetBytes(Buffer.from(serializeSample(sample) + "\r\n")));
});
test("dispatch appends one UTF-8 record with explanation and retries do not duplicate it", t => {
  const dir = mkdtempSync(join(tmpdir(), "llavon-pronunciation-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const datasetPath = join(dir, "pronunciations.jsonl"), eventPath = join(dir, "event.json"), commitMessagePath = join(dir, "commit.txt");
  const value = { ...sample, description: '口語四聲\n引號 " 𠮷\u2028' };
  writeFileSync(eventPath, JSON.stringify(event(value)));
  const first = appendDispatchToDataset({ datasetPath, eventPath, commitMessagePath });
  const second = appendDispatchToDataset({ datasetPath, eventPath, commitMessagePath });
  assert.equal(first.changed, true); assert.equal(second.changed, false);
  const rows = validateDatasetBytes(readFileSync(datasetPath));
  assert.equal(rows.samples.length, 1); assert.equal(rows.samples[0].description, value.description);
  assert.match(readFileSync(commitMessagePath, "utf8"), /append pronunciation sample/);
});
