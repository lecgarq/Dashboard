import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, editorProcedure } from "../trpc";
import * as trelloLib from "@/lib/trello/client";
import trelloEvents from "@/lib/events/trello";
import { createLogger } from "@/lib/server/logger";
import type { PrismaClient } from "@prisma/client";

const logger = createLogger("trello");

async function getUserTrelloToken(userId: string, db: PrismaClient) {
  const account = await db.account.findFirst({
    where: { userId, provider: "trello" },
    select: { access_token: true },
  });
  if (!account?.access_token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "trello_access_required" });
  }
  return account.access_token;
}

type Ctx = { session: { user: { id: string; email?: string | null } }; db: PrismaClient };

function withUserTrello<T>(ctx: Ctx, fn: () => Promise<T>): Promise<T> {
  return getUserTrelloToken(ctx.session.user.id, ctx.db).then((token) =>
    trelloLib.withTrelloToken(token, fn)
  );
}

// Per-user member ID cache (userId → trelloMemberId)
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

const checkItemsCache = new Map<string, { data: CalendarCheckItem[]; expiresAt: number }>();
const CHECK_ITEMS_TTL_MS = 30 * 1000;

const DASHBOARD_BOARD_FILTER = "ESTANDARIZACION";
let dashboardBoardId: string | null | undefined = undefined;

function broadcastTrelloUpdate(type: string) {
  checkItemsCache.clear();
  trelloEvents.emit("update", { type, timestamp: Date.now() });
}

