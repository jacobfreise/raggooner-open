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
  yUnit?: string;
  yLabel?: string;
}>();

// SVG layout constants
const W = 900;
const H = 320;
const PL = 55;
const PR = 20;
const PT = 15;
const PB = 85;
const PLOT_W = W - PL - PR;
const PLOT_H = H - PT - PB;

const unit = computed(() => props.yUnit ?? '%');

// Auto-scale: if yMax not provided, compute from data
const dataMax = computed(() => {
  if (props.yMax !== undefined) return props.yMax;
  const all = props.datasets.flatMap(ds => ds.points.filter((p): p is number => p !== null));
  return all.length > 0 ? Math.max(...all) : 0;
});

const tickStep = computed(() => {
  if (props.yMax !== undefined) {
    // Fixed yMax: pick step that gives ~4-5 ticks
    const steps = [1, 2, 5, 10, 25, 50, 100];
    const ideal = props.yMax / 4;
    return steps.find(s => s >= ideal) ?? 25;
  }
  const max = dataMax.value;
  if (max <= 0) return 5;
  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500];
  const ideal = max / 4;
  return steps.find(s => s >= ideal) ?? 100;
});

const computedYMax = computed(() => {
  if (props.yMax !== undefined) return props.yMax;
  if (dataMax.value <= 0) return tickStep.value * 4;
  return Math.ceil(dataMax.value / tickStep.value) * tickStep.value;
});

const yTicks = computed(() => {
  const ticks = [];
  for (let v = 0; v <= computedYMax.value; v += tickStep.value) {
    const yPx = PT + ((computedYMax.value - v) / computedYMax.value) * PLOT_H;
    ticks.push({ v, yPx });
  }
  return ticks;
});

const n = computed(() => props.xLabels.length);

const xAt = (i: number) => {
  if (n.value <= 1) return PL + PLOT_W / 2;
  return PL + (i / (n.value - 1)) * PLOT_W;
};

const yAt = (val: number) => PT + ((computedYMax.value - val) / computedYMax.value) * PLOT_H;

const pathFor = (dataset: ChartDataset) => {
  const cmds: string[] = [];
  let penDown = false;
  dataset.points.forEach((val, i) => {
    if (val === null) { return; }
    const x = xAt(i).toFixed(1);
    const y = yAt(val).toFixed(1);
    cmds.push(penDown ? `L${x},${y}` : `M${x},${y}`);
    penDown = true;
  });
  return cmds.join(' ');
};

const labelStep = computed(() => {
  if (n.value <= 12) return 1;
  if (n.value <= 24) return 2;
  return 3;
});

// Hover state
const containerRef = ref<HTMLElement | null>(null);
const hoverIdx = ref<number | null>(null);
const tooltipX = ref(0);
const tooltipY = ref(0);
const flipTooltip = ref(false);

const onMouseMove = (e: MouseEvent) => {
  const container = containerRef.value;
  if (!container) return;

  const cRect = container.getBoundingClientRect();
  tooltipX.value = e.clientX - cRect.left;
  tooltipY.value = e.clientY - cRect.top;
  flipTooltip.value = tooltipX.value > cRect.width / 2;

  const svg = container.querySelector('svg');
  if (!svg) return;
  const sRect = svg.getBoundingClientRect();
  const svgX = (e.clientX - sRect.left) * (W / sRect.width);
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

const formatVal = (v: number | null | undefined) =>
  v !== null && v !== undefined ? v + unit.value : '—';
</script>

<template>
  <div class="w-full space-y-3">
    <div ref="containerRef" class="relative overflow-x-auto"
         @mousemove="onMouseMove" @mouseleave="onMouseLeave">
      <svg :viewBox="`0 0 ${W} ${H}`" class="w-full min-w-[480px]">
        <!-- Y gridlines + labels -->
        <g v-for="tick in yTicks" :key="tick.v">
          <line :x1="PL" :x2="W - PR" :y1="tick.yPx" :y2="tick.yPx"
                stroke="#1e293b" stroke-width="1" />
          <text :x="PL - 7" :y="tick.yPx + 4"
                text-anchor="end" font-size="11" fill="#64748b" font-family="monospace">
            {{ tick.v }}{{ unit }}
          </text>
        </g>

        <!-- X gridlines + labels -->
        <g v-for="(label, i) in xLabels" :key="i">
          <line :x1="xAt(i)" :x2="xAt(i)" :y1="PT" :y2="H - PB"
                :stroke="hoverIdx === i ? '#334155' : '#1e293b'" stroke-width="1" />
          <text v-if="i % labelStep === 0"
                :x="xAt(i)" :y="H - PB + 6"
                text-anchor="end" font-size="10" fill="#64748b"
                :transform="`rotate(-40, ${xAt(i)}, ${H - PB + 6})`">
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

        <!-- Lines -->
        <g v-for="ds in datasets" :key="ds.label + '-line'">
          <path :d="pathFor(ds)" :stroke="ds.color"
                stroke-width="2.5" fill="none"
                stroke-linejoin="round" stroke-linecap="round" />
        </g>

        <!-- Dots -->
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

      <!-- Floating tooltip -->
      <div
        v-if="hoverIdx !== null"
        class="absolute z-50 pointer-events-none bg-slate-900 border border-slate-700 rounded-lg shadow-2xl px-3 py-2.5 text-xs min-w-[140px]"
        :style="{
          left: tooltipX + 'px',
          top: (tooltipY - 12) + 'px',
          transform: flipTooltip ? 'translate(calc(-100% - 12px), -100%)' : 'translate(12px, -100%)',
        }"
      >
        <div class="font-bold text-slate-200 mb-1.5 pb-1.5 border-b border-slate-700/80 whitespace-nowrap">
          {{ xLabels[hoverIdx] }}
        </div>
        <div v-for="ds in datasets" :key="ds.label + '-tip'"
             class="flex items-center justify-between gap-4 py-0.5">
          <div class="flex items-center gap-1.5 min-w-0">
            <div class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: ds.color }"></div>
            <span class="text-slate-400 truncate">{{ ds.label }}</span>
          </div>
          <span class="font-bold tabular-nums shrink-0" :style="{ color: ds.color }">
            {{ formatVal(ds.points[hoverIdx]) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="flex flex-wrap gap-x-5 gap-y-1 px-1">
      <div v-for="ds in datasets" :key="ds.label + '-legend'" class="flex items-center gap-1.5">
        <div class="w-5 h-2 rounded-full shrink-0" :style="{ backgroundColor: ds.color }"></div>
        <span class="text-xs text-slate-400">{{ ds.label }}</span>
      </div>
    </div>
  </div>
</template>
