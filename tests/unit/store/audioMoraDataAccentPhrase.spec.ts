import { beforeEach, expect, test } from "vitest";
import { store } from "@/store";
import type { EditorAudioQuery } from "@/store/type";
import { AudioKey, EngineId, SpeakerId, StyleId } from "@/type/preload";
import { cloneWithUnwrapProxy } from "@/helpers/cloneWithUnwrapProxy";
import { resetMockMode, uuid4 } from "@/helpers/random";

const initialState = cloneWithUnwrapProxy(store.state);
beforeEach(() => {
  store.replaceState(cloneWithUnwrapProxy(initialState));
  resetMockMode();
});

const createMora = (
  text: string,
  consonantLength: number | undefined,
  vowelLength: number,
) => ({
  text,
  consonant: consonantLength != undefined ? "k" : undefined,
  consonantLength,
  vowel: "a",
  vowelLength,
  pitch: 5,
});

/** モーラの長さを持つテスト用のAudioItemを作り、そのAudioKeyを返す */
const setupAudioItem = (moras: ReturnType<typeof createMora>[]): AudioKey => {
  const audioKey = AudioKey(uuid4());
  const query: EditorAudioQuery = {
    accentPhrases: [{ moras, accent: 1, isInterrogative: false }],
    speedScale: 1,
    pitchScale: 0,
    intonationScale: 1,
    volumeScale: 1,
    pauseLengthScale: 1,
    prePhonemeLength: 0.1,
    postPhonemeLength: 0.1,
    outputSamplingRate: 24000,
    outputStereo: false,
  };
  // storeのstateは直接書き換えられないので、AudioItemを追加したstateに置き換える
  const state = cloneWithUnwrapProxy(initialState);
  state.audioItems[audioKey] = {
    text: "テスト",
    voice: {
      engineId: EngineId("00000000-0000-0000-0000-000000000000"),
      speakerId: SpeakerId("00000000-0000-0000-0000-000000000000"),
      styleId: StyleId(0),
    },
    query,
  };
  store.replaceState(state);
  return audioKey;
};

const getLengths = (audioKey: AudioKey) =>
  store.state.audioItems[audioKey].query?.accentPhrases[0].moras.map((mora) => [
    mora.consonantLength,
    mora.vowelLength,
  ]);

test("アクセント句内の長さの一括調整は、操作したモーラの変化率を掛ける", async () => {
  const audioKey = setupAudioItem([
    createMora("カ", 0.04, 0.1),
    createMora("ア", undefined, 0.2),
  ]);

  // 1つ目の母音の長さを0.1→0.05（半分）にする
  await store.actions.COMMAND_SET_AUDIO_ITEM_MORA_DATA_ACCENT_PHRASE({
    audioKey,
    accentPhraseIndex: 0,
    moraIndex: 0,
    data: 0.05,
    type: "vowel",
  });

  const lengths = getLengths(audioKey);
  expect(lengths?.[0][0]).toBeCloseTo(0.02);
  expect(lengths?.[0][1]).toBeCloseTo(0.05);
  expect(lengths?.[1][0]).toBeUndefined();
  // 加算だと0.2-0.05=0.15になるが、割合なので半分の0.1になる
  expect(lengths?.[1][1]).toBeCloseTo(0.1);
});

test("短くしても、元々短い音素が他より先に0にならない", async () => {
  const audioKey = setupAudioItem([
    createMora("カ", 0.02, 0.15),
    createMora("ア", undefined, 0.15),
  ]);

  // 2つ目の母音の長さを0.15→0.1にする（加算だと子音は0.02-0.05で0になる）
  await store.actions.COMMAND_SET_AUDIO_ITEM_MORA_DATA_ACCENT_PHRASE({
    audioKey,
    accentPhraseIndex: 0,
    moraIndex: 1,
    data: 0.1,
    type: "vowel",
  });

  const lengths = getLengths(audioKey);
  expect(lengths?.[0][0]).toBeGreaterThan(0);
  expect(lengths?.[0][0]).toBeCloseTo(0.02 * (0.1 / 0.15));
});

test("長くしても上限（0.3）を超えない", async () => {
  const audioKey = setupAudioItem([
    createMora("カ", 0.05, 0.1),
    createMora("ア", undefined, 0.25),
  ]);

  // 1つ目の母音の長さを0.1→0.2（2倍）にする
  await store.actions.COMMAND_SET_AUDIO_ITEM_MORA_DATA_ACCENT_PHRASE({
    audioKey,
    accentPhraseIndex: 0,
    moraIndex: 0,
    data: 0.2,
    type: "vowel",
  });

  const lengths = getLengths(audioKey);
  expect(lengths?.[0][0]).toBeCloseTo(0.1);
  expect(lengths?.[0][1]).toBeCloseTo(0.2);
  expect(lengths?.[1][1]).toBeCloseTo(0.3);
});

test("操作したモーラの長さが0の場合は加算になる", async () => {
  const audioKey = setupAudioItem([
    createMora("カ", 0.04, 0),
    createMora("ア", undefined, 0.2),
  ]);

  await store.actions.COMMAND_SET_AUDIO_ITEM_MORA_DATA_ACCENT_PHRASE({
    audioKey,
    accentPhraseIndex: 0,
    moraIndex: 0,
    data: 0.05,
    type: "vowel",
  });

  const lengths = getLengths(audioKey);
  expect(lengths?.[0][0]).toBeCloseTo(0.09);
  expect(lengths?.[0][1]).toBeCloseTo(0.05);
  expect(lengths?.[1][1]).toBeCloseTo(0.25);
});

test("音高は従来通り加算で調整される", async () => {
  const audioKey = setupAudioItem([
    createMora("カ", 0.04, 0.1),
    { ...createMora("ア", undefined, 0.2), pitch: 4 },
  ]);

  await store.actions.COMMAND_SET_AUDIO_ITEM_MORA_DATA_ACCENT_PHRASE({
    audioKey,
    accentPhraseIndex: 0,
    moraIndex: 0,
    data: 5.5,
    type: "pitch",
  });

  const pitches = store.state.audioItems[
    audioKey
  ].query?.accentPhrases[0].moras.map((mora) => mora.pitch);
  expect(pitches?.[0]).toBeCloseTo(5.5);
  expect(pitches?.[1]).toBeCloseTo(4.5);
});