export const trelloRouter = router({
  getMyDueCards: protectedProcedure.query(async ({ ctx }) => {
    return withUserTrello(ctx, async () => {
      const memberId =
        memberIdCache.get(ctx.session.user.id) ??
        ((await trelloLib.findMemberIdByEmail("")) ?? undefined);
      if (memberId) memberIdCache.set(ctx.session.user.id, memberId);
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
    });
  }),

  getMyCheckItems: protectedProcedure.query(async ({ ctx }) => {
    return withUserTrello(ctx, async () => {
      const cached = checkItemsCache.get(ctx.session.user.id);
      if (cached && cached.expiresAt > Date.now()) return cached.data;

      const memberId =
        memberIdCache.get(ctx.session.user.id) ??
        ((await trelloLib.findMemberIdByEmail("")) ?? undefined);
      if (memberId) memberIdCache.set(ctx.session.user.id, memberId);
      if (!memberId) return [];

      if (dashboardBoardId === undefined) {
        try {
          const boards = (await trelloLib.getBoards()) as { id: string; name: string }[];
          const match = boards.find((b) => b.name.toUpperCase().includes(DASHBOARD_BOARD_FILTER));
          dashboardBoardId = match?.id ?? null;
        } catch {
          dashboardBoardId = null;
        }
      }

      const cards = await trelloLib.getMemberCardsWithChecklists(memberId);
      const data: CalendarCheckItem[] = cards
        .filter((c) => c.due && !c.dueComplete)
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
      checkItemsCache.set(ctx.session.user.id, { data, expiresAt: Date.now() + CHECK_ITEMS_TTL_MS });
      return data;
    });
  }),

  getCardChecklists: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .query(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.getCardChecklists(input.cardId))
    ),

  getBoards: protectedProcedure.query(({ ctx }) =>
    withUserTrello(ctx, () => trelloLib.getBoards())
  ),

  getBoardDetail: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.getBoardListsAndCards(input.boardId))
    ),

  getBoardFullDetail: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.getBoardFullData(input.boardId))
    ),

  getBoardMembers: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.getBoardMembers(input.boardId))
    ),

  getBoardLabels: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.getBoardLabels(input.boardId))
    ),

  createList: editorProcedure
    .input(z.object({ boardId: z.string(), name: z.string().min(1) }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.createList(input.boardId, input.name))
    ),

  updateList: editorProcedure
    .input(z.object({ listId: z.string(), pos: z.number().optional(), name: z.string().optional() }))
    .mutation(({ input, ctx }) => {
      const { listId, ...data } = input;
      return withUserTrello(ctx, () => trelloLib.updateList(listId, data));
    }),

  archiveList: editorProcedure
    .input(z.object({ listId: z.string() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.archiveList(input.listId))
    ),

  getArchivedCards: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.getArchivedCards(input.boardId))
    ),

  getArchivedLists: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.getArchivedLists(input.boardId))
    ),

  unarchiveCard: editorProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.unarchiveCard(input.cardId))
    ),

  unarchiveList: editorProcedure
    .input(z.object({ listId: z.string() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.unarchiveList(input.listId))
    ),

  createLabel: editorProcedure
    .input(z.object({ boardId: z.string(), name: z.string(), color: z.string() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.createLabel(input.boardId, input.name, input.color))
    ),

  updateLabel: editorProcedure
    .input(z.object({ labelId: z.string(), name: z.string().optional(), color: z.string().optional() }))
    .mutation(({ input, ctx }) => {
      const { labelId, ...data } = input;
      return withUserTrello(ctx, () => trelloLib.updateLabel(labelId, data));
    }),

  deleteLabel: editorProcedure
    .input(z.object({ labelId: z.string() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.deleteLabel(input.labelId))
    ),

  addLabelToCard: editorProcedure
    .input(z.object({ cardId: z.string(), labelId: z.string() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.addLabelToCard(input.cardId, input.labelId))
    ),

  removeLabelFromCard: editorProcedure
    .input(z.object({ cardId: z.string(), labelId: z.string() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.removeLabelFromCard(input.cardId, input.labelId))
    ),

  addAttachment: editorProcedure
    .input(z.object({ cardId: z.string(), fileBase64: z.string(), fileName: z.string(), mimeType: z.string() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () =>
        trelloLib.addAttachment(input.cardId, input.fileBase64, input.fileName, input.mimeType)
      )
    ),

  addAttachmentByUrl: editorProcedure
    .input(z.object({ cardId: z.string(), url: z.string().url(), name: z.string().optional() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.addAttachmentByUrl(input.cardId, input.url, input.name))
    ),

  deleteAttachment: editorProcedure
    .input(z.object({ cardId: z.string(), attachmentId: z.string() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.deleteAttachment(input.cardId, input.attachmentId))
    ),

  setCardCover: editorProcedure
    .input(z.object({
      cardId: z.string(),
      color: z.string().optional(),
      idAttachmentCover: z.string().optional(),
      brightness: z.enum(["dark", "light"]).optional(),
    }))
    .mutation(({ input, ctx }) => {
      const { cardId, ...cover } = input;
      return withUserTrello(ctx, () => trelloLib.setCardCover(cardId, cover));
    }),

  getBoardActions: protectedProcedure
    .input(z.object({ boardId: z.string() }))
    .query(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.getBoardActions(input.boardId))
    ),

  getCardDetail: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .query(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.getCardDetail(input.cardId))
    ),

  getCardActions: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .query(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.getCardActions(input.cardId))
    ),

  createCard: editorProcedure
    .input(z.object({ idList: z.string(), name: z.string().min(1), desc: z.string().optional(), due: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await withUserTrello(ctx, () => trelloLib.createCard(input));
      broadcastTrelloUpdate("card-created");
      return result;
    }),

  updateCard: editorProcedure
    .input(z.object({
      cardId: z.string(),
      name: z.string().optional(),
      desc: z.string().optional(),
      due: z.string().nullable().optional(),
      dueComplete: z.boolean().optional(),
      idList: z.string().optional(),
      pos: z.union([z.number(), z.literal("top"), z.literal("bottom")]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { cardId, ...data } = input;
      const result = await withUserTrello(ctx, () => trelloLib.updateCard(cardId, data));
      broadcastTrelloUpdate("card-updated");
      return result;
    }),

  archiveCard: editorProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.archiveCard(input.cardId))
    ),

  addComment: editorProcedure
    .input(z.object({ cardId: z.string(), text: z.string().min(1) }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.addComment(input.cardId, input.text))
    ),

  addMemberToCard: editorProcedure
    .input(z.object({ cardId: z.string(), memberId: z.string() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.addMemberToCard(input.cardId, input.memberId))
    ),

  removeMemberFromCard: editorProcedure
    .input(z.object({ cardId: z.string(), memberId: z.string() }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.removeMemberFromCard(input.cardId, input.memberId))
    ),

  createChecklist: editorProcedure
    .input(z.object({ cardId: z.string(), name: z.string().min(1) }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.createChecklist(input.cardId, input.name))
    ),

  addCheckItem: editorProcedure
    .input(z.object({ checklistId: z.string(), name: z.string().min(1) }))
    .mutation(({ input, ctx }) =>
      withUserTrello(ctx, () => trelloLib.addCheckItem(input.checklistId, input.name))
    ),

  createCheckItemFull: editorProcedure
    .input(z.object({
      checklistId: z.string(),
      cardId: z.string(),
      name: z.string().min(1),
      due: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await withUserTrello(ctx, async () => {
        const me = await trelloLib.findMemberIdByEmail("");
        const item = await trelloLib.addCheckItem(input.checklistId, input.name, input.due, me ?? undefined);
        if (input.due) {
          try {
            const card = await trelloLib.getCardDetail(input.cardId);
            if (!card.due) await trelloLib.updateCard(input.cardId, { due: input.due });
          } catch (e) {
            logger.error("Failed to update parent card due date", { cardId: input.cardId, e });
          }
        }
        if (me) {
          try {
            const card = await trelloLib.getCardDetail(input.cardId).catch(() => null);
            if (!card?.idMembers?.includes(me)) await trelloLib.addMemberToCard(input.cardId, me);
          } catch (e) {
            logger.error("Failed to auto-assign member to card", { cardId: input.cardId, e });
          }
        }
        return item;
      });
      broadcastTrelloUpdate("check-item-created");
      return result;
    }),

  updateCheckItem: editorProcedure
    .input(z.object({ cardId: z.string(), checkItemId: z.string(), state: z.enum(["complete", "incomplete"]) }))
    .mutation(async ({ input, ctx }) => {
      const result = await withUserTrello(ctx, () =>
        trelloLib.updateCheckItem(input.cardId, input.checkItemId, input.state)
      );
      broadcastTrelloUpdate("check-item-toggled");
      return result;
    }),

  updateCheckItemDue: editorProcedure
    .input(z.object({ cardId: z.string(), checkItemId: z.string(), due: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const result = await withUserTrello(ctx, () =>
        trelloLib.updateCheckItemDue(input.cardId, input.checkItemId, input.due)
      );
      broadcastTrelloUpdate("check-item-toggled");
      return result;
    }),

  renameCheckItem: editorProcedure
    .input(z.object({ cardId: z.string(), checkItemId: z.string(), name: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const result = await withUserTrello(ctx, () =>
        trelloLib.renameCheckItem(input.cardId, input.checkItemId, input.name)
      );
      broadcastTrelloUpdate("check-item-toggled");
      return result;
    }),

  deleteCheckItem: editorProcedure
    .input(z.object({ checklistId: z.string(), checkItemId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const result = await withUserTrello(ctx, () =>
        trelloLib.deleteCheckItem(input.checklistId, input.checkItemId)
      );
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
    .mutation(async ({ input, ctx }) => {
      const result = await withUserTrello(ctx, () =>
        trelloLib.moveCheckItem(input.oldChecklistId, input.newChecklistId, input.checkItemId, input.details)
      );
      broadcastTrelloUpdate("check-item-deleted");
      return result;
    }),
});
