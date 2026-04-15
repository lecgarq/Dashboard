"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { TaskAttachment, UserTask } from "@prisma/client";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Plus,
  Check,
  Trash2,
  Clock,
  CircleDot,
  CheckCircle2,
  Calendar,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Flame,
} from "lucide-react";

const TaskEditDialog = dynamic(
  () => import("@/components/tasks/TaskEditDialog").then((m) => m.TaskEditDialog),
  { ssr: false }
);

const STATUS_CONFIG = {
  TODO: {
    label: "To Do",
    icon: CircleDot,
    color: "text-muted-foreground",
    bg: "bg-muted/50",
  },
  IN_PROGRESS: {
    label: "In Progress",
    icon: Clock,
    color: "text-chart-1",
    bg: "bg-chart-1/10",
  },
  DONE: {
    label: "Done",
    icon: CheckCircle2,
    color: "text-chart-2",
    bg: "bg-chart-2/10",
  },
};

const PRIORITY_CONFIG = {
  LOW: { label: "Low", icon: ArrowDown, color: "text-muted-foreground" },
  MEDIUM: { label: "Medium", icon: ArrowRight, color: "text-chart-3" },
  HIGH: { label: "High", icon: ArrowUp, color: "text-chart-5" },
  URGENT: { label: "Urgent", icon: Flame, color: "text-destructive" },
};

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TaskWithAttachments = UserTask & { attachments: TaskAttachment[] };

const STATUS_SORT_ORDER: Record<TaskStatus, number> = {
  TODO: 0,
  IN_PROGRESS: 1,
  DONE: 2,
};

