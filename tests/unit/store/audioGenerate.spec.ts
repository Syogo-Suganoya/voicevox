import { describe, test, expect } from "vitest";
import {
  calculateAudioLength,
  generateLabFromAudioQuery,
} from "@/store/audioGenerate";
import type { EditorAudioQuery } from "@/store/type";

const baseEditorAudioQuery: EditorAudioQuery = {
  accentPhrases: [],
  speedScale: 1,
  pitchScale: 0,
  intonationScale: 1,
  volumeScale: 1,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
  pauseLengthScale: 1,
  outputSamplingRate: 24000,
  outputStereo: false,
  kana: "",
};

describe("audioGenerate", () => {
  describe("calculateAudioLength", () => {
    test("アクセント句がない場合は0を返すこと", () => {
      const audioQuery: EditorAudioQuery = {
        ...baseEditorAudioQuery,
        accentPhrases: [],
      };

      expect(calculateAudioLength(audioQuery)).toBe(0);
    });

    test("アクセント句がある場合の計算が正しいこと", () => {
      const audioQuery: EditorAudioQuery = {
        ...baseEditorAudioQuery,
        accentPhrases: [
          {
            moras: [
              {
                text: "あ",
                vowel: "a",
                vowelLength: 0.2,
                pitch: 0,
                consonant: "a",
                consonantLength: 0.1,
              }, // 0.3
              {
                text: "い",
                vowel: "i",
                vowelLength: 0.2,
                pitch: 0,
                consonant: undefined,
                consonantLength: undefined,
              }, // 0.2
            ],
            accent: 1,
            pauseMora: undefined,
          },
        ],
      };

      // 0.1(pre) + 0.3 + 0.2 + 0.1(post) = 0.7
      expect(calculateAudioLength(audioQuery)).toBeCloseTo(0.7);
    });

    test("speedScaleが反映されること", () => {
      const audioQuery: EditorAudioQuery = {
        ...baseEditorAudioQuery,
        accentPhrases: [
          {
            moras: [
              {
                text: "あ",
                vowel: "a",
                vowelLength: 0.2,
                pitch: 0,
                consonant: "a",
                consonantLength: 0.1,
              },
            ],
            accent: 1,
            pauseMora: undefined,
          },
        ],
        speedScale: 2, // 2倍速
      };

      // (0.1(pre) + 0.3 + 0.1(post)) / 2 = 0.25
      expect(calculateAudioLength(audioQuery)).toBeCloseTo(0.25);
    });

    test("ポーズがある場合の計算が正しいこと", () => {
      const audioQuery: EditorAudioQuery = {
        ...baseEditorAudioQuery,
        accentPhrases: [
          {
            moras: [
              {
                text: "あ",
                vowel: "a",
                vowelLength: 0.2,
                pitch: 0,
                consonant: "a",
                consonantLength: 0.1,
              },
            ],
            accent: 1,
            pauseMora: {
              text: "、",
              vowel: "pau",
              vowelLength: 0.5,
              pitch: 0,
            }, // 0.5 * 1.5 = 0.75
          },
        ],
        pauseLengthScale: 1.5,
      };

      // 0.1 + 0.3 + 0.75 + 0.1 = 1.25
      expect(calculateAudioLength(audioQuery)).toBeCloseTo(1.25);
    });
    test("prePhonemeLengthが反映されること", () => {
      const audioQuery: EditorAudioQuery = {
        ...baseEditorAudioQuery,
        accentPhrases: [
          {
            moras: [
              {
                text: "あ",
                vowel: "a",
                vowelLength: 0.2,
                pitch: 0,
                consonant: "a",
                consonantLength: 0.1,
              },
            ],
            accent: 1,
            pauseMora: undefined,
          },
        ],
        prePhonemeLength: 0.5,
      };

      // 0.5(pre) + 0.3 + 0.1(post) = 0.9
      expect(calculateAudioLength(audioQuery)).toBeCloseTo(0.9);
    });

    test("postPhonemeLengthが反映されること", () => {
      const audioQuery: EditorAudioQuery = {
        ...baseEditorAudioQuery,
        accentPhrases: [
          {
            moras: [
              {
                text: "あ",
                vowel: "a",
                vowelLength: 0.2,
                pitch: 0,
                consonant: "a",
                consonantLength: 0.1,
              },
            ],
            accent: 1,
            pauseMora: undefined,
          },
        ],
        postPhonemeLength: 0.5,
      };

      // 0.1(pre) + 0.3 + 0.5(post) = 0.9
      expect(calculateAudioLength(audioQuery)).toBeCloseTo(0.9);
    });
  });
  describe("generateLabFromAudioQuery", () => {
    const audioQuery: EditorAudioQuery = {
      ...baseEditorAudioQuery,
      speedScale: 2,
      pauseLengthScale: 0.5,
      accentPhrases: [
        {
          moras: [
            {
              text: "カ",
              vowel: "a",
              vowelLength: 0.2,
              pitch: 0,
              consonant: "k",
              consonantLength: 0.1,
            },
            {
              text: "ン",
              vowel: "N",
              vowelLength: 0.1,
              pitch: 0,
              consonant: undefined,
              consonantLength: undefined,
            },
          ],
          accent: 1,
          pauseMora: {
            text: "、",
            vowel: "pau",
            vowelLength: 0.4,
            pitch: 0,
            consonant: undefined,
            consonantLength: undefined,
          },
        },
        {
          moras: [
            {
              text: "イ",
              vowel: "I",
              vowelLength: 0.2,
              pitch: 0,
              consonant: undefined,
              consonantLength: undefined,
            },
          ],
          accent: 1,
          pauseMora: undefined,
        },
      ],
    };

    test("音素ごとの区間をlab形式の文字列にできること", () => {
      // 時刻は100ナノ秒単位で、話速2倍なので長さは半分になる
      // 間（pauseMora）の長さにはpauseLengthScaleが掛かる
      // 母音は小文字になるが、撥音「N」はそのまま
      expect(generateLabFromAudioQuery(audioQuery).toString()).toBe(
        [
          "0 500000 pau",
          "500000 1000000 k",
          "1000000 2000000 a",
          "2000000 2500000 N",
          "2500000 3500000 pau",
          "3500000 4500000 i",
          "4500000 5000000 pau",
          "",
        ].join("\n"),
      );
    });

    test("終了時刻が最後の音素の終了時刻になること", () => {
      expect(generateLabFromAudioQuery(audioQuery).endTime).toBe(5000000);
    });

    test("shiftで全区間がずれ、元のLabは変わらないこと", () => {
      const lab = generateLabFromAudioQuery(baseEditorAudioQuery);
      const shifted = lab.shift(1000000);

      expect(shifted.toString()).toBe(
        ["1000000 2000000 pau", "2000000 3000000 pau", ""].join("\n"),
      );
      expect(shifted.endTime).toBe(3000000);
      expect(lab.toString()).toBe(
        ["0 1000000 pau", "1000000 2000000 pau", ""].join("\n"),
      );
    });
  });
});
