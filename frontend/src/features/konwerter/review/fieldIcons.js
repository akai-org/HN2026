import {
  AlignLeft,
  CalendarDays,
  CircleDot,
  FileQuestion,
  Folder,
  Hash,
  Info,
  List,
  Paperclip,
  Repeat,
  ShieldCheck,
  SquareCheck,
  Type,
  Text,
} from "lucide-react";

export const FIELD_ICONS = {
  TEXT_FIELD: Type,
  NUMBER: Hash,
  TEXTAREA: AlignLeft,
  DATEPICKER: CalendarDays,
  RADIO: CircleDot,
  CHECKBOX: SquareCheck,
  SELECT: List,
  FILE_UPLOADER: Paperclip,
  CONSENT_SECTION: ShieldCheck,
  TEXT_BLOCK: Text,
  INFO_SECTION: Info,
  SECTION: Folder,
  REPEATING_SECTION: Repeat,
};

export function fieldIcon(type) {
  return FIELD_ICONS[type] ?? FileQuestion;
}
