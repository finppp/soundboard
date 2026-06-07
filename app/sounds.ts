export type Sound = {
  id: string;
  label: string;
  src: string;
  key: string;
};

export const SOUNDS: Sound[] = [
  { id: "1", label: "Yawn 3",     src: "/sounds/yawn3.m4a",     key: "q" },
  { id: "2", label: "Yawn 4",     src: "/sounds/yawn4.m4a",     key: "w" },
  { id: "3", label: "Its Piss",   src: "/sounds/its-piss.m4a",  key: "e" },
  { id: "4", label: "Yeah Noice", src: "/sounds/yeah-noice.m4a", key: "r" },
  { id: "5", label: "What a Day", src: "/sounds/what-a-day.m4a", key: "a" },
];
