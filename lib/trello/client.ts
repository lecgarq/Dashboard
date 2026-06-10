"server-only";

import { AsyncLocalStorage } from "node:async_hooks";

const BASE = "https://api.trello.com/1";
const tokenStorage = new AsyncLocalStorage<string>();

export async function withTrelloToken<T>(token: string, fn: () => Promise<T>): Promise<T> {
  return tokenStorage.run(token, fn);
}

function auth() {
  const token = tokenStorage.getStore() ?? process.env.TRELLO_TOKEN ?? "";
  return `key=${process.env.TRELLO_API_KEY}&token=${token}`;
}

async function trelloFetch(path: string, options?: RequestInit) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}${auth()}`, {
    ...options,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Trello API error: ${res.status} ${path}`);
  return res.json();
}

// ── Boards ──────────────────────────────────────────────────────────────────

export async function getBoards() {
  return trelloFetch(
    "/members/me/boards?fields=id,name,desc,url,prefs,dateLastActivity&filter=open"
  );
}

export async function getBoardListsAndCards(boardId: string) {
  const [lists, cards] = await Promise.all([
    trelloFetch(`/boards/${boardId}/lists?fields=id,name,pos,closed&filter=open`),
    trelloFetch(`/boards/${boardId}/cards?fields=id,name,desc,idList,pos,due,dueComplete,labels,url,idMembers,cover&filter=open`),
  ]);
  return { lists, cards };
}

// Fetches lists, cards, members, and labels in a single Trello request
export async function getBoardFullData(boardId: string) {
  const data = await trelloFetch(
    `/boards/${boardId}?lists=open&cards=open` +
    `&card_fields=id,name,desc,idList,pos,due,dueComplete,labels,url,idMembers,cover` +
    `&members=all&member_fields=id,fullName,username,avatarUrl,avatarHash` +
    `&labels=all&label_fields=id,name,color` +
    `&fields=id,name`
  );
  return {
    lists: (data.lists ?? []) as unknown[],
    cards: (data.cards ?? []) as unknown[],
    members: (data.members ?? []) as unknown[],
    labels: (data.labels ?? []) as unknown[],
  };
}

export async function getBoardMembers(boardId: string) {
  return trelloFetch(
    `/boards/${boardId}/members?fields=id,fullName,username,avatarUrl,avatarHash`
  );
}

export async function getBoardLabels(boardId: string) {
  return trelloFetch(`/boards/${boardId}/labels?fields=id,name,color`);
}

// ── Cards ────────────────────────────────────────────────────────────────────

export async function getCardDetail(cardId: string) {
  return trelloFetch(
    `/cards/${cardId}?checklists=all&members=true&attachments=true&fields=id,name,desc,idList,pos,due,dueComplete,labels,url,idMembers,cover,badges`
  );
}

export async function getCardActions(cardId: string) {
  return trelloFetch(
    `/cards/${cardId}/actions?filter=commentCard&limit=50&fields=id,type,date,data,memberCreator`
  );
}

export async function createCard(data: {
  idList: string;
  name: string;
  desc?: string;
  due?: string;
}) {
  return trelloFetch("/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateCard(
  cardId: string,
  data: {
    name?: string;
    desc?: string;
    due?: string | null;
    dueComplete?: boolean;
    idList?: string;
    pos?: number | "top" | "bottom";
  }
) {
  return trelloFetch(`/cards/${cardId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function archiveCard(cardId: string) {
  return trelloFetch(`/cards/${cardId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ closed: true }),
  });
}

export async function addComment(cardId: string, text: string) {
  return trelloFetch(`/cards/${cardId}/actions/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function addMemberToCard(cardId: string, memberId: string) {
  return trelloFetch(`/cards/${cardId}/idMembers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: memberId }),
  });
}

export async function removeMemberFromCard(cardId: string, memberId: string) {
  return trelloFetch(`/cards/${cardId}/idMembers/${memberId}`, {
    method: "DELETE",
  });
}

