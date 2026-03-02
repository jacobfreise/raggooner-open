<script setup lang="ts">
import { computed, ref } from 'vue';

export interface ChartDataset {
  label: string;
  color: string;
  points: (number | null)[];
}

const props = defineProps<{
  datasets: ChartDataset[];
  xLabels: string[];
  yMax?: number;
  yLabel?: string;
}>();

// SVG layout constants
const W = 900;
const H = 320;
const PL = 55;   // left padding (y-axis labels)
const PR = 20;   // right padding
const PT = 15;   // top padding
const PB = 85;   // bottom padding (rotated x-axis labels)
const PLOT_W = W - PL - PR;
const PLOT_H = H - PT - PB;

const yMax = computed(() => props.yMax ?? 100);

const yTicks = computed(() => {
  const ticks = [];
  for (let v = 0; v <= yMax.value; v += 25) {
    const yPx = PT + ((yMax.value - v) / yMax.value) * PLOT_H;
    ticks.push({ v, yPx });
  }
  return ticks;
});

const n = computed(() => props.xLabels.length);

const xAt = (i: number) => {
  if (n.value <= 1) return PL + PLOT_W / 2;
  return PL + (i / (n.value - 1)) * PLOT_W;
};

const yAt = (val: number) => PT + ((yMax.value - val) / yMax.value) * PLOT_H;

const pathFor = (dataset: ChartDataset) => {
  const cmds: string[] = [];
  let penDown = false;
  dataset.points.forEach((val, i) => {
    if (val === null) { penDown = false; return; }
    const x = xAt(i).toFixed(1);
    const y = yAt(val).toFixed(1);
    cmds.push(penDown ? `L${x},${y}` : `M${x},${y}`);
    penDown = true;
  });
  return cmds.join(' ');
};

// Show every Nth label so x-axis isn't overcrowded
const labelStep = computed(() => {
  if (n.value <= 12) return 1;
  if (n.value <= 24) return 2;
  return 3;
});

// Hover tracking
const hoverIdx = ref<number | null>(null);

const onMouseMove = (e: MouseEvent) => {
  const svg = e.currentTarget as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const svgX = (e.clientX - rect.left) * (W / rect.width);
  const relX = svgX - PL;
  if (n.value === 0 || relX < -10 || relX > PLOT_W + 10) {
    hoverIdx.value = null;
    return;
  }
  if (n.value === 1) { hoverIdx.value = 0; return; }
  const step = PLOT_W / (n.value - 1);
  hoverIdx.value = Math.max(0, Math.min(n.value - 1, Math.round(relX / step)));
};

const onMouseLeave = () => { hoverIdx.value = null; };
</script>

<template>
  <div class="w-full space-y-2">
    <!-- SVG Chart -->
    <div class="overflow-x-auto">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        class="w-full min-w-[480px]"
        @mousemove="onMouseMove"
        @mouseleave="onMouseLeave"
      >
        <!-- Y gridlines + labels -->
        <g v-for="tick in yTicks" :key="tick.v">
          <line :x1="PL" :x2="W - PR" :y1="tick.yPx" :y2="tick.yPx"
                stroke="#1e293b" stroke-width="1" />
          <text :x="PL - 7" :y="tick.yPx + 4"
                text-anchor="end" font-size="11" fill="#64748b" font-family="monospace">
            {{ tick.v }}%
          </text>
        </g>

        <!-- X gridlines + labels (every Nth) -->
        <g v-for="(label, i) in xLabels" :key="i">
          <line :x1="xAt(i)" :x2="xAt(i)" :y1="PT" :y2="H - PB"
                :stroke="hoverIdx === i ? '#334155' : '#1e293b'" stroke-width="1" />
          <text v-if="i % labelStep === 0"
                :x="xAt(i)"
                :y="H - PB + 6"
                text-anchor="end"
                font-size="10"
                fill="#64748b"
                :transform="`rotate(-40, ${xAt(i)}, ${H - PB + 6})`"
          >
            {{ label.length > 16 ? label.slice(0, 14) + '…' : label }}
          </text>
        </g>

        <!-- Axes -->
        <line :x1="PL" :x2="PL" :y1="PT" :y2="H - PB" stroke="#334155" stroke-width="1.5" />
        <line :x1="PL" :x2="W - PR" :y1="H - PB" :y2="H - PB" stroke="#334155" stroke-width="1.5" />

        <!-- Y axis label -->
        <text v-if="yLabel"
              :x="12" :y="PT + PLOT_H / 2"
              text-anchor="middle" font-size="11" fill="#64748b"
              :transform="`rotate(-90, 12, ${PT + PLOT_H / 2})`">
          {{ yLabel }}
        </text>

        <!-- Dataset lines -->
        <g v-for="ds in datasets" :key="ds.label + '-line'">
          <path :d="pathFor(ds)" :stroke="ds.color"
                stroke-width="2.5" fill="none"
                stroke-linejoin="round" stroke-linecap="round" />
        </g>

        <!-- Dataset dots (drawn on top of lines) -->
        <g v-for="ds in datasets" :key="ds.label + '-dots'">
          <g v-for="(val, i) in ds.points" :key="i">
            <circle v-if="val !== null"
                    :cx="xAt(i)" :cy="yAt(val)"
                    :r="hoverIdx === i ? 5.5 : 3.5"
                    :fill="ds.color" stroke="#0f172a" stroke-width="2"
                    style="transition: r 0.1s" />
          </g>
        </g>

        <!-- Hover crosshair -->
        <line v-if="hoverIdx !== null"
              :x1="xAt(hoverIdx)" :x2="xAt(hoverIdx)"
              :y1="PT" :y2="H - PB"
              stroke="#6366f1" stroke-width="1" stroke-dasharray="4,3" opacity="0.7" />
      </svg>
    </div>

    <!-- Hover tooltip bar -->
    <div v-if="hoverIdx !== null"
         class="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 bg-slate-900 rounded-lg border border-indigo-500/30 text-xs">
      <span class="font-bold text-slate-300 shrink-0">{{ xLabels[hoverIdx] }}</span>
      <div v-for="ds in datasets" :key="ds.label + '-tip'" class="flex items-center gap-1.5">
        <div class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: ds.color }"></div>
        <span class="text-slate-400">{{ ds.label }}:</span>
        <span class="font-bold tabular-nums" :style="{ color: ds.color }">
          {{ ds.points[hoverIdx] !== null && ds.points[hoverIdx] !== undefined
              ? ds.points[hoverIdx] + '%'
              : '—' }}
        </span>
      </div>
    </div>

    <!-- Legend -->
    <div class="flex flex-wrap gap-x-5 gap-y-1 px-1 pt-1">
      <div v-for="ds in datasets" :key="ds.label + '-legend'" class="flex items-center gap-1.5">
        <div class="w-5 h-2 rounded-full shrink-0" :style="{ backgroundColor: ds.color }"></div>
        <span class="text-xs text-slate-400">{{ ds.label }}</span>
      </div>
    </div>
  </div>
</template>
