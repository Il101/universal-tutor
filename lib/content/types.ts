export interface Course {
  id: string;
  title: string;
  topic: string;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  level: string;
  visibility: string | null;
  createdBy: string | null;
  units: Unit[];
}

export interface Unit {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  lessons: UnitLesson[];
  parseError?: boolean;
}

/**
 * All metadata extracted from unit markdown frontmatter.
 * The markdown is the single source of truth — DB columns mirror these for fast queries.
 */
export interface ParsedUnitMeta {
  title: string;
  description: string;
  icon: string;
  color: string;
  topic: string | null;
  targetLanguage: string | null;
  sourceLanguage: string | null;
  level: string | null;
  courseId: string | null;
}

/** Full result of parsing unit markdown: metadata + lessons. */
export interface ParsedUnit extends ParsedUnitMeta {
  lessons: UnitLesson[];
}

/** A single lesson inside a unit. */
export interface UnitLesson {
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  exercises: Exercise[];
}

export interface ParsedCourse {
  id: string | null;
  courseTitle: string;
  description: string;
  topic: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  level: string;
}

export type Exercise =
  | MultipleChoiceExercise
  | TranslationExercise
  | FillInTheBlankExercise
  | MatchingPairsExercise
  | ListeningExercise
  | WordBankExercise
  | SpeakingExercise
  | FreeTextExercise
  | FlashcardReviewExercise;

export interface MultipleChoiceExercise {
  type: "multiple-choice";
  text: string;
  choices: string[];
  correctIndex: number;
  randomOrder?: boolean;
  noAudio?: string[];
  srsWords: string | string[];
}

export interface TranslationExercise {
  type: "translation";
  text: string;
  sentence: string;
  answer: string;
  acceptAlso: string[];
  noAudio?: string[];
  srsWords: string | string[];
}

export interface FillInTheBlankExercise {
  type: "fill-in-the-blank";
  sentence: string;
  blank: string;
  noAudio?: string[];
  srsWords: string | string[];
}

export interface MatchingPairsExercise {
  type: "matching-pairs";
  pairs: { left: string; right: string }[];
  randomOrder?: boolean;
  noAudio?: string[];
  srsWords: string | string[];
}

export interface ListeningExercise {
  type: "listening";
  text: string;
  ttsLang: string;
  mode?: "choices" | "word-bank";
  choices?: string[];
  correctIndex?: number;
  noAudio?: string[];
  srsWords: string | string[];
}

export interface WordBankExercise {
  type: "word-bank";
  text: string;
  words: string[];
  answer: string[];
  randomOrder?: boolean;
  noAudio?: string[];
  srsWords: string | string[];
}

export interface SpeakingExercise {
  type: "speaking";
  sentence: string;
  noAudio?: string[];
  srsWords: string | string[];
}

export interface FreeTextExercise {
  type: "free-text";
  text: string;
  afterSubmitPrompt: string;
  noAudio?: string[];
  srsWords?: string | string[];
}

export interface FlashcardReviewExercise {
  type: "flashcard-review";
  front: string;
  back: string;
  noAudio?: string[];
  srsWords: string | string[];
}

export interface CourseListItem {
  id: string;
  title: string;
  topic: string;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  level: string;
  unitCount: number;
  lessonCount: number;
}

export interface StandaloneUnitInfo {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  topic: string;
  targetLanguage?: string | null;
  sourceLanguage?: string | null;
  level: string | null;
  lessonCount: number;
  completedLessons: number;
  visibility: string | null;
  creatorName: string | null;
  isOwner: boolean;
  isInLibrary?: boolean;
  parseError?: boolean;
}

export interface UnitWithContent {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  topic: string;
  targetLanguage?: string | null;
  sourceLanguage?: string | null;
  level: string | null;
  courseId: string | null;
  visibility: string | null;
  createdBy: string | null;
  lessons: UnitLesson[];
  parseError?: boolean;
}

export interface OwnedCourseInfo {
  id: string;
  title: string;
  topic: string;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  level: string;
  visibility: string | null;
  unitCount: number;
  lessonCount: number;
  completedLessons: number;
  createdAt: Date;
}

export interface CourseManagementInfo {
  id: string;
  title: string;
  topic: string;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  level: string;
  visibility: string | null;
  createdBy: string | null;
  units: {
    id: string;
    title: string;
    icon: string;
    visibility: string | null;
    lessonCount: number;
  }[];
}

export interface AvailableUnitForCourse {
  id: string;
  title: string;
  icon: string;
  topic: string;
  level: string | null;
  lessonCount: number;
}