// ── Checklists ───────────────────────────────────────────────────────────────

interface CheckItem {
  id: string;
  name: string;
  state: "complete" | "incomplete";
  due: string | null;
  idChecklist: string;
}

export interface Checklist {
  id: string;
  name: string;
  idCard: string;
  checkItems: CheckItem[];
}

/**
 * Fetch all checklists (with check items) for a given card.
 */
export async function getCardChecklists(cardId: string): Promise<Checklist[]> {
  return trelloFetch(`/cards/${cardId}/checklists?checkItem_fields=id,name,state,due,idMember&fields=id,name,idCard`);
}

export async function createChecklist(cardId: string, name: string) {
  return trelloFetch("/checklists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idCard: cardId, name }),
  });
}

export async function addCheckItem(checklistId: string, name: string, due?: string, memberId?: string) {
  const body: Record<string, string> = { name };
  if (due) body.due = due;
  if (memberId) body.idMember = memberId;
  return trelloFetch(`/checklists/${checklistId}/checkItems`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateCheckItem(
  cardId: string,
  checkItemId: string,
  state: "complete" | "incomplete"
) {
  return trelloFetch(`/cards/${cardId}/checkItem/${checkItemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
}

export async function updateCheckItemDue(
  cardId: string,
  checkItemId: string,
  due: string
) {
  return trelloFetch(`/cards/${cardId}/checkItem/${checkItemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ due }),
  });
}

export async function renameCheckItem(
  cardId: string,
  checkItemId: string,
  name: string
) {
  return trelloFetch(`/cards/${cardId}/checkItem/${checkItemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteCheckItem(checklistId: string, checkItemId: string) {
  return trelloFetch(`/checklists/${checklistId}/checkItems/${checkItemId}`, {
    method: "DELETE",
  });
}

/**
 * Workaround for moving check items (Trello doesn't support moving natively)
 * Creates a new item in the target checklist and deletes the old one.
 */
export async function moveCheckItem(
  oldChecklistId: string,
  newChecklistId: string,
  checkItemId: string,
  details: { name: string; state: "complete" | "incomplete"; due?: string | null }
) {
  const me = await findMemberIdByEmail("");
  const newItem = await trelloFetch(`/checklists/${newChecklistId}/checkItems`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: details.name,
      checked: details.state === "complete",
      due: details.due || undefined,
      idMember: me ?? undefined,
    }),
  });

  // 2. Delete from old checklist
  await deleteCheckItem(oldChecklistId, checkItemId);

  return newItem;
}

// ── Lists ────────────────────────────────────────────────────────────────────

export async function createList(boardId: string, name: string) {
  return trelloFetch("/lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idBoard: boardId, name, pos: "bottom" }),
  });
}

export async function updateList(listId: string, data: { pos?: number; name?: string }) {
  return trelloFetch(`/lists/${listId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function archiveList(listId: string) {
  return trelloFetch(`/lists/${listId}/closed`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: true }),
  });
}

// ── Archive ──────────────────────────────────────────────────────────────────

export async function getArchivedCards(boardId: string) {
  return trelloFetch(
    `/boards/${boardId}/cards?filter=closed&fields=id,name,desc,idList,pos,due,dueComplete,labels,url,idMembers,cover`
  );
}

export async function getArchivedLists(boardId: string) {
  return trelloFetch(
    `/boards/${boardId}/lists?filter=closed&fields=id,name,pos`
  );
}

