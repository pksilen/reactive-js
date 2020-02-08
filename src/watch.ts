import { effect, ReactiveEffectOptions, stop } from "./effect";
import { hasChanged, isArray, isObject } from "./utils";

export type WatchSource<T = any> = () => T;

export type WatchCallback<T = any> = (
  value: T,
  oldValue: T,
  onCleanup: CleanupRegistrator
) => any;

export type CleanupRegistrator = (invalidate: () => void) => void;

export interface WatchOptions {
  lazy?: boolean;
  flush?: "pre" | "post" | "sync";
  deep?: boolean;
  onTrack?: ReactiveEffectOptions["onTrack"];
  onTrigger?: ReactiveEffectOptions["onTrigger"];
}

export type StopHandle = () => void;

const invoke = (fn: Function) => fn();

// initial value for watchers to trigger on undefined initial values
const INITIAL_WATCHER_VALUE = {};

// overload #2: single source + cb
export function watch<T>(
  source: WatchSource<T>,
  cb: WatchCallback<T>,
  options: WatchOptions
): StopHandle;

// implementation
export function watch<T = any>(
  effectOrSource: WatchSource<T>,
  cbOrOptions: WatchCallback<T>,
  options: WatchOptions
): StopHandle {
  // effect callback as 2nd argument - this is a source watcher
  return doWatch(effectOrSource, cbOrOptions, options);
}

function doWatch(
  source: WatchSource,
  cb: WatchCallback,
  { deep, onTrack, onTrigger }: WatchOptions = {}
): StopHandle {
  let getter: () => any;
  getter = () => source();

  if (deep) {
    const baseGetter = getter;
    getter = () => traverse(baseGetter());
  }

  const registerCleanup: CleanupRegistrator = () => {};

  let oldValue = isArray(source) ? [] : INITIAL_WATCHER_VALUE;
  const applyCb = () => {
    const newValue = runner();
    if (deep || hasChanged(newValue, oldValue)) {
      cb(
        newValue,
        oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue,
        registerCleanup
      );
      oldValue = newValue;
    }
  };

  let scheduler: (job: () => any) => void;
  scheduler = invoke;

  const runner = effect(getter, {
    lazy: true,
    // so it runs before component update effects in pre flush mode
    computed: true,
    onTrack,
    onTrigger,
    scheduler: () => scheduler(applyCb)
  });

  if (applyCb) {
    scheduler(applyCb);
  } else {
    scheduler(runner);
  }

  return () => {
    stop(runner);
  };
}

function traverse(value: unknown, seen: Set<unknown> = new Set()) {
  if (!isObject(value) || seen.has(value)) {
    return;
  }
  seen.add(value);
  if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], seen);
    }
  } else if (value instanceof Map) {
    value.forEach((v, key) => {
      // to register mutation dep for existing keys
      traverse(value.get(key), seen);
    });
  } else if (value instanceof Set) {
    value.forEach(v => {
      traverse(v, seen);
    });
  } else {
    for (const key in value) {
      traverse(value[key], seen);
    }
  }
  return value;
}
