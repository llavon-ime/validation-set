import { createHash, timingSafeEqual } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

const encoder = new TextEncoder();
const fatalDecoder = new TextDecoder("utf-8", { fatal: true });
const SAMPLE_KEYS = [
  "schemaVersion",
  "license",
  "context",
  "answer",
  "padding",
  "difficulty",
];
const PADDING_KEYS = ["syllable", "tone"];
const PAYLOAD_KEYS = ["submissionId", "sample", "payloadSha256", "attribution"];
const ATTRIBUTION_KEYS = ["githubId", "githubLogin"];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9-]{1,39}$/u;
const BOPOMOFO_PATTERN =
  /^[ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ]?[ㄧㄨㄩ]?[ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ]?$/u;

function fail(message) {
  throw new Error(message);
}

function assertRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} 必須是 JSON object`);
  }
}

function assertExactKeys(value, expected, label) {
  assertRecord(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} 欄位不正確`);
  }
}

function assertUnicodeScalarNfc(value, label, minimum, maximum) {
  if (typeof value !== "string") fail(`${label} 必須是字串`);

  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        fail(`${label} 包含未成對的 high surrogate`);
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail(`${label} 包含未成對的 low surrogate`);
    }
  }

  const bytes = encoder.encode(value);
  if (fatalDecoder.decode(bytes) !== value) fail(`${label} 無法完整 UTF-8 round-trip`);
  if (value.normalize("NFC") !== value) fail(`${label} 必須使用 Unicode NFC`);

  const length = Array.from(value).length;
  if (length < minimum || length > maximum) {
    fail(`${label} 長度必須介於 ${minimum} 與 ${maximum} 個 Unicode code point`);
  }
}

function assertPaddingUnit(value, index) {
  const label = `sample.padding[${index}]`;
  assertExactKeys(value, PADDING_KEYS, label);
  assertUnicodeScalarNfc(value.syllable, `${label}.syllable`, 1, 3);
  if (!BOPOMOFO_PATTERN.test(value.syllable)) fail(`${label}.syllable 注音格式不正確`);
  if (!Number.isInteger(value.tone) || value.tone < 1 || value.tone > 5) {
    fail(`${label}.tone 必須是 1–5 的整數`);
  }
  return { syllable: value.syllable, tone: value.tone };
}

export function canonicalizeSample(value) {
  assertExactKeys(value, SAMPLE_KEYS, "sample");
  if (value.schemaVersion !== 1) fail("sample.schemaVersion 必須是 1");
  if (value.license !== "CC-BY-4.0") fail("sample.license 必須是 CC-BY-4.0");
  assertUnicodeScalarNfc(value.context, "sample.context", 0, 500);
  assertUnicodeScalarNfc(value.answer, "sample.answer", 1, 32);
  if (!Array.isArray(value.padding) || value.padding.length < 1 || value.padding.length > 32) {
    fail("sample.padding 必須包含 1–32 筆注音");
  }
  if (Array.from(value.answer).length !== value.padding.length) {
    fail("sample.answer 與 sample.padding 必須逐字對齊");
  }
  if (!Number.isInteger(value.difficulty) || value.difficulty < 1 || value.difficulty > 5) {
    fail("sample.difficulty 必須是 1–5 的整數");
  }

  return {
    schemaVersion: 1,
    license: "CC-BY-4.0",
    context: value.context,
    answer: value.answer,
    padding: value.padding.map(assertPaddingUnit),
    difficulty: value.difficulty,
  };
}

export function serializeSample(value) {
  return JSON.stringify(canonicalizeSample(value))
    .replace(/\u2028/gu, "\\u2028")
    .replace(/\u2029/gu, "\\u2029");
}

export function sha256Utf8(value) {
  assertUnicodeScalarNfc(value, "canonical JSON", 1, Number.MAX_SAFE_INTEGER);
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
}

function decodeUtf8WithoutBom(bytes, label) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail(`${label} 不得包含 UTF-8 BOM`);
  }
  try {
    return fatalDecoder.decode(bytes);
  } catch {
    fail(`${label} 包含無效 UTF-8 bytes`);
  }
}