const PRIORITY_SORT_ORDER: Record<TaskPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function sortTasks(items: TaskWithAttachments[]) {
  return [...items].sort((a, b) => {
    const statusDiff =
      STATUS_SORT_ORDER[a.status as TaskStatus] -
      STATUS_SORT_ORDER[b.status as TaskStatus];
    if (statusDiff !== 0) return statusDiff;

    const priorityDiff =
      PRIORITY_SORT_ORDER[a.priority as TaskPriority] -
      PRIORITY_SORT_ORDER[b.priority as TaskPriority];
    if (priorityDiff !== 0) return priorityDiff;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export default function TasksPage() {
  const utils = trpc.useUtils();
  const { data: tasks = [] } = trpc.tasks.getMyTasks.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("MEDIUM");
  const [newDueDate, setNewDueDate] = useState("");
  const [filter, setFilter] = useState<"ALL" | TaskStatus>("ALL");
  const [activeTask, setActiveTask] = useState<TaskWithAttachments | null>(null);

  const createTask = trpc.tasks.createTask.useMutation({
    onSuccess: (created) => {
      utils.tasks.getMyTasks.setData(undefined, (current = []) =>
        sortTasks([
          { ...created, attachments: [] } as TaskWithAttachments,
          ...current,
        ])
      );
      setCreateOpen(false);
      setNewTitle("");
      setNewDesc("");
      setNewPriority("MEDIUM");
      setNewDueDate("");
    },
  });

  const updateTask = trpc.tasks.updateTask.useMutation({
    onSuccess: (updated) => {
      utils.tasks.getMyTasks.setData(undefined, (current = []) =>
        sortTasks(
          current.map((task) =>
            task.id === updated.id
              ? ({ ...task, ...updated, attachments: task.attachments } as TaskWithAttachments)
              : task
          )
        )
      );
    },
  });

  const deleteTask = trpc.tasks.deleteTask.useMutation({
    onSuccess: (deleted) => {
      utils.tasks.getMyTasks.setData(undefined, (current = []) =>
        current.filter((task) => task.id !== deleted.id)
      );
      setActiveTask((current) => (current?.id === deleted.id ? null : current));
    },
  });

  useEffect(() => {
    if (!activeTask) return;
    const latest = tasks.find((task) => task.id === activeTask.id);
    if (!latest) {
      setActiveTask(null);
      return;
    }
    setActiveTask(latest as TaskWithAttachments);
  }, [activeTask, tasks]);

  const filteredTasks = useMemo(
    () => (filter === "ALL" ? tasks : tasks.filter((task) => task.status === filter)),
    [filter, tasks]
  );

  const counts = useMemo(
    () => ({
      ALL: tasks.length,
      TODO: tasks.filter((task) => task.status === "TODO").length,
      IN_PROGRESS: tasks.filter((task) => task.status === "IN_PROGRESS").length,
      DONE: tasks.filter((task) => task.status === "DONE").length,
    }),
    [tasks]
  );

  function cycleStatus(taskId: string, current: string) {
    const order: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
    const idx = order.indexOf(current as TaskStatus);
    const next = order[(idx + 1) % order.length];
    updateTask.mutate({ id: taskId, status: next });
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Tasks" />
      <TaskEditDialog
        task={activeTask}
        open={!!activeTask}
        onOpenChange={(open: boolean) => {
          if (!open) setActiveTask(null);
        }}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border/50 bg-card/30 backdrop-blur-sm px-6 py-3 flex items-center gap-3 shrink-0">
          <div className="flex p-0.5 rounded-lg glass-card">
            {(["ALL", "TODO", "IN_PROGRESS", "DONE"] as const).map((statusKey) => (
              <button
                key={statusKey}
                onClick={() => setFilter(statusKey)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-smooth ${
                  filter === statusKey
                    ? "gradient-accent text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {statusKey === "ALL"
                  ? "All"
                  : statusKey === "IN_PROGRESS"
                  ? "In Progress"
                  : statusKey === "TODO"
                  ? "To Do"
                  : "Done"}
                <span className="ml-1.5 opacity-60">{counts[statusKey]}</span>
              </button>
            ))}
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="ml-auto h-8 text-xs gradient-accent text-white hover:opacity-90 gap-1.5"
              >
                <Plus size={14} /> New Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Create Task</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Title *
                  </label>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="h-10 bg-secondary/50 border-border/50 text-foreground"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Description
                  </label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Add details..."
                    rows={3}
                    className="w-full rounded-md px-3 py-2 text-sm bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Priority
                    </label>
                    <Select
                      value={newPriority}
                      onValueChange={(value) => setNewPriority(value as TaskPriority)}
                    >
                      <SelectTrigger className="h-10 bg-secondary/50 border-border/50 text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="URGENT">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Due Date
                    </label>
                    <Input
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="h-10 bg-secondary/50 border-border/50 text-foreground"
                    />
                  </div>
                </div>
                <Button
                  className="w-full h-10 gradient-accent text-white hover:opacity-90"
                  onClick={() =>
                    createTask.mutate({
                      title: newTitle,
                      description: newDesc || undefined,
                      priority: newPriority,
                      dueDate: newDueDate ? new Date(newDueDate) : undefined,
                    })
                  }
                  disabled={!newTitle.trim() || createTask.isPending}
                >
                  {createTask.isPending ? "Creating..." : "Create Task"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl glass-card flex items-center justify-center">
                <CheckCircle2 size={28} className="text-muted-foreground/30" />
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {filter === "ALL"
                    ? "No tasks yet"
                    : `No ${filter.toLowerCase().replace("_", " ")} tasks`}
                </p>
                <p className="text-xs text-muted-foreground/50 mt-1">
                  Click "New Task" to get started
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 stagger-children max-w-3xl">
              {filteredTasks.map((task) => {
                const statusConf =
                  STATUS_CONFIG[task.status as TaskStatus] ?? STATUS_CONFIG.TODO;
                const priorityConf =
                  PRIORITY_CONFIG[task.priority as TaskPriority] ??
                  PRIORITY_CONFIG.MEDIUM;
                const StatusIcon = statusConf.icon;
                const PriorityIcon = priorityConf.icon;

                return (
                  <div
                    key={task.id}
                    onClick={() => setActiveTask(task as TaskWithAttachments)}
                    className={`group glass-card p-4 flex items-start gap-4 transition-smooth cursor-pointer hover:bg-muted/10 ${
                      task.status === "DONE" ? "opacity-50" : ""
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        cycleStatus(task.id, task.status);
                      }}
                      className={`mt-0.5 p-1 rounded-md transition-smooth hover:bg-accent ${statusConf.color}`}
                      title={`Click to change status (${statusConf.label})`}
                    >
                      <StatusIcon size={18} />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            task.status === "DONE"
                              ? "line-through text-muted-foreground"
                              : "text-foreground"
                          }`}
                        >
                          {task.title}
                        </span>
                        <span
                          className={priorityConf.color}
                          title={priorityConf.label}
                        >
                          <PriorityIcon size={14} />
                        </span>
                      </div>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${statusConf.bg} ${statusConf.color}`}
                        >
                          {statusConf.label}
                        </span>
                        {task.dueDate && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Calendar size={10} />
                            {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-smooth">
                      {task.status !== "DONE" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateTask.mutate({ id: task.id, status: "DONE" });
                          }}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-chart-2 hover:bg-chart-2/10 transition-smooth"
                          title="Mark as done"
                        >
                          <Check size={14} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTask.mutate({ id: task.id });
                        }}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-smooth"
                        title="Delete task"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
