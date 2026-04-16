"use client";

import { Suspense, useState } from "react";
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
import { trpc } from "@/lib/core/trpc";
import { useRole } from "@/hooks/use-role";
import { cn } from "@/lib/core/utils";
import {
  Plus,
  FileText,
  Link2,
  Copy,
  CheckCircle2,
  Trash2,
  ExternalLink,
  ClipboardList,
  BarChart3,
  Loader2,
} from "lucide-react";

type QuestionType = "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "PARAGRAPH";

interface Question {
  text: string;
  type: QuestionType;
  options: string[];
  required: boolean;
}

function ExamListSkeleton() {
  return (
    <div className="max-w-4xl space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass-card p-5 animate-pulse">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-4 w-48 bg-muted/40 rounded" />
                <div className="h-4 w-16 bg-muted/30 rounded-md" />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-3 w-14 bg-muted/30 rounded" />
                <div className="h-3 w-14 bg-muted/30 rounded" />
                <div className="h-3 w-24 bg-muted/30 rounded" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExamList({
  onBuildForm,
}: {
  onBuildForm: (examId: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [exams] = trpc.exam.getExams.useSuspenseQuery(undefined, { staleTime: 5 * 60 * 1000 });

  function copyLink(url: string, examId: string) {
    navigator.clipboard.writeText(url);
    setCopied(examId);
    setTimeout(() => setCopied(null), 2000);
  }

  if (exams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl glass-card flex items-center justify-center">
          <FileText size={28} className="text-muted-foreground/30" />
        </div>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No exams yet</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Create your first exam to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-3 stagger-children">
      {exams.map((exam) => (
        <div key={exam.id} className="glass-card p-5 transition-smooth group">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {exam.title}
                </h3>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-md",
                    exam.status === "DONE"
                      ? "bg-chart-2/10 text-chart-2"
                      : exam.status === "IN_PROGRESS"
                      ? "bg-chart-1/10 text-chart-1"
                      : exam.status === "REVIEW"
                      ? "bg-chart-5/10 text-chart-5"
                      : "bg-muted/50 text-muted-foreground"
                  )}
                >
                  {exam.status.replace("_", " ")}
                </span>
              </div>
              {exam.description && (
                <p className="text-xs text-muted-foreground/70 mb-2">
                  {exam.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60">
                <span className="flex items-center gap-1">
                  <ClipboardList size={10} />
                  {exam._count.tasks} tasks
                </span>
                <span className="flex items-center gap-1">
                  <BarChart3 size={10} />
                  {exam._count.results} results
                </span>
                <span>Created {new Date(exam.createdAt).toLocaleDateString()}</span>
              </div>
              {(exam as any).formUrl && (
                <div className="flex items-center gap-2 mt-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
                  <Link2 size={14} className="text-primary shrink-0" />
                  <a
                    href={(exam as any).formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline truncate flex-1"
                  >
                    {(exam as any).formUrl}
                  </a>
                  <button
                    onClick={() => copyLink((exam as any).formUrl!, exam.id)}
                    className="p-1 rounded text-muted-foreground hover:text-primary transition-smooth"
                    title="Copy link"
                  >
                    {copied === exam.id ? (
                      <CheckCircle2 size={14} className="text-chart-2" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                  <a
                    href={(exam as any).formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded text-muted-foreground hover:text-primary transition-smooth"
                    title="Open form"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {!(exam as any).formUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 border-border/50 text-foreground hover:bg-accent"
                  onClick={() => onBuildForm(exam.id)}
                >
                  <FileText size={12} />
                  Build Form
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ExamPage() {
  const { isEditor } = useRole();
  const utils = trpc.useUtils();

  const createExam = trpc.exam.createExam.useMutation({
    onSuccess: (created) => {
      utils.exam.getExams.setData(undefined, (current = []) => [
        { ...created, _count: { tasks: 0, results: 0 } },
        ...current,
      ]);
      setCreateOpen(false);
      setNewTitle("");
    },
  });
  const generateForm = trpc.exam.generateForm.useMutation({
    onSuccess: ({ exam }) => {
      utils.exam.getExams.setData(undefined, (current = []) =>
        current.map((item) =>
          item.id === exam.id
            ? {
                ...item,
                formUrl: exam.formUrl ?? null,
                formId: exam.formId ?? null,
              }
            : item
        )
      );
      setFormBuilderOpen(false);
      setQuestions([{ text: "", type: "MULTIPLE_CHOICE", options: ["", ""], required: true }]);
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [formBuilderOpen, setFormBuilderOpen] = useState(false);
  const [formBuilderExamId, setFormBuilderExamId] = useState<string | null>(null);

  const [questions, setQuestions] = useState<Question[]>([
    { text: "", type: "MULTIPLE_CHOICE", options: ["", ""], required: true },
  ]);

  function addQuestion() {
    setQuestions([
      ...questions,
      { text: "", type: "MULTIPLE_CHOICE", options: ["", ""], required: true },
    ]);
  }

  function removeQuestion(idx: number) {
    setQuestions(questions.filter((_, i) => i !== idx));
  }

  function updateQuestion(idx: number, updates: Partial<Question>) {
    setQuestions(questions.map((q, i) => (i === idx ? { ...q, ...updates } : q)));
  }

  function addOption(qIdx: number) {
    const q = questions[qIdx];
    updateQuestion(qIdx, { options: [...q.options, ""] });
  }

  function updateOption(qIdx: number, oIdx: number, value: string) {
    const q = questions[qIdx];
    const newOptions = [...q.options];
    newOptions[oIdx] = value;
    updateQuestion(qIdx, { options: newOptions });
  }

  function removeOption(qIdx: number, oIdx: number) {
    const q = questions[qIdx];
    updateQuestion(qIdx, { options: q.options.filter((_, i) => i !== oIdx) });
  }

  async function handleGenerateForm() {
    if (!formBuilderExamId) return;
    const validQuestions = questions.filter((q) => q.text.trim());
    if (validQuestions.length === 0) return;

    generateForm.mutate({
      examId: formBuilderExamId,
      questions: validQuestions.map((q) => ({
        text: q.text,
        type: q.type,
        options: q.type === "MULTIPLE_CHOICE" ? q.options.filter((o) => o.trim()) : undefined,
        required: q.required,
      })),
    });
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Examen Revit" />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="border-b border-border/50 bg-card/30 backdrop-blur-sm px-6 py-3 flex items-center gap-3 shrink-0">
          <ClipboardList size={16} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Exams</span>

          {isEditor && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="ml-auto h-8 text-xs gradient-accent text-white hover:opacity-90 gap-1.5"
                >
                  <Plus size={14} /> New Exam
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm bg-card border-border text-foreground">
                <DialogHeader>
                  <DialogTitle>Create Exam</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Exam title"
                    className="h-10 bg-secondary/50 border-border/50"
                    autoFocus
                  />
                  <Button
                    className="w-full h-10 gradient-accent text-white hover:opacity-90"
                    onClick={() => createExam.mutate({ title: newTitle })}
                    disabled={!newTitle.trim() || createExam.isPending}
                  >
                    {createExam.isPending ? "Creating…" : "Create Exam"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Content — streams in independently via Suspense */}
        <div className="flex-1 overflow-auto p-6">
          <Suspense fallback={<ExamListSkeleton />}>
            <ExamList
              onBuildForm={(examId) => {
                setFormBuilderExamId(examId);
                setFormBuilderOpen(true);
              }}
            />
          </Suspense>
        </div>
      </div>

      {/* ── Form Builder Dialog ── */}
      <Dialog open={formBuilderOpen} onOpenChange={setFormBuilderOpen}>
        <DialogContent className="max-w-2xl bg-card border-border max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Build Google Form</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {questions.map((q, qi) => (
              <div
                key={qi}
                className="glass-card p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                    Question {qi + 1}
                  </span>
                  {questions.length > 1 && (
                    <button
                      onClick={() => removeQuestion(qi)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive transition-smooth"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                <Input
                  value={q.text}
                  onChange={(e) => updateQuestion(qi, { text: e.target.value })}
                  placeholder="Question text"
                  className="h-9 bg-secondary/50 border-border/50 text-foreground text-sm"
                />

                <div className="flex items-center gap-3">
                  <Select
                    value={q.type}
                    onValueChange={(v) => updateQuestion(qi, { type: v as QuestionType })}
                  >
                    <SelectTrigger className="h-8 text-xs w-48 bg-secondary/50 border-border/50 text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="MULTIPLE_CHOICE" className="text-xs">
                        Multiple Choice
                      </SelectItem>
                      <SelectItem value="SHORT_ANSWER" className="text-xs">
                        Short Answer
                      </SelectItem>
                      <SelectItem value="PARAGRAPH" className="text-xs">
                        Paragraph
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) =>
                        updateQuestion(qi, { required: e.target.checked })
                      }
                      className="rounded border-border/50"
                    />
                    Required
                  </label>
                </div>

                {/* MC Options */}
                {q.type === "MULTIPLE_CHOICE" && (
                  <div className="space-y-1.5 pl-4">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full border border-border/50 shrink-0" />
                        <Input
                          value={opt}
                          onChange={(e) => updateOption(qi, oi, e.target.value)}
                          placeholder={`Option ${oi + 1}`}
                          className="h-7 text-xs bg-secondary/30 border-border/30 text-foreground flex-1"
                        />
                        {q.options.length > 2 && (
                          <button
                            onClick={() => removeOption(qi, oi)}
                            className="p-0.5 text-muted-foreground/50 hover:text-destructive"
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => addOption(qi)}
                      className="text-[10px] text-primary hover:underline pl-6"
                    >
                      + Add option
                    </button>
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={addQuestion}
              className="w-full py-2.5 border border-dashed border-border/50 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-border transition-smooth"
            >
              + Add Question
            </button>

            <Button
              onClick={handleGenerateForm}
              className="w-full h-10 gradient-accent text-white hover:opacity-90 gap-2"
              disabled={
                generateForm.isPending ||
                questions.every((q) => !q.text.trim())
              }
            >
              {generateForm.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Generating
                  Google Form…
                </>
              ) : (
                <>
                  <FileText size={14} /> Generate Google Form
                </>
              )}
            </Button>

            {generateForm.isError && (
              <p className="text-xs text-destructive text-center">
                {generateForm.error?.message ?? "Failed to generate form. Check Google API credentials."}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
