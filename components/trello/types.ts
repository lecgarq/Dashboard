export type TrelloBoard = {
  id: string;
  name: string;
  desc: string;
  url: string;
  dateLastActivity: string;
  prefs: { backgroundColor?: string; backgroundImage?: string };
};

export type TrelloCard = {
  id: string;
  name: string;
  desc: string;
  idList: string;
  pos: number;
  due: string | null;
  dueComplete: boolean;
  labels: { id: string; name: string; color: string }[];
  url: string;
  idMembers?: string[];
  cover?: { color?: string; idAttachmentCover?: string };
};

export type TrelloList = {
  id: string;
  name: string;
  pos: number;
};

export type TrelloLabel = {
  id: string;
  name: string;
  color: string;
};

export type TrelloMember = {
  id: string;
  fullName: string;
};

export type TrelloAction = {
  id: string;
  type: string;
  date: string;
  memberCreator?: {
    fullName?: string;
  };
  data?: {
    card?: { name?: string; closed?: boolean };
    list?: { name?: string };
    listBefore?: { name?: string };
    listAfter?: { name?: string };
    attachment?: { name?: string };
  };
};
