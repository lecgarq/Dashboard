import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, editorProcedure } from "../trpc";
import * as trelloLib from "@/lib/trello";
import trelloEvents from "@/lib/trello-events";
import { createLogger } from "@/lib/server/logger";

const logger = createLogger("trello");

function requireToken() {
  if (!process.env.TRELLO_TOKEN || process.env.TRELLO_TOKEN.startsWith("<")) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "TRELLO_TOKEN is not configured in .env",
    });
  }
}

// Trello member IDs are stable per email — cache for the process lifetime
const memberIdCache = new Map<string, string>();

type CalendarCheckItem = {
  id: string;
  name: string;
  state: "complete" | "incomplete";
  due: string | null;
  cardId: string;
  cardName: string;
  cardDue: string;
  checklistId: string;
  checklistName: string;
};

// Short-lived cache for expensive multi-call procedures (TTL: 30 seconds for snappy real-time feel)
const checkItemsCache = new Map<string, { data: CalendarCheckItem[]; expiresAt: number }>();
const CHECK_ITEMS_TTL_MS = 30 * 1000;

// Board name filter — only show check items from this board on the dashboard calendar
const DASHBOARD_BOARD_FILTER = "ESTANDARIZACION";

// Board ID cache: board name → board ID (resolved once per process)
let dashboardBoardId: string | null | undefined = undefined;

function broadcastTrelloUpdate(type: string) {
  checkItemsCache.clear();
  trelloEvents.emit("update", { type, timestamp: Date.now() });
}

