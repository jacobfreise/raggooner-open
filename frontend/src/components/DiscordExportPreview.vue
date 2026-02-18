<template>
  <div v-if="isAdmin" class="mt-8 border-t border-slate-700 pt-6">

    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-bold text-white flex items-center gap-2">
        <i class="ph-bold ph-discord-logo text-indigo-400"></i>
        Discord Export
      </h3>

      <button
          @click="showPreview = !showPreview"
          class="text-sm font-medium px-3 py-1.5 rounded-md transition-colors flex items-center gap-2"
          :class="showPreview ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:text-white'">
        <i :class="showPreview ? 'ph-bold ph-eye-slash' : 'ph-bold ph-eye'"></i>
        {{ showPreview ? 'Hide Preview' : 'Show Preview' }}
      </button>
    </div>

    <div class="flex flex-col gap-3">

      <div v-if="singleMessageLength <= 2000">
        <button
            @click="copyToClipboard('single')"
            class="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-900/20">
          <i class="ph-bold ph-copy"></i>
          Copy Report
          <span class="text-xs opacity-75 font-mono">({{ singleMessageLength }} chars)</span>
        </button>
      </div>

      <div v-else class="space-y-3">
        <div class="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-3">
          <i class="ph-bold ph-warning text-amber-500 text-xl shrink-0"></i>
          <div class="text-sm text-amber-200">
            <strong>Limit Exceeded!</strong> The report is too long for one Discord message.
            It has been split into {{ splitMessages.length }} parts.
          </div>
        </div>

        <div class="flex gap-2">
          <button
              v-for="(msg, idx) in splitMessages"
              :key="idx"
              @click="copyToClipboard('split', idx)"
              class="flex-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-indigo-400 text-white px-3 py-3 rounded-lg font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95">
            <div class="flex items-center gap-2 text-sm">
              <i class="ph-bold ph-copy"></i>
              Part {{ idx + 1 }}
            </div>
            <span class="text-[10px] uppercase tracking-wider opacity-60 font-mono">{{ msg.length }} chars</span>
          </button>
        </div>

        <button
            @click="copyToClipboard('single')"
            class="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all active:scale-95">
          <i class="ph-bold ph-crown"></i>
          I have Nitro
          <span class="text-xs opacity-75 font-mono">({{ singleMessageLength }} chars)</span>
        </button>
      </div>
    </div>

    <Transition
        enter-active-class="duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2">

      <div v-if="showPreview" class="mt-6">
        <div class="bg-[#36393f] rounded-lg overflow-hidden border border-[#202225] shadow-xl">
          <div class="bg-[#2f3136] px-4 py-2 border-b border-[#202225] flex items-center gap-2 text-xs text-[#72767d] font-bold uppercase tracking-wide">
            Preview: #tournament-results
          </div>

          <div class="p-4 max-h-[500px] overflow-y-auto space-y-6 custom-scrollbar">

            <div v-for="(msg, idx) in (singleMessageLength <= 2000 ? [singleMessage] : splitMessages)" :key="idx" class="flex gap-4 group">

              <div class="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xl shadow-sm shrink-0 mt-0.5">
                🤖
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2 mb-1">
                  <span class="text-white font-medium hover:underline cursor-pointer">Tournament Bot</span>
                  <span v-if="singleMessageLength > 2000" class="px-1.5 rounded-[3px] bg-[#5865F2] text-white text-[10px] font-bold h-4 flex items-center leading-none">
                    PART {{ idx + 1 }}/{{ splitMessages.length }}
                  </span>
                  <span class="text-xs text-[#72767d]">Today at {{ getCurrentTime() }}</span>
                </div>

                <div
                    class="text-[#dcddde] text-[0.9375rem] leading-[1.375rem] whitespace-pre-wrap break-words font-discord"
                    v-html="renderDiscordMarkdown(msg)">
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </Transition>

    <Transition
        enter-active-class="transform ease-out duration-300 transition"
        enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
        enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
        leave-active-class="transition ease-in duration-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0">
      <div v-if="showCopySuccess" class="fixed bottom-4 right-4 z-50 bg-emerald-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 font-medium">
        <i class="ph-fill ph-check-circle text-xl"></i>
        {{ copySuccessMessage }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Tournament } from '../types';
import { generateDiscordReport, generateDiscordReportSplit } from '../utils/exportUtils';

const props = defineProps<{
  tournament: Tournament;
  isAdmin: boolean;
}>();

const showPreview = ref(false);
const showCopySuccess = ref(false);
const copySuccessMessage = ref('');

// Generate reports
const singleMessage = computed(() => generateDiscordReport(props.tournament));
const splitMessages = computed(() => generateDiscordReportSplit(props.tournament));
const singleMessageLength = computed(() => singleMessage.value.length);

// Helper for Preview Rendering
const renderDiscordMarkdown = (text: string) => {
  if (!text) return '';

  let html = text
      // Code blocks (Handle newlines inside safely)
      .replace(/```([\s\S]*?)```/g, '<div class="bg-[#2f3136] p-2.5 rounded-md my-1 border border-[#202225] font-mono text-xs text-[#b9bbbe] overflow-x-auto"><code>$1</code></div>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
      // Italic
      .replace(/_(.*?)_/g, '<em class="italic text-[#b9bbbe]">$1</em>')
      // Quotes / Blockquotes
      .replace(/^> (.*$)/gm, '<div class="pl-2 border-l-4 border-[#4f545c] text-[#a3a6aa] text-sm my-1">$1</div>')
      // Newlines to BR (but be careful not to double break inside pre tags if logic changes)
      .replace(/\n/g, '<br>');

  return html;
};

const copyToClipboard = async (mode: 'single' | 'split', messageIndex?: number) => {
  let text = '';
  let label = '';

  if (mode === 'single') {
    text = singleMessage.value;
    label = 'Copied full report!';
  } else if (mode === 'split' && messageIndex !== undefined) {
    text = splitMessages.value[messageIndex]!;
    label = `Part ${messageIndex + 1} copied!`;
  }

  try {
    await navigator.clipboard.writeText(text);
    copySuccessMessage.value = label;
    showCopySuccess.value = true;
    setTimeout(() => showCopySuccess.value = false, 2500);
  } catch (e) {
    console.error('Clipboard failed', e);
  }
};

const getCurrentTime = () => {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
</script>

<style scoped>
/* Optional: Fake Font for realism */
.font-discord {
  font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

/* Custom Scrollbar for the preview box */
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  background-color: #2f3136;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #202225;
  border-radius: 4px;
}
</style>