"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/core/trpc";
import { 
  Cloud, 
  FlaskConical, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Play,
  Monitor
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const STAGES = [
  "Prep & Upscale",
  "Background Removal",
  "Captioning",
  "Refinement (GDINO/SAM)",
  "Embeddings (SigLIP)",
  "Finalize"
];

export function LodTrainingPanel() {
  const [isTraining, setIsTraining] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState("Idle");
  
  const startMutation = trpc.lod.startBatchTraining.useMutation({
    onSuccess: () => {
      setIsTraining(true);
    }
  });

  const { data: status, refetch: refetchStatus } = trpc.lod.getTrainingStatus.useQuery(undefined, {
    enabled: isTraining,
    refetchInterval: isTraining ? 5000 : false,
  });

  useEffect(() => {
    if (status) {
      setProgress(status.progress);
      setCurrentMessage(status.message || "Processing...");
      if (status.progress === 100) {
        setIsTraining(false);
      }
    }
  }, [status]);

  const handleStart = () => {
    startMutation.mutate({
      inputDir: "C:\\LECG\\LOD Checker\\00_data\\input_demo", // For demo; in prod this would be selected
      outputDir: "C:\\LECG\\LOD Checker\\00_data\\output_integrated",
      provider: "LECG Modernization",
    });
  };

  const getStageIndex = (msg: string) => {
    if (msg.includes("Upscale")) return 0;
    if (msg.includes("Background") || msg.includes("RMBG")) return 1;
    if (msg.includes("Caption")) return 2;
    if (msg.includes("Detection") || msg.includes("Segment")) return 3;
    if (msg.includes("Embed")) return 4;
    if (msg.includes("Finalize")) return 5;
    return -1;
  };

  const currentStageIdx = getStageIndex(currentMessage);

  return (
    <Card className="w-full bg-slate-900/50 border-slate-800 backdrop-blur-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2 text-white">
              <FlaskConical className="w-5 h-5 text-indigo-400" />
              LOD Training Engine (Super Stack)
            </CardTitle>
            <CardDescription className="text-slate-400">
              Process new Revit families through the 13-stage vision pipeline to build the RAG collection.
            </CardDescription>
          </div>
          <Badge variant={isTraining ? "default" : "secondary"} className={isTraining ? "bg-indigo-600 animate-pulse" : ""}>
            {isTraining ? "Training Active" : "Engine Ready"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isTraining && progress !== 100 && (
          <div className="border-2 border-dashed border-slate-800 rounded-xl p-12 flex flex-col items-center justify-center gap-4 bg-slate-950/20">
            <Cloud className="w-12 h-12 text-slate-600" />
            <div className="text-center">
              <p className="text-slate-300 font-medium">Drop Family Screenshots Here</p>
              <p className="text-slate-500 text-sm">Supports PNG, JPG, WebP from Revit Exports</p>
            </div>
            <Button 
              variant="outline" 
              className="mt-4 border-indigo-500/50 hover:bg-indigo-500/10 text-indigo-300"
              onClick={handleStart}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Start Batch Training (Optimized)
            </Button>
          </div>
        )}

        {isTraining && (
          <div className="space-y-4">
            <div className="flex justify-between items-end mb-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-indigo-400" />
                  {currentMessage}
                </p>
                <p className="text-xs text-slate-500">
                  Worker ID: GPU_CORE_NODE_01 | Device: CUDA (FP16)
                </p>
              </div>
              <p className="text-sm font-bold text-white">{progress}%</p>
            </div>
            <Progress value={progress} className="h-2 bg-slate-800" />
            
            <div className="grid grid-cols-6 gap-2 pt-4">
              {STAGES.map((stage, i) => (
                <div key={stage} className="space-y-2">
                  <div 
                    className={`h-1 rounded-full transition-all duration-500 ${
                      i < currentStageIdx ? "bg-emerald-500" : 
                      i === currentStageIdx ? "bg-indigo-500 animate-pulse" : 
                      "bg-slate-800"
                    }`} 
                  />
                  <p className={`text-[10px] text-center leading-tight ${
                    i <= currentStageIdx ? "text-slate-300" : "text-slate-600"
                  }`}>
                    {stage}
                  </p>
                </div>
              ))}
            </div>

            {status?.etr && (
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 flex items-center justify-between mt-6">
                <span className="text-xs text-indigo-300 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Estimating Time to Return...
                </span>
                <span className="text-xs font-mono text-white bg-slate-900 px-2 py-1 rounded">
                  ETR: {Math.floor(status.etr / 60)}m {status.etr % 60}s
                </span>
              </div>
            )}
          </div>
        )}

        {progress === 100 && !isTraining && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-8 flex flex-col items-center gap-4 text-center animate-in fade-in zoom-in duration-500">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Batch Integration Complete</h3>
              <p className="text-slate-400 max-w-md mt-1">
                All 24 items have been processed, upscaled, and embedded into the HNSW vector store.
              </p>
            </div>
            <Button 
              variant="outline" 
              className="mt-2 border-emerald-500/50 hover:bg-emerald-500/20 text-emerald-300"
              onClick={() => setProgress(0)}
            >
              Start New Batch
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
