import type {
  AudioItem,
  AudioStoreState,
  EditorAudioQuery,
  SettingStoreState,
} from "./type";
import { convertAudioQueryFromEditorToEngine } from "./proxy";
import { generateTempUniqueId } from "./utility";
import { ensureNotNullish, type Brand } from "@/type/utility";

/** labの1行分。1つの音素の区間を表す。時刻の単位は100ナノ秒。 */
type LabEntry = {
  start: number;
  end: number;
  phoneme: string;
};

/** 音素ごとの区間を並べたもの。lab形式の文字列に変換して書き出す。 */
export class Lab {
  constructor(private readonly entries: readonly LabEntry[]) {}

  /** 最後の音素の終了時刻。音素が1つもない場合は0。 */
  get endTime(): number {
    return this.entries.at(-1)?.end ?? 0;
  }

  /** すべての区間を`offset`だけ後ろにずらしたLabを返す。 */
  shift(offset: number): Lab {
    return new Lab(
      this.entries.map((entry) => ({
        ...entry,
        start: entry.start + offset,
        end: entry.end + offset,
      })),
    );
  }

  /** lab形式の文字列に変換する。各行は改行で終わる。 */
  toString(): string {
    return this.entries
      .map(
        (entry) =>
          `${entry.start.toFixed()} ${entry.end.toFixed()} ${entry.phoneme}\n`,
      )
      .join("");
  }
}

export function generateLabFromAudioQuery(audioQuery: EditorAudioQuery): Lab {
  const speedScale = audioQuery.speedScale;

  const entries: LabEntry[] = [];
  let timestamp = 0;
  const addEntry = (length: number, phoneme: string) => {
    const start = timestamp;
    timestamp += (length * 10000000) / speedScale;
    entries.push({ start, end: timestamp, phoneme });
  };

  addEntry(audioQuery.prePhonemeLength, "pau");

  audioQuery.accentPhrases.forEach((accentPhrase) => {
    accentPhrase.moras.forEach((mora) => {
      if (mora.consonantLength != undefined && mora.consonant != undefined) {
        addEntry(mora.consonantLength, mora.consonant);
      }
      addEntry(
        mora.vowelLength,
        mora.vowel != "N" ? mora.vowel.toLowerCase() : mora.vowel,
      );
    });
    if (accentPhrase.pauseMora != undefined) {
      addEntry(
        accentPhrase.pauseMora.vowelLength * audioQuery.pauseLengthScale,
        accentPhrase.pauseMora.vowel,
      );
    }
  });

  addEntry(audioQuery.postPhonemeLength, "pau");

  return new Lab(entries);
}

export type AudioUniqueId = Brand<string, "AudioUniqueId">;

export async function generateUniqueIdAndQuery(
  state: AudioStoreState & SettingStoreState,
  audioItem: AudioItem,
) {
  audioItem = JSON.parse(JSON.stringify(audioItem)) as AudioItem;
  const audioQuery = ensureNotNullish(audioItem.query);
  const engineId = audioItem.voice.engineId;
  audioQuery.outputSamplingRate =
    state.engineSettings[engineId].outputSamplingRate;
  audioQuery.outputStereo = state.savingSetting.outputStereo;

  const id = await generateTempUniqueId([
    audioItem.text,
    audioQuery,
    audioItem.voice,
    audioItem.morphingInfo,
    state.experimentalSetting.enableInterrogativeUpspeak, // このフラグが違うと、同じAudioQueryで違う音声が生成されるので追加
  ]);
  const engineAudioQuery = convertAudioQueryFromEditorToEngine(
    audioQuery,
    state.engineManifests[engineId].defaultSamplingRate,
  );
  return { id: id as AudioUniqueId, audioQuery: engineAudioQuery };
}

export function isMorphable(
  state: AudioStoreState,
  {
    audioItem,
  }: {
    audioItem: AudioItem;
  },
) {
  if (audioItem.morphingInfo?.targetStyleId == undefined) return false;
  const { engineId, styleId } = audioItem.voice;
  const info =
    state.morphableTargetsInfo[engineId]?.[styleId]?.[
      audioItem.morphingInfo.targetStyleId
    ];
  if (info == undefined) return false;
  return info.isMorphable;
}

export class NotMorphableError extends Error {
  constructor() {
    super("モーフィングの設定が無効です。");
  }
}

export function handlePossiblyNotMorphableError(e: unknown) {
  if (e instanceof NotMorphableError) {
    return e.message;
  } else {
    window.backend.logError(e);
    return;
  }
}

/**
 * AudioQueryから音声の長さを計算する(秒)
 */
export function calculateAudioLength(audioQuery: EditorAudioQuery) {
  if (audioQuery.accentPhrases.length === 0) return 0;

  let length = 0;
  length += audioQuery.prePhonemeLength;
  audioQuery.accentPhrases.forEach((accentPhrase) => {
    accentPhrase.moras.forEach((mora) => {
      if (mora.consonantLength != undefined) {
        length += mora.consonantLength;
      }
      length += mora.vowelLength;
    });
    if (accentPhrase.pauseMora != undefined) {
      length +=
        accentPhrase.pauseMora.vowelLength * audioQuery.pauseLengthScale;
    }
  });
  length += audioQuery.postPhonemeLength;
  return length / audioQuery.speedScale;
}
