"use client";
import { EChart } from "./EChart";
import type { EChartsOption } from "echarts";
import type { SummaryDTO } from "../types";

function donut(title: string, data: { name: string; value: number; key: string }[]): EChartsOption {
  return {
    title: { text: title, left: "center", top: 0, textStyle: { color: "#a1a1aa", fontSize: 12, fontWeight: 500 } },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: { bottom: 0, textStyle: { color: "#a1a1aa" } },
    series: [{
      type: "pie", radius: ["55%", "78%"], center: ["50%", "52%"], avoidLabelOverlap: true,
      itemStyle: { borderColor: "#09090b", borderWidth: 2 },
      label: { show: false }, labelLine: { show: false },
      data: data.map((d) => ({ name: d.name, value: d.value, _key: d.key })),
    }],
  };
}

export function CompositionDonuts({
  composition, onPickInternalExternal, onPickAdminMember,
}: {
  composition: SummaryDTO["composition"];
  onPickInternalExternal: (v: "internal" | "external") => void;
  onPickAdminMember: (v: "admin" | "member") => void;
}) {
  const ie = composition.internalExternal;
  const perm = composition.permission;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        <EChart
          option={donut("Internal vs External", [
            { name: "Internal", value: ie.internal, key: "internal" },
            { name: "External", value: ie.external, key: "external" },
          ])}
          height={260}
          onEvents={{ click: (p) => onPickInternalExternal((p.name === "Internal" ? "internal" : "external")) }}
        />
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        <EChart
          option={donut("Permission mix", [
            { name: "Administrator", value: perm.admin, key: "admin" },
            { name: "Member", value: perm.member, key: "member" },
          ])}
          height={260}
          onEvents={{ click: (p) => onPickAdminMember((p.name === "Administrator" ? "admin" : "member")) }}
        />
      </div>
    </div>
  );
}
