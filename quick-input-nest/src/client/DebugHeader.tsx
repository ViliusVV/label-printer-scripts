import { Show, createSignal, onCleanup, onMount } from "solid-js";
import type { ReplayResult, SyncError } from "./sync";
import { clearLastError } from "./sync";

type Props = {
  online: boolean;
  cacheCount: number;
  pendingCount: number;
  lastSyncAt: number;
  lastReplay: ReplayResult | null;
  lastError: SyncError | null;
};

const formatAgo = (now: number, then: number): string => {
  if (!then) return "never";
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${Math.round(sec / 3600)}h ago`;
};

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n}B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)}kB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  return `${(n / 1024 ** 3).toFixed(2)}GB`;
};

export function DebugHeader(props: Props) {
  const [now, setNow] = createSignal(Date.now());
  const [swState, setSwState] = createSignal<"unsupported" | "pending" | "ready" | "controlling">(
    "pending",
  );
  const [storageEstimate, setStorageEstimate] = createSignal<{ usage: number; quota: number } | null>(
    null,
  );

  onMount(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(tick));

    if (!("serviceWorker" in navigator)) {
      setSwState("unsupported");
    } else {
      if (navigator.serviceWorker.controller) setSwState("controlling");
      navigator.serviceWorker.ready.then(() => {
        setSwState(navigator.serviceWorker.controller ? "controlling" : "ready");
      });
      const onChange = () =>
        setSwState(navigator.serviceWorker.controller ? "controlling" : "ready");
      navigator.serviceWorker.addEventListener("controllerchange", onChange);
      onCleanup(() =>
        navigator.serviceWorker.removeEventListener("controllerchange", onChange),
      );
    }

    if (navigator.storage?.estimate) {
      const refresh = () =>
        navigator.storage.estimate().then((est) =>
          setStorageEstimate({ usage: est.usage ?? 0, quota: est.quota ?? 0 }),
        );
      void refresh();
      const id = setInterval(refresh, 10_000);
      onCleanup(() => clearInterval(id));
    }
  });

  return (
    <div class="mb-3 rounded border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-600">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class={props.online ? "text-green-700" : "text-amber-700"}>
          {props.online ? "● online" : "○ offline"}
        </span>
        <span>cache: {props.cacheCount}</span>
        <span>pending: {props.pendingCount}</span>
        <span>synced {formatAgo(now(), props.lastSyncAt)}</span>
        <Show when={props.lastReplay}>
          {(replay) => (
            <span>
              replay: {replay().replayed}✓
              <Show when={replay().remaining > 0}> {replay().remaining}↻</Show> ·{" "}
              {formatAgo(now(), replay().at)}
            </span>
          )}
        </Show>
        <span>sw: {swState()}</span>
        <Show when={storageEstimate()}>
          {(est) => (
            <span>
              storage: {formatBytes(est().usage)} / {formatBytes(est().quota)}
            </span>
          )}
        </Show>
        <span>build: {__BUILD_HASH__}</span>
        <span title={__BUILD_TIME__}>{import.meta.env.MODE}</span>
        <span class="truncate">{location.origin}</span>
      </div>
      <Show when={props.lastError}>
        {(err) => (
          <div class="mt-1 flex items-start gap-2 text-red-700">
            <span class="break-all">
              err [{err().source}, {formatAgo(now(), err().at)}]: {err().message}
            </span>
            <button
              type="button"
              class="rounded border border-red-300 px-1.5 text-[10px] hover:bg-red-50"
              onClick={clearLastError}
            >
              clear
            </button>
          </div>
        )}
      </Show>
    </div>
  );
}