export function validateDatasetBytes(bytes) {
  const text = decodeUtf8WithoutBom(bytes, "dataset/validation.jsonl");
  if (text === "") return { text, lines: [], samples: [] };
  if (text.includes("\r")) fail("dataset/validation.jsonl 必須使用 LF，不得包含 CR");
  if (!text.endsWith("\n")) fail("dataset/validation.jsonl 最後一行必須以 LF 結束");

  const lines = text.slice(0, -1).split("\n");
  const samples = lines.map((line, index) => {
    if (line.length === 0) fail(`dataset/validation.jsonl 第 ${index + 1} 行不得為空白行`);
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      fail(`dataset/validation.jsonl 第 ${index + 1} 行不是有效 JSON`);
    }
    const canonical = serializeSample(parsed);
    if (line !== canonical) fail(`dataset/validation.jsonl 第 ${index + 1} 行不是 canonical JSON`);
    return parsed;
  });
  return { text, lines, samples };
}

export function validateDatasetFile(datasetPath) {
  const bytes = existsSync(datasetPath) ? readFileSync(datasetPath) : Buffer.alloc(0);
  return validateDatasetBytes(bytes);
}

function validateAttribution(value) {
  if (value === null) return null;
  assertExactKeys(value, ATTRIBUTION_KEYS, "client_payload.attribution");
  if (!Number.isSafeInteger(value.githubId) || value.githubId <= 0) {
    fail("client_payload.attribution.githubId 不正確");
  }
  if (
    typeof value.githubLogin !== "string" ||
    !GITHUB_LOGIN_PATTERN.test(value.githubLogin) ||
    value.githubLogin.startsWith("-") ||
    value.githubLogin.endsWith("-")
  ) {
    fail("client_payload.attribution.githubLogin 不正確");
  }
  return { githubId: value.githubId, githubLogin: value.githubLogin };
}

function hashesEqual(left, right) {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function parseDispatchEventBytes(bytes) {
  const text = decodeUtf8WithoutBom(bytes, "GitHub event payload");
  let event;
  try {
    event = JSON.parse(text);
  } catch {
    fail("GitHub event payload 不是有效 JSON");
  }
  assertRecord(event, "GitHub event payload");
  const payload = event.client_payload;
  assertExactKeys(payload, PAYLOAD_KEYS, "client_payload");
  if (typeof payload.submissionId !== "string" || !UUID_PATTERN.test(payload.submissionId)) {
    fail("client_payload.submissionId 不是有效 UUID");
  }
  if (typeof payload.payloadSha256 !== "string" || !SHA256_PATTERN.test(payload.payloadSha256)) {
    fail("client_payload.payloadSha256 不是小寫 SHA-256 hex");
  }

  const sample = canonicalizeSample(payload.sample);
  const line = serializeSample(sample);
  const calculatedSha256 = sha256Utf8(line);
  if (!hashesEqual(payload.payloadSha256, calculatedSha256)) {
    fail("client_payload.payloadSha256 與 canonical UTF-8 sample 不符");
  }

  return {
    submissionId: payload.submissionId,
    sample,
    line,
    payloadSha256: calculatedSha256,
    attribution: validateAttribution(payload.attribution),
  };
}

function createCommitMessage(payload) {
  const subject = `dataset: append validation sample ${payload.submissionId}`;
  if (!payload.attribution) return subject;
  const { githubId, githubLogin } = payload.attribution;
  return (
    `${subject}\n\n` +
    `Co-authored-by: ${githubLogin} ` +
    `<${githubId}+${githubLogin}@users.noreply.github.com>`
  );
}

export function appendDispatchToDataset({ eventPath, datasetPath, commitMessagePath }) {
  const payload = parseDispatchEventBytes(readFileSync(eventPath));
  const before = validateDatasetFile(datasetPath);
  const changed = !before.lines.includes(payload.line);

  if (changed) {
    appendFileSync(datasetPath, `${payload.line}\n`, { encoding: "utf8" });
    const after = validateDatasetFile(datasetPath);
    if (after.lines.at(-1) !== payload.line) fail("寫入後的最後一行與 canonical sample 不符");
  }

  writeFileSync(commitMessagePath, createCommitMessage(payload), { encoding: "utf8" });
  return {
    changed,
    payloadSha256: payload.payloadSha256,
    sampleCount: before.lines.length + (changed ? 1 : 0),
  };
}