export async function unarchiveCard(cardId: string) {
  return trelloFetch(`/cards/${cardId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ closed: false }),
  });
}

export async function unarchiveList(listId: string) {
  return trelloFetch(`/lists/${listId}/closed`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: false }),
  });
}

// ── Labels ───────────────────────────────────────────────────────────────────

export async function createLabel(boardId: string, name: string, color: string) {
  return trelloFetch("/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idBoard: boardId, name, color }),
  });
}

export async function updateLabel(labelId: string, data: { name?: string; color?: string }) {
  return trelloFetch(`/labels/${labelId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteLabel(labelId: string) {
  return trelloFetch(`/labels/${labelId}`, { method: "DELETE" });
}

export async function addLabelToCard(cardId: string, labelId: string) {
  return trelloFetch(`/cards/${cardId}/idLabels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: labelId }),
  });
}

export async function removeLabelFromCard(cardId: string, labelId: string) {
  return trelloFetch(`/cards/${cardId}/idLabels/${labelId}`, {
    method: "DELETE",
  });
}

// ── Attachments ──────────────────────────────────────────────────────────────

export async function addAttachment(
  cardId: string,
  fileBase64: string,
  fileName: string,
  mimeType: string
) {
  // Convert base64 to Blob for FormData upload
  const byteString = Buffer.from(fileBase64, "base64");
  const blob = new Blob([byteString], { type: mimeType });
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("name", fileName);
  form.append("mimeType", mimeType);

  const sep = "?";
  const res = await fetch(`${BASE}/cards/${cardId}/attachments${sep}${auth()}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Trello API error: ${res.status} /cards/${cardId}/attachments`);
  return res.json();
}

export async function addAttachmentByUrl(cardId: string, url: string, name?: string) {
  return trelloFetch(`/cards/${cardId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, name: name ?? url }),
  });
}

export async function deleteAttachment(cardId: string, attachmentId: string) {
  return trelloFetch(`/cards/${cardId}/attachments/${attachmentId}`, {
    method: "DELETE",
  });
}

// ── Card cover ───────────────────────────────────────────────────────────────

export async function setCardCover(
  cardId: string,
  cover: { color?: string; idAttachmentCover?: string; brightness?: "dark" | "light" }
) {
  return trelloFetch(`/cards/${cardId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cover }),
  });
}

// ── Member / due-date helpers ────────────────────────────────────────────────

export interface TrelloCard {
  id: string;
  name: string;
  due: string | null;
  url: string;
  dueComplete: boolean;
  idBoard: string;
}

// Per-token cache for member ID (token → memberId)
const meIdByToken = new Map<string, string | null>();

/**
 * Returns the Trello member ID for whoever owns the current token.
 * The email param is kept for API compatibility but is unused.
 */
export async function findMemberIdByEmail(_email: string): Promise<string | null> {
  const token = tokenStorage.getStore() ?? process.env.TRELLO_TOKEN ?? "";
  const cached = meIdByToken.get(token);
  if (cached !== undefined) return cached;
  try {
    const me: { id: string } = await trelloFetch("/members/me?fields=id");
    meIdByToken.set(token, me.id ?? null);
    return me.id ?? null;
  } catch {
    meIdByToken.set(token, null);
    return null;
  }
}

/**
 * Get visible cards for a member (excludes cards on archived lists/boards).
 * `filter=visible` = card not closed + list not closed + board not closed.
 */
export async function getMemberCards(memberId: string): Promise<TrelloCard[]> {
  return trelloFetch(
    `/members/${memberId}/cards?filter=visible&fields=name,due,url,dueComplete,idBoard`
  );
}

export interface TrelloCardWithChecklists extends TrelloCard {
  checklists: Checklist[];
}

/**
 * Fetches all visible member cards with their checklists embedded in a single
 * Trello API call, eliminating the N+1 pattern for checklist-heavy views.
 */
export async function getMemberCardsWithChecklists(
  memberId: string
): Promise<TrelloCardWithChecklists[]> {
  return trelloFetch(
    `/members/${memberId}/cards?filter=visible` +
      `&fields=name,due,url,dueComplete,idBoard` +
      `&checklists=all` +
      `&checklist_fields=id,name,idCard` +
      `&checkItem_fields=id,name,state,due,idMember`
  );
}

// ── Board actions (activity log) ─────────────────────────────────────────────

export async function getBoardActions(boardId: string) {
  return trelloFetch(
    `/boards/${boardId}/actions?filter=all&limit=50&fields=id,type,date,data,memberCreator`
  );
}
