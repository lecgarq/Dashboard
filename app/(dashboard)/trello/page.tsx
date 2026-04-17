"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";

import { TrelloBoardView } from "@/components/trello/TrelloBoardView";
import { trpc } from "@/lib/core/trpc";

import type { TrelloBoard } from "@/components/trello/types";

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="h-28 animate-pulse rounded-xl bg-muted" key={index} />
      ))}
    </div>
  );
}

export default function TrelloPage() {
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<TrelloBoard | null>(null);

  const {
    data: boards = [],
    error: boardsError,
    isLoading: boardsLoading,
  } = trpc.trello.getBoards.useQuery();

  function handleSelectBoard(board: TrelloBoard) {
    setSelectedBoard(board);
    setSelectedBoardId(board.id);
  }

  function handleBack() {
    setSelectedBoardId(null);
    setSelectedBoard(null);
  }

  if (selectedBoardId) {
    return (
      <TrelloBoardView
        board={selectedBoard}
        boardId={selectedBoardId}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Trello Workspace</h1>

      {boardsLoading ? (
        <BoardSkeleton />
      ) : boardsError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle className="text-destructive/50" size={32} />
          <p className="text-sm font-medium text-foreground">Trello connection failed</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Check that <code className="rounded bg-muted px-1">TRELLO_TOKEN</code> is set
            in your <code className="rounded bg-muted px-1">.env</code> file.
          </p>
        </div>
      ) : boards.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          No open boards found in your Trello workspace.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(boards as TrelloBoard[]).map((board) => (
            <button
              className="group relative h-28 overflow-hidden rounded-xl text-left transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary"
              key={board.id}
              onClick={() => handleSelectBoard(board)}
              style={{
                backgroundColor: board.prefs?.backgroundColor ?? "#0052CC",
                backgroundImage: board.prefs?.backgroundImage
                  ? `url(${board.prefs.backgroundImage})`
                  : undefined,
                backgroundPosition: "center",
                backgroundSize: "cover",
              }}
            >
              <div className="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/20" />
              <div className="absolute inset-0 flex flex-col justify-between p-4">
                <span className="text-sm font-semibold leading-tight text-white drop-shadow">
                  {board.name}
                </span>
                <span className="text-xs text-white/70">
                  {board.dateLastActivity
                    ? `Updated ${new Date(board.dateLastActivity).toLocaleDateString()}`
                    : ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