export const trelloRouter = router({
  // ── My due cards (for home calendar) ─────────────────────────────────────

  getMyDueCards: protectedProcedure.query(async ({ ctx }) => {
    requireToken();
    const email = ctx.session.user.email?.toLowerCase();
    if (!email) return [];
    let memberId = memberIdCache.get(email);
    if (!memberId) {
      memberId = (await trelloLib.findMemberIdByEmail(email)) ?? undefined;
      if (memberId) memberIdCache.set(email, memberId);
    }
    if (!memberId) return [];
    const cards = await trelloLib.getMemberCards(memberId);
    return cards
      .filter((c) => c.due)
      .map((c) => ({
        id: c.id,
        name: c.name,
        due: c.due!,
        url: c.url,
        dueComplete: c.dueComplete ?? false,
      }));
  }),

  // ── My check items for the calendar ───────────────────────────────────────
  // Returns all INCOMPLETE checklist items from cards assigned to the token-holder
  // where the parent card has a due date and is not yet complete.
  getMyCheckItems: protectedProcedure.query(async ({ ctx }) => {
    requireToken();
    const email = ctx.session.user.email?.toLowerCase();
    if (!email) return [];

    const cached = checkItemsCache.get(email);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    let memberId = memberIdCache.get(email);
    if (!memberId) {
      memberId = (await trelloLib.findMemberIdByEmail(email)) ?? undefined;
      if (memberId) memberIdCache.set(email, memberId);
    }
    if (!memberId) return [];

    // Resolve the dashboard board ID once
    if (dashboardBoardId === undefined) {
      try {
        const boards = await trelloLib.getBoards() as { id: string; name: string }[];
        const match = boards.find((b) =>
          b.name.toUpperCase().includes(DASHBOARD_BOARD_FILTER)
        );
        dashboardBoardId = match?.id ?? null;
      } catch {
        dashboardBoardId = null;
      }
    }

    // Single API call: cards + checklists embedded (eliminates N+1)
    const cards = await trelloLib.getMemberCardsWithChecklists(memberId);
    const data: CalendarCheckItem[] = cards
      .filter((c) => c.due && !c.dueComplete)
      // Only include cards from the ESTANDARIZACION board
      .filter((c) => !dashboardBoardId || c.idBoard === dashboardBoardId)
      .flatMap((card) =>
        card.checklists.flatMap((cl) =>
          cl.checkItems.map((item) => ({
            id: item.id,
            name: item.name,
            state: item.state,
            due: item.due ?? null,
            cardId: card.id,
            cardName: card.name,
            cardDue: card.due!,
            checklistId: cl.id,
            checklistName: cl.name,
          }))
        )
      );
    checkItemsCache.set(email, { data, expiresAt: Date.now() + CHECK_ITEMS_TTL_MS });
    return data;
  }),

  // Fetch checklists for a single card (used in create-item dialog)
  getCardChecklists: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .query(({ input }) => trelloLib.getCardChecklists(input.cardId)),

  // ── Boards ────────────────────────────────────────────────────────────────

  getBoards: protectedProcedure.query(async () => {
    requireToken();
    return trelloLib.getBoards();
  }),

  getBoardDetail: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input }) => trelloLib.getBoardListsAndCards(input.boardId)),

  // Single-request replacement for getBoardDetail + getBoardMembers + getBoardLabels
  getBoardFullDetail: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input }) => trelloLib.getBoardFullData(input.boardId)),

  getBoardMembers: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input }) => trelloLib.getBoardMembers(input.boardId)),

  getBoardLabels: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input }) => trelloLib.getBoardLabels(input.boardId)),

  createList: editorProcedure
    .input(z.object({ boardId: z.string(), name: z.string().min(1) }))
    .mutation(({ input }) => trelloLib.createList(input.boardId, input.name)),

  updateList: editorProcedure
    .input(z.object({ listId: z.string(), pos: z.number().optional(), name: z.string().optional() }))
    .mutation(({ input }) => {
      const { listId, ...data } = input;
      return trelloLib.updateList(listId, data);
    }),

  archiveList: editorProcedure
    .input(z.object({ listId: z.string() }))
    .mutation(({ input }) => trelloLib.archiveList(input.listId)),

  // ── Archive ───────────────────────────────────────────────────────────────

  getArchivedCards: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input }) => trelloLib.getArchivedCards(input.boardId)),

  getArchivedLists: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input }) => trelloLib.getArchivedLists(input.boardId)),

  unarchiveCard: editorProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(({ input }) => trelloLib.unarchiveCard(input.cardId)),

  unarchiveList: editorProcedure
    .input(z.object({ listId: z.string() }))
    .mutation(({ input }) => trelloLib.unarchiveList(input.listId)),

  // ── Labels ────────────────────────────────────────────────────────────────

  createLabel: editorProcedure
    .input(z.object({ boardId: z.string(), name: z.string(), color: z.string() }))
    .mutation(({ input }) => trelloLib.createLabel(input.boardId, input.name, input.color)),

  updateLabel: editorProcedure
    .input(z.object({ labelId: z.string(), name: z.string().optional(), color: z.string().optional() }))
    .mutation(({ input }) => {
      const { labelId, ...data } = input;
      return trelloLib.updateLabel(labelId, data);
    }),

  deleteLabel: editorProcedure
    .input(z.object({ labelId: z.string() }))
    .mutation(({ input }) => trelloLib.deleteLabel(input.labelId)),

  addLabelToCard: editorProcedure
    .input(z.object({ cardId: z.string(), labelId: z.string() }))
    .mutation(({ input }) => trelloLib.addLabelToCard(input.cardId, input.labelId)),

  removeLabelFromCard: editorProcedure
    .input(z.object({ cardId: z.string(), labelId: z.string() }))
    .mutation(({ input }) => trelloLib.removeLabelFromCard(input.cardId, input.labelId)),

  // ── Attachments ───────────────────────────────────────────────────────────

  addAttachment: editorProcedure
    .input(z.object({
      cardId: z.string(),
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(({ input }) =>
      trelloLib.addAttachment(input.cardId, input.fileBase64, input.fileName, input.mimeType)
    ),

  addAttachmentByUrl: editorProcedure
    .input(z.object({ cardId: z.string(), url: z.string().url(), name: z.string().optional() }))
    .mutation(({ input }) =>
      trelloLib.addAttachmentByUrl(input.cardId, input.url, input.name)
    ),

  deleteAttachment: editorProcedure
    .input(z.object({ cardId: z.string(), attachmentId: z.string() }))
    .mutation(({ input }) =>
      trelloLib.deleteAttachment(input.cardId, input.attachmentId)
    ),

  // ── Card cover ────────────────────────────────────────────────────────────

  setCardCover: editorProcedure
    .input(z.object({
      cardId: z.string(),
      color: z.string().optional(),
      idAttachmentCover: z.string().optional(),
      brightness: z.enum(["dark", "light"]).optional(),
    }))
    .mutation(({ input }) => {
      const { cardId, ...cover } = input;
      return trelloLib.setCardCover(cardId, cover);
    }),

  // ── Board activity ────────────────────────────────────────────────────────

  getBoardActions: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input }) => trelloLib.getBoardActions(input.boardId)),

  // ── Cards ─────────────────────────────────────────────────────────────────

  getCardDetail: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .query(({ input }) => trelloLib.getCardDetail(input.cardId)),

  getCardActions: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .query(({ input }) => trelloLib.getCardActions(input.cardId)),

  createCard: editorProcedure
    .input(
      z.object({
        idList: z.string(),
        name: z.string().min(1),
        desc: z.string().optional(),
        due: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await trelloLib.createCard(input);
      broadcastTrelloUpdate("card-created");
      return result;
    }),

  updateCard: editorProcedure
    .input(
      z.object({
        cardId: z.string(),
        name: z.string().optional(),
        desc: z.string().optional(),
        due: z.string().nullable().optional(),
        dueComplete: z.boolean().optional(),
        idList: z.string().optional(),
        pos: z.union([z.number(), z.literal("top"), z.literal("bottom")]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { cardId, ...data } = input;
      const result = await trelloLib.updateCard(cardId, data);
      broadcastTrelloUpdate("card-updated");
      return result;
    }),

  archiveCard: editorProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(({ input }) => trelloLib.archiveCard(input.cardId)),

  addComment: editorProcedure
    .input(z.object({ cardId: z.string(), text: z.string().min(1) }))
    .mutation(({ input }) => trelloLib.addComment(input.cardId, input.text)),

  addMemberToCard: editorProcedure
    .input(z.object({ cardId: z.string(), memberId: z.string() }))
    .mutation(({ input }) => trelloLib.addMemberToCard(input.cardId, input.memberId)),

  removeMemberFromCard: editorProcedure
    .input(z.object({ cardId: z.string(), memberId: z.string() }))
    .mutation(({ input }) => trelloLib.removeMemberFromCard(input.cardId, input.memberId)),

  // ── Checklists ────────────────────────────────────────────────────────────

  createChecklist: editorProcedure
    .input(z.object({ cardId: z.string(), name: z.string().min(1) }))
    .mutation(({ input }) => trelloLib.createChecklist(input.cardId, input.name)),

  addCheckItem: editorProcedure
    .input(z.object({ checklistId: z.string(), name: z.string().min(1) }))
    .mutation(({ input }) => trelloLib.addCheckItem(input.checklistId, input.name)),

  // Smart check-item creation: sets due date + auto-assigns token owner to card and item
  createCheckItemFull: editorProcedure
    .input(z.object({
      checklistId: z.string(),
      cardId: z.string(),
      name: z.string().min(1),
      due: z.string().optional(), // ISO date for the check item
    }))
    .mutation(async ({ input }) => {
      // 0) Get current Trello member ID (token owner)
      const me = await trelloLib.findMemberIdByEmail("");
      
      // 1) Create the check item (passing me as idMember for Advanced Checklists)
      const item = await trelloLib.addCheckItem(input.checklistId, input.name, input.due, me ?? undefined);

      // 2) Ensure the parent card has a due date (use item due if card has none)
      if (input.due) {
        try {
          const card = await trelloLib.getCardDetail(input.cardId);
          if (!card.due) {
            await trelloLib.updateCard(input.cardId, { due: input.due });
          }
        } catch (e) { 
          logger.error("Failed to update parent card due date", { cardId: input.cardId, e });
        }
      }

      // 3) Auto-assign token owner to the card (best-effort)
      if (me) {
        try {
          // Check if already a member to avoid 400 errors
          const card = await trelloLib.getCardDetail(input.cardId).catch(() => null);
          const alreadyAssigned = card?.idMembers?.includes(me);
          if (!alreadyAssigned) {
            await trelloLib.addMemberToCard(input.cardId, me);
          }
        } catch (e) {
          logger.error("Failed to auto-assign member to card", { cardId: input.cardId, e });
        }
      }

      broadcastTrelloUpdate("check-item-created");
      return item;
    }),

  updateCheckItem: editorProcedure
    .input(
      z.object({
        cardId: z.string(),
        checkItemId: z.string(),
        state: z.enum(["complete", "incomplete"]),
      })
    )
    .mutation(async ({ input }) => {
      const result = await trelloLib.updateCheckItem(input.cardId, input.checkItemId, input.state);
      broadcastTrelloUpdate("check-item-toggled");
      return result;
    }),

  updateCheckItemDue: editorProcedure
    .input(z.object({
      cardId: z.string(),
      checkItemId: z.string(),
      due: z.string(), // ISO date
    }))
    .mutation(async ({ input }) => {
      const result = await trelloLib.updateCheckItemDue(input.cardId, input.checkItemId, input.due);
      broadcastTrelloUpdate("check-item-toggled");
      return result;
    }),

  renameCheckItem: editorProcedure
    .input(z.object({
      cardId: z.string(),
      checkItemId: z.string(),
      name: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const result = await trelloLib.renameCheckItem(input.cardId, input.checkItemId, input.name);
      broadcastTrelloUpdate("check-item-toggled");
      return result;
    }),

  deleteCheckItem: editorProcedure
    .input(z.object({ checklistId: z.string(), checkItemId: z.string() }))
    .mutation(async ({ input }) => {
      const result = await trelloLib.deleteCheckItem(input.checklistId, input.checkItemId);
      broadcastTrelloUpdate("check-item-deleted");
      return result;
    }),

  moveCheckItem: editorProcedure
    .input(z.object({
      oldChecklistId: z.string(),
      newChecklistId: z.string(),
      checkItemId: z.string(),
      details: z.object({
        name: z.string(),
        state: z.enum(["complete", "incomplete"]),
        due: z.string().nullable().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const result = await trelloLib.moveCheckItem(
        input.oldChecklistId,
        input.newChecklistId,
        input.checkItemId,
        input.details
      );
      // Item ID changes, best to treat as a deletion + recreate (which SSE refresh will handle)
      broadcastTrelloUpdate("check-item-deleted");
      return result;
    }),
});
